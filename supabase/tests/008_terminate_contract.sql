-- GestioneImmobili - Test automatico RPC terminate_contract
-- Prerequisiti:
--   - Supabase locale avviato e migration applicate.
--   - Seed locale con utente.a@test.local.
--   - RPC public.terminate_contract(uuid,date,text,uuid).
--
-- Scenario:
--   Contratto attivo:        01/01/2027 - 31/12/2027
--   Cessazione effettiva:    31/10/2027
--   Settembre:               PAID, deve restare PAID
--   Ottobre:                 CREATED, maturato, deve restare CREATED
--   Novembre:                CREATED, futuro, deve diventare NOT_DUE
--   Dicembre:                CREATED, futuro, deve diventare NOT_DUE
--   Locatario attivo:        deve essere chiuso con valid_to = 01/11/2027
--
-- Il test termina con ROLLBACK e non lascia fixture nel database.

\set ON_ERROR_STOP on

begin;

-- ============================================================
-- 1. Verifica prerequisiti
-- ============================================================

do $$
declare
    v_user_count integer;
    v_function_count integer;
begin
    select count(*)
      into v_user_count
      from auth.users
     where lower(trim(email)) = 'utente.a@test.local';

    if v_user_count <> 1 then
        raise exception
            'TERMINATION_TEST_USER_MISSING: atteso utente.a@test.local';
    end if;

    select count(*)
      into v_function_count
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'terminate_contract';

    if v_function_count <> 1 then
        raise exception
            'TERMINATION_TEST_RPC_MISSING: trovate % funzioni',
            v_function_count;
    end if;
end;
$$;

insert into public.profiles (
    id, first_name, last_name, display_name, status
)
select
    id, 'Utente', 'A', 'Utente A', 'ACTIVE'
from auth.users
where lower(trim(email)) = 'utente.a@test.local'
on conflict (id) do update
set first_name = excluded.first_name,
    last_name = excluded.last_name,
    display_name = excluded.display_name,
    status = excluded.status,
    updated_at = now();

-- ============================================================
-- 2. Fixture isolate: Owner, accesso, Property, Tenant, Contract
-- ============================================================

insert into public.owners (
    id, owner_type, first_name, last_name, tax_code, status
)
values (
    'f1000000-0000-0000-0000-000000000001',
    'NATURAL_PERSON',
    'Proprietario',
    'Cessazione',
    'TERMINATIONOWNER',
    'ACTIVE'
)
on conflict (id) do update
set first_name = excluded.first_name,
    last_name = excluded.last_name,
    tax_code = excluded.tax_code,
    status = excluded.status,
    updated_at = now();

insert into public.user_owner_accesses (
    user_id, owner_id, role, valid_from, status
)
select
    id,
    'f1000000-0000-0000-0000-000000000001',
    'MANAGER',
    current_date,
    'ACTIVE'
from auth.users
where lower(trim(email)) = 'utente.a@test.local'
and not exists (
    select 1
      from public.user_owner_accesses uoa
     where uoa.user_id = auth.users.id
       and uoa.owner_id = 'f1000000-0000-0000-0000-000000000001'
);

insert into public.properties (
    id, internal_code, name, property_type, status, municipality
)
values (
    'f1100000-0000-0000-0000-000000000001',
    'IMM-TERMINATION-TEST',
    'Immobile test cessazione',
    'APARTMENT',
    'ACTIVE',
    'Roma'
)
on conflict (id) do update
set internal_code = excluded.internal_code,
    name = excluded.name,
    status = excluded.status,
    updated_at = now();

insert into public.property_ownerships (
    id, property_id, owner_id, ownership_percentage, valid_from
)
values (
    'f1200000-0000-0000-0000-000000000001',
    'f1100000-0000-0000-0000-000000000001',
    'f1000000-0000-0000-0000-000000000001',
    100,
    current_date
)
on conflict (id) do update
set ownership_percentage = 100,
    valid_from = excluded.valid_from,
    valid_to = null;

insert into public.tenants (
    id, tenant_type, first_name, last_name, tax_code, email, status
)
values (
    'f1300000-0000-0000-0000-000000000001',
    'NATURAL_PERSON',
    'Locatario',
    'Cessazione',
    'TERMINATIONTENANT',
    'locatario.cessazione@test.local',
    'ACTIVE'
)
on conflict (id) do update
set first_name = excluded.first_name,
    last_name = excluded.last_name,
    tax_code = excluded.tax_code,
    status = excluded.status,
    updated_at = now();

