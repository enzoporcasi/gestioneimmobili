begin;

select plan(24);

insert into public.profiles (
    id, first_name, last_name, display_name, status
)
select
    id,
    'Utente',
    case email
        when 'utente.a@test.local' then 'A'
        else 'B'
    end,
    case email
        when 'utente.a@test.local' then 'Utente A'
        else 'Utente B'
    end,
    'ACTIVE'
from auth.users
where email in ('utente.a@test.local', 'utente.b@test.local')
on conflict (id) do update
set status = 'ACTIVE',
    archived_at = null,
    updated_at = now();

select is(
    (select count(*)::integer from auth.users
     where email in ('utente.a@test.local', 'utente.b@test.local')),
    2,
    'local RLS test users are present'
);

insert into public.owners (
    id, owner_type, first_name, last_name, tax_code, status
)
values
    ('a1800000-0000-0000-0000-000000000001',
     'NATURAL_PERSON', 'Owner', 'RLS A', 'RLS018A', 'ACTIVE'),
    ('b1800000-0000-0000-0000-000000000002',
     'NATURAL_PERSON', 'Owner', 'RLS B', 'RLS018B', 'ACTIVE'),
    ('c1800000-0000-0000-0000-000000000003',
     'NATURAL_PERSON', 'Owner', 'RLS A2', 'RLS018C', 'ACTIVE')
on conflict (id) do update
set first_name = excluded.first_name,
    last_name = excluded.last_name,
    tax_code = excluded.tax_code,
    status = excluded.status,
    archived_at = null;

insert into public.user_owner_accesses (
    user_id, owner_id, role, valid_from, status
)
select user_id, owner_id, 'MANAGER', current_date, 'ACTIVE'
from (values
    ('796c3053-6a28-4ff5-aa08-06129dcf942e'::uuid,
     'a1800000-0000-0000-0000-000000000001'::uuid),
    ('4a30d9e0-04aa-42f0-93c6-977247230a9c'::uuid,
     'b1800000-0000-0000-0000-000000000002'::uuid),
    ('796c3053-6a28-4ff5-aa08-06129dcf942e'::uuid,
     'c1800000-0000-0000-0000-000000000003'::uuid)
) fixture(user_id, owner_id)
where not exists (
    select 1
    from public.user_owner_accesses access
    where access.user_id = fixture.user_id
      and access.owner_id = fixture.owner_id
      and access.status = 'ACTIVE'
);

insert into public.properties (
    id, internal_code, name, property_type, status, municipality
)
values
    ('a1810000-0000-0000-0000-000000000001',
     'RLS018-A', 'RLS Property A', 'APARTMENT', 'ACTIVE', 'Roma'),
    ('b1810000-0000-0000-0000-000000000002',
     'RLS018-B', 'RLS Property B', 'APARTMENT', 'ACTIVE', 'Roma')
on conflict (id) do update
set internal_code = excluded.internal_code,
    name = excluded.name,
    status = excluded.status,
    archived_at = null;

insert into public.property_ownerships (
    id, property_id, owner_id, ownership_percentage, valid_from
)
values
    ('a1820000-0000-0000-0000-000000000001',
     'a1810000-0000-0000-0000-000000000001',
     'a1800000-0000-0000-0000-000000000001', 100, current_date),
    ('b1820000-0000-0000-0000-000000000002',
     'b1810000-0000-0000-0000-000000000002',
     'b1800000-0000-0000-0000-000000000002', 100, current_date)
on conflict (id) do update
set property_id = excluded.property_id,
    owner_id = excluded.owner_id,
    ownership_percentage = excluded.ownership_percentage,
    valid_from = excluded.valid_from,
    valid_to = null;

insert into public.rentable_spaces (
    id, property_id, code, name, space_type
)
values
    ('a1830000-0000-0000-0000-000000000001',
     'a1810000-0000-0000-0000-000000000001',
     'RLS018-A', 'RLS Space A', 'ROOM'),
    ('b1830000-0000-0000-0000-000000000002',
     'b1810000-0000-0000-0000-000000000002',
     'RLS018-B', 'RLS Space B', 'ROOM')
on conflict (id) do update
set property_id = excluded.property_id,
    code = excluded.code,
    name = excluded.name;

