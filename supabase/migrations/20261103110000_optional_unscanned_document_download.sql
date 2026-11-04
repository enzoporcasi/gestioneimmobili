create table security.document_security_settings (
    singleton boolean primary key default true check (singleton),
    allow_unscanned_downloads boolean not null default false
);
insert into security.document_security_settings default values;
alter table security.document_security_settings enable row level security;
revoke all on security.document_security_settings from public, anon, authenticated;

create or replace function public.get_document_security_mode()
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, security
as $$
begin
    if auth.uid() is null then
        raise exception 'AUTHENTICATION_REQUIRED';
    end if;
    return coalesce((
        select allow_unscanned_downloads
        from security.document_security_settings
        where singleton
    ), false);
end;
$$;
revoke all on function public.get_document_security_mode() from public, anon;
grant execute on function public.get_document_security_mode() to authenticated;

create or replace function public.authorize_document_download(p_document_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, security
as $$
declare
    v_version public.document_versions%rowtype;
    v_document public.documents%rowtype;
    v_role text := 'VIEWER';
    v_scan_skipped boolean := false;
begin
    if auth.uid() is null then
        raise exception 'AUTHENTICATION_REQUIRED';
    end if;

    select * into v_version
    from public.document_versions
    where id = p_document_version_id;
    if not found then
        raise exception 'DOCUMENT_VERSION_NOT_FOUND';
    end if;

    select * into v_document
    from public.documents
    where id = v_version.document_id;
    if v_document.sensitivity = 'HIGHLY_SENSITIVE' then
        v_role := 'MANAGER';
    end if;
    if security.can_access_document(v_version.document_id, v_role) is not true then
        raise exception 'ACCESS_DENIED';
    end if;

    v_scan_skipped := public.get_document_security_mode()
        and v_version.upload_status = 'PENDING_SCAN'
        and v_version.malware_scan_status = 'PENDING'
        and v_version.finalized_at is not null
        and v_version.uploaded_at is not null;

    if (v_version.upload_status = 'AVAILABLE' and v_version.malware_scan_status = 'CLEAN') is not true
        and v_scan_skipped is not true then
        raise exception 'DOCUMENT_NOT_AVAILABLE';
    end if;

    return jsonb_build_object(
        'authorized', true,
        'document_id', v_version.document_id,
        'document_version_id', v_version.id,
        'bucket', v_version.storage_bucket,
        'storage_path', v_version.storage_path,
        'expires_in_seconds', 300,
        'scan_skipped', v_scan_skipped
    );
end;
$$;
revoke all on function public.authorize_document_download(uuid) from public, anon;
grant execute on function public.authorize_document_download(uuid) to authenticated;