insert into public.contracts (
    id, internal_code, property_id, object_type, contract_type,
    management_status, lifecycle_status, start_date, end_date,
    currency, activated_at, ended_at, notes
)
values (
    'f2000000-0000-0000-0000-000000000002',
    'CTR-TERMINATION-TEST',
    'f1100000-0000-0000-0000-000000000001',
    'WHOLE_PROPERTY',
    'RESIDENTIAL',
    'ACTIVE',
    'IN_PROGRESS',
    date '2027-01-01',
    date '2027-12-31',
    'EUR',
    now(),
    null,
    'Fixture test cessazione'
)
on conflict (id) do update
set property_id = excluded.property_id,
    management_status = 'ACTIVE',
    lifecycle_status = 'IN_PROGRESS',
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    ended_at = null,
    notes = excluded.notes,
    updated_at = now();

insert into public.contract_tenants (
    id, contract_id, tenant_id, role,
    valid_from, valid_to, status, notes
)
values (
    'f2100000-0000-0000-0000-000000000002',
    'f2000000-0000-0000-0000-000000000002',
    'f1300000-0000-0000-0000-000000000001',
    'TENANT',
    date '2027-01-01',
    null,
    'ACTIVE',
    'Partecipazione fixture cessazione'
)
on conflict (id) do update
set valid_from = excluded.valid_from,
    valid_to = null,
    status = 'ACTIVE';

insert into public.contract_terms (
    id, contract_id, valid_from, valid_to,
    base_rent_amount, billing_frequency, billing_interval,
    first_billing_period_start, due_day, notes
)
values (
    'f3000000-0000-0000-0000-000000000003',
    'f2000000-0000-0000-0000-000000000002',
    date '2027-01-01',
    null,
    1000.00,
    'MONTHLY',
    null,
    date '2027-01-01',
    5,
    'Term fixture cessazione'
)
on conflict (id) do update
set valid_from = excluded.valid_from,
    valid_to = null,
    base_rent_amount = excluded.base_rent_amount,
    first_billing_period_start = excluded.first_billing_period_start,
    due_day = excluded.due_day;

-- ============================================================
-- 3. Canoni settembre-dicembre
-- ============================================================

-- Pulizia preventiva limitata alla fixture.
delete from public.receipt_allocations
where rent_installment_id in (
    'f4090000-0000-0000-0000-000000000009',
    'f4100000-0000-0000-0000-000000000010',
    'f4110000-0000-0000-0000-000000000011',
    'f4120000-0000-0000-0000-000000000012'
);

delete from public.receipts
where property_id = 'f1100000-0000-0000-0000-000000000001';

delete from public.audit_events
where entity_id = 'f2000000-0000-0000-0000-000000000002';

delete from public.contract_changes
where contract_id = 'f2000000-0000-0000-0000-000000000002'
  and change_type = 'EARLY_TERMINATION';

delete from public.idempotency_keys
where operation_name = 'terminate_contract'
  and idempotency_key in (
      'f5000000-0000-0000-0000-000000000005',
      'f6000000-0000-0000-0000-000000000006'
  );

delete from public.rent_installments
where contract_id = 'f2000000-0000-0000-0000-000000000002';

insert into public.rent_installments (
    id, contract_id, contract_term_id, sequence_number,
    period_start, period_end, due_date,
    amount_due, amount_lost, status, generated_at, closed_at
)
values
(
    'f4090000-0000-0000-0000-000000000009',
    'f2000000-0000-0000-0000-000000000002',
    'f3000000-0000-0000-0000-000000000003',
    20270901,
    date '2027-09-01', date '2027-09-30', date '2027-09-05',
    1000.00, 0.00, 'PAID', now(), now()
),
(
    'f4100000-0000-0000-0000-000000000010',
    'f2000000-0000-0000-0000-000000000002',
    'f3000000-0000-0000-0000-000000000003',
    20271001,
    date '2027-10-01', date '2027-10-31', date '2027-10-05',
    1000.00, 0.00, 'CREATED', now(), null
),
(
    'f4110000-0000-0000-0000-000000000011',
    'f2000000-0000-0000-0000-000000000002',
    'f3000000-0000-0000-0000-000000000003',
    20271101,
    date '2027-11-01', date '2027-11-30', date '2027-11-05',
    1000.00, 0.00, 'CREATED', now(), null
),
(
    'f4120000-0000-0000-0000-000000000012',
    'f2000000-0000-0000-0000-000000000002',
    'f3000000-0000-0000-0000-000000000003',
    20271201,
    date '2027-12-01', date '2027-12-31', date '2027-12-05',
    1000.00, 0.00, 'CREATED', now(), null
);

