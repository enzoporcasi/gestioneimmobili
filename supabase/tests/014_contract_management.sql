-- Verifica perimetro Manager, flusso Locatario/Contratto e generazione rate solo attivi.
\set ON_ERROR_STOP on

begin;

insert into public.owners (
    id, owner_type, first_name, last_name, tax_code, status
)
values (
    'c6000000-0000-0000-0000-000000000006',
    'NATURAL_PERSON',
    'Owner',
    'Contract Test',
    'CONTRACTMANAGERTEST',
    'ACTIVE'
)
on conflict (id) do update
set first_name = excluded.first_name,
    last_name = excluded.last_name,
    tax_code = excluded.tax_code,
    status = excluded.status;

insert into public.properties (
    id, internal_code, name, property_type, status, municipality
)
values (
    'c7000000-0000-0000-0000-000000000007',
    'IMM-CONTRACT-TEST',
    'Immobile test contratti',
    'APARTMENT',
    'ACTIVE',
    'Roma'
)
on conflict (id) do update
set internal_code = excluded.internal_code,
    name = excluded.name,
    status = excluded.status,
    updated_at = now();

insert into public.property_ownerships (
    id, property_id, owner_id, ownership_percentage, valid_from
)
values (
    'c8000000-0000-0000-0000-000000000008',
    'c7000000-0000-0000-0000-000000000007',
    'c6000000-0000-0000-0000-000000000006',
    100,
    current_date
)
on conflict (id) do update
set property_id = excluded.property_id,
    owner_id = excluded.owner_id,
    ownership_percentage = excluded.ownership_percentage,
    valid_from = excluded.valid_from;

insert into public.user_owner_accesses (
    user_id, owner_id, role, valid_from, status
)
select
    '796c3053-6a28-4ff5-aa08-06129dcf942e',
    'c6000000-0000-0000-0000-000000000006',
    'MANAGER',
    current_date,
    'ACTIVE'
where not exists (
    select 1
    from public.user_owner_accesses
    where user_id = '796c3053-6a28-4ff5-aa08-06129dcf942e'
      and owner_id = 'c6000000-0000-0000-0000-000000000006'
      and status = 'ACTIVE'
);

select set_config(
    'request.jwt.claims',
    json_build_object(
        'sub', '796c3053-6a28-4ff5-aa08-06129dcf942e',
        'role', 'authenticated'
    )::text,
    true
);
set local role authenticated;

select property_id from public.list_manageable_properties()
where property_id = 'c7000000-0000-0000-0000-000000000007'
\gset

select (public.create_tenant_for_property(
    'c7000000-0000-0000-0000-000000000007',
    'NATURAL_PERSON',
    'Ada',
    'Locataria',
    p_email => ' ADA@example.test ',
    p_phone => ' 123456 '
) ->> 'tenant_id') as tenant_id
\gset

do $$
begin
    if not exists (
        select 1 from public.list_manageable_tenants()
        where tenant_id is not null
          and property_id = 'c7000000-0000-0000-0000-000000000007'
          and email = 'ada@example.test'
    ) then
        raise exception 'MANAGEABLE_TENANT_MISSING_OR_NOT_NORMALIZED';
    end if;
end;
$$;

select (public.create_legal_contract_with_term(
    'c7000000-0000-0000-0000-000000000007',
    'CTR-CONTRACT-TEST',
    'RESIDENTIAL_FREE',
    date '2027-01-01',
    date '2030-12-31',
    900::numeric,
    'MONTHLY',
    5::smallint,
    :'tenant_id'::uuid,
    1800::numeric,
    date '2027-01-01',
    '{}'::uuid[],
    'Contract workflow test',
    false,
    true,
    null
) ->> 'contract_id') as contract_id
\gset

