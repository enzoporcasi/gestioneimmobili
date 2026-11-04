\set ON_ERROR_STOP on
begin;

insert into public.owners(id, owner_type, first_name, last_name)
values ('d0200000-0000-0000-0000-000000000001', 'NATURAL_PERSON', 'Owner', 'Billing Test');
insert into public.user_owner_accesses(user_id, owner_id, role, valid_from)
values ('796c3053-6a28-4ff5-aa08-06129dcf942e', 'd0200000-0000-0000-0000-000000000001', 'MANAGER', current_date);
insert into public.properties(id, internal_code, name, property_type, municipality)
values ('d0200000-0000-0000-0000-000000000002', 'BILLING-020', 'Immobile Billing Test', 'APARTMENT', 'Roma');
insert into public.property_ownerships(property_id, owner_id, ownership_percentage, valid_from)
values ('d0200000-0000-0000-0000-000000000002', 'd0200000-0000-0000-0000-000000000001', 100, current_date);
insert into public.contracts(id, internal_code, property_id, object_type, contract_type, management_status, start_date, end_date)
values ('d0200000-0000-0000-0000-000000000003', 'BILLING-CONTRACT-020', 'd0200000-0000-0000-0000-000000000002',
    'WHOLE_PROPERTY', 'RESIDENTIAL_FREE', 'ACTIVE', date_trunc('month', current_date)::date, (current_date + interval '4 years')::date);
insert into public.contract_terms(contract_id, valid_from, base_rent_amount, billing_frequency, first_billing_period_start, due_day)
values ('d0200000-0000-0000-0000-000000000003', date_trunc('month', current_date)::date,
    1000, 'MONTHLY', date_trunc('month', current_date)::date, 5);

select set_config('request.jwt.claims', '{"sub":"796c3053-6a28-4ff5-aa08-06129dcf942e","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
    v_result jsonb;
    v_installment uuid;
    v_receipt jsonb;
begin
    v_result := public.generate_contract_installments('d0200000-0000-0000-0000-000000000003');
    if (v_result->>'installments_created')::integer <> 1 then raise exception 'BILLING_GENERATION_FAILED'; end if;
    v_result := public.generate_contract_installments('d0200000-0000-0000-0000-000000000003');
    if (v_result->>'installments_created')::integer <> 0 then raise exception 'BILLING_DUPLICATE_INSTALLMENT'; end if;

    select id into strict v_installment from public.v_billing_installments
    where contract_id = 'd0200000-0000-0000-0000-000000000003' and can_record_payment;
    v_receipt := public.record_partial_installment_payment(
        p_installment_id => v_installment, p_amount => 250, p_payment_date => current_date,
        p_payment_method => 'BANK_TRANSFER', p_idempotency_key => 'd0200000-0000-0000-0000-000000000004');
    perform set_config('test.billing_receipt_id', v_receipt->>'receipt_id', true);
    if public.record_partial_installment_payment(
        p_installment_id => v_installment, p_amount => 250, p_payment_date => current_date,
        p_payment_method => 'BANK_TRANSFER', p_idempotency_key => 'd0200000-0000-0000-0000-000000000004')
        is distinct from v_receipt then raise exception 'BILLING_PAYMENT_REPLAY_FAILED'; end if;
    if (select active_residual from public.v_billing_installments where id = v_installment) <> 750 then
        raise exception 'BILLING_RESIDUAL_FAILED';
    end if;
    if (select count(*) from public.v_billing_receipts where installment_id = v_installment) <> 1 then
        raise exception 'BILLING_RECEIPT_HISTORY_FAILED';
    end if;
end;
$$;
reset role;

select set_config('request.jwt.claims', '{"sub":"4a30d9e0-04aa-42f0-93c6-977247230a9c","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
    if exists (select 1 from public.v_billing_installments where contract_id = 'd0200000-0000-0000-0000-000000000003') then
        raise exception 'BILLING_CROSS_SCOPE_INSTALLMENT_LEAK';
    end if;
    if exists (select 1 from public.v_billing_receipts
        where receipt_id = current_setting('test.billing_receipt_id')::uuid) then
        raise exception 'BILLING_CROSS_SCOPE_RECEIPT_LEAK';
    end if;
    if exists (select 1 from public.v_billing_contracts where id = 'd0200000-0000-0000-0000-000000000003') then
        raise exception 'BILLING_CROSS_SCOPE_CONTRACT_LEAK';
    end if;
    begin
        perform public.generate_contract_installments('d0200000-0000-0000-0000-000000000003');
        raise exception 'BILLING_CROSS_SCOPE_GENERATION_ALLOWED';
    exception when raise_exception then
        if sqlerrm <> 'ACCESS_DENIED' then raise; end if;
    end;
end;
$$;
reset role;

update public.user_owner_accesses set role = 'VIEWER'
where owner_id = 'd0200000-0000-0000-0000-000000000001';
select set_config('request.jwt.claims', '{"sub":"796c3053-6a28-4ff5-aa08-06129dcf942e","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
    if not exists (select 1 from public.v_billing_installments where contract_id = 'd0200000-0000-0000-0000-000000000003' and not can_record_payment) then
        raise exception 'BILLING_VIEWER_READ_FAILED';
    end if;
    begin
        perform public.generate_contract_installments('d0200000-0000-0000-0000-000000000003');
        raise exception 'BILLING_VIEWER_GENERATION_ALLOWED';
    exception when raise_exception then
        if sqlerrm <> 'ACCESS_DENIED' then raise; end if;
    end;
    begin
        perform public.record_partial_installment_payment(
            p_installment_id => (select id from public.v_billing_installments where contract_id = 'd0200000-0000-0000-0000-000000000003'),
            p_amount => 250, p_payment_date => current_date, p_payment_method => 'BANK_TRANSFER',
            p_idempotency_key => 'd0200000-0000-0000-0000-000000000004');
        raise exception 'BILLING_VIEWER_PAYMENT_REPLAY_ALLOWED';
    exception when raise_exception then
        if sqlerrm <> 'ACCESS_DENIED' then raise; end if;
    end;
end;
$$;
reset role;

update public.user_owner_accesses set role = 'MANAGER'
where owner_id = 'd0200000-0000-0000-0000-000000000001';
update public.contracts set management_status = 'INACTIVE'
where id = 'd0200000-0000-0000-0000-000000000003';
set local role authenticated;
do $$
begin
    begin
        perform public.generate_contract_installments('d0200000-0000-0000-0000-000000000003');
        raise exception 'BILLING_INACTIVE_CONTRACT_GENERATION_ALLOWED';
    exception when raise_exception then
        if sqlerrm <> 'CONTRACT_NOT_ACTIVE' then raise; end if;
    end;
end;
$$;
reset role;
rollback;
\echo 'BILLING WORKSPACE TEST PASSED'