insert into public.contracts (
    id, internal_code, property_id, object_type, contract_type,
    start_date, end_date
)
values
    ('a1840000-0000-0000-0000-000000000001',
     'RLS018-CONTRACT-A', 'a1810000-0000-0000-0000-000000000001',
     'WHOLE_PROPERTY', 'RESIDENTIAL_FREE', date '2027-01-01', date '2028-12-31'),
    ('b1840000-0000-0000-0000-000000000002',
     'RLS018-CONTRACT-B', 'b1810000-0000-0000-0000-000000000002',
     'WHOLE_PROPERTY', 'RESIDENTIAL_FREE', date '2027-01-01', date '2028-12-31')
on conflict (id) do update
set property_id = excluded.property_id,
    internal_code = excluded.internal_code;

insert into public.contract_terms (
    id, contract_id, valid_from, base_rent_amount,
    billing_frequency, first_billing_period_start, due_day
)
values
    ('a1850000-0000-0000-0000-000000000001',
     'a1840000-0000-0000-0000-000000000001',
     date '2027-01-01', 900, 'MONTHLY', date '2027-01-01', 5),
    ('b1850000-0000-0000-0000-000000000002',
     'b1840000-0000-0000-0000-000000000002',
     date '2027-01-01', 900, 'MONTHLY', date '2027-01-01', 5)
on conflict (id) do update
set contract_id = excluded.contract_id,
    base_rent_amount = excluded.base_rent_amount;

insert into public.tenants (
    id, tenant_type, first_name, last_name, status
)
values
    ('a1860000-0000-0000-0000-000000000001',
     'NATURAL_PERSON', 'Tenant', 'RLS A', 'ACTIVE'),
    ('b1860000-0000-0000-0000-000000000002',
     'NATURAL_PERSON', 'Tenant', 'RLS B', 'ACTIVE')
on conflict (id) do update
set first_name = excluded.first_name,
    last_name = excluded.last_name,
    status = excluded.status;

insert into public.tenant_property_accesses (tenant_id, property_id)
values
    ('a1860000-0000-0000-0000-000000000001',
     'a1810000-0000-0000-0000-000000000001'),
    ('b1860000-0000-0000-0000-000000000002',
     'b1810000-0000-0000-0000-000000000002')
on conflict do nothing;

insert into public.contract_tenants (
    id, contract_id, tenant_id, role, valid_from
)
values
    ('a1870000-0000-0000-0000-000000000001',
     'a1840000-0000-0000-0000-000000000001',
     'a1860000-0000-0000-0000-000000000001',
     'TENANT', date '2027-01-01'),
    ('b1870000-0000-0000-0000-000000000002',
     'b1840000-0000-0000-0000-000000000002',
     'b1860000-0000-0000-0000-000000000002',
     'TENANT', date '2027-01-01')
on conflict (id) do update
set contract_id = excluded.contract_id,
    tenant_id = excluded.tenant_id;

insert into public.contract_rentable_spaces (contract_id, rentable_space_id)
values
    ('a1840000-0000-0000-0000-000000000001',
     'a1830000-0000-0000-0000-000000000001'),
    ('a1840000-0000-0000-0000-000000000001',
     'b1830000-0000-0000-0000-000000000002'),
    ('b1840000-0000-0000-0000-000000000002',
     'b1830000-0000-0000-0000-000000000002')
on conflict do nothing;

insert into public.contract_changes (
    id, contract_id, change_type, effective_date
)
values
    ('a1880000-0000-0000-0000-000000000001',
     'a1840000-0000-0000-0000-000000000001', 'RENT_CHANGE', date '2027-01-01'),
    ('b1880000-0000-0000-0000-000000000002',
     'b1840000-0000-0000-0000-000000000002', 'RENT_CHANGE', date '2027-01-01')
on conflict (id) do nothing;

insert into public.rent_installments (
    id, contract_id, contract_term_id, sequence_number,
    period_start, period_end, due_date, amount_due
)
values
    ('a1890000-0000-0000-0000-000000000001',
     'a1840000-0000-0000-0000-000000000001',
     'a1850000-0000-0000-0000-000000000001',
     901, date '2027-01-01', date '2027-01-31', date '2027-01-05', 900),
    ('b1890000-0000-0000-0000-000000000002',
     'b1840000-0000-0000-0000-000000000002',
     'b1850000-0000-0000-0000-000000000002',
     901, date '2027-01-01', date '2027-01-31', date '2027-01-05', 900)
