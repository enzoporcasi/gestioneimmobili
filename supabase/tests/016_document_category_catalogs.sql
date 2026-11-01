\set ON_ERROR_STOP on

begin;

do $$
declare
    v_user_id uuid;
begin
    select id into v_user_id
    from auth.users
    where lower(trim(email)) = 'utente.a@test.local';

    if v_user_id is null then
        raise exception 'DOCUMENT_CATALOG_TEST_USER_MISSING';
    end if;

    insert into public.profiles (id, first_name, last_name, display_name, status)
    values (v_user_id, 'Utente', 'A', 'Utente A', 'ACTIVE')
    on conflict (id) do update
    set status = 'ACTIVE', updated_at = now();
end;
$$;

insert into public.owners (
    id, owner_type, first_name, last_name, tax_code, status
)
values (
    'f6100000-0000-0000-0000-000000000001',
    'NATURAL_PERSON',
    'Proprietario',
    'Test Documenti',
    'DOCCATALOGTEST',
    'ACTIVE'
)
on conflict (id) do update set status = 'ACTIVE', updated_at = now();

insert into public.user_owner_accesses (
    user_id, owner_id, role, valid_from, status
)
select auth_user.id, 'f6100000-0000-0000-0000-000000000001', 'MANAGER', current_date, 'ACTIVE'
from auth.users auth_user
where lower(trim(auth_user.email)) = 'utente.a@test.local'
  and not exists (
      select 1
      from public.user_owner_accesses access
      where access.user_id = auth_user.id
        and access.owner_id = 'f6100000-0000-0000-0000-000000000001'
  );

insert into public.properties (
    id, internal_code, name, property_type, status, municipality
)
values (
    'f6200000-0000-0000-0000-000000000002',
    'IMM-DOC-CATALOG-TEST',
    'Immobile catalogo documenti',
    'APARTMENT',
    'ACTIVE',
    'Roma'
)
on conflict (id) do update set status = 'ACTIVE', updated_at = now();

insert into public.property_ownerships (
    id, property_id, owner_id, ownership_percentage, valid_from
)
values (
    'f6300000-0000-0000-0000-000000000003',
    'f6200000-0000-0000-0000-000000000002',
    'f6100000-0000-0000-0000-000000000001',
    100,
    current_date
)
on conflict (id) do update set valid_from = current_date, valid_to = null;

insert into public.tenants (
    id, tenant_type, first_name, last_name, status
)
values (
    'f6400000-0000-0000-0000-000000000004',
    'NATURAL_PERSON',
    'Locatario',
    'Test Documenti',
    'ACTIVE'
)
on conflict (id) do update set status = 'ACTIVE', updated_at = now();

insert into public.tenant_property_accesses (tenant_id, property_id)
values ('f6400000-0000-0000-0000-000000000004', 'f6200000-0000-0000-0000-000000000002')
on conflict (tenant_id, property_id) do nothing;

select set_config(
    'request.jwt.claims',
    json_build_object(
        'sub', (select id::text from auth.users where lower(trim(email)) = 'utente.a@test.local'),
        'role', 'authenticated'
    )::text,
    true
);
set local role authenticated;

do $$
declare
    v_owner_doc jsonb;
    v_property_doc jsonb;
    v_tenant_doc jsonb;
    v_cancel_result jsonb;
    v_cancelled_document_id uuid;
    v_denied boolean := false;
