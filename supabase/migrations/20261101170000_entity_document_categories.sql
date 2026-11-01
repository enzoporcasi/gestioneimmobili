insert into public.reference_catalog_items (catalog_code, code, label, sort_order)
values
    ('document_category', 'IDENTITY_DOCUMENT', 'Documento di identità', 10),
    ('document_category', 'TAX_CODE', 'Codice fiscale', 11),
    ('document_category', 'VAT_REGISTRATION', 'Partita IVA', 12),
    ('document_category', 'CHAMBER_OF_COMMERCE_EXTRACT', 'Visura camerale', 13),
    ('document_category', 'ARTICLES_OF_ASSOCIATION', 'Atto costitutivo o statuto', 14),
    ('document_category', 'LEGAL_REPRESENTATIVE_ID', 'Documento del rappresentante legale', 15),
    ('document_category', 'PASSPORT', 'Passaporto', 20),
    ('document_category', 'RESIDENCE_PERMIT', 'Permesso di soggiorno', 21),
    ('document_category', 'FLOOR_PLAN', 'Planimetria', 30),
    ('document_category', 'CADASTRAL_VISURA', 'Visura catastale', 31),
    ('document_category', 'OWNERSHIP_DEED', 'Atto di proprietà', 32),
    ('document_category', 'ENERGY_CERTIFICATE', 'Attestato di prestazione energetica (APE)', 33),
    ('document_category', 'LEASE_CONTRACT', 'Contratto di locazione', 34),
    ('document_category', 'INSURANCE_POLICY', 'Polizza assicurativa', 35),
    ('document_category', 'PROPERTY_PHOTO', 'Fotografia dell’immobile', 36),
    ('document_category', 'CHAMBER_OF_COMMERCE_REGISTRATION', 'Iscrizione alla Camera di commercio', 40),
    ('document_category', 'EMPLOYMENT_DOCUMENT', 'Documentazione lavorativa o reddituale', 41),
    ('document_category', 'TRANSITORY_NEED_DOCUMENT', 'Documentazione esigenza transitoria', 42),
    ('document_category', 'SIGNED_CONTRACT', 'Contratto firmato', 50),
    ('document_category', 'REGISTRATION_RECEIPT', 'Ricevuta di registrazione', 51),
    ('document_category', 'CONTRACT_ADDENDUM', 'Appendice o proroga', 52),
    ('document_category', 'HANDOVER_REPORT', 'Verbale di consegna', 53),
    ('document_category', 'PAYMENT_RECEIPT', 'Ricevuta di pagamento', 54)
on conflict (catalog_code, code) do update
set label = excluded.label,
    is_active = true;

insert into public.reference_catalog_items (catalog_code, code, label, sort_order)
values ('document_sensitivity', 'HIGHLY_SENSITIVE', 'Altamente sensibile', 3)
on conflict (catalog_code, code) do update
set label = excluded.label,
    is_active = true;

create table public.document_category_entity_map (
    entity_type text not null check (entity_type in ('OWNER', 'PROPERTY', 'TENANT', 'CONTRACT')),
    catalog_code text not null default 'document_category'
        check (catalog_code = 'document_category'),
    category_code text not null,
    minimum_sensitivity text not null default 'STANDARD'
        check (minimum_sensitivity in ('STANDARD', 'PERSONAL', 'HIGHLY_SENSITIVE')),
    sort_order integer not null default 0,
    is_active boolean not null default true,
    primary key (entity_type, category_code),
    foreign key (catalog_code, category_code)
        references public.reference_catalog_items (catalog_code, code)
        on update restrict on delete restrict
);