-- Incasso consolidato di settembre, da preservare.
insert into public.receipts (
    id, property_id, payer_tenant_id, payer_name,
    payment_date, amount, currency, payment_method,
    status, notes
)
values (
    'f4900000-0000-0000-0000-000000000090',
    'f1100000-0000-0000-0000-000000000001',
    'f1300000-0000-0000-0000-000000000001',
    'Locatario Cessazione',
    date '2027-09-05',
    1000.00,
    'EUR',
    'BANK_TRANSFER',
    'RECORDED',
    'Incasso consolidato da preservare'
)
on conflict (id) do update
set amount = excluded.amount,
    status = 'RECORDED';

insert into public.receipt_allocations (
    id, receipt_id, rent_installment_id, allocated_amount
)
values (
    'f4910000-0000-0000-0000-000000000091',
    'f4900000-0000-0000-0000-000000000090',
    'f4090000-0000-0000-0000-000000000009',
    1000.00
)
on conflict (id) do update
set allocated_amount = 1000.00;

-- ============================================================
-- 4. Simulazione Utente A e prima cessazione
-- ============================================================

select set_config(
    'request.jwt.claims',
    json_build_object(
        'sub', (
            select id::text
              from auth.users
             where lower(trim(email)) = 'utente.a@test.local'
        ),
        'role', 'authenticated'
    )::text,
    true
);

set local role authenticated;

select public.terminate_contract(
    'f2000000-0000-0000-0000-000000000002'::uuid,
    date '2027-10-31',
    'Cessazione anticipata automatica di test',
    'f5000000-0000-0000-0000-000000000005'::uuid
);

reset role;

-- ============================================================
-- 5. Verifiche dopo la cessazione
-- ============================================================

do $$
declare
    v_management_status text;
    v_lifecycle_status text;
    v_ended_at date;
    v_tenant_status text;
    v_tenant_valid_to date;
    v_sep_status text;
    v_oct_status text;
    v_nov_status text;
    v_dec_status text;
    v_sep_receipts integer;
    v_change_count integer;
    v_audit_count integer;
begin
    select management_status, lifecycle_status, ended_at::date
      into v_management_status, v_lifecycle_status, v_ended_at
      from public.contracts
     where id = 'f2000000-0000-0000-0000-000000000002';

    if v_management_status <> 'INACTIVE'
       or v_lifecycle_status <> 'EARLY_TERMINATED'
       or v_ended_at <> date '2027-10-31' then
        raise exception
            'TERMINATION_TEST_CONTRACT_FAILED: management=%, lifecycle=%, ended_at=%',
            v_management_status, v_lifecycle_status, v_ended_at;
    end if;

    select status, valid_to
      into v_tenant_status, v_tenant_valid_to
      from public.contract_tenants
     where id = 'f2100000-0000-0000-0000-000000000002';

    if v_tenant_status <> 'INACTIVE'
       or v_tenant_valid_to <> date '2027-11-01' then
        raise exception
            'TERMINATION_TEST_TENANT_FAILED: status=%, valid_to=%',
            v_tenant_status, v_tenant_valid_to;
    end if;

    select
        max(status) filter (where period_start = date '2027-09-01'),
        max(status) filter (where period_start = date '2027-10-01'),
        max(status) filter (where period_start = date '2027-11-01'),
        max(status) filter (where period_start = date '2027-12-01')
    into v_sep_status, v_oct_status, v_nov_status, v_dec_status
    from public.rent_installments
    where contract_id = 'f2000000-0000-0000-0000-000000000002';

    if v_sep_status <> 'PAID' then
        raise exception
            'TERMINATION_TEST_SEPTEMBER_CHANGED: status=%',
            v_sep_status;
    end if;

    if v_oct_status <> 'CREATED' then
        raise exception
            'TERMINATION_TEST_OCTOBER_CHANGED: status=%',
            v_oct_status;
    end if;

    if v_nov_status <> 'NOT_DUE'
       or v_dec_status <> 'NOT_DUE' then
        raise exception
            'TERMINATION_TEST_FUTURE_INSTALLMENTS_FAILED: nov=%, dec=%',
            v_nov_status, v_dec_status;
    end if;

    select count(*)
      into v_sep_receipts
      from public.receipt_allocations
     where rent_installment_id = 'f4090000-0000-0000-0000-000000000009'
       and allocated_amount = 1000.00;

    if v_sep_receipts <> 1 then
        raise exception
            'TERMINATION_TEST_RECEIPT_NOT_PRESERVED: count=%',
            v_sep_receipts;
    end if;

    select count(*)
      into v_change_count
      from public.contract_changes
     where contract_id = 'f2000000-0000-0000-0000-000000000002'
       and change_type = 'EARLY_TERMINATION'
       and effective_date = date '2027-10-31';

    if v_change_count <> 1 then
        raise exception
            'TERMINATION_TEST_CHANGE_FAILED: count=%',
            v_change_count;
    end if;

    select count(*)
      into v_audit_count
      from public.audit_events
     where entity_id = 'f2000000-0000-0000-0000-000000000002'
       and action = 'CONTRACT_TERMINATED'
       and outcome = 'SUCCESS';

    if v_audit_count <> 1 then
        raise exception
            'TERMINATION_TEST_AUDIT_FAILED: count=%',
            v_audit_count;
    end if;
