-- GestioneImmobili
-- Migration: RPC documentali e RLS documenti/versioni/bridge.
-- Presuppone bucket privato storage: property-documents.

-- Helper: accesso a un Documento tramite almeno un collegamento visibile.
create or replace function security.can_access_document(
    p_document_id uuid,
    p_required_role text default 'VIEWER'
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, security
as $$
    select
        exists (
            select 1 from public.property_documents pd
            where pd.document_id = p_document_id
              and security.can_access_property(pd.property_id, p_required_role)
        )
        or exists (
            select 1
            from public.owner_documents od
            where od.document_id = p_document_id
              and security.can_access_owner(od.owner_id, p_required_role)
        )
        or exists (
            select 1
            from public.contract_documents cd
            where cd.document_id = p_document_id
              and security.can_access_contract(cd.contract_id, p_required_role)
        )
        or exists (
            select 1
            from public.rent_installment_documents rid
            where rid.document_id = p_document_id
              and security.can_access_installment(rid.rent_installment_id, p_required_role)
        )
        or exists (
            select 1
            from public.expense_documents ed
            where ed.document_id = p_document_id
              and security.can_access_expense(ed.expense_id, p_required_role)
        )
        or exists (
            select 1
            from public.rentable_space_documents rsd
            join public.rentable_spaces rs on rs.id = rsd.rentable_space_id
            where rsd.document_id = p_document_id
              and security.can_access_property(rs.property_id, p_required_role)
        )
        or exists (
            select 1
            from public.receipt_documents rd
            join public.receipts r on r.id = rd.receipt_id
            where rd.document_id = p_document_id
              and security.can_access_property(r.property_id, p_required_role)
        );
$$;

revoke all on function security.can_access_document(uuid,text)
from public, anon, authenticated;
grant execute on function security.can_access_document(uuid,text)
to authenticated;

-- Prenota un upload e crea il collegamento tipizzato.
create or replace function public.reserve_document_upload(
    p_entity_type text,
    p_entity_id uuid,
    p_title text,
    p_category text,
    p_original_file_name text,
    p_declared_mime_type text,
    p_expected_size_bytes bigint,
    p_sensitivity text default 'STANDARD',
    p_link_role text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, security
as $$
declare
    v_document_id uuid := gen_random_uuid();
    v_version_id uuid := gen_random_uuid();
    v_storage_path text;
    v_safe_name text;
    v_allowed boolean := false;
begin
    if auth.uid() is null then
        raise exception using errcode='P0001', message='AUTHENTICATION_REQUIRED';
    end if;

    if p_title is null or btrim(p_title)='' then
        raise exception using errcode='P0001', message='DOCUMENT_TITLE_REQUIRED';
    end if;

    if p_original_file_name is null or btrim(p_original_file_name)='' then
        raise exception using errcode='P0001', message='FILE_NAME_REQUIRED';
    end if;

    if p_declared_mime_type not in ('application/pdf','image/jpeg','image/png') then
        raise exception using errcode='P0001', message='UNSUPPORTED_MIME_TYPE';
    end if;

    if p_expected_size_bytes is null or p_expected_size_bytes<=0 or p_expected_size_bytes>20971520 then
        raise exception using errcode='P0001', message='INVALID_FILE_SIZE';
    end if;

    if p_sensitivity not in ('STANDARD','PERSONAL','HIGHLY_SENSITIVE') then
        raise exception using errcode='P0001', message='INVALID_DOCUMENT_SENSITIVITY';
    end if;

    case p_entity_type
        when 'PROPERTY' then
            v_allowed := security.can_access_property(p_entity_id,'MANAGER');
        when 'OWNER' then
            v_allowed := security.can_access_owner(p_entity_id,'MANAGER');
        when 'CONTRACT' then
            v_allowed := security.can_access_contract(p_entity_id,'MANAGER');
        when 'RENT_INSTALLMENT' then
            v_allowed := security.can_access_installment(p_entity_id,'MANAGER');
        when 'EXPENSE' then
            v_allowed := security.can_access_expense(p_entity_id,'MANAGER');
        when 'RENTABLE_SPACE' then
            select security.can_access_property(property_id,'MANAGER') into v_allowed
            from public.rentable_spaces where id=p_entity_id;
        when 'RECEIPT' then
            select security.can_access_property(property_id,'MANAGER') into v_allowed
            from public.receipts where id=p_entity_id;
        else
            raise exception using errcode='P0001', message='UNSUPPORTED_DOCUMENT_ENTITY_TYPE';
    end case;

    if coalesce(v_allowed,false)=false then
        raise exception using errcode='P0001', message='ACCESS_DENIED';
    end if;

    v_safe_name := regexp_replace(btrim(p_original_file_name),'[^A-Za-z0-9._-]+','_','g');
    if v_safe_name='' then v_safe_name:='document'; end if;
    v_storage_path := v_document_id::text || '/' || v_version_id::text || '/' || v_safe_name;

    insert into public.documents(
        id,title,category,status,sensitivity,created_at,updated_at
    ) values (
        v_document_id,btrim(p_title),btrim(p_category),'ACTIVE',p_sensitivity,now(),now()
    );

    insert into public.document_versions(
        id,document_id,version_number,storage_bucket,storage_path,
        original_file_name,mime_type,size_bytes,malware_scan_status,
        upload_status,reserved_by_user_id,reserved_at
    ) values (
        v_version_id,v_document_id,1,'property-documents',v_storage_path,
        btrim(p_original_file_name),p_declared_mime_type,p_expected_size_bytes,
        'PENDING','RESERVED',auth.uid(),now()
    );

    case p_entity_type
        when 'PROPERTY' then insert into public.property_documents values(v_document_id,p_entity_id,p_link_role);
        when 'OWNER' then insert into public.owner_documents values(v_document_id,p_entity_id,p_link_role);
        when 'CONTRACT' then insert into public.contract_documents values(v_document_id,p_entity_id,p_link_role);
        when 'RENT_INSTALLMENT' then insert into public.rent_installment_documents values(v_document_id,p_entity_id,p_link_role);
        when 'EXPENSE' then insert into public.expense_documents values(v_document_id,p_entity_id,p_link_role);
        when 'RENTABLE_SPACE' then insert into public.rentable_space_documents values(v_document_id,p_entity_id,p_link_role);
        when 'RECEIPT' then insert into public.receipt_documents values(v_document_id,p_entity_id,p_link_role);
    end case;

    insert into public.audit_events(actor_user_id,action,entity_type,entity_id,outcome,metadata)
    values(auth.uid(),'DOCUMENT_UPLOAD_RESERVED','DOCUMENT',v_document_id,'SUCCESS',
           jsonb_build_object('version_id',v_version_id,'entity_type',p_entity_type,'entity_id',p_entity_id));

    return jsonb_build_object(
        'document_id',v_document_id,
        'document_version_id',v_version_id,
        'bucket','property-documents',
        'storage_path',v_storage_path,
        'upload_status','RESERVED'
    );
end;
$$;

-- Finalizza dopo che l'oggetto Storage è stato caricato.
create or replace function public.finalize_document_upload(
    p_document_version_id uuid,
    p_actual_mime_type text,
    p_actual_size_bytes bigint,
    p_checksum text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, security
as $$
declare v public.document_versions%rowtype;
begin
    if auth.uid() is null then raise exception using errcode='P0001',message='AUTHENTICATION_REQUIRED'; end if;
    select * into v from public.document_versions where id=p_document_version_id for update;
    if not found then raise exception using errcode='P0001',message='DOCUMENT_VERSION_NOT_FOUND'; end if;
    if v.reserved_by_user_id<>auth.uid() then raise exception using errcode='P0001',message='ACCESS_DENIED'; end if;
    if not security.can_access_document(v.document_id,'MANAGER') then raise exception using errcode='P0001',message='ACCESS_DENIED'; end if;
    if v.upload_status<>'RESERVED' then raise exception using errcode='P0001',message='UPLOAD_NOT_RESERVED'; end if;
    if p_actual_mime_type not in ('application/pdf','image/jpeg','image/png') then raise exception using errcode='P0001',message='UNSUPPORTED_MIME_TYPE'; end if;
    if p_actual_size_bytes<=0 or p_actual_size_bytes>20971520 then raise exception using errcode='P0001',message='INVALID_FILE_SIZE'; end if;
    if not exists(select 1 from storage.objects o where o.bucket_id=v.storage_bucket and o.name=v.storage_path) then
        raise exception using errcode='P0001',message='UPLOAD_NOT_FOUND';
    end if;
    update public.document_versions set mime_type=p_actual_mime_type,size_bytes=p_actual_size_bytes,
        checksum=p_checksum,upload_status='PENDING_SCAN',finalized_at=now(),uploaded_at=now()
    where id=v.id;
    insert into public.audit_events(actor_user_id,action,entity_type,entity_id,outcome,metadata)
    values(auth.uid(),'DOCUMENT_UPLOAD_FINALIZED','DOCUMENT',v.document_id,'SUCCESS',jsonb_build_object('version_id',v.id));
    return jsonb_build_object('document_id',v.document_id,'document_version_id',v.id,'upload_status','PENDING_SCAN');
end;
$$;

-- Registra l'esito della scansione malware. Solo backend/service role.
create or replace function public.complete_document_scan(
    p_document_version_id uuid,
    p_scan_result text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, security
as $$
declare v public.document_versions%rowtype; v_status text;
begin
    if p_scan_result not in ('CLEAN','INFECTED','FAILED') then
        raise exception using errcode='P0001',message='INVALID_SCAN_RESULT';
    end if;
    select * into v from public.document_versions where id=p_document_version_id for update;
    if not found then raise exception using errcode='P0001',message='DOCUMENT_VERSION_NOT_FOUND'; end if;
    if v.upload_status<>'PENDING_SCAN' then raise exception using errcode='P0001',message='DOCUMENT_NOT_PENDING_SCAN'; end if;
    v_status := case when p_scan_result='CLEAN' then 'AVAILABLE' when p_scan_result='INFECTED' then 'REJECTED' else 'FAILED' end;
    update public.document_versions set malware_scan_status=p_scan_result,upload_status=v_status where id=v.id;
    if p_scan_result='CLEAN' then
        update public.documents set current_version_id=v.id,updated_at=now() where id=v.document_id;
    else
        insert into public.security_events(user_id,event_type,severity,outcome,details)
        values(v.reserved_by_user_id,'DOCUMENT_SCAN_'||p_scan_result,
               case when p_scan_result='INFECTED' then 'HIGH' else 'WARNING' end,
               p_scan_result,jsonb_build_object('document_id',v.document_id,'version_id',v.id));
    end if;
    return jsonb_build_object('document_id',v.document_id,'document_version_id',v.id,
                              'malware_scan_status',p_scan_result,'upload_status',v_status);
end;
$$;

-- Controllo autorizzativo prima di generare una signed URL nel backend.
create or replace function public.authorize_document_download(p_document_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, security
as $$
declare v public.document_versions%rowtype; d public.documents%rowtype; v_role text:='VIEWER';
begin
    if auth.uid() is null then raise exception using errcode='P0001',message='AUTHENTICATION_REQUIRED'; end if;
    select * into v from public.document_versions where id=p_document_version_id;
    if not found then raise exception using errcode='P0001',message='DOCUMENT_VERSION_NOT_FOUND'; end if;
    select * into d from public.documents where id=v.document_id;
    if d.sensitivity='HIGHLY_SENSITIVE' then v_role:='MANAGER'; end if;
    if not security.can_access_document(v.document_id,v_role) then raise exception using errcode='P0001',message='ACCESS_DENIED'; end if;
    if v.upload_status<>'AVAILABLE' or v.malware_scan_status<>'CLEAN' then
        raise exception using errcode='P0001',message='DOCUMENT_NOT_AVAILABLE';
    end if;
    return jsonb_build_object('authorized',true,'document_id',v.document_id,
                              'document_version_id',v.id,'bucket',v.storage_bucket,
                              'storage_path',v.storage_path,'expires_in_seconds',300);
end;
$$;

-- Privilegi RPC client.
revoke all on function public.reserve_document_upload(text,uuid,text,text,text,text,bigint,text,text) from public,anon;
revoke all on function public.finalize_document_upload(uuid,text,bigint,text) from public,anon;
revoke all on function public.authorize_document_download(uuid) from public,anon;
grant execute on function public.reserve_document_upload(text,uuid,text,text,text,text,bigint,text,text) to authenticated;
grant execute on function public.finalize_document_upload(uuid,text,bigint,text) to authenticated;
grant execute on function public.authorize_document_download(uuid) to authenticated;

-- complete_document_scan non è eseguibile dal client autenticato.
revoke all on function public.complete_document_scan(uuid,text) from public,anon,authenticated;

-- RLS tabelle documentali.
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.property_documents enable row level security;
alter table public.owner_documents enable row level security;
alter table public.contract_documents enable row level security;
alter table public.rent_installment_documents enable row level security;
alter table public.expense_documents enable row level security;
alter table public.rentable_space_documents enable row level security;
alter table public.receipt_documents enable row level security;

create policy documents_select_scoped on public.documents
for select to authenticated using(security.can_access_document(id,'VIEWER'));

create policy document_versions_select_scoped on public.document_versions
for select to authenticated using(security.can_access_document(document_id,'VIEWER'));

create policy property_documents_select_scoped on public.property_documents
for select to authenticated using(security.can_access_document(document_id,'VIEWER'));

create policy owner_documents_select_scoped on public.owner_documents
for select to authenticated using(security.can_access_document(document_id,'VIEWER'));

create policy contract_documents_select_scoped on public.contract_documents
for select to authenticated using(security.can_access_document(document_id,'VIEWER'));

create policy installment_documents_select_scoped on public.rent_installment_documents
for select to authenticated using(security.can_access_document(document_id,'VIEWER'));

create policy expense_documents_select_scoped on public.expense_documents
for select to authenticated using(security.can_access_document(document_id,'VIEWER'));

create policy rentable_space_documents_select_scoped on public.rentable_space_documents
for select to authenticated using(security.can_access_document(document_id,'VIEWER'));

create policy receipt_documents_select_scoped on public.receipt_documents
for select to authenticated using(security.can_access_document(document_id,'VIEWER'));

-- Grant SELECT: la RLS decide le righe visibili.
grant select on public.documents,public.document_versions,
 public.property_documents,public.owner_documents,public.contract_documents,
 public.rent_installment_documents,public.expense_documents,
 public.rentable_space_documents,public.receipt_documents to authenticated;