insert into public.document_category_entity_map (
    entity_type, category_code, minimum_sensitivity, sort_order
)
values
    ('OWNER', 'IDENTITY_DOCUMENT', 'HIGHLY_SENSITIVE', 1),
    ('OWNER', 'TAX_CODE', 'HIGHLY_SENSITIVE', 2),
    ('OWNER', 'VAT_REGISTRATION', 'HIGHLY_SENSITIVE', 3),
    ('OWNER', 'CHAMBER_OF_COMMERCE_EXTRACT', 'HIGHLY_SENSITIVE', 4),
    ('OWNER', 'ARTICLES_OF_ASSOCIATION', 'HIGHLY_SENSITIVE', 5),
    ('OWNER', 'LEGAL_REPRESENTATIVE_ID', 'HIGHLY_SENSITIVE', 6),
    ('OWNER', 'OWNERSHIP_DEED', 'HIGHLY_SENSITIVE', 7),
    ('OWNER', 'OTHER', 'HIGHLY_SENSITIVE', 99),
    ('PROPERTY', 'FLOOR_PLAN', 'HIGHLY_SENSITIVE', 1),
    ('PROPERTY', 'CADASTRAL_VISURA', 'HIGHLY_SENSITIVE', 2),
    ('PROPERTY', 'OWNERSHIP_DEED', 'HIGHLY_SENSITIVE', 3),
    ('PROPERTY', 'ENERGY_CERTIFICATE', 'HIGHLY_SENSITIVE', 4),
    ('PROPERTY', 'LEASE_CONTRACT', 'HIGHLY_SENSITIVE', 5),
    ('PROPERTY', 'INSURANCE_POLICY', 'HIGHLY_SENSITIVE', 6),
    ('PROPERTY', 'PROPERTY_PHOTO', 'STANDARD', 7),
    ('PROPERTY', 'CONTRACT', 'HIGHLY_SENSITIVE', 8),
    ('PROPERTY', 'OTHER', 'HIGHLY_SENSITIVE', 99),
    ('TENANT', 'IDENTITY_DOCUMENT', 'HIGHLY_SENSITIVE', 1),
    ('TENANT', 'PASSPORT', 'HIGHLY_SENSITIVE', 2),
    ('TENANT', 'TAX_CODE', 'HIGHLY_SENSITIVE', 3),
    ('TENANT', 'RESIDENCE_PERMIT', 'HIGHLY_SENSITIVE', 4),
    ('TENANT', 'CHAMBER_OF_COMMERCE_REGISTRATION', 'HIGHLY_SENSITIVE', 5),
    ('TENANT', 'CHAMBER_OF_COMMERCE_EXTRACT', 'HIGHLY_SENSITIVE', 6),
    ('TENANT', 'EMPLOYMENT_DOCUMENT', 'HIGHLY_SENSITIVE', 7),
    ('TENANT', 'TRANSITORY_NEED_DOCUMENT', 'HIGHLY_SENSITIVE', 8),
    ('TENANT', 'SIGNED_CONTRACT', 'HIGHLY_SENSITIVE', 9),
    ('TENANT', 'OTHER', 'HIGHLY_SENSITIVE', 99),
    ('CONTRACT', 'SIGNED_CONTRACT', 'HIGHLY_SENSITIVE', 1),
    ('CONTRACT', 'REGISTRATION_RECEIPT', 'HIGHLY_SENSITIVE', 2),
    ('CONTRACT', 'CONTRACT_ADDENDUM', 'HIGHLY_SENSITIVE', 3),
    ('CONTRACT', 'HANDOVER_REPORT', 'HIGHLY_SENSITIVE', 4),
    ('CONTRACT', 'PAYMENT_RECEIPT', 'HIGHLY_SENSITIVE', 5),
    ('CONTRACT', 'CONTRACT', 'HIGHLY_SENSITIVE', 6),
    ('CONTRACT', 'OTHER', 'HIGHLY_SENSITIVE', 99)
on conflict (entity_type, category_code) do update
set minimum_sensitivity = excluded.minimum_sensitivity,
    sort_order = excluded.sort_order,
    is_active = true;

alter table public.document_category_entity_map enable row level security;
revoke all on public.document_category_entity_map from public, anon, authenticated;

