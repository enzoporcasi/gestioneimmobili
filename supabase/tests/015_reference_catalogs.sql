\set ON_ERROR_STOP on

begin;

do $$
begin
    if not exists (
        select 1
        from public.reference_catalog_items
        where catalog_code = 'contract_type'
          and code = 'RESIDENTIAL_AGREED'
          and label = 'Abitativo concordato (3+2)'
          and is_active
    ) then
        raise exception 'CONTRACT_TYPE_CATALOG_MISSING';
    end if;

    if exists (
        select 1
        from public.reference_catalog_items
        where catalog_code = 'contract_type'
          and is_active
          and code not in (
              'RESIDENTIAL_FREE',
              'RESIDENTIAL_AGREED',
              'TRANSITORY',
              'COMMERCIAL'
          )
    ) then
        raise exception 'UNSUPPORTED_CONTRACT_TYPE_IS_ACTIVE';
    end if;

    if not exists (
        select 1
        from public.reference_catalog_items
        where catalog_code = 'upload_status'
          and code = 'PENDING_SCAN'
          and is_active
    ) then
        raise exception 'PENDING_SCAN_CATALOG_MISSING';
    end if;
end;
$$;

insert into public.properties (
    id, internal_code, name, property_type, status, municipality
)
values (
    'cd000000-0000-0000-0000-000000000001',
    'IMM-CATALOG-TEST',
    'Immobile test cataloghi',
    'APARTMENT',
    'ACTIVE',
    'Roma'
);

do $$
declare
    v_property_id uuid;
begin
    select p.property_type_catalog_item_id into v_property_id
    from public.properties p
    where p.id = 'cd000000-0000-0000-0000-000000000001';

    if v_property_id is distinct from (
        select item.id
        from public.reference_catalog_items item
        where item.catalog_code = 'property_type'
          and item.code = 'APARTMENT'
    ) then
        raise exception 'PROPERTY_TYPE_LOOKUP_NOT_LINKED';
    end if;

    begin
        update public.properties
        set property_type = 'INVALID_TYPE'
        where id = 'cd000000-0000-0000-0000-000000000001';
        raise exception 'UNKNOWN_PROPERTY_TYPE_WAS_ACCEPTED';
    exception
        when sqlstate '23503' then
            null;
    end;
end;
$$;

set local role authenticated;
select count(*) from public.list_reference_catalog_items();
reset role;

rollback;

select 'REFERENCE CATALOG TEST PASSED' as result;
