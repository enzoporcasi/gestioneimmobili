create table public.reference_catalogs (
    code text primary key,
    label text not null,
    is_workflow boolean not null default false
);

create table public.reference_catalog_items (
    id uuid primary key default gen_random_uuid(),
    catalog_code text not null references public.reference_catalogs(code) on delete restrict,
    code text not null,
    label text not null,
    sort_order integer not null default 0,
    is_active boolean not null default true,
    unique (catalog_code, code)
);

insert into public.reference_catalogs (code, label, is_workflow) values
    ('profile_status', 'Stato profilo', true),
    ('owner_type', 'Tipo Proprietario', false),
    ('tenant_type', 'Tipo Locatario', false),
    ('entity_status', 'Stato anagrafica', true),
    ('access_role', 'Ruolo di accesso', true),
    ('invitation_status', 'Stato invito', true),
    ('legal_document_type', 'Tipo documento legale', false),
    ('acceptance_action', 'Azione accettazione', true),
    ('data_request_type', 'Tipo richiesta privacy', false),
    ('data_request_status', 'Stato richiesta privacy', true),
    ('property_type', 'Tipo immobile', false),
    ('rentable_space_type', 'Tipo porzione locabile', false),
    ('availability_override', 'Disponibilità porzione', true),
    ('contract_object_type', 'Oggetto contratto', false),
    ('contract_type', 'Tipologia contratto', false),
    ('contract_management_status', 'Stato gestionale contratto', true),
    ('contract_lifecycle_status', 'Ciclo di vita contratto', true),
    ('tax_regime', 'Regime fiscale', false),
    ('contract_tenant_role', 'Ruolo Locatario nel contratto', false),
    ('billing_frequency', 'Periodicità canone', false),
    ('contract_change_type', 'Tipo variazione contratto', false),
    ('installment_status', 'Stato rata', true),
    ('installment_component_type', 'Componente rata', false),
    ('payment_method', 'Metodo di pagamento', false),
    ('receipt_status', 'Stato incasso', true),
    ('expense_category', 'Categoria spesa', false),
    ('expense_status', 'Stato spesa', true),
    ('expense_allocation_mode', 'Modalità ripartizione spesa', false),
    ('owner_settlement_status', 'Stato conguaglio Proprietari', true),
    ('billing_run_status', 'Stato generazione rate', true),
    ('document_category', 'Categoria documento', false),
    ('document_status', 'Stato documento', true),
    ('document_sensitivity', 'Sensibilità documento', false),
    ('malware_scan_status', 'Stato scansione file', true),
    ('upload_status', 'Stato caricamento file', true),
    ('deadline_category', 'Categoria scadenza', false),
    ('deadline_priority', 'Priorità scadenza', false),
    ('deadline_status', 'Stato scadenza', true),
    ('notification_channel', 'Canale notifica', false),
    ('notification_delivery_status', 'Stato invio notifica', true),
    ('expense_payment_status', 'Stato pagamento spesa', true);

