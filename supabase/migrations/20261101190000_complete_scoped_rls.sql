create policy user_owner_accesses_self_select
on public.user_owner_accesses
for select to authenticated
using (user_id = (select auth.uid()));

create policy contract_rentable_spaces_select
on public.contract_rentable_spaces
for select to authenticated
using (
    security.can_access_contract(contract_id, 'VIEWER')
    and exists (
        select 1
        from public.rentable_spaces space
        where space.id = rentable_space_id
          and security.can_access_property(space.property_id, 'VIEWER')
    )
);

create policy contract_tenants_select
on public.contract_tenants
for select to authenticated
using (security.can_access_contract(contract_id, 'VIEWER'));

create policy contract_terms_select
on public.contract_terms
for select to authenticated
using (security.can_access_contract(contract_id, 'VIEWER'));

create policy contract_changes_select
on public.contract_changes
for select to authenticated
using (security.can_access_contract(contract_id, 'VIEWER'));

create policy rent_installment_components_select
on public.rent_installment_components
for select to authenticated
using (security.can_access_installment(rent_installment_id, 'VIEWER'));

create policy receipts_select
on public.receipts
for select to authenticated
using (security.can_access_property(property_id, 'VIEWER'));

create policy receipt_allocations_select
on public.receipt_allocations
for select to authenticated
using (
    exists (
        select 1
        from public.receipts receipt
        where receipt.id = receipt_id
          and security.can_access_property(receipt.property_id, 'VIEWER')
    )
    and security.can_access_installment(rent_installment_id, 'VIEWER')
);

create policy expense_allocations_select
on public.expense_allocations
for select to authenticated
using (
    security.can_access_expense(expense_id, 'VIEWER')
    and security.can_access_owner(owner_id, 'VIEWER')
);

create policy expense_payments_select
on public.expense_payments
for select to authenticated
using (
    exists (
        select 1
        from public.expenses expense
        where expense.id = expense_id
          and security.can_access_property(expense.property_id, 'VIEWER')
    )
    and (
        payer_owner_id is null
        or security.can_access_owner(payer_owner_id, 'VIEWER')
    )
);

create policy owner_settlement_items_select
on public.owner_settlement_items
for select to authenticated
using (
    security.can_access_property(property_id, 'VIEWER')
    and security.can_access_owner(creditor_owner_id, 'VIEWER')
    and security.can_access_owner(debtor_owner_id, 'VIEWER')
    and (
        expense_id is null
        or security.can_access_expense(expense_id, 'VIEWER')
    )
);

create policy deadlines_assigned_user_select
on public.deadlines
for select to authenticated
using (responsible_user_id = (select auth.uid()));

create policy deadline_documents_assigned_user_select
on public.deadline_documents
for select to authenticated
using (
    exists (
        select 1
        from public.deadlines deadline
        where deadline.id = deadline_id
          and deadline.responsible_user_id = (select auth.uid())
    )
    and security.can_access_document(document_id, 'VIEWER')
);

create policy notification_rules_recipient_select
on public.notification_rules
for select to authenticated
using (recipient_user_id = (select auth.uid()));

create policy notification_deliveries_recipient_select
on public.notification_deliveries
for select to authenticated
using (
    exists (
        select 1
        from public.notification_rules rule
        where rule.id = notification_rule_id
          and rule.recipient_user_id = (select auth.uid())
    )
);

create policy legal_documents_active_select
on public.legal_documents
for select to authenticated
using (status = 'ACTIVE');

create policy legal_document_versions_current_select
on public.legal_document_versions
for select to authenticated
using (
    effective_from <= current_date
    and published_at <= now()
    and (retired_at is null or retired_at > now())
);

-- These tables are reserved for server-side workflows and contain secrets,
-- operational metadata, or privileged audit data. Keep client reads explicitly denied.
create policy invitations_server_only
on public.invitations
for select to authenticated
using (false);

create policy invitation_owners_server_only
on public.invitation_owners
for select to authenticated
using (false);

create policy document_category_entity_map_server_only
on public.document_category_entity_map
for select to authenticated
using (false);

create policy audit_events_server_only
on public.audit_events
for select to authenticated
using (false);

create policy security_events_server_only
on public.security_events
for select to authenticated
using (false);

create policy billing_generation_runs_server_only
on public.billing_generation_runs
for select to authenticated
using (false);

create policy idempotency_keys_server_only
on public.idempotency_keys
for select to authenticated
using (false);
