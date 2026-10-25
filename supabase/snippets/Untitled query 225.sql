insert into public.contracts (
    internal_code,
    property_id,
    object_type,
    contract_type,
    management_status,
    lifecycle_status,
    start_date,
    end_date,
    currency,
    notes
)
values (
    'CTR-TEST-A',
    '11000000-0000-0000-0000-000000000001'::uuid,
    'RENTABLE_SPACES',
    'RESIDENTIAL',
    'INACTIVE',
    'DRAFT',
    date '2027-01-01',
    date '2027-12-31',
    'EUR',
    'Contratto fittizio per verifica RLS'
)
on conflict (internal_code) do update
set
    property_id = excluded.property_id,
    object_type = excluded.object_type,
    contract_type = excluded.contract_type,
    management_status = excluded.management_status,
    lifecycle_status = excluded.lifecycle_status,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    notes = excluded.notes,
    updated_at = now()
returning
    id,
    internal_code,
    property_id,
    management_status,
    lifecycle_status,
    start_date,
    end_date;