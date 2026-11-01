update public.document_category_entity_map
set minimum_sensitivity = 'HIGHLY_SENSITIVE'
where minimum_sensitivity = 'PERSONAL';
