insert into public.reference_catalog_items (
    catalog_code,
    code,
    label,
    sort_order,
    is_active
)
values (
    'upload_status',
    'PENDING_SCAN',
    'In attesa di scansione',
    2,
    true
)
on conflict (catalog_code, code) do update
set label = excluded.label,
    is_active = true;