insert into public.reference_catalog_items (catalog_code, code, label, sort_order) values
    ('profile_status', 'ACTIVE', 'Attivo', 1),
    ('profile_status', 'BLOCKED', 'Bloccato', 2),
    ('profile_status', 'INACTIVE', 'Inattivo', 3),
    ('owner_type', 'NATURAL_PERSON', 'Persona fisica', 1),
    ('owner_type', 'LEGAL_ENTITY', 'Persona giuridica', 2),
    ('tenant_type', 'NATURAL_PERSON', 'Persona fisica', 1),
    ('tenant_type', 'LEGAL_ENTITY', 'Persona giuridica', 2),
    ('tenant_type', 'SOLE_PROPRIETOR', 'Ditta individuale', 3),
    ('entity_status', 'ACTIVE', 'Attivo', 1),
    ('entity_status', 'INACTIVE', 'Inattivo', 2),
    ('access_role', 'VIEWER', 'Consultazione', 1),
    ('access_role', 'MANAGER', 'Gestione', 2),
    ('access_role', 'ADMINISTRATOR', 'Amministratore', 3),
    ('invitation_status', 'SENT', 'Inviato', 1),
    ('invitation_status', 'ACCEPTED', 'Accettato', 2),
    ('invitation_status', 'EXPIRED', 'Scaduto', 3),
    ('invitation_status', 'REVOKED', 'Revocato', 4),
    ('legal_document_type', 'TERMS', 'Condizioni di servizio', 1),
    ('legal_document_type', 'PRIVACY', 'Informativa privacy', 2),
    ('legal_document_type', 'COOKIE', 'Informativa cookie', 3),
    ('acceptance_action', 'ACCEPTED', 'Accettata', 1),
    ('acceptance_action', 'WITHDRAWN', 'Revocata', 2),
    ('data_request_type', 'ACCESS', 'Accesso', 1),
    ('data_request_type', 'EXPORT', 'Esportazione', 2),
    ('data_request_type', 'RECTIFICATION', 'Rettifica', 3),
    ('data_request_type', 'DELETION', 'Cancellazione', 4),
    ('data_request_type', 'RESTRICTION', 'Limitazione', 5),
    ('data_request_status', 'OPEN', 'Aperta', 1),
    ('data_request_status', 'IN_PROGRESS', 'In lavorazione', 2),
    ('data_request_status', 'COMPLETED', 'Completata', 3),
    ('data_request_status', 'REJECTED', 'Rifiutata', 4),
    ('data_request_status', 'CANCELLED', 'Annullata', 5),
    ('property_type', 'APARTMENT', 'Appartamento', 1),
    ('property_type', 'COMMERCIAL', 'Commerciale', 2),
    ('property_type', 'GARAGE', 'Garage', 3),
    ('property_type', 'PARKING', 'Posto auto', 4),
    ('property_type', 'STORAGE', 'Deposito', 5),
    ('property_type', 'LAND', 'Terreno', 6),
    ('property_type', 'OTHER', 'Altro', 7),
    ('rentable_space_type', 'ROOM', 'Stanza', 1),
    ('rentable_space_type', 'COMMERCIAL', 'Locale commerciale', 2),
    ('rentable_space_type', 'PARKING', 'Posto auto', 3),
    ('rentable_space_type', 'STORAGE', 'Deposito', 4),
    ('rentable_space_type', 'OTHER', 'Altro', 5),
    ('availability_override', 'UNAVAILABLE', 'Non disponibile', 1),
    ('contract_object_type', 'WHOLE_PROPERTY', 'Intero immobile', 1),
    ('contract_object_type', 'RENTABLE_SPACES', 'Porzioni locabili', 2),
    ('contract_type', 'RESIDENTIAL_FREE', 'Abitativo libero (4+4)', 1),
    ('contract_type', 'RESIDENTIAL_AGREED', 'Abitativo concordato (3+2)', 2),
    ('contract_type', 'TRANSITORY', 'Abitativo transitorio', 3),
    ('contract_type', 'COMMERCIAL', 'Commerciale (6+6)', 4),
    ('contract_type', 'STUDENT', 'Abitativo per studenti', 5),
    ('contract_type', 'COMMODATUM', 'Comodato', 6),
    ('contract_type', 'OTHER', 'Altro', 7),
    ('contract_management_status', 'ACTIVE', 'Attivo', 1),
    ('contract_management_status', 'INACTIVE', 'Inattivo', 2),
    ('contract_lifecycle_status', 'DRAFT', 'Bozza', 1),
    ('contract_lifecycle_status', 'SCHEDULED', 'Programmato', 2),
    ('contract_lifecycle_status', 'IN_PROGRESS', 'In corso', 3),
    ('contract_lifecycle_status', 'EXPIRING', 'In scadenza', 4),
    ('contract_lifecycle_status', 'ENDED', 'Terminato', 5),
    ('contract_lifecycle_status', 'CANCELLED', 'Annullato', 6),
    ('contract_lifecycle_status', 'TERMINATED', 'Risolto anticipatamente', 7),
    ('tax_regime', 'ORDINARIO', 'Ordinario', 1),
    ('tax_regime', 'CEDOLARE_SECCA', 'Cedolare secca', 2),
    ('contract_tenant_role', 'TENANT', 'Locatario principale', 1),
    ('contract_tenant_role', 'CO_TENANT', 'Co-conduttore', 2),
    ('billing_frequency', 'MONTHLY', 'Mensile', 1),
    ('billing_frequency', 'BIMONTHLY', 'Bimestrale', 2),
    ('billing_frequency', 'QUARTERLY', 'Trimestrale', 3),
    ('billing_frequency', 'SEMIANNUAL', 'Semestrale', 4),
    ('billing_frequency', 'ANNUAL', 'Annuale', 5),
    ('billing_frequency', 'CUSTOM', 'Personalizzata', 6),
    ('contract_change_type', 'EARLY_TERMINATION', 'Risoluzione anticipata', 1),
    ('contract_change_type', 'RENT_CHANGE', 'Variazione canone', 2),
    ('contract_change_type', 'TERM_CHANGE', 'Variazione condizioni', 3),
    ('installment_status', 'CREATED', 'Creata', 1),
    ('installment_status', 'PAID', 'Pagata', 2),
    ('installment_status', 'LOST', 'Persa', 3),
    ('installment_status', 'NOT_DUE', 'Non dovuta', 4),
    ('installment_status', 'CANCELLED', 'Annullata', 5),
    ('installment_component_type', 'RENT', 'Canone', 1),
    ('installment_component_type', 'ADJUSTMENT', 'Conguaglio', 2),
    ('installment_component_type', 'EXPENSE', 'Spesa accessoria', 3),
    ('payment_method', 'BANK_TRANSFER', 'Bonifico bancario', 1),
    ('payment_method', 'CASH', 'Contanti', 2),
    ('payment_method', 'CARD', 'Carta', 3),
    ('payment_method', 'DIRECT_DEBIT', 'Addebito diretto', 4),
    ('payment_method', 'OTHER', 'Altro', 5),
    ('receipt_status', 'RECORDED', 'Registrato', 1),
    ('receipt_status', 'REVERSED', 'Stornato', 2),
    ('expense_category', 'MAINTENANCE', 'Manutenzione', 1),
    ('expense_category', 'UTILITIES', 'Utenze', 2),
    ('expense_category', 'TAXES', 'Imposte e tasse', 3),
    ('expense_category', 'INSURANCE', 'Assicurazione', 4),
    ('expense_category', 'CONDOMINIUM', 'Condominio', 5),
    ('expense_category', 'OTHER', 'Altro', 6),
    ('expense_status', 'TO_PAY', 'Da pagare', 1),
    ('expense_status', 'PAID', 'Pagata', 2),
    ('expense_status', 'CANCELLED', 'Annullata', 3),
    ('expense_allocation_mode', 'OWNERSHIP_QUOTAS', 'Quote di proprietà', 1),
    ('expense_allocation_mode', 'MANUAL', 'Manuale', 2),
    ('owner_settlement_status', 'OPEN', 'Aperto', 1),
    ('owner_settlement_status', 'SETTLED', 'Saldato', 2),
    ('billing_run_status', 'RUNNING', 'In corso', 1),
    ('billing_run_status', 'COMPLETED', 'Completata', 2),
    ('billing_run_status', 'FAILED', 'Fallita', 3),
    ('document_category', 'CONTRACT', 'Contratto', 1),
    ('document_category', 'IDENTITY', 'Documento di identità', 2),
    ('document_category', 'TAX', 'Documentazione fiscale', 3),
    ('document_category', 'PROPERTY', 'Immobile', 4),
    ('document_category', 'RECEIPT', 'Ricevuta', 5),
    ('document_category', 'OTHER', 'Altro', 6),
    ('document_status', 'ACTIVE', 'Attivo', 1),
    ('document_status', 'INACTIVE', 'Inattivo', 2),
    ('document_sensitivity', 'STANDARD', 'Standard', 1),
    ('document_sensitivity', 'SENSITIVE', 'Sensibile', 2),
    ('malware_scan_status', 'PENDING', 'In attesa', 1),
    ('malware_scan_status', 'CLEAN', 'Sicuro', 2),
    ('malware_scan_status', 'INFECTED', 'Infetto', 3),
    ('malware_scan_status', 'FAILED', 'Non verificato', 4),
    ('upload_status', 'RESERVED', 'Prenotato', 1),
    ('upload_status', 'UPLOADED', 'Caricato', 2),
    ('upload_status', 'AVAILABLE', 'Disponibile', 3),
    ('upload_status', 'REJECTED', 'Rifiutato', 4),
    ('deadline_category', 'CONTRACT', 'Contratto', 1),
    ('deadline_category', 'PAYMENT', 'Pagamento', 2),
    ('deadline_category', 'DOCUMENT', 'Documento', 3),
    ('deadline_category', 'TAX', 'Adempimento fiscale', 4),
    ('deadline_category', 'OTHER', 'Altro', 5),
    ('deadline_priority', 'LOW', 'Bassa', 1),
    ('deadline_priority', 'MEDIUM', 'Media', 2),
    ('deadline_priority', 'HIGH', 'Alta', 3),
    ('deadline_status', 'TODO', 'Da fare', 1),
    ('deadline_status', 'IN_PROGRESS', 'In corso', 2),
    ('deadline_status', 'COMPLETED', 'Completata', 3),
    ('deadline_status', 'CANCELLED', 'Annullata', 4),
    ('notification_channel', 'PUSH', 'Notifica push', 1),
    ('notification_channel', 'EMAIL', 'E-mail', 2),
    ('notification_delivery_status', 'SCHEDULED', 'Programmato', 1),
    ('notification_delivery_status', 'SENT', 'Inviato', 2),
    ('notification_delivery_status', 'FAILED', 'Fallito', 3),
    ('expense_payment_status', 'RECORDED', 'Registrato', 1),
    ('expense_payment_status', 'REVERSED', 'Stornato', 2);