on conflict (id) do update
set contract_id = excluded.contract_id,
    contract_term_id = excluded.contract_term_id;

insert into public.rent_installment_components (
    id, rent_installment_id, component_type, amount, description
)
values
    ('a18a0000-0000-0000-0000-000000000001',
     'a1890000-0000-0000-0000-000000000001', 'RENT', 900, 'Test'),
    ('b18a0000-0000-0000-0000-000000000002',
     'b1890000-0000-0000-0000-000000000002', 'RENT', 900, 'Test')
on conflict (id) do nothing;

insert into public.receipts (
    id, property_id, payment_date, amount
)
values
    ('a18b0000-0000-0000-0000-000000000001',
     'a1810000-0000-0000-0000-000000000001', date '2027-01-05', 900),
    ('b18b0000-0000-0000-0000-000000000002',
     'b1810000-0000-0000-0000-000000000002', date '2027-01-05', 900)
on conflict (id) do nothing;

insert into public.receipt_allocations (
    id, receipt_id, rent_installment_id, allocated_amount
)
values
    ('a18c0000-0000-0000-0000-000000000001',
     'a18b0000-0000-0000-0000-000000000001',
     'a1890000-0000-0000-0000-000000000001', 900),
    ('a18c0000-0000-0000-0000-000000000002',
     'a18b0000-0000-0000-0000-000000000001',
     'b1890000-0000-0000-0000-000000000002', 900),
    ('b18c0000-0000-0000-0000-000000000003',
     'b18b0000-0000-0000-0000-000000000002',
     'b1890000-0000-0000-0000-000000000002', 900)
on conflict (id) do nothing;

insert into public.expenses (
    id, property_id, category, description, competence_date,
    total_amount, allocation_mode
)
values
    ('a18d0000-0000-0000-0000-000000000001',
     'a1810000-0000-0000-0000-000000000001',
     'MAINTENANCE', 'RLS expense A', date '2027-01-01', 100, 'MANUAL'),
    ('b18d0000-0000-0000-0000-000000000002',
     'b1810000-0000-0000-0000-000000000002',
     'MAINTENANCE', 'RLS expense B', date '2027-01-01', 100, 'MANUAL')
on conflict (id) do nothing;

insert into public.expense_allocations (
    id, expense_id, owner_id, allocated_amount
)
values
    ('a18e0000-0000-0000-0000-000000000001',
     'a18d0000-0000-0000-0000-000000000001',
     'a1800000-0000-0000-0000-000000000001', 50),
    ('a18e0000-0000-0000-0000-000000000002',
     'a18d0000-0000-0000-0000-000000000001',
     'b1800000-0000-0000-0000-000000000002', 50),
    ('b18e0000-0000-0000-0000-000000000003',
     'b18d0000-0000-0000-0000-000000000002',
     'b1800000-0000-0000-0000-000000000002', 100)
on conflict (id) do nothing;

insert into public.expense_payments (
    id, expense_id, payer_owner_id, payment_date, amount
)
values
    ('a18f0000-0000-0000-0000-000000000001',
     'a18d0000-0000-0000-0000-000000000001',
     'a1800000-0000-0000-0000-000000000001', date '2027-01-05', 50),
    ('b18f0000-0000-0000-0000-000000000002',
     'b18d0000-0000-0000-0000-000000000002',
     'b1800000-0000-0000-0000-000000000002', date '2027-01-05', 100)
on conflict (id) do nothing;

insert into public.owner_settlement_items (
    id, property_id, creditor_owner_id, debtor_owner_id, amount
)
values
    ('a1900000-0000-0000-0000-000000000001',
     'a1810000-0000-0000-0000-000000000001',
     'a1800000-0000-0000-0000-000000000001',
     'c1800000-0000-0000-0000-000000000003', 50),
    ('a1900000-0000-0000-0000-000000000002',
     'a1810000-0000-0000-0000-000000000001',
     'a1800000-0000-0000-0000-000000000001',
     'b1800000-0000-0000-0000-000000000002', 50),
    ('b1900000-0000-0000-0000-000000000003',
     'b1810000-0000-0000-0000-000000000002',
     'b1800000-0000-0000-0000-000000000002',
     'a1800000-0000-0000-0000-000000000001', 50)
on conflict (id) do nothing;

