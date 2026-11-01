create or replace function public.cancel_document_upload(p_document_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, security, storage
as $$
declare
    version_row public.document_versions%rowtype;
begin
    if auth.uid() is null then
        raise exception using errcode = 'P0001', message = 'AUTHENTICATION_REQUIRED';
    end if;

    select *
    into version_row
    from public.document_versions
    where id = p_document_version_id
    for update;

    if not found then
        raise exception using errcode = 'P0001', message = 'DOCUMENT_VERSION_NOT_FOUND';
    end if;
    if version_row.reserved_by_user_id <> auth.uid() then
        raise exception using errcode = 'P0001', message = 'ACCESS_DENIED';
    end if;
    if version_row.upload_status <> 'RESERVED' then
        raise exception using errcode = 'P0001', message = 'UPLOAD_NOT_CANCELLABLE';
    end if;
    if not security.can_access_document(version_row.document_id, 'MANAGER') then
        raise exception using errcode = 'P0001', message = 'ACCESS_DENIED';
    end if;

    delete from storage.objects
    where bucket_id = version_row.storage_bucket
      and name = version_row.storage_path;

    insert into public.audit_events (
        actor_user_id, action, entity_type, entity_id, outcome, metadata
    )
    values (
        auth.uid(),
        'DOCUMENT_UPLOAD_CANCELLED',
        'DOCUMENT',
        version_row.document_id,
        'SUCCESS',
        jsonb_build_object('version_id', version_row.id)
    );

    delete from public.property_documents where document_id = version_row.document_id;
    delete from public.owner_documents where document_id = version_row.document_id;
    delete from public.tenant_documents where document_id = version_row.document_id;
    delete from public.contract_documents where document_id = version_row.document_id;
    delete from public.rent_installment_documents where document_id = version_row.document_id;
    delete from public.expense_documents where document_id = version_row.document_id;
    delete from public.rentable_space_documents where document_id = version_row.document_id;
    delete from public.receipt_documents where document_id = version_row.document_id;

    delete from public.document_versions where id = version_row.id;
    delete from public.documents where id = version_row.document_id;

    return jsonb_build_object(
        'document_id', version_row.document_id,
        'document_version_id', version_row.id,
        'cancelled', true
    );
end;
$$;

revoke all on function public.cancel_document_upload(uuid) from public, anon;
grant execute on function public.cancel_document_upload(uuid) to authenticated;
