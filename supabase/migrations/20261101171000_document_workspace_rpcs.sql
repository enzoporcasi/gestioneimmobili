create or replace function public.list_manageable_document_entities()
returns table (
    entity_type text,
    entity_id uuid,
    display_name text
)
language sql
stable
security definer
set search_path = pg_catalog, public, security
as $$
    with active_actor as (
        select profile.id
        from public.profiles profile
        where profile.id = auth.uid()
          and profile.status = 'ACTIVE'
          and profile.archived_at is null
    )
    select 'OWNER', owner.id, coalesce(
        nullif(btrim(owner.business_name), ''),
        nullif(concat_ws(' ', nullif(btrim(owner.first_name), ''), nullif(btrim(owner.last_name), '')), ''),
        'Proprietario'
    )
    from public.owners owner
    cross join active_actor
    where owner.archived_at is null
      and security.can_access_owner(owner.id, 'MANAGER')

    union all

    select 'PROPERTY', property.id,
        concat(property.internal_code, ' · ', property.name)
    from public.properties property
    cross join active_actor
    where property.archived_at is null
      and security.can_access_property(property.id, 'MANAGER')

    union all

    select 'TENANT', tenant.id, coalesce(
        nullif(btrim(tenant.business_name), ''),
        nullif(concat_ws(' ', nullif(btrim(tenant.first_name), ''), nullif(btrim(tenant.last_name), '')), ''),
        'Locatario'
    )
    from public.tenants tenant
    cross join active_actor
    where tenant.status = 'ACTIVE'
      and exists (
          select 1
          from public.tenant_property_accesses access
          where access.tenant_id = tenant.id
            and security.can_access_property(access.property_id, 'MANAGER')
      )

    union all

    select 'CONTRACT', contract.id,
        concat(contract.internal_code, ' · ', property.name)
    from public.contracts contract
    join public.properties property on property.id = contract.property_id
    cross join active_actor
    where security.can_access_property(contract.property_id, 'MANAGER')
    order by 1, 3;
$$;

create or replace function public.list_manageable_documents()
returns table (
    document_id uuid,
    entity_type text,
    entity_id uuid,
    entity_label text,
    title text,
    category text,
    category_label text,
    original_file_name text,
    mime_type text,
    size_bytes bigint,
    upload_status text,
    malware_scan_status text,
    document_version_id uuid,
    created_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, security
as $$
    with entity_links as (
        select owner_document.document_id, 'OWNER'::text as entity_type,
            owner.id as entity_id,
            coalesce(nullif(btrim(owner.business_name), ''),
                nullif(concat_ws(' ', nullif(btrim(owner.first_name), ''), nullif(btrim(owner.last_name), '')), ''),
                'Proprietario') as entity_label
        from public.owner_documents owner_document
        join public.owners owner on owner.id = owner_document.owner_id

        union all

        select property_document.document_id, 'PROPERTY',
            property.id, concat(property.internal_code, ' · ', property.name)
        from public.property_documents property_document
        join public.properties property on property.id = property_document.property_id

        union all

        select tenant_document.document_id, 'TENANT',
            tenant.id, coalesce(nullif(btrim(tenant.business_name), ''),
                nullif(concat_ws(' ', nullif(btrim(tenant.first_name), ''), nullif(btrim(tenant.last_name), '')), ''),
                'Locatario')
        from public.tenant_documents tenant_document
        join public.tenants tenant on tenant.id = tenant_document.tenant_id

        union all

        select contract_document.document_id, 'CONTRACT',
            contract.id, concat(contract.internal_code, ' · ', property.name)
        from public.contract_documents contract_document
        join public.contracts contract on contract.id = contract_document.contract_id
        join public.properties property on property.id = contract.property_id
    )
    select
        document.id,
        entity_links.entity_type,
        entity_links.entity_id,
        entity_links.entity_label,
        document.title,
        document.category,
        category.label,
        version.original_file_name,
        version.mime_type,
        version.size_bytes,
        version.upload_status,
        version.malware_scan_status,
        version.id,
        document.created_at
    from entity_links
    join public.documents document on document.id = entity_links.document_id
    join lateral (
        select item.*
        from public.document_versions item
        where item.document_id = document.id
        order by item.version_number desc
        limit 1
    ) version on true
    left join public.reference_catalog_items category
      on category.catalog_code = 'document_category'
     and category.code = document.category
    where security.can_access_document(document.id, 'VIEWER')
      and exists (
          select 1
          from public.profiles profile
          where profile.id = auth.uid()
            and profile.status = 'ACTIVE'
            and profile.archived_at is null
      )
    order by document.created_at desc, document.title;
$$;

revoke all on function public.list_manageable_document_entities() from public, anon;
revoke all on function public.list_manageable_documents() from public, anon;
grant execute on function public.list_manageable_document_entities() to authenticated;
grant execute on function public.list_manageable_documents() to authenticated;