insert into public.deadlines (
    id, title, category, due_at, priority, responsible_user_id
)
values
    ('a1910000-0000-0000-0000-000000000001',
     'RLS deadline A', 'OTHER', now(), 'MEDIUM',
     '796c3053-6a28-4ff5-aa08-06129dcf942e'),
    ('b1910000-0000-0000-0000-000000000002',
     'RLS deadline B', 'OTHER', now(), 'MEDIUM',
     '4a30d9e0-04aa-42f0-93c6-977247230a9c')
on conflict (id) do nothing;

insert into public.notification_rules (
    id, deadline_id, recipient_user_id, channel, offset_minutes
)
values
    ('a1920000-0000-0000-0000-000000000001',
     'a1910000-0000-0000-0000-000000000001',
     '796c3053-6a28-4ff5-aa08-06129dcf942e', 'EMAIL', 60),
    ('b1920000-0000-0000-0000-000000000002',
     'b1910000-0000-0000-0000-000000000002',
     '4a30d9e0-04aa-42f0-93c6-977247230a9c', 'EMAIL', 60)
on conflict (id) do nothing;

insert into public.notification_deliveries (
    id, notification_rule_id, scheduled_at
)
values
    ('a1930000-0000-0000-0000-000000000001',
     'a1920000-0000-0000-0000-000000000001', now()),
    ('b1930000-0000-0000-0000-000000000002',
     'b1920000-0000-0000-0000-000000000002', now())
on conflict (id) do nothing;

insert into public.legal_documents (id, type, title, status)
values
    ('a1940000-0000-0000-0000-000000000001',
     'PRIVACY', 'RLS legal active', 'ACTIVE'),
    ('b1940000-0000-0000-0000-000000000002',
     'PRIVACY', 'RLS legal inactive', 'INACTIVE')
on conflict (id) do update
set status = excluded.status;

insert into public.legal_document_versions (
    id, legal_document_id, version_code, content_path, effective_from
)
values
    ('a1950000-0000-0000-0000-000000000001',
     'a1940000-0000-0000-0000-000000000001',
     'RLS-1', 'legal/rls-a.pdf', current_date),
    ('b1950000-0000-0000-0000-000000000002',
     'b1940000-0000-0000-0000-000000000002',
     'RLS-1', 'legal/rls-b.pdf', current_date)
on conflict (id) do nothing;

insert into public.documents (id, title, category)
values
    ('a1960000-0000-0000-0000-000000000001',
     'RLS document A', 'CONTRACT'),
    ('b1960000-0000-0000-0000-000000000002',
     'RLS document B', 'CONTRACT')
on conflict (id) do nothing;

insert into public.property_documents (document_id, property_id)
values
    ('a1960000-0000-0000-0000-000000000001',
     'a1810000-0000-0000-0000-000000000001'),
    ('b1960000-0000-0000-0000-000000000002',
     'b1810000-0000-0000-0000-000000000002')
on conflict do nothing;

insert into public.deadline_documents (document_id, deadline_id)
values
    ('a1960000-0000-0000-0000-000000000001',
     'a1910000-0000-0000-0000-000000000001'),
    ('b1960000-0000-0000-0000-000000000002',
     'b1910000-0000-0000-0000-000000000002')
on conflict do nothing;

insert into public.invitations (
    id, inviter_user_id, recipient_email, role, token_hash, expires_at
)
values (
    'a1970000-0000-0000-0000-000000000001',
    '796c3053-6a28-4ff5-aa08-06129dcf942e',
    'rls018@example.test', 'VIEWER', 'RLS-018-TOKEN',
    now() + interval '1 day'
)
on conflict (id) do nothing;

insert into public.invitation_owners (invitation_id, owner_id)
values (
    'a1970000-0000-0000-0000-000000000001',
    'a1800000-0000-0000-0000-000000000001'
)
on conflict do nothing;

insert into public.audit_events (
    id, actor_user_id, action, entity_type, entity_id, outcome
)
values (
    'a1980000-0000-0000-0000-000000000001',
    '796c3053-6a28-4ff5-aa08-06129dcf942e',
    'RLS_TEST', 'PROPERTY', 'a1810000-0000-0000-0000-000000000001',
    'SUCCESS'
)
on conflict (id) do nothing;

insert into public.security_events (
    id, user_id, event_type, severity, outcome
)
values (
    'a1990000-0000-0000-0000-000000000001',
    '796c3053-6a28-4ff5-aa08-06129dcf942e',
    'RLS_TEST', 'LOW', 'SUCCESS'
)
on conflict (id) do nothing;