do $$
declare
    v_mapping record;
begin
    for v_mapping in
        select * from (values
            ('profiles', 'status', 'profile_status'),
            ('owners', 'owner_type', 'owner_type'),
            ('owners', 'status', 'entity_status'),
            ('invitations', 'role', 'access_role'),
            ('invitations', 'status', 'invitation_status'),
            ('user_owner_accesses', 'role', 'access_role'),
            ('user_owner_accesses', 'status', 'entity_status'),
            ('legal_documents', 'type', 'legal_document_type'),
            ('legal_documents', 'status', 'entity_status'),
            ('legal_acceptances', 'action', 'acceptance_action'),
            ('data_subject_requests', 'type', 'data_request_type'),
            ('data_subject_requests', 'status', 'data_request_status'),
            ('properties', 'property_type', 'property_type'),
            ('properties', 'status', 'entity_status'),
            ('rentable_spaces', 'space_type', 'rentable_space_type'),
            ('rentable_spaces', 'management_status', 'entity_status'),
            ('rentable_spaces', 'availability_override', 'availability_override'),
            ('tenants', 'tenant_type', 'tenant_type'),
            ('tenants', 'status', 'entity_status'),
            ('contracts', 'object_type', 'contract_object_type'),
            ('contracts', 'contract_type', 'contract_type'),
            ('contracts', 'management_status', 'contract_management_status'),
            ('contracts', 'lifecycle_status', 'contract_lifecycle_status'),
            ('contracts', 'tax_regime', 'tax_regime'),
            ('contract_tenants', 'role', 'contract_tenant_role'),
            ('contract_tenants', 'status', 'entity_status'),
            ('contract_terms', 'billing_frequency', 'billing_frequency'),
            ('contract_changes', 'change_type', 'contract_change_type'),
            ('rent_installments', 'status', 'installment_status'),
            ('rent_installment_components', 'component_type', 'installment_component_type'),
            ('receipts', 'payment_method', 'payment_method'),
            ('receipts', 'status', 'receipt_status'),
            ('expenses', 'category', 'expense_category'),
            ('expenses', 'status', 'expense_status'),
            ('expenses', 'allocation_mode', 'expense_allocation_mode'),
            ('expense_payments', 'payment_method', 'payment_method'),
            ('expense_payments', 'status', 'expense_payment_status'),
            ('owner_settlement_items', 'status', 'owner_settlement_status'),
            ('billing_generation_runs', 'status', 'billing_run_status'),
            ('documents', 'category', 'document_category'),
            ('documents', 'status', 'document_status'),
            ('documents', 'sensitivity', 'document_sensitivity'),
            ('document_versions', 'malware_scan_status', 'malware_scan_status'),
            ('document_versions', 'upload_status', 'upload_status'),
            ('deadlines', 'category', 'deadline_category'),
            ('deadlines', 'priority', 'deadline_priority'),
            ('deadlines', 'status', 'deadline_status'),
            ('notification_rules', 'channel', 'notification_channel'),
            ('notification_deliveries', 'status', 'notification_delivery_status')
        ) as mappings(table_name, column_name, catalog_code)
    loop
        execute format(
            'insert into public.reference_catalog_items (catalog_code, code, label, sort_order) '
            'select %L, distinct_values.value, initcap(replace(lower(distinct_values.value), %L, %L)), 1000 '
            'from (select distinct %I::text as value from public.%I where %I is not null) distinct_values '
            'on conflict (catalog_code, code) do nothing',
            v_mapping.catalog_code,
            '_',
            ' ',
            v_mapping.column_name,
            v_mapping.table_name,
            v_mapping.column_name
        );
    end loop;