create or replace function public.list_document_categories(p_entity_type text)
returns table (
    code text,
    label text,
    minimum_sensitivity text,
    sort_order integer
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
    if auth.uid() is null or not exists (
        select 1
        from public.profiles profile
        where profile.id = auth.uid()
          and profile.status = 'ACTIVE'
          and profile.archived_at is null
    ) then
        raise exception using errcode = 'P0001', message = 'ACCESS_DENIED';
    end if;

    if p_entity_type not in ('OWNER', 'PROPERTY', 'TENANT', 'CONTRACT') then
        raise exception using errcode = 'P0001', message = 'UNSUPPORTED_DOCUMENT_ENTITY_TYPE';
    end if;

    return query
    select item.code, item.label, mapping.minimum_sensitivity, mapping.sort_order
    from public.document_category_entity_map mapping
    join public.reference_catalog_items item
      on item.catalog_code = mapping.catalog_code
     and item.code = mapping.category_code
    where mapping.entity_type = p_entity_type
      and mapping.is_active
      and item.is_active
    order by mapping.sort_order, item.label;
end;
$$;

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
            from public.tenant_documents td
            join public.tenant_property_accesses tpa on tpa.tenant_id = td.tenant_id
            where td.document_id = p_document_id
              and security.can_access_property(tpa.property_id, p_required_role)
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

revoke all on function security.can_access_document(uuid, text) from public, anon, authenticated;
grant execute on function security.can_access_document(uuid, text) to authenticated;

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
    v_sensitivity text := p_sensitivity;
    v_minimum_sensitivity text;
    v_sensitivity_rank smallint;
    v_minimum_sensitivity_rank smallint;
begin
    if auth.uid() is null or not exists (
        select 1
        from public.profiles profile
        where profile.id = auth.uid()
          and profile.status = 'ACTIVE'
          and profile.archived_at is null
    ) then
        raise exception using errcode = 'P0001', message = 'ACCESS_DENIED';
    end if;

    if p_title is null or btrim(p_title) = '' then
        raise exception using errcode = 'P0001', message = 'DOCUMENT_TITLE_REQUIRED';
    end if;
    if p_original_file_name is null or btrim(p_original_file_name) = '' then
        raise exception using errcode = 'P0001', message = 'FILE_NAME_REQUIRED';
    end if;
    if p_declared_mime_type not in ('application/pdf', 'image/jpeg', 'image/png') then
        raise exception using errcode = 'P0001', message = 'UNSUPPORTED_MIME_TYPE';
    end if;
    if p_expected_size_bytes is null or p_expected_size_bytes <= 0 or p_expected_size_bytes > 20971520 then
        raise exception using errcode = 'P0001', message = 'INVALID_FILE_SIZE';
    end if;
    if p_sensitivity not in ('STANDARD', 'PERSONAL', 'HIGHLY_SENSITIVE') then
        raise exception using errcode = 'P0001', message = 'INVALID_DOCUMENT_SENSITIVITY';
    end if;

    case p_entity_type
        when 'PROPERTY' then
            v_allowed := security.can_access_property(p_entity_id, 'MANAGER');
        when 'OWNER' then
            v_allowed := security.can_access_owner(p_entity_id, 'MANAGER');
        when 'CONTRACT' then
            v_allowed := security.can_access_contract(p_entity_id, 'MANAGER');
        when 'TENANT' then
            select exists (
                select 1
                from public.tenant_property_accesses tpa
                where tpa.tenant_id = p_entity_id
                  and security.can_access_property(tpa.property_id, 'MANAGER')
            ) into v_allowed;
        when 'RENT_INSTALLMENT' then
            v_allowed := security.can_access_installment(p_entity_id, 'MANAGER');
        when 'EXPENSE' then
            v_allowed := security.can_access_expense(p_entity_id, 'MANAGER');
        when 'RENTABLE_SPACE' then
            select security.can_access_property(property_id, 'MANAGER')
            into v_allowed
            from public.rentable_spaces
            where id = p_entity_id;
        when 'RECEIPT' then
            select security.can_access_property(property_id, 'MANAGER')
            into v_allowed
            from public.receipts
            where id = p_entity_id;
        else
            raise exception using errcode = 'P0001', message = 'UNSUPPORTED_DOCUMENT_ENTITY_TYPE';
    end case;

    if not coalesce(v_allowed, false) then
        raise exception using errcode = 'P0001', message = 'ACCESS_DENIED';
    end if;

    if p_entity_type in ('OWNER', 'PROPERTY', 'TENANT', 'CONTRACT') then
        select mapping.minimum_sensitivity
        into v_minimum_sensitivity
        from public.document_category_entity_map mapping
        join public.reference_catalog_items item
          on item.catalog_code = mapping.catalog_code
         and item.code = mapping.category_code
        where mapping.entity_type = p_entity_type
          and mapping.category_code = p_category
          and mapping.is_active
          and item.is_active;

        if not found then
            raise exception using errcode = 'P0001', message = 'INVALID_DOCUMENT_CATEGORY_FOR_ENTITY';
        end if;

        v_minimum_sensitivity_rank := case v_minimum_sensitivity
            when 'HIGHLY_SENSITIVE' then 3
            when 'PERSONAL' then 2
            else 1
        end;
        v_sensitivity_rank := case p_sensitivity
            when 'HIGHLY_SENSITIVE' then 3
            when 'PERSONAL' then 2
            else 1
        end;

        if v_minimum_sensitivity_rank > v_sensitivity_rank then
            v_sensitivity := v_minimum_sensitivity;
        end if;
    elsif not exists (
        select 1
        from public.reference_catalog_items item
        where item.catalog_code = 'document_category'
          and item.code = p_category
          and item.is_active
    ) then
        raise exception using errcode = 'P0001', message = 'INVALID_DOCUMENT_CATEGORY';
    end if;

    v_safe_name := regexp_replace(btrim(p_original_file_name), '[^A-Za-z0-9._-]+', '_', 'g');
    if v_safe_name = '' then
        v_safe_name := 'document';
    end if;
    v_storage_path := v_document_id::text || '/' || v_version_id::text || '/' || v_safe_name;

    insert into public.documents (
        id, title, category, status, sensitivity, created_at, updated_at
    )
    values (
        v_document_id, btrim(p_title), btrim(p_category), 'ACTIVE', v_sensitivity, now(), now()
    );

    insert into public.document_versions (
        id, document_id, version_number, storage_bucket, storage_path,
        original_file_name, mime_type, size_bytes, malware_scan_status,
        upload_status, reserved_by_user_id, reserved_at
    )
    values (
        v_version_id, v_document_id, 1, 'property-documents', v_storage_path,
        btrim(p_original_file_name), p_declared_mime_type, p_expected_size_bytes,
        'PENDING', 'RESERVED', auth.uid(), now()
    );

    case p_entity_type
        when 'PROPERTY' then
            insert into public.property_documents values (v_document_id, p_entity_id, p_link_role);
        when 'OWNER' then
            insert into public.owner_documents values (v_document_id, p_entity_id, p_link_role);
        when 'TENANT' then
            insert into public.tenant_documents values (v_document_id, p_entity_id, p_link_role);
        when 'CONTRACT' then
            insert into public.contract_documents values (v_document_id, p_entity_id, p_link_role);
        when 'RENT_INSTALLMENT' then
            insert into public.rent_installment_documents values (v_document_id, p_entity_id, p_link_role);
        when 'EXPENSE' then
            insert into public.expense_documents values (v_document_id, p_entity_id, p_link_role);
        when 'RENTABLE_SPACE' then
            insert into public.rentable_space_documents values (v_document_id, p_entity_id, p_link_role);
        when 'RECEIPT' then
            insert into public.receipt_documents values (v_document_id, p_entity_id, p_link_role);
    end case;

    insert into public.audit_events (
        actor_user_id, action, entity_type, entity_id, outcome, metadata
    )
    values (
        auth.uid(),
        'DOCUMENT_UPLOAD_RESERVED',
        'DOCUMENT',
        v_document_id,
        'SUCCESS',
        jsonb_build_object(
            'version_id', v_version_id,
            'entity_type', p_entity_type,
            'entity_id', p_entity_id,
            'category', p_category
        )
    );

    return jsonb_build_object(
        'document_id', v_document_id,
        'document_version_id', v_version_id,
        'bucket', 'property-documents',
        'storage_path', v_storage_path,
        'upload_status', 'RESERVED'
    );
end;
$$;

revoke all on function public.list_document_categories(text) from public, anon;
grant execute on function public.list_document_categories(text) to authenticated;
revoke all on function public.reserve_document_upload(text, uuid, text, text, text, text, bigint, text, text)
    from public, anon;
grant execute on function public.reserve_document_upload(text, uuid, text, text, text, text, bigint, text, text)
    to authenticated;

create policy tenant_documents_select_scoped
on public.tenant_documents
for select to authenticated
using (security.can_access_document(document_id, 'VIEWER'));

grant select on public.tenant_documents to authenticated;
