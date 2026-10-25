-- GestioneImmobili - Test automatico generate_due_installments
-- Eseguire sul database Supabase locale dopo le migration.
-- Il test è non distruttivo: termina con ROLLBACK.
-- Richiede la funzione public.generate_due_installments(date).

\set ON_ERROR_STOP on

begin;

-- ============================================================
-- 1. Fixture minime
-- ============================================================

insert into public.properties (
    id, internal_code, name, property_type, status, municipality
)
values (
    'c1000000-0000-0000-0000-000000000001',
    'IMM-BILLING-TEST',
    'Immobile test generazione canoni',
    'APARTMENT',
    'ACTIVE',
    'Roma'
)
on conflict (id) do update
set internal_code = excluded.internal_code,
    name = excluded.name,
    status = excluded.status,
    updated_at = now();

insert into public.contracts (
    id, internal_code, property_id, object_type, contract_type,
    management_status, lifecycle_status, start_date, end_date,
    currency, activated_at, notes
)
values (
    'c2000000-0000-0000-0000-000000000002',
    'CTR-BILLING-TEST',
    'c1000000-0000-0000-0000-000000000001',
    'WHOLE_PROPERTY',
    'RESIDENTIAL',
    'ACTIVE',
    'IN_PROGRESS',
    date '2027-01-15',
    date '2027-06-30',
    'EUR',
    now(),
    'Fixture automatica generate_due_installments'
)
on conflict (id) do update
set management_status = 'ACTIVE',
    lifecycle_status = 'IN_PROGRESS',
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    ended_at = null,
    updated_at = now();

-- Prima mensilità: febbraio 2027; due_day 31 per verificare il mese corto.
insert into public.contract_terms (
    id, contract_id, valid_from, valid_to, base_rent_amount,
    billing_frequency, billing_interval,
    first_billing_period_start, due_day, notes
)
values (
    'c3000000-0000-0000-0000-000000000003',
    'c2000000-0000-0000-0000-000000000002',
    date '2027-01-15',
    null,
    1000.00,
    'MONTHLY',
    null,
    date '2027-02-01',
    31,
    'Term test mensile'
)
on conflict (id) do update
set valid_from = excluded.valid_from,
    valid_to = null,
    base_rent_amount = excluded.base_rent_amount,
    billing_frequency = excluded.billing_frequency,
    billing_interval = null,
    first_billing_period_start = excluded.first_billing_period_start,
    due_day = excluded.due_day;

-- Rimuove eventuali righe residue solo per gli ID fissi della fixture,
-- comunque tutto sarà annullato dal ROLLBACK.
delete from public.rent_installments
where contract_id = 'c2000000-0000-0000-0000-000000000002';

delete from public.billing_generation_runs
where correlation_id in (
    'c4000000-0000-0000-0000-000000000004',
    'c5000000-0000-0000-0000-000000000005'
);

-- ============================================================
-- 2. Prima esecuzione: reference date 15 aprile 2027
-- Deve recuperare febbraio, marzo e aprile.
-- ============================================================

select public.generate_due_installments(date '2027-04-15');

do $$
declare
    v_count integer;
    v_total numeric;
    v_feb_due date;
    v_min_period date;
    v_max_period date;
begin
    select
        count(*),
        sum(amount_due),
        min(period_start),
        max(period_start)
    into
        v_count,
        v_total,
        v_min_period,
        v_max_period
    from public.rent_installments
    where contract_id = 'c2000000-0000-0000-0000-000000000002';

    if v_count <> 3 then
        raise exception
            'BILLING_TEST_FIRST_RUN_COUNT_FAILED: attesi 3, trovati %',
            v_count;
    end if;

    if v_total <> 3000.00 then
        raise exception
            'BILLING_TEST_TOTAL_FAILED: atteso 3000, trovato %',
            v_total;
    end if;

    if v_min_period <> date '2027-02-01'
       or v_max_period <> date '2027-04-01' then
        raise exception
            'BILLING_TEST_PERIOD_RANGE_FAILED: min %, max %',
            v_min_period, v_max_period;
    end if;

    select due_date
      into v_feb_due
      from public.rent_installments
     where contract_id = 'c2000000-0000-0000-0000-000000000002'
       and period_start = date '2027-02-01';

    if v_feb_due <> date '2027-02-28' then
        raise exception
            'BILLING_TEST_SHORT_MONTH_FAILED: atteso 2027-02-28, trovato %',
            v_feb_due;
    end if;
