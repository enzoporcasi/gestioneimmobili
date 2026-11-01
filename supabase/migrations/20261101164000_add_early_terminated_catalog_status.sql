insert into public.reference_catalog_items (
    catalog_code,
    code,
    label,
    sort_order,
    is_active
)
values (
    'contract_lifecycle_status',
    'EARLY_TERMINATED',
    'Risolto anticipatamente',
    8,
    true
)
on conflict (catalog_code, code) do update
set label = excluded.label,
    is_active = true;