insert into public.billing_generation_runs (
    id, reference_date, status, correlation_id
)
values (
    'a19a0000-0000-0000-0000-000000000001',
    current_date, 'COMPLETED', 'a19a0000-0000-0000-0000-000000000002'
)
on conflict (id) do nothing;

insert into public.idempotency_keys (
    id, user_id, operation_name, idempotency_key, request_hash, status
)
values (
    'a19b0000-0000-0000-0000-000000000001',
    '796c3053-6a28-4ff5-aa08-06129dcf942e',
    'RLS_TEST', 'a19b0000-0000-0000-0000-000000000002',
    'test-hash', 'COMPLETED'
)
on conflict (id) do nothing;

select set_config(
    'request.jwt.claims',
    json_build_object(
        'sub', '796c3053-6a28-4ff5-aa08-06129dcf942e',
        'role', 'authenticated'
    )::text,
    true
);
set local role authenticated;

select ok(
    not exists (
        select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
          and c.relrowsecurity
          and not exists (
              select 1
              from pg_policies policy
              where policy.schemaname = n.nspname
                and policy.tablename = c.relname
          )
    ),
    'every public table with RLS has an explicit policy'
);

select is(
    (select count(*)::integer
     from public.user_owner_accesses
     where owner_id in (
         'a1800000-0000-0000-0000-000000000001',
         'b1800000-0000-0000-0000-000000000002',
         'c1800000-0000-0000-0000-000000000003'
     )),
    2,
    'owner access rows are visible only to their assigned user'
);

select is(
    (select count(*)::integer from public.contract_tenants
     where id in (
         'a1870000-0000-0000-0000-000000000001',
         'b1870000-0000-0000-0000-000000000002'
     )),
    1,
    'contract tenant links follow contract access'
);

select is(
    (select count(*)::integer from public.contract_terms
     where id in (
         'a1850000-0000-0000-0000-000000000001',
         'b1850000-0000-0000-0000-000000000002'
     )),
    1,
    'contract terms follow contract access'
);

select is(
    (select count(*)::integer from public.contract_rentable_spaces
     where contract_id in (
         'a1840000-0000-0000-0000-000000000001',
         'b1840000-0000-0000-0000-000000000002'
     )),
    1,
    'contract-space links require access to both related entities'
);

select is(
    (select count(*)::integer from public.contract_changes
     where id in (
         'a1880000-0000-0000-0000-000000000001',
         'b1880000-0000-0000-0000-000000000002'
     )),
    1,
    'contract change history follows contract access'
);

select is(
    (select count(*)::integer from public.rent_installment_components
     where id in (
         'a18a0000-0000-0000-0000-000000000001',
         'b18a0000-0000-0000-0000-000000000002'
     )),
    1,
    'installment components follow installment access'
);

select is(
    (select count(*)::integer from public.v_rent_installment_balance
     where id in (
         'a1890000-0000-0000-0000-000000000001',
         'b1890000-0000-0000-0000-000000000002'
     )),
    1,
    'installment balance view enforces underlying RLS policies'
);

select is(
    (select amount_received::numeric
     from public.v_rent_installment_balance
     where id = 'a1890000-0000-0000-0000-000000000001'),
    900::numeric,
    'installment balance view excludes out-of-scope allocations'
);

select is(
    (select count(*)::integer from public.receipts
     where id in (
         'a18b0000-0000-0000-0000-000000000001',
         'b18b0000-0000-0000-0000-000000000002'
     )),
    1,
    'receipts follow property access'
);

select is(
    (select count(*)::integer from public.receipt_allocations
     where id in (
         'a18c0000-0000-0000-0000-000000000001',
         'a18c0000-0000-0000-0000-000000000002',
         'b18c0000-0000-0000-0000-000000000003'
     )),
    1,
    'receipt allocations require access to both receipt and installment'
);

select is(
    (select count(*)::integer from public.expense_allocations
     where id in (
         'a18e0000-0000-0000-0000-000000000001',
         'a18e0000-0000-0000-0000-000000000002',
         'b18e0000-0000-0000-0000-000000000003'
     )),
    1,
    'expense allocations require access to the expense and owner'
);

select is(
    (select count(*)::integer from public.expense_payments
     where id in (
         'a18f0000-0000-0000-0000-000000000001',
         'b18f0000-0000-0000-0000-000000000002'
     )),
    1,
    'expense payments follow expense and payer owner access'
);

