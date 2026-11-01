insert into public.reference_catalog_items (
    catalog_code,
    code,
    label,
    sort_order,
    is_active
)
values (
    'contract_type',
    'RESIDENTIAL',
    'Abitativo (codice storico)',
    100,
    false
)
on conflict (catalog_code, code) do update
set is_active = false;