end;
$$;

create or replace function public.sync_reference_catalog_item()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
    v_code text := to_jsonb(new) ->> tg_argv[0];
    v_item_id uuid;
begin
    if v_code is not null then
        select item.id into v_item_id
        from public.reference_catalog_items item
        where item.catalog_code = tg_argv[1]
          and item.code = v_code;
        if not found then
            raise exception using
                errcode = '23503',
                message = 'UNKNOWN_REFERENCE_CATALOG_ITEM',
                detail = format('Catalog %s does not contain code %s.', tg_argv[1], v_code);
        end if;
    end if;

    new := jsonb_populate_record(
        new,
        jsonb_build_object(tg_argv[2], v_item_id)
    );
    return new;
end;
$$;

do $$
declare
    v_mapping record;
begin
    for v_mapping in
        select * from (values
            ('profiles', 'status', 'profile_status'),
            ('owners', 'owner_type', 'owner_type'),
            ('owners', 'status', 'entity_status'),
            ('invitations', 'role', 'access_role'),
            ('invitations', 'status', 'invitation_status'),
            ('user_owner_accesses', 'role', 'access_role'),
            ('user_owner_accesses', 'status', 'entity_status'),
            ('legal_documents', 'type', 'legal_document_type'),
            ('legal_documents', 'status', 'entity_status'),
            ('legal_acceptances', 'action', 'acceptance_action'),
            ('data_subject_requests', 'type', 'data_request_type'),
            ('data_subject_requests', 'status', 'data_request_status'),
            ('properties', 'property_type', 'property_type'),
            ('properties', 'status', 'entity_status'),
            ('rentable_spaces', 'space_type', 'rentable_space_type'),
            ('rentable_spaces', 'management_status', 'entity_status'),
            ('rentable_spaces', 'availability_override', 'availability_override'),
            ('tenants', 'tenant_type', 'tenant_type'),
            ('tenants', 'status', 'entity_status'),
            ('contracts', 'object_type', 'contract_object_type'),
            ('contracts', 'contract_type', 'contract_type'),
            ('contracts', 'management_status', 'contract_management_status'),
            ('contracts', 'lifecycle_status', 'contract_lifecycle_status'),
            ('contracts', 'tax_regime', 'tax_regime'),
            ('contract_tenants', 'role', 'contract_tenant_role'),
            ('contract_tenants', 'status', 'entity_status'),
            ('contract_terms', 'billing_frequency', 'billing_frequency'),
            ('contract_changes', 'change_type', 'contract_change_type'),
            ('rent_installments', 'status', 'installment_status'),
            ('rent_installment_components', 'component_type', 'installment_component_type'),
            ('receipts', 'payment_method', 'payment_method'),
            ('receipts', 'status', 'receipt_status'),
            ('expenses', 'category', 'expense_category'),
            ('expenses', 'status', 'expense_status'),
            ('expenses', 'allocation_mode', 'expense_allocation_mode'),
            ('expense_payments', 'payment_method', 'payment_method'),
            ('expense_payments', 'status', 'expense_payment_status'),
            ('owner_settlement_items', 'status', 'owner_settlement_status'),
            ('billing_generation_runs', 'status', 'billing_run_status'),
            ('documents', 'category', 'document_category'),
            ('documents', 'status', 'document_status'),
            ('documents', 'sensitivity', 'document_sensitivity'),
            ('document_versions', 'malware_scan_status', 'malware_scan_status'),
            ('document_versions', 'upload_status', 'upload_status'),
            ('deadlines', 'category', 'deadline_category'),
            ('deadlines', 'priority', 'deadline_priority'),
            ('deadlines', 'status', 'deadline_status'),
            ('notification_rules', 'channel', 'notification_channel'),
            ('notification_deliveries', 'status', 'notification_delivery_status')
        ) as mappings(table_name, column_name, catalog_code)
    loop
        execute format(
            'alter table public.%I add column %I uuid',
            v_mapping.table_name,
            v_mapping.column_name || '_catalog_item_id'
        );
        execute format(
            'alter table public.%I add constraint %I foreign key (%I) '
            'references public.reference_catalog_items (id) on update restrict on delete restrict',
            v_mapping.table_name,
            'fk_' || v_mapping.table_name || '_' || v_mapping.column_name || '_catalog',
            v_mapping.column_name || '_catalog_item_id'
        );
        execute format(
            'create trigger %I before insert or update of %I on public.%I '
            'for each row execute function public.sync_reference_catalog_item(%L, %L, %L)',
            'trg_' || v_mapping.table_name || '_' || v_mapping.column_name || '_catalog',
            v_mapping.column_name,
            v_mapping.table_name,
            v_mapping.column_name,
            v_mapping.catalog_code,
            v_mapping.column_name || '_catalog_item_id'
        );
    end loop;