select is(
    (select count(*)::integer from public.owner_settlement_items
     where id in (
         'a1900000-0000-0000-0000-000000000001',
         'a1900000-0000-0000-0000-000000000002',
         'b1900000-0000-0000-0000-000000000003'
     )),
    1,
    'settlements require property, both owners, and expense scope'
);

select is(
    (select count(*)::integer from public.deadlines
     where id in (
         'a1910000-0000-0000-0000-000000000001',
         'b1910000-0000-0000-0000-000000000002'
     )),
    1,
    'deadlines are visible only to their assigned user'
);

select is(
    (select count(*)::integer from public.deadline_documents
     where document_id in (
         'a1960000-0000-0000-0000-000000000001',
         'b1960000-0000-0000-0000-000000000002'
     )),
    1,
    'deadline document links require assigned deadline and document access'
);

select is(
    (select count(*)::integer from public.notification_rules
     where id in (
         'a1920000-0000-0000-0000-000000000001',
         'b1920000-0000-0000-0000-000000000002'
     )),
    1,
    'notification rules are visible only to their recipient'
);

select is(
    (select count(*)::integer from public.notification_deliveries
     where id in (
         'a1930000-0000-0000-0000-000000000001',
         'b1930000-0000-0000-0000-000000000002'
     )),
    1,
    'notification deliveries inherit recipient scope'
);

select is(
    (select count(*)::integer from public.legal_documents
     where id in (
         'a1940000-0000-0000-0000-000000000001',
         'b1940000-0000-0000-0000-000000000002'
     )),
    1,
    'only active legal documents are readable'
);

select is(
    (select count(*)::integer from public.legal_document_versions
     where id in (
         'a1950000-0000-0000-0000-000000000001',
         'b1950000-0000-0000-0000-000000000002'
     )),
    1,
    'legal versions require a current version and active parent document'
);

select ok(
    not exists (
        select 1 from public.invitations
        where id = 'a1970000-0000-0000-0000-000000000001'
    )
    and not exists (
        select 1 from public.invitation_owners
        where invitation_id = 'a1970000-0000-0000-0000-000000000001'
    )
    and not has_table_privilege(
        'authenticated', 'public.document_category_entity_map', 'SELECT'
    )
    and not exists (
        select 1 from public.audit_events
        where id = 'a1980000-0000-0000-0000-000000000001'
    )
    and not exists (
        select 1 from public.security_events
        where id = 'a1990000-0000-0000-0000-000000000001'
    )
    and not exists (
        select 1 from public.billing_generation_runs
        where id = 'a19a0000-0000-0000-0000-000000000001'
    )
    and not exists (
        select 1 from public.idempotency_keys
        where id = 'a19b0000-0000-0000-0000-000000000001'
    ),
    'invitation, catalog mapping, audit, billing, and idempotency tables remain private'
);

reset role;

update public.profiles
set status = 'BLOCKED'
where id = '4a30d9e0-04aa-42f0-93c6-977247230a9c';

select set_config(
    'request.jwt.claims',
    json_build_object(
        'sub', '4a30d9e0-04aa-42f0-93c6-977247230a9c',
        'role', 'authenticated'
    )::text,
    true
);
set local role authenticated;

select is(
    (select count(*)::integer
     from public.properties
     where id = 'b1810000-0000-0000-0000-000000000002')
    + (select count(*)::integer
       from public.owners
       where id = 'b1800000-0000-0000-0000-000000000002')
    + (select count(*)::integer
       from public.contracts
       where id = 'b1840000-0000-0000-0000-000000000002'),
    0,
    'blocked profiles cannot read owned properties, owners, or contracts'
);

reset role;

update public.profiles
set status = 'ACTIVE',
    archived_at = now()
where id = '4a30d9e0-04aa-42f0-93c6-977247230a9c';

set local role authenticated;

select is(
    (select count(*)::integer
     from public.properties
     where id = 'b1810000-0000-0000-0000-000000000002')
    + (select count(*)::integer
       from public.owners
       where id = 'b1800000-0000-0000-0000-000000000002')
    + (select count(*)::integer
       from public.contracts
       where id = 'b1840000-0000-0000-0000-000000000002'),
    0,
    'archived profiles cannot read owned properties, owners, or contracts'
);

select * from finish();

rollback;