end;
$$;

-- ============================================================
-- 6. Idempotenza: stessa chiave e stessi parametri
-- ============================================================

select set_config(
    'request.jwt.claims',
    json_build_object(
        'sub', (
            select id::text
              from auth.users
             where lower(trim(email)) = 'utente.a@test.local'
        ),
        'role', 'authenticated'
    )::text,
    true
);

set local role authenticated;

select public.terminate_contract(
    'f2000000-0000-0000-0000-000000000002'::uuid,
    date '2027-10-31',
    'Cessazione anticipata automatica di test',
    'f5000000-0000-0000-0000-000000000005'::uuid
);

reset role;

-- Nessun duplicato dopo il retry idempotente.
do $$
declare
    v_change_count integer;
    v_audit_count integer;
    v_idempotency_count integer;
begin
    select count(*) into v_change_count
      from public.contract_changes
     where contract_id = 'f2000000-0000-0000-0000-000000000002'
       and change_type = 'EARLY_TERMINATION';

    select count(*) into v_audit_count
      from public.audit_events
     where entity_id = 'f2000000-0000-0000-0000-000000000002'
       and action = 'CONTRACT_TERMINATED';

    select count(*) into v_idempotency_count
      from public.idempotency_keys
     where operation_name = 'terminate_contract'
       and idempotency_key = 'f5000000-0000-0000-0000-000000000005';

    if v_change_count <> 1
       or v_audit_count <> 1
       or v_idempotency_count <> 1 then
        raise exception
            'TERMINATION_TEST_IDEMPOTENCY_FAILED: changes=%, audits=%, keys=%',
            v_change_count, v_audit_count, v_idempotency_count;
    end if;
end;
$$;

-- ============================================================
-- 7. Conflitto idempotenza: stessa chiave, parametri differenti
-- ============================================================

select set_config(
    'request.jwt.claims',
    json_build_object(
        'sub', (
            select id::text
              from auth.users
             where lower(trim(email)) = 'utente.a@test.local'
        ),
        'role', 'authenticated'
    )::text,
    true
);

set local role authenticated;

do $$
declare
    v_failed_as_expected boolean := false;
begin
    begin
        perform public.terminate_contract(
            'f2000000-0000-0000-0000-000000000002'::uuid,
            date '2027-09-30',
            'Parametri differenti con stessa chiave',
            'f5000000-0000-0000-0000-000000000005'::uuid
        );
    exception
        when others then
            if sqlerrm like '%IDEMPOTENCY_CONFLICT%' then
                v_failed_as_expected := true;
            else
                raise;
            end if;
    end;

    if not v_failed_as_expected then
        raise exception
            'TERMINATION_TEST_IDEMPOTENCY_CONFLICT_NOT_RAISED';
    end if;
end;
$$;

reset role;

-- ============================================================
-- 8. Output diagnostico
-- ============================================================

select
    c.internal_code,
    c.management_status,
    c.lifecycle_status,
    c.ended_at::date as effective_end_date,
    ct.status as tenant_status,
    ct.valid_to as tenant_valid_to
from public.contracts c
join public.contract_tenants ct
  on ct.contract_id = c.id
where c.id = 'f2000000-0000-0000-0000-000000000002';

select
    period_start,
    period_end,
    due_date,
    status
from public.rent_installments
where contract_id = 'f2000000-0000-0000-0000-000000000002'
order by period_start;

rollback;

\echo 'TERMINATE CONTRACT TEST PASSED'
