insert into public.reference_catalog_items (catalog_code, code, label, sort_order)
values ('document_sensitivity', 'HIGHLY_SENSITIVE', 'Altamente sensibile', 3)
on conflict (catalog_code, code) do update
set label = excluded.label,
    is_active = true;
