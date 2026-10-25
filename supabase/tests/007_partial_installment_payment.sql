-- GestioneImmobili - Test automatico RPC record_partial_installment_payment
-- Prerequisiti:
--   - Supabase locale avviato e migration applicate.
--   - Seed locale con utente.a@test.local.
--   - RPC public.record_partial_installment_payment(...).
--
-- Scenario:
--   Canone dovuto:       EUR 1.000
--   Primo pagamento:     EUR   600 -> PARTIAL, residuo EUR 400
--   Sovrappagamento:     EUR   401 -> rifiutato, nessun effetto
--   Secondo pagamento:   EUR   400 -> PAID, residuo EUR 0
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
            'PARTIAL_PAYMENT_TEST_USER_MISSING: atteso utente.a@test.local';
    end if;

    select count(*)
      into v_function_count
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'record_partial_installment_payment';

    if v_function_count <> 1 then
        raise exception
            'PARTIAL_PAYMENT_TEST_RPC_MISSING: trovate % funzioni',
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
-- 2. Fixture isolate
-- ============================================================

insert into public.owners (
    id, owner_type, first_name, last_name, tax_code, status
)
values (
    'e1000000-0000-0000-0000-000000000001',
    'NATURAL_PERSON',
    'Proprietario',
    'Pagamento Parziale',
    'PARTIALPAYOWNER',
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
    'e1000000-0000-0000-0000-000000000001',
    'MANAGER',
    current_date,
    'ACTIVE'
from auth.users
where lower(trim(email)) = 'utente.a@test.local'
and not exists (
    select 1
      from public.user_owner_accesses uoa
     where uoa.user_id = auth.users.id
       and uoa.owner_id = 'e1000000-0000-0000-0000-000000000001'
);

insert into public.properties (
    id, internal_code, name, property_type, status, municipality
)
values (
    'e1100000-0000-0000-0000-000000000001',
    'IMM-PARTIAL-PAY-TEST',
    'Immobile test pagamento parziale',
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
    'e1200000-0000-0000-0000-000000000001',
    'e1100000-0000-0000-0000-000000000001',
    'e1000000-0000-0000-0000-000000000001',
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
    'e2000000-0000-0000-0000-000000000002',
    'CTR-PARTIAL-PAY-TEST',
    'e1100000-0000-0000-0000-000000000001',
    'WHOLE_PROPERTY',
    'RESIDENTIAL',
    'ACTIVE',
    'IN_PROGRESS',
    date '2027-01-01',
    date '2027-12-31',
    'EUR',
    now(),
    'Fixture pagamento parziale'
)
on conflict (id) do update
set property_id = excluded.property_id,
    management_status = 'ACTIVE',
    lifecycle_status = 'IN_PROGRESS',
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    ended_at = null,
    updated_at = now();

insert into public.contract_terms (
    id, contract_id, valid_from, valid_to,
    base_rent_amount, billing_frequency, billing_interval,
    first_billing_period_start, due_day, notes
)
values (
    'e3000000-0000-0000-0000-000000000003',
    'e2000000-0000-0000-0000-000000000002',
    date '2027-01-01',
    null,
    1000.00,
    'MONTHLY',
    null,
    date '2027-02-01',
    5,
    'Term fixture pagamento parziale'
)
on conflict (id) do update
set valid_from = excluded.valid_from,
    valid_to = null,
    base_rent_amount = 1000.00,
    billing_frequency = 'MONTHLY',
    billing_interval = null,
    first_billing_period_start = date '2027-02-01',
    due_day = 5;

-- Pulizia preventiva limitata alla fixture corrente.
delete from public.receipt_allocations
where rent_installment_id = 'e4000000-0000-0000-0000-000000000004';

delete from public.receipts
where property_id = 'e1100000-0000-0000-0000-000000000001'
  and payer_name in (
      'Pagatore Parziale Test',
      'Pagatore Sovrappagamento Test',
      'Pagatore Saldo Test'
  );

delete from public.audit_events
where entity_id = 'e4000000-0000-0000-0000-000000000004';

delete from public.rent_installments
where id = 'e4000000-0000-0000-0000-000000000004';

insert into public.rent_installments (
    id, contract_id, contract_term_id, sequence_number,
    period_start, period_end, due_date,
    amount_due, amount_lost, status, generated_at
)
values (
    'e4000000-0000-0000-0000-000000000004',
    'e2000000-0000-0000-0000-000000000002',
    'e3000000-0000-0000-0000-000000000003',
    20270201,
    date '2027-02-01',
    date '2027-02-28',
    date '2027-02-05',
    1000.00,
    0.00,
    'CREATED',
    now()
);

-- ============================================================
-- 3. Simulazione JWT Utente A
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

-- ============================================================
-- 4. Primo pagamento parziale: EUR 600
-- ============================================================

select public.record_partial_installment_payment(
    'e4000000-0000-0000-0000-000000000004'::uuid,
    600.00,
    date '2027-02-03',
    'BANK_TRANSFER',
    null,
    'Pagatore Parziale Test',
    'Prima quota del Canone'
);

reset role;

-- Verifica il primo pagamento.
do $$
declare
    v_receipts integer;
    v_allocations integer;
    v_received numeric;
    v_residual numeric;
    v_status text;
    v_audit integer;
begin
    select count(*)
      into v_receipts
      from public.receipts
     where property_id = 'e1100000-0000-0000-0000-000000000001'
       and payer_name = 'Pagatore Parziale Test'
       and amount = 600.00
       and status = 'RECORDED';

    select count(*)
      into v_allocations
      from public.receipt_allocations
     where rent_installment_id = 'e4000000-0000-0000-0000-000000000004'
       and allocated_amount = 600.00;

    select amount_received, active_residual, calculated_status
      into v_received, v_residual, v_status
      from public.v_rent_installment_balance
     where id = 'e4000000-0000-0000-0000-000000000004';

    select count(*)
      into v_audit
      from public.audit_events
     where entity_id = 'e4000000-0000-0000-0000-000000000004'
       and action = 'INSTALLMENT_PARTIAL_PAYMENT_RECORDED'
       and outcome = 'SUCCESS';

    if v_receipts <> 1 then
        raise exception
            'PARTIAL_PAYMENT_FIRST_RECEIPT_FAILED: count=%',
            v_receipts;
    end if;

    if v_allocations <> 1 then
        raise exception
            'PARTIAL_PAYMENT_FIRST_ALLOCATION_FAILED: count=%',
            v_allocations;
    end if;

    if v_received <> 600.00
       or v_residual <> 400.00
       or v_status <> 'PARTIAL' then
        raise exception
            'PARTIAL_PAYMENT_FIRST_BALANCE_FAILED: received=%, residual=%, status=%',
            v_received, v_residual, v_status;
    end if;

    if v_audit <> 1 then
        raise exception
            'PARTIAL_PAYMENT_FIRST_AUDIT_FAILED: count=%',
            v_audit;
    end if;
end;
$$;

-- ============================================================
-- 5. Tentativo sovrappagamento: EUR 401 su residuo EUR 400
-- Deve fallire senza effetti collaterali.
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
        perform public.record_partial_installment_payment(
            'e4000000-0000-0000-0000-000000000004'::uuid,
            401.00,
            date '2027-02-04',
            'BANK_TRANSFER',
            null,
            'Pagatore Sovrappagamento Test',
            'Tentativo da rifiutare'
        );
    exception
        when others then
            if sqlerrm like '%PAYMENT_EXCEEDS_RESIDUAL%' then
                v_failed_as_expected := true;
            else
                raise;
            end if;
    end;

    if not v_failed_as_expected then
        raise exception
            'PARTIAL_PAYMENT_OVERPAYMENT_DID_NOT_FAIL';
    end if;
end;
$$;

reset role;

-- Controllo che il tentativo fallito non abbia creato righe.
do $$
declare
    v_bad_receipts integer;
    v_allocation_total numeric;
begin
    select count(*)
      into v_bad_receipts
      from public.receipts
     where property_id = 'e1100000-0000-0000-0000-000000000001'
       and payer_name = 'Pagatore Sovrappagamento Test';

    select coalesce(sum(allocated_amount), 0)
      into v_allocation_total
      from public.receipt_allocations
     where rent_installment_id = 'e4000000-0000-0000-0000-000000000004';

    if v_bad_receipts <> 0 or v_allocation_total <> 600.00 then
        raise exception
            'PARTIAL_PAYMENT_OVERPAYMENT_SIDE_EFFECTS: receipts=%, allocation_total=%',
            v_bad_receipts, v_allocation_total;
    end if;
end;
$$;

-- ============================================================
-- 6. Secondo pagamento: saldo EUR 400
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

select public.record_partial_installment_payment(
    'e4000000-0000-0000-0000-000000000004'::uuid,
    400.00,
    date '2027-02-05',
    'BANK_TRANSFER',
    null,
    'Pagatore Saldo Test',
    'Saldo del Canone'
);

reset role;

-- Verifica saldo finale.
do $$
declare
    v_receipts integer;
    v_allocations integer;
    v_receipt_total numeric;
    v_allocation_total numeric;
    v_received numeric;
    v_residual numeric;
    v_status text;
    v_physical_status text;
    v_partial_audit integer;
    v_paid_audit integer;
begin
    select count(*), sum(amount)
      into v_receipts, v_receipt_total
      from public.receipts
     where property_id = 'e1100000-0000-0000-0000-000000000001'
       and payer_name in (
           'Pagatore Parziale Test',
           'Pagatore Saldo Test'
       )
       and status = 'RECORDED';

    select count(*), sum(allocated_amount)
      into v_allocations, v_allocation_total
      from public.receipt_allocations
     where rent_installment_id = 'e4000000-0000-0000-0000-000000000004';

    select amount_received, active_residual, calculated_status, status
      into v_received, v_residual, v_status, v_physical_status
      from public.v_rent_installment_balance
     where id = 'e4000000-0000-0000-0000-000000000004';

    select count(*)
      into v_partial_audit
      from public.audit_events
     where entity_id = 'e4000000-0000-0000-0000-000000000004'
       and action = 'INSTALLMENT_PARTIAL_PAYMENT_RECORDED';

    select count(*)
      into v_paid_audit
      from public.audit_events
     where entity_id = 'e4000000-0000-0000-0000-000000000004'
       and action = 'INSTALLMENT_PAID';

    if v_receipts <> 2 or v_receipt_total <> 1000.00 then
        raise exception
            'PARTIAL_PAYMENT_FINAL_RECEIPTS_FAILED: count=%, total=%',
            v_receipts, v_receipt_total;
    end if;

    if v_allocations <> 2 or v_allocation_total <> 1000.00 then
        raise exception
            'PARTIAL_PAYMENT_FINAL_ALLOCATIONS_FAILED: count=%, total=%',
            v_allocations, v_allocation_total;
    end if;

    if v_received <> 1000.00
       or v_residual <> 0.00
       or v_status <> 'PAID'
       or v_physical_status <> 'PAID' then
        raise exception
            'PARTIAL_PAYMENT_FINAL_BALANCE_FAILED: received=%, residual=%, calculated=%, physical=%',
            v_received, v_residual, v_status, v_physical_status;
    end if;

    if v_partial_audit <> 1 or v_paid_audit <> 1 then
        raise exception
            'PARTIAL_PAYMENT_FINAL_AUDIT_FAILED: partial=%, paid=%',
            v_partial_audit, v_paid_audit;
    end if;
end;
$$;

-- ============================================================
-- 7. Terzo pagamento dopo saldo: deve fallire
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
        perform public.record_partial_installment_payment(
            'e4000000-0000-0000-0000-000000000004'::uuid,
            1.00,
            date '2027-02-06',
            'BANK_TRANSFER',
            null,
            'Pagatore Terzo Tentativo',
            'Tentativo dopo saldo'
        );
    exception
        when others then
            if sqlerrm like '%INSTALLMENT_ALREADY_SETTLED%'
               or sqlerrm like '%INSTALLMENT_NOT_PAYABLE%' then
                v_failed_as_expected := true;
            else
                raise;
            end if;
    end;

    if not v_failed_as_expected then
        raise exception
            'PARTIAL_PAYMENT_THIRD_PAYMENT_DID_NOT_FAIL';
    end if;
end;
$$;

reset role;

-- ============================================================
-- 8. Output diagnostico
-- ============================================================

select
    b.id as installment_id,
    b.amount_due,
    b.amount_received,
    b.active_residual,
    b.calculated_status,
    b.status as physical_status,
    count(a.id) as allocation_count,
    sum(a.allocated_amount) as allocated_total
from public.v_rent_installment_balance b
join public.receipt_allocations a
  on a.rent_installment_id = b.id
where b.id = 'e4000000-0000-0000-0000-000000000004'
group by
    b.id,
    b.amount_due,
    b.amount_received,
    b.active_residual,
    b.calculated_status,
    b.status;

rollback;

\echo 'PARTIAL INSTALLMENT PAYMENT TEST PASSED'