begin
    if not exists (
        select 1 from public.list_document_categories('OWNER')
        where code = 'IDENTITY_DOCUMENT'
    ) or not exists (
        select 1 from public.list_document_categories('PROPERTY')
        where code = 'FLOOR_PLAN'
    ) or not exists (
        select 1 from public.list_document_categories('TENANT')
        where code = 'RESIDENCE_PERMIT'
    ) or not exists (
        select 1 from public.list_document_categories('TENANT')
        where code = 'CHAMBER_OF_COMMERCE_REGISTRATION'
    ) then
        raise exception 'ENTITY_DOCUMENT_CATEGORIES_MISSING';
    end if;

    v_owner_doc := public.reserve_document_upload(
        'OWNER',
        'f6100000-0000-0000-0000-000000000001',
        'Documento identità test',
        'IDENTITY_DOCUMENT',
        'identita.pdf',
        'application/pdf',
        100
    );
    v_property_doc := public.reserve_document_upload(
        'PROPERTY',
        'f6200000-0000-0000-0000-000000000002',
        'Planimetria test',
        'FLOOR_PLAN',
        'planimetria.pdf',
        'application/pdf',
        100
    );
    v_tenant_doc := public.reserve_document_upload(
        'TENANT',
        'f6400000-0000-0000-0000-000000000004',
        'Permesso di soggiorno test',
        'RESIDENCE_PERMIT',
        'permesso.pdf',
        'application/pdf',
        100
    );

    if not exists (
        select 1 from public.documents
        where id = (v_owner_doc ->> 'document_id')::uuid
          and sensitivity = 'HIGHLY_SENSITIVE'
    ) then
        raise exception 'OWNER_IDENTITY_DOCUMENT_NOT_CLASSIFIED_SENSITIVE';
    end if;

    if not security.can_access_document((v_tenant_doc ->> 'document_id')::uuid, 'MANAGER') then
        raise exception 'TENANT_DOCUMENT_ACCESS_NOT_LINKED_TO_PROPERTY';
    end if;

    if not exists (
        select 1
        from public.list_manageable_document_entities()
        where entity_type = 'TENANT'
          and entity_id = 'f6400000-0000-0000-0000-000000000004'
    ) then
        raise exception 'MANAGEABLE_TENANT_NOT_LISTED_FOR_DOCUMENTS';
    end if;

    if not exists (
        select 1
        from public.list_manageable_documents()
        where document_id = (v_tenant_doc ->> 'document_id')::uuid
          and entity_type = 'TENANT'
          and category_label = 'Permesso di soggiorno'
    ) then
        raise exception 'TENANT_DOCUMENT_NOT_LISTED';
    end if;

    begin
        perform public.reserve_document_upload(
            'OWNER',
            'f6100000-0000-0000-0000-000000000001',
            'Categoria non coerente',
            'FLOOR_PLAN',
            'planimetria.pdf',
            'application/pdf',
            100
        );
        raise exception 'OWNER_ACCEPTED_PROPERTY_DOCUMENT_CATEGORY';
    exception
        when sqlstate 'P0001' then
            if sqlerrm <> 'INVALID_DOCUMENT_CATEGORY_FOR_ENTITY' then
                raise;
            end if;
    end;

    if v_property_doc ->> 'upload_status' <> 'RESERVED' then
        raise exception 'DOCUMENT_RESERVATION_STATUS_INVALID';
    end if;

    v_cancelled_document_id := (v_property_doc ->> 'document_id')::uuid;
    v_cancel_result := public.cancel_document_upload(
        (v_property_doc ->> 'document_version_id')::uuid
    );
    if v_cancel_result ->> 'cancelled' <> 'true' then
        raise exception 'DOCUMENT_UPLOAD_CANCELLATION_FAILED';
    end if;
    if coalesce(current_setting('storage.allow_delete_query', true), 'false') = 'true' then
        raise exception 'STORAGE_DELETE_SETTING_NOT_RESTORED';
    end if;
    if exists (
        select 1 from public.documents where id = v_cancelled_document_id
    ) or exists (
        select 1
        from public.document_versions
        where document_id = v_cancelled_document_id
    ) or exists (
        select 1
        from public.property_documents
        where document_id = v_cancelled_document_id
    ) then
        raise exception 'CANCELLED_DOCUMENT_RECORDS_REMAIN';
    end if;
end;
$$;

reset role;
rollback;

\echo 'DOCUMENT CATEGORY CATALOG TEST PASSED'
