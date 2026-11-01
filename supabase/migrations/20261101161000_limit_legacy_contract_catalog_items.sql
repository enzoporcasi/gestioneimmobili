update public.reference_catalog_items
set is_active = code in (
    'RESIDENTIAL_FREE',
    'RESIDENTIAL_AGREED',
    'TRANSITORY',
    'COMMERCIAL'
)
where catalog_code = 'contract_type';

revoke all on function public.sync_reference_catalog_item() from public, anon, authenticated;
