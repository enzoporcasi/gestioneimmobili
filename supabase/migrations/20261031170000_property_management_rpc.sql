create or replace function public.list_manageable_owners()
returns table (
    owner_id uuid,
    owner_name text,
    owner_type text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, security
as $$
begin
    if auth.uid() is null then
        raise exception using
            errcode = 'P0001',
            message = 'AUTHENTICATION_REQUIRED';
    end if;

    return query
    select
        o.id,
        coalesce(
            nullif(btrim(o.business_name), ''),
            nullif(concat_ws(' ', nullif(btrim(o.first_name), ''), nullif(btrim(o.last_name), '')), ''),
            'Proprietario'
        ),
        o.owner_type
    from public.owners o
    where o.status = 'ACTIVE'
      and o.archived_at is null
      and security.can_access_owner(o.id, 'MANAGER')
    order by 2;
end;
$$;

create or replace function public.create_property_with_ownership(
    p_internal_code text,
    p_name text,
    p_property_type text,
    p_municipality text,
    p_ownerships jsonb,
    p_address_line1 text default null,
    p_address_line2 text default null,
    p_postal_code text default null,
    p_province text default null,
    p_country_code text default 'IT',
    p_surface_sqm numeric default null,
    p_notes text default null,
    p_cadastral_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, security
as $$
declare
    v_property_id uuid := gen_random_uuid();
    v_ownership_count integer;
    v_distinct_owner_count integer;
    v_ownership_total numeric;
    v_allocation record;
begin
    if auth.uid() is null then
        raise exception using
            errcode = 'P0001',
            message = 'AUTHENTICATION_REQUIRED';
    end if;

    if nullif(btrim(p_internal_code), '') is null
       or nullif(btrim(p_name), '') is null
       or nullif(btrim(p_property_type), '') is null
       or nullif(btrim(p_municipality), '') is null then
        raise exception using
            errcode = 'P0001',
            message = 'REQUIRED_PROPERTY_FIELD_MISSING';
    end if;

    if p_country_code is null
       or btrim(p_country_code) !~ '^[A-Za-z]{2}$' then
        raise exception using
            errcode = 'P0001',
            message = 'INVALID_COUNTRY_CODE';
    end if;

    if p_surface_sqm is not null
       and (p_surface_sqm <= 0 or p_surface_sqm > 99999999.99) then
        raise exception using
            errcode = 'P0001',
            message = 'INVALID_PROPERTY_SURFACE';
    end if;

    if p_cadastral_data is not null
       and jsonb_typeof(p_cadastral_data) <> 'object' then
        raise exception using
            errcode = 'P0001',
            message = 'INVALID_CADASTRAL_DATA';
    end if;

    if p_ownerships is null or jsonb_typeof(p_ownerships) <> 'array' then
        raise exception using
            errcode = 'P0001',
            message = 'OWNERSHIP_ALLOCATIONS_REQUIRED';
    end if;

    if jsonb_array_length(p_ownerships) = 0 then
        raise exception using
            errcode = 'P0001',
            message = 'OWNERSHIP_ALLOCATIONS_REQUIRED';
    end if;

    if exists (
        select 1
        from jsonb_array_elements(p_ownerships) as allocation(value)
        where jsonb_typeof(allocation.value) <> 'object'
           or jsonb_typeof(allocation.value -> 'owner_id') <> 'string'
           or (allocation.value ->> 'owner_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           or jsonb_typeof(allocation.value -> 'ownership_percentage') <> 'number'
    ) then
        raise exception using
            errcode = 'P0001',
            message = 'INVALID_OWNERSHIP_ALLOCATION';
    end if;

    select
        count(*),
        count(distinct allocation.owner_id),
        sum(allocation.ownership_percentage)
    into
        v_ownership_count,
        v_distinct_owner_count,
        v_ownership_total
    from jsonb_to_recordset(p_ownerships) as allocation(
        owner_id uuid,
        ownership_percentage numeric
    );

    if v_ownership_count = 0
       or v_distinct_owner_count <> v_ownership_count
       or exists (
           select 1
           from jsonb_to_recordset(p_ownerships) as allocation(
               owner_id uuid,
               ownership_percentage numeric
           )
           where allocation.owner_id is null
              or allocation.ownership_percentage is null
              or allocation.ownership_percentage <= 0
              or allocation.ownership_percentage > 100
              or allocation.ownership_percentage <> round(allocation.ownership_percentage, 4)
       ) then
        raise exception using
            errcode = 'P0001',
            message = 'INVALID_OWNERSHIP_ALLOCATION';
    end if;

    if v_ownership_total <> 100 then
        raise exception using
            errcode = 'P0001',
            message = 'OWNERSHIP_PERCENTAGE_MUST_TOTAL_100';
    end if;

    for v_allocation in
        select allocation.owner_id, allocation.ownership_percentage
        from jsonb_to_recordset(p_ownerships) as allocation(
            owner_id uuid,
            ownership_percentage numeric
        )
    loop
        if not exists (
            select 1
            from public.owners o
            where o.id = v_allocation.owner_id
              and o.status = 'ACTIVE'
              and o.archived_at is null
              and security.can_access_owner(o.id, 'MANAGER')
        ) then
            raise exception using
                errcode = 'P0001',
                message = 'ACCESS_DENIED';
        end if;
    end loop;

    insert into public.properties (
        id,
        internal_code,
        name,
        property_type,
        status,
        address_line1,
        address_line2,
        postal_code,
        municipality,
        province,
        country_code,
        surface_sqm,
        notes,
        cadastral_data
    )
    values (
        v_property_id,
        btrim(p_internal_code),
        btrim(p_name),
        btrim(p_property_type),
        'ACTIVE',
        nullif(btrim(p_address_line1), ''),
        nullif(btrim(p_address_line2), ''),
        nullif(btrim(p_postal_code), ''),
        btrim(p_municipality),
        nullif(btrim(p_province), ''),
        upper(btrim(p_country_code)),
        p_surface_sqm,
        nullif(btrim(p_notes), ''),
        nullif(p_cadastral_data, '{}'::jsonb)
    );

    insert into public.property_ownerships (
        property_id,
        owner_id,
        ownership_percentage,
        valid_from
    )
    select
        v_property_id,
        allocation.owner_id,
        allocation.ownership_percentage,
        current_date
    from jsonb_to_recordset(p_ownerships) as allocation(
        owner_id uuid,
        ownership_percentage numeric
    );

    insert into public.audit_events (
        actor_user_id,
        action,
        entity_type,
        entity_id,
        outcome,
        metadata
    )
    values (
        auth.uid(),
        'PROPERTY_CREATED',
        'PROPERTY',
        v_property_id,
        'SUCCESS',
        jsonb_build_object('internal_code', btrim(p_internal_code))
    );

    return jsonb_build_object('property_id', v_property_id);
end;
$$;

create or replace function public.update_property_details(
    p_property_id uuid,
    p_internal_code text,
    p_name text,
    p_property_type text,
    p_status text,
    p_municipality text,
    p_address_line1 text default null,
    p_address_line2 text default null,
    p_postal_code text default null,
    p_province text default null,
    p_country_code text default 'IT',
    p_surface_sqm numeric default null,
    p_notes text default null,
    p_cadastral_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, security
as $$
declare
    v_property public.properties%rowtype;
begin
    if auth.uid() is null then
        raise exception using
            errcode = 'P0001',
            message = 'AUTHENTICATION_REQUIRED';
    end if;

    if not security.can_access_property(p_property_id, 'MANAGER') then
        raise exception using
            errcode = 'P0001',
            message = 'ACCESS_DENIED';
    end if;

    if nullif(btrim(p_internal_code), '') is null
       or nullif(btrim(p_name), '') is null
       or nullif(btrim(p_property_type), '') is null
       or nullif(btrim(p_municipality), '') is null then
        raise exception using
            errcode = 'P0001',
            message = 'REQUIRED_PROPERTY_FIELD_MISSING';
    end if;

    if p_status is null or p_status not in ('ACTIVE', 'INACTIVE') then
        raise exception using
            errcode = 'P0001',
            message = 'INVALID_PROPERTY_STATUS';
    end if;

    if p_country_code is null
       or btrim(p_country_code) !~ '^[A-Za-z]{2}$' then
        raise exception using
            errcode = 'P0001',
            message = 'INVALID_COUNTRY_CODE';
    end if;

    if p_surface_sqm is not null
       and (p_surface_sqm <= 0 or p_surface_sqm > 99999999.99) then
        raise exception using
            errcode = 'P0001',
            message = 'INVALID_PROPERTY_SURFACE';
    end if;

    if p_cadastral_data is not null
       and jsonb_typeof(p_cadastral_data) <> 'object' then
        raise exception using
            errcode = 'P0001',
            message = 'INVALID_CADASTRAL_DATA';
    end if;

    select *
    into v_property
    from public.properties p
    where p.id = p_property_id
    for update;

    if not found then
        raise exception using
            errcode = 'P0001',
            message = 'PROPERTY_NOT_FOUND';
    end if;

    update public.properties
    set internal_code = btrim(p_internal_code),
        name = btrim(p_name),
        property_type = btrim(p_property_type),
        status = p_status,
        address_line1 = nullif(btrim(p_address_line1), ''),
        address_line2 = nullif(btrim(p_address_line2), ''),
        postal_code = nullif(btrim(p_postal_code), ''),
        municipality = btrim(p_municipality),
        province = nullif(btrim(p_province), ''),
        country_code = upper(btrim(p_country_code)),
        surface_sqm = p_surface_sqm,
        notes = nullif(btrim(p_notes), ''),
        cadastral_data = nullif(p_cadastral_data, '{}'::jsonb),
        updated_at = now()
    where id = p_property_id;

    insert into public.audit_events (
        actor_user_id,
        action,
        entity_type,
        entity_id,
        outcome,
        metadata
    )
    values (
        auth.uid(),
        'PROPERTY_UPDATED',
        'PROPERTY',
        p_property_id,
        'SUCCESS',
        jsonb_build_object(
            'internal_code', btrim(p_internal_code),
            'previous_internal_code', v_property.internal_code
        )
    );

    return jsonb_build_object('property_id', p_property_id);
end;
$$;

revoke all on function public.list_manageable_owners()
from public, anon;
revoke all on function public.create_property_with_ownership(
    text, text, text, text, jsonb, text, text, text, text, text, numeric, text, jsonb
)
from public, anon;
revoke all on function public.update_property_details(
    uuid, text, text, text, text, text, text, text, text, text, text, numeric, text, jsonb
)
from public, anon;

grant execute on function public.list_manageable_owners()
to authenticated;
grant execute on function public.create_property_with_ownership(
    text, text, text, text, jsonb, text, text, text, text, text, numeric, text, jsonb
)
to authenticated;
grant execute on function public.update_property_details(
    uuid, text, text, text, text, text, text, text, text, text, text, numeric, text, jsonb
)
to authenticated;
