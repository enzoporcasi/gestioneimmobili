insert into public.reference_catalog_items (catalog_code, code, label, sort_order)
values ('expense_status', 'PARTIALLY_PAID', 'Parzialmente pagata', 4)
on conflict (catalog_code, code) do nothing;

create or replace view public.v_expenses_workspace
with (security_invoker = true)
as
select expense.id, expense.property_id, property.name as property_name,
    expense.category, expense.description, expense.competence_date,
    expense.total_amount, expense.status, expense.allocation_mode,
    expense.notes, expense.created_at,
    security.can_access_property(expense.property_id, 'MANAGER') as can_manage
from public.expenses expense
join public.properties property on property.id = expense.property_id;

create or replace view public.v_expense_ownerships
with (security_invoker = true)
as
select ownership.id, ownership.property_id, ownership.owner_id,
    coalesce(owner.business_name, concat_ws(' ', owner.first_name, owner.last_name)) as owner_name,
    ownership.ownership_percentage, ownership.valid_from, ownership.valid_to
from public.property_ownerships ownership
join public.owners owner on owner.id = ownership.owner_id;

create or replace view public.v_expense_allocations
with (security_invoker = true)
as
select allocation.id, allocation.expense_id,
    coalesce(owner.business_name, concat_ws(' ', owner.first_name, owner.last_name)) as owner_name,
    allocation.percentage, allocation.allocated_amount
from public.expense_allocations allocation
join public.owners owner on owner.id = allocation.owner_id;

create or replace view public.v_expense_payments
with (security_invoker = true)
as
select payment.id, payment.expense_id, payment.payment_date,
    payment.amount, payment.payment_method, payment.status,
    coalesce(owner.business_name, concat_ws(' ', owner.first_name, owner.last_name)) as payer_name
from public.expense_payments payment
left join public.owners owner on owner.id = payment.payer_owner_id;

create or replace view public.v_expense_properties
with (security_invoker = true)
as
select property.id, property.name, property.internal_code,
    security.can_access_property(property.id, 'MANAGER') as can_manage
from public.properties property;

revoke all on public.v_expenses_workspace, public.v_expense_ownerships,
    public.v_expense_allocations, public.v_expense_payments, public.v_expense_properties from public, anon, authenticated;
grant select on public.v_expenses_workspace, public.v_expense_ownerships,
    public.v_expense_allocations, public.v_expense_payments, public.v_expense_properties to authenticated;