do $$
begin
    if not exists (
        select 1 from public.list_manageable_contracts()
        where internal_code = 'CTR-CONTRACT-TEST'
          and management_status = 'INACTIVE'
          and object_type = 'WHOLE_PROPERTY'
          and tenant_name = 'Ada Locataria'
    ) then
        raise exception 'CONTRACT_CREATION_OR_LISTING_FAILED';
    end if;
end;
$$;

do $$
begin
    begin
        perform public.create_contract_with_term(
            'c7000000-0000-0000-0000-000000000007',
            'CTR-LEGACY-RPC',
            'RESIDENTIAL_FREE',
            date '2027-01-01',
            date '2030-12-31',
            900::numeric,
            'MONTHLY',
            5::smallint,
            (select id from public.tenants
             where first_name = 'Ada' and last_name = 'Locataria')
        );
        raise exception 'LEGACY_CONTRACT_RPC_REMAINS_CALLABLE';
    exception
        when insufficient_privilege then
            null;
    end;
end;
$$;

select public.create_legal_contract_with_term(
    'c7000000-0000-0000-0000-000000000007',
    'CTR-AGREED-TEST',
    'RESIDENTIAL_AGREED',
    date '2027-01-01',
    date '2029-12-31',
    900::numeric,
    'MONTHLY',
    5::smallint,
    :'tenant_id'::uuid,
    null,
    date '2027-01-01',
    '{}'::uuid[],
    null,
    true,
    false,
    null
);

select public.create_legal_contract_with_term(
    'c7000000-0000-0000-0000-000000000007',
    'CTR-TRANSITORY-TEST',
    'TRANSITORY',
    date '2027-01-01',
    date '2027-03-31',
    900::numeric,
    'MONTHLY',
    5::smallint,
    :'tenant_id'::uuid,
    null,
    date '2027-01-01',
    '{}'::uuid[],
    null,
    true,
    true,
    'Esigenza lavorativa temporanea documentata'
);

do $$
begin
    if not exists (
        select 1 from public.list_manageable_contracts()
        where internal_code = 'CTR-AGREED-TEST'
          and contract_type = 'RESIDENTIAL_AGREED'
          and agreed_rent_applied
          and tax_regime = 'ORDINARIO'
    ) then
        raise exception 'AGREED_RENT_OR_ORDINARY_TAX_REGIME_NOT_PERSISTED';
    end if;
    if not exists (
        select 1 from public.list_manageable_contracts()
        where internal_code = 'CTR-TRANSITORY-TEST'
          and agreed_rent_applied
          and tax_regime = 'CEDOLARE_SECCA'
          and transitory_reason = 'Esigenza lavorativa temporanea documentata'
    ) then
        raise exception 'TRANSITORY_LEGAL_OPTIONS_NOT_PERSISTED';
    end if;
    if not exists (
        select 1 from public.list_manageable_contracts()
        where internal_code = 'CTR-CONTRACT-TEST'
          and contract_type = 'RESIDENTIAL_FREE'
          and not agreed_rent_applied
          and tax_regime = 'CEDOLARE_SECCA'
    ) then
        raise exception 'CEDOLARE_OPTION_NOT_PERSISTED_FOR_FREE_RESIDENTIAL_CONTRACT';
    end if;
end;
$$;

do $$
begin
    begin
        perform public.create_legal_contract_with_term(
            'c7000000-0000-0000-0000-000000000007',
            'CTR-TRANSITORY-NO-REASON',
            'TRANSITORY',
            date '2027-01-01',
            date '2027-03-31',
            900::numeric,
            'MONTHLY',
            5::smallint,
            (select id from public.tenants
             where first_name = 'Ada' and last_name = 'Locataria'),
            null,
            date '2027-01-01',
            '{}'::uuid[],
            null,
            false,
            false,
            null
        );
        raise exception 'TRANSITORY_WITHOUT_REASON_WAS_ALLOWED';
    exception
        when sqlstate 'P0001' then
            if sqlerrm <> 'TRANSITORY_REASON_REQUIRED' then
                raise;
            end if;
    end;
end;
$$;