end;
$$;

do $$
declare
    v_mapping record;
begin
    for v_mapping in
        select * from (values
            ('profiles', 'status', 'profile_status'),
            ('owners', 'owner_type', 'owner_type'),
            ('owners', 'status', 'entity_status'),
            ('invitations', 'role', 'access_role'),
            ('invitations', 'status', 'invitation_status'),
            ('user_owner_accesses', 'role', 'access_role'),
            ('user_owner_accesses', 'status', 'entity_status'),
            ('legal_documents', 'type', 'legal_document_type'),
            ('legal_documents', 'status', 'entity_status'),
            ('legal_acceptances', 'action', 'acceptance_action'),
            ('data_subject_requests', 'type', 'data_request_type'),
            ('data_subject_requests', 'status', 'data_request_status'),
            ('properties', 'property_type', 'property_type'),
            ('properties', 'status', 'entity_status'),
            ('rentable_spaces', 'space_type', 'rentable_space_type'),
            ('rentable_spaces', 'management_status', 'entity_status'),
            ('rentable_spaces', 'availability_override', 'availability_override'),
            ('tenants', 'tenant_type', 'tenant_type'),
            ('tenants', 'status', 'entity_status'),
            ('contracts', 'object_type', 'contract_object_type'),
            ('contracts', 'contract_type', 'contract_type'),
            ('contracts', 'management_status', 'contract_management_status'),
            ('contracts', 'lifecycle_status', 'contract_lifecycle_status'),
            ('contracts', 'tax_regime', 'tax_regime'),
            ('contract_tenants', 'role', 'contract_tenant_role'),
            ('contract_tenants', 'status', 'entity_status'),
            ('contract_terms', 'billing_frequency', 'billing_frequency'),
            ('contract_changes', 'change_type', 'contract_change_type'),
            ('rent_installments', 'status', 'installment_status'),
            ('rent_installment_components', 'component_type', 'installment_component_type'),
            ('receipts', 'payment_method', 'payment_method'),
            ('receipts', 'status', 'receipt_status'),
            ('expenses', 'category', 'expense_category'),
            ('expenses', 'status', 'expense_status'),
            ('expenses', 'allocation_mode', 'expense_allocation_mode'),
            ('expense_payments', 'payment_method', 'payment_method'),
            ('expense_payments', 'status', 'expense_payment_status'),
            ('owner_settlement_items', 'status', 'owner_settlement_status'),
            ('billing_generation_runs', 'status', 'billing_run_status'),
            ('documents', 'category', 'document_category'),
            ('documents', 'status', 'document_status'),
            ('documents', 'sensitivity', 'document_sensitivity'),
            ('document_versions', 'malware_scan_status', 'malware_scan_status'),
            ('document_versions', 'upload_status', 'upload_status'),
            ('deadlines', 'category', 'deadline_category'),
            ('deadlines', 'priority', 'deadline_priority'),
            ('deadlines', 'status', 'deadline_status'),
            ('notification_rules', 'channel', 'notification_channel'),
            ('notification_deliveries', 'status', 'notification_delivery_status')
        ) as mappings(table_name, column_name, catalog_code)
    loop
        execute format(
            'update public.%I as source set %I = item.id '
            'from public.reference_catalog_items item '
            'where item.catalog_code = %L and item.code = source.%I::text',
            v_mapping.table_name,
            v_mapping.column_name || '_catalog_item_id',
            v_mapping.catalog_code,
            v_mapping.column_name
        );
    end loop;
end;
$$;

alter table public.reference_catalogs enable row level security;
alter table public.reference_catalog_items enable row level security;

create policy reference_catalogs_read_authenticated
on public.reference_catalogs for select to authenticated using (true);

create policy reference_catalog_items_read_authenticated
on public.reference_catalog_items for select to authenticated using (true);

revoke all on public.reference_catalogs from public, anon, authenticated;
revoke all on public.reference_catalog_items from public, anon, authenticated;
grant select on public.reference_catalogs to authenticated;
grant select on public.reference_catalog_items to authenticated;

create or replace function public.list_reference_catalog_items()
returns table (
    catalog_code text,
    code text,
    label text,
    sort_order integer,
    is_active boolean
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
    select item.catalog_code, item.code, item.label, item.sort_order, item.is_active
    from public.reference_catalog_items item
    order by item.catalog_code, item.sort_order, item.label;
$$;

revoke all on function public.list_reference_catalog_items() from public, anon;
grant execute on function public.list_reference_catalog_items() to authenticated;
