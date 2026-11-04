create or replace view public.v_billing_installments
with (security_invoker = true)
as
select
    balance.id,
    balance.contract_id,
    contract.property_id,
    property.name as property_name,
    contract.internal_code as contract_code,
    balance.period_start,
    balance.period_end,
    balance.due_date,
    balance.amount_due,
    balance.amount_received,
    balance.amount_lost,
    balance.active_residual,
    balance.calculated_status,
    security.can_access_installment(balance.id, 'MANAGER') as can_record_payment,
    (
        select string_agg(
            coalesce(tenant.business_name, concat_ws(' ', tenant.first_name, tenant.last_name)),
            ', ' order by association.valid_from
        )
        from public.contract_tenants association
        join public.tenants tenant on tenant.id = association.tenant_id
        where association.contract_id = contract.id
          and association.valid_from <= balance.period_start
          and (association.valid_to is null or association.valid_to > balance.period_start)
    ) as tenant_name
from public.v_rent_installment_balance balance
join public.contracts contract on contract.id = balance.contract_id
join public.properties property on property.id = contract.property_id;

create or replace view public.v_billing_receipts
with (security_invoker = true)
as
select
    allocation.id as allocation_id,
    allocation.rent_installment_id as installment_id,
    receipt.id as receipt_id,
    receipt.payment_date,
    receipt.payment_method,
    receipt.payer_name,
    receipt.status,
    receipt.notes,
    receipt.created_at,
    allocation.allocated_amount as amount,
    contract.property_id,
    property.name as property_name,
    contract.internal_code as contract_code,
    installment.period_start,
    installment.period_end
from public.receipt_allocations allocation
join public.receipts receipt on receipt.id = allocation.receipt_id
join public.rent_installments installment on installment.id = allocation.rent_installment_id
join public.contracts contract on contract.id = installment.contract_id
join public.properties property on property.id = contract.property_id;

create or replace view public.v_billing_contracts
with (security_invoker = true)
as
select contract.id, contract.internal_code, contract.property_id,
    property.name as property_name, contract.management_status,
    security.can_access_contract(contract.id, 'MANAGER') as can_generate
from public.contracts contract
join public.properties property on property.id = contract.property_id;

revoke all on public.v_billing_installments, public.v_billing_receipts, public.v_billing_contracts from public, anon, authenticated;
grant select on public.v_billing_installments, public.v_billing_receipts, public.v_billing_contracts to authenticated;

create or replace function public.generate_contract_installments(p_contract_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, security
as $$
declare
    v_contract public.contracts%rowtype;
    v_term public.contract_terms%rowtype;
    v_start date;
    v_next date;
    v_limit date;
    v_months integer;
    v_rows integer;
    v_created integer := 0;
begin
    if auth.uid() is null then
        raise exception 'AUTHENTICATION_REQUIRED';
    end if;
    if security.can_access_contract(p_contract_id, 'MANAGER') is not true then
        raise exception 'ACCESS_DENIED';
    end if;

    select * into v_contract from public.contracts where id = p_contract_id for update;
    if not found or v_contract.management_status <> 'ACTIVE' then
        raise exception 'CONTRACT_NOT_ACTIVE';
    end if;

    v_limit := least(current_date, v_contract.end_date, coalesce(v_contract.ended_at::date, v_contract.end_date));
    for v_term in
        select * from public.contract_terms
        where contract_id = p_contract_id
        order by valid_from
    loop
        v_months := case v_term.billing_frequency
            when 'MONTHLY' then 1
            when 'BIMONTHLY' then 2
            when 'QUARTERLY' then 3
            when 'SEMIANNUAL' then 6
            when 'ANNUAL' then 12
            when 'CUSTOM' then v_term.billing_interval
        end;
        if v_months is null or v_months <= 0 then
            raise exception 'UNSUPPORTED_BILLING_FREQUENCY';
        end if;
        if v_term.due_day is null or v_term.due_day not between 1 and 31 then
            raise exception 'INVALID_DUE_DAY';
        end if;

        v_start := greatest(v_term.first_billing_period_start, v_term.valid_from, v_contract.start_date);
        while v_start <= v_limit loop
            exit when v_term.valid_to is not null and v_start >= v_term.valid_to;
            v_next := (v_start + make_interval(months => v_months))::date;
            insert into public.rent_installments (
                contract_id, contract_term_id, sequence_number, period_start,
                period_end, due_date, amount_due, status
            ) values (
                p_contract_id, v_term.id, to_char(v_start, 'YYYYMMDD')::integer,
                v_start, v_next - 1, public.calculate_due_date(v_start, v_term.due_day),
                v_term.base_rent_amount, 'CREATED'
            ) on conflict (contract_id, period_start, period_end) do nothing;
            get diagnostics v_rows = row_count;
            v_created := v_created + v_rows;
            v_start := v_next;
        end loop;
    end loop;

    insert into public.audit_events (actor_user_id, action, entity_type, entity_id, outcome, metadata)
    values (auth.uid(), 'CONTRACT_INSTALLMENTS_GENERATED', 'CONTRACT', p_contract_id,
        'SUCCESS', jsonb_build_object('reference_date', current_date, 'installments_created', v_created));
    return jsonb_build_object('contract_id', p_contract_id, 'installments_created', v_created, 'reference_date', current_date);
end;
$$;
revoke all on function public.generate_contract_installments(uuid) from public, anon;
grant execute on function public.generate_contract_installments(uuid) to authenticated;