do $$
begin
    begin
        perform public.create_legal_contract_with_term(
            'c7000000-0000-0000-0000-000000000007',
            'CTR-INVALID-SHORT-TERM',
            'RESIDENTIAL_FREE',
            date '2027-01-01',
            date '2027-12-31',
            900::numeric,
            'MONTHLY',
            5::smallint,
            (select id from public.tenants
             where first_name = 'Ada' and last_name = 'Locataria'),
            null,
            date '2027-01-01',
            '{}'::uuid[],
            null,
            false,
            false,
            null
        );
        raise exception 'SHORT_4_PLUS_4_CONTRACT_WAS_ALLOWED';
    exception
        when sqlstate 'P0001' then
            if sqlerrm <> 'CONTRACT_DURATION_BELOW_LEGAL_MINIMUM' then
                raise;
            end if;
    end;

    begin
        perform public.create_legal_contract_with_term(
            'c7000000-0000-0000-0000-000000000007',
            'CTR-TRANSITORY-TOO-LONG',
            'TRANSITORY',
            date '2027-01-01',
            date '2028-07-01',
            900::numeric,
            'MONTHLY',
            5::smallint,
            (select id from public.tenants
             where first_name = 'Ada' and last_name = 'Locataria'),
            null,
            date '2027-01-01',
            '{}'::uuid[],
            null,
            false,
            false,
            'Esigenza lavorativa temporanea'
        );
        raise exception 'TRANSITORY_CONTRACT_OVER_18_MONTHS_WAS_ALLOWED';
    exception
        when sqlstate 'P0001' then
            if sqlerrm <> 'INVALID_TRANSITORY_DURATION' then
                raise;
            end if;
    end;
end;
$$;

reset role;
select public.generate_due_installments(date '2027-01-15');
do $$
begin
    if exists (
        select 1 from public.rent_installments
        where contract_id = (
            select id from public.contracts where internal_code = 'CTR-CONTRACT-TEST'
        )
    ) then
        raise exception 'INACTIVE_CONTRACT_GENERATED_INSTALLMENTS';
    end if;
end;
$$;

set local role authenticated;
select public.set_contract_management_status(:'contract_id'::uuid, 'ACTIVE');
reset role;
select public.generate_due_installments(date '2027-01-15');
do $$
begin
    if (
        select count(*) from public.rent_installments
        where contract_id = (
            select id from public.contracts where internal_code = 'CTR-CONTRACT-TEST'
        )
    ) <> 1 then
        raise exception 'ACTIVE_CONTRACT_INSTALLMENT_NOT_GENERATED';
    end if;
end;
$$;

set local role authenticated;
select public.set_contract_management_status(:'contract_id'::uuid, 'INACTIVE');
reset role;
do $$
begin
    if not exists (
        select 1 from public.list_manageable_contracts()
        where internal_code = 'CTR-CONTRACT-TEST'
          and management_status = 'INACTIVE'
          and lifecycle_status = 'SCHEDULED'
    ) then
        raise exception 'DEACTIVATION_CHANGED_CONTRACT_LIFECYCLE';
    end if;
end;
$$;
select public.generate_due_installments(date '2027-02-15');
do $$
begin
    if (
        select count(*) from public.rent_installments
        where contract_id = (
            select id from public.contracts where internal_code = 'CTR-CONTRACT-TEST'
        )
    ) <> 1 then
        raise exception 'INACTIVE_CONTRACT_GENERATED_ADDITIONAL_INSTALLMENTS';
    end if;
end;
$$;

set local role authenticated;
select public.set_contract_management_status(:'contract_id'::uuid, 'ACTIVE');
reset role;
select public.generate_due_installments(date '2027-02-15');
do $$
begin
    if (
        select count(*) from public.rent_installments
        where contract_id = (
            select id from public.contracts where internal_code = 'CTR-CONTRACT-TEST'
        )
    ) <> 2 then
        raise exception 'REACTIVATED_CONTRACT_DID_NOT_RESUME_INSTALLMENT_GENERATION';
    end if;
