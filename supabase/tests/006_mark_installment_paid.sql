-- GestioneImmobili - Test automatico RPC mark_installment_paid
-- Prerequisiti:
--   - Supabase locale avviato e migration applicate.
--   - Utente Auth: utente.a@test.local
--   - RPC public.mark_installment_paid(uuid,date,text,uuid,text)
--
-- Il test è non distruttivo: tutte le fixture vengono annullate con ROLLBACK.

\set ON_ERROR_STOP on

begin;

-- ============================================================
-- 1. Verifica prerequisito Auth e crea/aggiorna il profilo
-- ============================================================

do $$
declare
    v_count integer;
begin
    select count(*)
      into v_count
      from auth.users
     where lower(trim(email)) = 'utente.a@test.local';

    if v_count <> 1 then
        raise exception
            'PAYMENT_TEST_USER_MISSING: atteso utente.a@test.local';
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
-- 2. Fixture: Proprietario, Accesso, Immobile, Contratto, Term, Canone
-- ============================================================

insert into public.owners (
    id, owner_type, first_name, last_name, tax_code, status
)
values (
    'd1000000-0000-0000-0000-000000000001',
    'NATURAL_PERSON', 'Proprietario', 'Pagamento',
    'PAYMENTTESTOWNER', 'ACTIVE'
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
    'd1000000-0000-0000-0000-000000000001',
    'MANAGER',
    current_date,
    'ACTIVE'
from auth.users
where lower(trim(email)) = 'utente.a@test.local'
and not exists (
    select 1
      from public.user_owner_accesses uoa
     where uoa.user_id = auth.users.id
       and uoa.owner_id = 'd1000000-0000-0000-0000-000000000001'
);

insert into public.properties (
    id, internal_code, name, property_type, status, municipality
)
values (
    'd1100000-0000-0000-0000-000000000001',
    'IMM-PAYMENT-TEST',
    'Immobile test pagamento',
    'APARTMENT', 'ACTIVE', 'Roma'
)
on conflict (id) do update
set name = excluded.name,
    status = excluded.status,
    updated_at = now();

insert into public.property_ownerships (
    id, property_id, owner_id, ownership_percentage, valid_from
)
values (
    'd1200000-0000-0000-0000-000000000001',
    'd1100000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000001',
    100,
    current_date
)
on conflict (id) do update
set ownership_percentage = 100,
    valid_from = excluded.valid_from,
    valid_to = null;

insert into public.contracts (
    id, internal_code, property_id, object_type, contract_type,
    management_status, lifecycle_status, start_date, end_date,
    currency, activated_at, notes
)
values (
    'd2000000-0000-0000-0000-000000000002',
    'CTR-PAYMENT-TEST',
    'd1100000-0000-0000-0000-000000000001',
    'WHOLE_PROPERTY', 'RESIDENTIAL',
    'ACTIVE', 'IN_PROGRESS',
    date '2027-01-01', date '2027-12-31',
    'EUR', now(), 'Fixture pagamento atomico'
)
on conflict (id) do update
set management_status = 'ACTIVE',
    lifecycle_status = 'IN_PROGRESS',
    ended_at = null,
    updated_at = now();

insert into public.contract_terms (
    id, contract_id, valid_from, valid_to,
    base_rent_amount, billing_frequency, billing_interval,
    first_billing_period_start, due_day, notes
)
values (
    'd3000000-0000-0000-0000-000000000003',
    'd2000000-0000-0000-0000-000000000002',
    date '2027-01-01', null,
    1000.00, 'MONTHLY', null,
    date '2027-02-01', 5,
    'Term test pagamento'
)
on conflict (id) do update
set base_rent_amount = 1000.00,
    first_billing_period_start = date '2027-02-01',
    due_day = 5,
    valid_to = null;

-- Pulizia preventiva delle sole fixture fisse, sempre dentro la transazione.
delete from public.receipt_allocations
where rent_installment_id = 'd4000000-0000-0000-0000-000000000004';

delete from public.receipts
where property_id = 'd1100000-0000-0000-0000-000000000001'
  and notes = 'Receipt creato dal test automatico';

delete from public.audit_events
where entity_id = 'd4000000-0000-0000-0000-000000000004';

delete from public.rent_installments
where id = 'd4000000-0000-0000-0000-000000000004';

insert into public.rent_installments (
    id, contract_id, contract_term_id, sequence_number,
    period_start, period_end, due_date,
    amount_due, amount_lost, status, generated_at
)
values (
    'd4000000-0000-0000-0000-000000000004',
    'd2000000-0000-0000-0000-000000000002',
    'd3000000-0000-0000-0000-000000000003',
    20270201,
    date '2027-02-01', date '2027-02-28', date '2027-02-05',
    1000.00, 0.00, 'CREATED', now()
);

-- ============================================================
-- 3. Simula Utente A ed esegue il pagamento
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

select public.mark_installment_paid(
    'd4000000-0000-0000-0000-000000000004'::uuid,
    date '2027-02-05',
    'BANK_TRANSFER',
    null,
    'Pagatore Test'
);

reset role;

-- ============================================================
-- 4. Verifica Incasso, Allocazione, saldo derivato e Audit
-- ============================================================

do $$
declare
    v_receipt_count integer;
    v_allocation_count integer;
    v_receipt_amount numeric;
    v_allocated_amount numeric;
    v_received numeric;
    v_residual numeric;
    v_calculated_status text;
    v_audit_count integer;
begin
    select count(*), min(amount)
      into v_receipt_count, v_receipt_amount
      from public.receipts
     where property_id = 'd1100000-0000-0000-0000-000000000001'
       and payer_name = 'Pagatore Test'
       and payment_date = date '2027-02-05'
       and status = 'RECORDED';

    if v_receipt_count <> 1 or v_receipt_amount <> 1000.00 then
        raise exception
            'PAYMENT_TEST_RECEIPT_FAILED: count=%, amount=%',
            v_receipt_count, v_receipt_amount;
    end if;

    select count(*), min(allocated_amount)
      into v_allocation_count, v_allocated_amount
      from public.receipt_allocations
     where rent_installment_id = 'd4000000-0000-0000-0000-000000000004';

    if v_allocation_count <> 1 or v_allocated_amount <> 1000.00 then
        raise exception
            'PAYMENT_TEST_ALLOCATION_FAILED: count=%, amount=%',
            v_allocation_count, v_allocated_amount;
    end if;

    select amount_received, active_residual, calculated_status
      into v_received, v_residual, v_calculated_status
      from public.v_rent_installment_balance
     where id = 'd4000000-0000-0000-0000-000000000004';

    if v_received <> 1000.00
       or v_residual <> 0.00
       or v_calculated_status <> 'PAID' then
        raise exception
            'PAYMENT_TEST_BALANCE_FAILED: received=%, residual=%, status=%',
            v_received, v_residual, v_calculated_status;
    end if;

    select count(*)
      into v_audit_count
      from public.audit_events
     where entity_id = 'd4000000-0000-0000-0000-000000000004'
       and action = 'INSTALLMENT_PAID'
       and outcome = 'SUCCESS';

    if v_audit_count <> 1 then
        raise exception
            'PAYMENT_TEST_AUDIT_FAILED: count=%',
            v_audit_count;
    end if;
end;
$$;

-- ============================================================
-- 5. Secondo pagamento: deve fallire senza creare duplicati
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
        perform public.mark_installment_paid(
            'd4000000-0000-0000-0000-000000000004'::uuid,
            date '2027-02-05',
            'BANK_TRANSFER',
            null,
            'Secondo Pagatore Test'
        );
    exception
        when others then
            if sqlerrm like '%INSTALLMENT_NOT_PAYABLE%'
               or sqlerrm like '%INSTALLMENT_ALREADY_SETTLED%' then
                v_failed_as_expected := true;
            else
                raise;
            end if;
    end;

    if not v_failed_as_expected then
        raise exception 'PAYMENT_TEST_DUPLICATE_DID_NOT_FAIL';
    end if;
end;
$$;

reset role;

-- Dopo l'eccezione catturata non devono esserci righe aggiuntive.
do $$
declare
    v_receipt_count integer;
    v_allocation_count integer;
    v_audit_count integer;
begin
    select count(*)
      into v_receipt_count
      from public.receipts
     where property_id = 'd1100000-0000-0000-0000-000000000001'
       and payment_date = date '2027-02-05'
       and payer_name in ('Pagatore Test', 'Secondo Pagatore Test');

    select count(*)
      into v_allocation_count
      from public.receipt_allocations
     where rent_installment_id = 'd4000000-0000-0000-0000-000000000004';

    select count(*)
      into v_audit_count
      from public.audit_events
     where entity_id = 'd4000000-0000-0000-0000-000000000004'
       and action = 'INSTALLMENT_PAID';

    if v_receipt_count <> 1
       or v_allocation_count <> 1
       or v_audit_count <> 1 then
        raise exception
            'PAYMENT_TEST_DUPLICATE_SIDE_EFFECTS: receipts=%, allocations=%, audits=%',
            v_receipt_count, v_allocation_count, v_audit_count;
    end if;
end;
$$;

-- ============================================================
-- 6. Output diagnostico e rollback
-- ============================================================

select
    b.id as installment_id,
    b.amount_due,
    b.amount_received,
    b.active_residual,
    b.calculated_status,
    r.id as receipt_id,
    r.amount as receipt_amount,
    r.payment_method,
    a.allocated_amount
from public.v_rent_installment_balance b
join public.receipt_allocations a
  on a.rent_installment_id = b.id
join public.receipts r
  on r.id = a.receipt_id
where b.id = 'd4000000-0000-0000-0000-000000000004';

rollback;

\echo 'MARK INSTALLMENT PAID TEST PASSED'
