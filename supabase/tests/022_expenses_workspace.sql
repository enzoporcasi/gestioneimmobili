\set ON_ERROR_STOP on
begin;
insert into public.owners(id, owner_type, first_name, last_name)
values ('d0230000-0000-0000-0000-000000000001', 'NATURAL_PERSON', 'Owner', 'Expenses Test');
insert into public.user_owner_accesses(user_id, owner_id, role, valid_from)
values ('796c3053-6a28-4ff5-aa08-06129dcf942e', 'd0230000-0000-0000-0000-000000000001', 'MANAGER', current_date);
insert into public.properties(id, internal_code, name, property_type, municipality)
values ('d0230000-0000-0000-0000-000000000002', 'EXPENSE-UI-023', 'Immobile Spese Test', 'APARTMENT', 'Roma');
insert into public.property_ownerships(property_id, owner_id, ownership_percentage, valid_from)
values ('d0230000-0000-0000-0000-000000000002', 'd0230000-0000-0000-0000-000000000001', 100, current_date);

select set_config('request.jwt.claims', '{"sub":"796c3053-6a28-4ff5-aa08-06129dcf942e","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
    v_result jsonb;
    v_replay jsonb;
    v_expense uuid;
begin
    v_result := public.create_expense_with_allocations(
        p_property_id => 'd0230000-0000-0000-0000-000000000002', p_rentable_space_id => null,
        p_category => 'MAINTENANCE', p_description => 'Riparazione test',
        p_competence_date => current_date, p_total_amount => 125.50, p_allocation_mode => 'OWNERSHIP_QUOTAS',
        p_first_payment_amount => 25.50, p_first_payment_date => current_date,
        p_payer_owner_id => 'd0230000-0000-0000-0000-000000000001', p_payment_method => 'BANK_TRANSFER',
        p_idempotency_key => 'd0230000-0000-0000-0000-000000000003');
    v_replay := public.create_expense_with_allocations(
        p_property_id => 'd0230000-0000-0000-0000-000000000002', p_rentable_space_id => null,
        p_category => 'MAINTENANCE', p_description => 'Riparazione test',
        p_competence_date => current_date, p_total_amount => 125.50, p_allocation_mode => 'OWNERSHIP_QUOTAS',
        p_first_payment_amount => 25.50, p_first_payment_date => current_date,
        p_payer_owner_id => 'd0230000-0000-0000-0000-000000000001', p_payment_method => 'BANK_TRANSFER',
        p_idempotency_key => 'd0230000-0000-0000-0000-000000000003');
    if v_result is distinct from v_replay then raise exception 'EXPENSE_WORKSPACE_REPLAY_FAILED'; end if;
    v_expense := (v_result->>'expense_id')::uuid;
    perform set_config('test.expense_workspace_id', v_expense::text, true);
    if not exists (select 1 from public.v_expenses_workspace where id = v_expense and status = 'PARTIALLY_PAID' and can_manage) then
        raise exception 'EXPENSE_WORKSPACE_READ_FAILED';
    end if;
    if (select count(*) from public.v_expense_payments where expense_id = v_expense) <> 1 then
        raise exception 'EXPENSE_WORKSPACE_PAYMENT_DUPLICATED';
    end if;
    if (select sum(allocated_amount) from public.v_expense_allocations where expense_id = v_expense) <> 125.50 then
        raise exception 'EXPENSE_WORKSPACE_ALLOCATION_FAILED';
    end if;
end;
$$;
reset role;

select set_config('request.jwt.claims', '{"sub":"4a30d9e0-04aa-42f0-93c6-977247230a9c","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
    if exists (select 1 from public.v_expenses_workspace where id = current_setting('test.expense_workspace_id')::uuid)
    or exists (select 1 from public.v_expense_allocations where expense_id = current_setting('test.expense_workspace_id')::uuid)
    or exists (select 1 from public.v_expense_payments where expense_id = current_setting('test.expense_workspace_id')::uuid) then
        raise exception 'EXPENSE_WORKSPACE_CROSS_SCOPE_LEAK';
    end if;
end;
$$;
reset role;

update public.user_owner_accesses set role = 'VIEWER' where owner_id = 'd0230000-0000-0000-0000-000000000001';
select set_config('request.jwt.claims', '{"sub":"796c3053-6a28-4ff5-aa08-06129dcf942e","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
    if not exists (select 1 from public.v_expenses_workspace where id = current_setting('test.expense_workspace_id')::uuid and not can_manage) then
        raise exception 'EXPENSE_WORKSPACE_VIEWER_READ_FAILED';
    end if;
    begin
        perform public.create_expense_with_allocations(
            'd0230000-0000-0000-0000-000000000002', null, 'OTHER', 'Negata', current_date, 10, 'OWNERSHIP_QUOTAS');
        raise exception 'EXPENSE_WORKSPACE_VIEWER_WRITE_ALLOWED';
    exception when raise_exception then
        if sqlerrm <> 'ACCESS_DENIED' then raise; end if;
    end;
end;
$$;
reset role;
rollback;
\echo 'EXPENSES WORKSPACE TEST PASSED'