end;
$$;

insert into public.contracts (
    id, internal_code, property_id, object_type, contract_type,
    management_status, lifecycle_status, start_date, end_date
)
values (
    'c9000000-0000-0000-0000-000000000009',
    'CTR-CONTRACT-SECOND',
    'c7000000-0000-0000-0000-000000000007',
    'WHOLE_PROPERTY',
    'RESIDENTIAL_FREE',
    'INACTIVE',
    'DRAFT',
    date '2027-01-15',
    date '2027-02-15'
)
on conflict (id) do update
set management_status = 'INACTIVE',
    lifecycle_status = 'DRAFT',
    start_date = excluded.start_date,
    end_date = excluded.end_date;

insert into public.contract_terms (
    id, contract_id, valid_from, valid_to, base_rent_amount,
    billing_frequency, first_billing_period_start, due_day
)
values (
    'ca000000-0000-0000-0000-00000000000a',
    'c9000000-0000-0000-0000-000000000009',
    date '2027-01-15',
    date '2027-02-16',
    800::numeric,
    'MONTHLY',
    date '2027-01-15',
    5
)
on conflict (id) do update
set valid_from = excluded.valid_from,
    valid_to = excluded.valid_to,
    base_rent_amount = excluded.base_rent_amount,
    first_billing_period_start = excluded.first_billing_period_start,
    due_day = excluded.due_day;

insert into public.contract_tenants (
    id, contract_id, tenant_id, role, valid_from, status
)
values (
    'cb000000-0000-0000-0000-00000000000b',
    'c9000000-0000-0000-0000-000000000009',
    :'tenant_id'::uuid,
    'TENANT',
    date '2027-01-15',
    'ACTIVE'
)
on conflict (id) do update
set tenant_id = excluded.tenant_id,
    valid_from = excluded.valid_from,
    status = excluded.status;

set local role authenticated;
do $$
begin
    begin
        perform public.set_contract_management_status(
            'c9000000-0000-0000-0000-000000000009',
            'ACTIVE'
        );
        raise exception 'OVERLAPPING_CONTRACT_ACTIVATION_WAS_ALLOWED';
    exception
        when sqlstate 'P0001' then
            if sqlerrm <> 'CONTRACT_OBJECT_ALREADY_RENTED' then
                raise;
            end if;
    end;

    begin
        perform public.create_legal_contract_with_term(
            'c7000000-0000-0000-0000-000000000007',
            'CTR-CONTRACT-OVERLAP',
            'RESIDENTIAL_FREE',
            date '2027-01-15',
            date '2031-01-14',
            800::numeric,
            'MONTHLY',
            5::smallint,
            (select id from public.tenants
             where first_name = 'Ada' and last_name = 'Locataria'),
            null,
            date '2027-01-15',
            '{}'::uuid[],
            null,
            false,
            false,
            null
        );
        raise exception 'OVERLAPPING_ACTIVE_CONTRACT_WAS_ALLOWED';
    exception
        when sqlstate 'P0001' then
            if sqlerrm <> 'CONTRACT_OBJECT_ALREADY_RENTED' then
                raise;
            end if;
    end;
end;
$$;

select set_config(
    'request.jwt.claims',
    json_build_object(
        'sub', '4a30d9e0-04aa-42f0-93c6-977247230a9c',
        'role', 'authenticated'
    )::text,
    true
);

do $$
begin
    begin
        perform public.create_tenant_for_property(
            'c7000000-0000-0000-0000-000000000007',
            'NATURAL_PERSON',
            'Unauthorized',
            'Tenant'
        );
        raise exception 'UNAUTHORIZED_TENANT_CREATION_WAS_ALLOWED';
    exception
        when sqlstate 'P0001' then
            if sqlerrm <> 'ACCESS_DENIED' then
                raise;
            end if;
    end;
end;
$$;

reset role;
rollback;