end;
$$;

-- ============================================================
-- 3. Seconda esecuzione uguale: deve essere idempotente
-- ============================================================

select public.generate_due_installments(date '2027-04-15');

do $$
declare
    v_count integer;
begin
    select count(*)
      into v_count
      from public.rent_installments
     where contract_id = 'c2000000-0000-0000-0000-000000000002';

    if v_count <> 3 then
        raise exception
            'BILLING_TEST_IDEMPOTENCY_FAILED: attesi ancora 3, trovati %',
            v_count;
    end if;
end;
$$;

-- ============================================================
-- 4. Recupero periodo successivo: reference date 2 maggio
-- Il job non è girato il primo maggio, ma deve creare maggio.
-- ============================================================

select public.generate_due_installments(date '2027-05-02');

do $$
declare
    v_count integer;
    v_may_count integer;
    v_may_due date;
begin
    select count(*)
      into v_count
      from public.rent_installments
     where contract_id = 'c2000000-0000-0000-0000-000000000002';

    if v_count <> 4 then
        raise exception
            'BILLING_TEST_CATCHUP_COUNT_FAILED: attesi 4, trovati %',
            v_count;
    end if;

    select count(*), min(due_date)
      into v_may_count, v_may_due
      from public.rent_installments
     where contract_id = 'c2000000-0000-0000-0000-000000000002'
       and period_start = date '2027-05-01';

    if v_may_count <> 1 then
        raise exception
            'BILLING_TEST_MAY_MISSING_OR_DUPLICATE: trovati %',
            v_may_count;
    end if;

    if v_may_due <> date '2027-05-31' then
        raise exception
            'BILLING_TEST_MAY_DUE_DATE_FAILED: atteso 2027-05-31, trovato %',
            v_may_due;
    end if;
end;
$$;

-- ============================================================
-- 5. Non generare periodi successivi alla fine Contratto
-- Reference date agosto, ma fine Contratto 30 giugno.
-- Deve aggiungere solo giugno, arrivando a 5 Canoni totali.
-- ============================================================

select public.generate_due_installments(date '2027-08-10');

do $$
declare
    v_count integer;
    v_after_end integer;
begin
    select count(*)
      into v_count
      from public.rent_installments
     where contract_id = 'c2000000-0000-0000-0000-000000000002';

    if v_count <> 5 then
        raise exception
            'BILLING_TEST_CONTRACT_END_COUNT_FAILED: attesi 5, trovati %',
            v_count;
    end if;

    select count(*)
      into v_after_end
      from public.rent_installments
     where contract_id = 'c2000000-0000-0000-0000-000000000002'
       and period_start > date '2027-06-30';

    if v_after_end <> 0 then
        raise exception
            'BILLING_TEST_GENERATED_AFTER_END: trovati %',
            v_after_end;
    end if;
end;
$$;

-- ============================================================
-- 6. Verifica run completati
-- ============================================================

do $$
declare
    v_completed integer;
    v_failed integer;
begin
    select
        count(*) filter (where status = 'COMPLETED'),
        count(*) filter (where status = 'FAILED')
    into
        v_completed,
        v_failed
    from public.billing_generation_runs
    where reference_date in (
        date '2027-04-15',
        date '2027-05-02',
        date '2027-08-10'
    );

    if v_completed < 4 then
        raise exception
            'BILLING_TEST_RUN_LOG_FAILED: attesi almeno 4 completed, trovati %',
            v_completed;
    end if;

    if v_failed <> 0 then
        raise exception
            'BILLING_TEST_RUN_HAS_FAILURES: trovati %',
            v_failed;
    end if;
end;
$$;

-- Mostra il risultato per diagnosi prima del rollback.
select
    period_start,
    period_end,
    due_date,
    amount_due,
    status
from public.rent_installments
where contract_id = 'c2000000-0000-0000-0000-000000000002'
order by period_start;

rollback;

\echo 'BILLING GENERATION TEST PASSED'
