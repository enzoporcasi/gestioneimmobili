-- Verifica RPC immobili, autorizzazioni e quote proprietarie.
-- Tutte le fixture vengono annullate alla fine.

\set ON_ERROR_STOP on

begin;

insert into public.owners (
    id, owner_type, first_name, last_name, tax_code, status
)
values
(
    'c3000000-0000-0000-0000-000000000003',
    'NATURAL_PERSON', 'Proprietario', 'Test A', 'PROPERTYRPCA', 'ACTIVE'
),
(
    'c4000000-0000-0000-0000-000000000004',
    'NATURAL_PERSON', 'Proprietario', 'Test B', 'PROPERTYRPCB', 'ACTIVE'
)
on conflict (id) do update
set first_name = excluded.first_name,
    last_name = excluded.last_name,
    tax_code = excluded.tax_code,
    status = excluded.status,
    updated_at = now();

insert into public.user_owner_accesses (
    user_id, owner_id, role, valid_from, status
)
select
    '796c3053-6a28-4ff5-aa08-06129dcf942e',
    'c3000000-0000-0000-0000-000000000003',
    'ADMINISTRATOR',
    current_date,
    'ACTIVE'
where not exists (
    select 1
    from public.user_owner_accesses
    where user_id = '796c3053-6a28-4ff5-aa08-06129dcf942e'
      and owner_id = 'c3000000-0000-0000-0000-000000000003'
);

insert into public.user_owner_accesses (
    user_id, owner_id, role, valid_from, status
)
select
    '4a30d9e0-04aa-42f0-93c6-977247230a9c',
    'c4000000-0000-0000-0000-000000000004',
    'ADMINISTRATOR',
    current_date,
    'ACTIVE'
where not exists (
    select 1
    from public.user_owner_accesses
    where user_id = '4a30d9e0-04aa-42f0-93c6-977247230a9c'
      and owner_id = 'c4000000-0000-0000-0000-000000000004'
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

do $$
declare
    v_property_id uuid;
    v_visible_owner_count integer;
    v_ownership_count integer;
begin
    if has_table_privilege('authenticated', 'public.properties', 'INSERT')
       or has_table_privilege('authenticated', 'public.properties', 'UPDATE')
       or has_table_privilege('authenticated', 'public.property_ownerships', 'INSERT')
       or has_table_privilege('authenticated', 'public.property_ownerships', 'UPDATE') then
        raise exception 'PROPERTY_RPC_DIRECT_WRITE_GRANT_PRESENT';
    end if;

    if has_function_privilege(
        'anon',
        'public.create_property_with_ownership(text,text,text,text,jsonb,text,text,text,text,text,numeric,text,jsonb)',
        'EXECUTE'
    ) then
        raise exception 'PROPERTY_RPC_ANON_EXECUTE_GRANTED';
    end if;

    if not exists (
        select 1
        from public.list_manageable_owners()
        where owner_id = 'c3000000-0000-0000-0000-000000000003'
    ) then
        raise exception 'PROPERTY_RPC_MANAGER_OWNER_NOT_LISTED';
    end if;

    if exists (
        select 1
        from public.list_manageable_owners()
        where owner_id = 'c4000000-0000-0000-0000-000000000004'
    ) then
        raise exception 'PROPERTY_RPC_OUT_OF_SCOPE_OWNER_LISTED';
    end if;

    select count(*)
    into v_visible_owner_count
    from public.list_manageable_owners();

    if v_visible_owner_count < 2 then
        raise exception 'PROPERTY_RPC_SEEDED_DEMO_OWNER_NOT_LISTED';
    end if;

    v_property_id := (public.create_property_with_ownership(
        'PROPERTY-RPC-TEST',
        'Immobile RPC test',
        'APARTMENT',
        'Roma',
        jsonb_build_array(jsonb_build_object(
            'owner_id', 'c3000000-0000-0000-0000-000000000003',
            'ownership_percentage', 100
        )),
        'Via di prova 1',
        null,
        '00100',
        'RM',
        'IT',
        85.5,
        'Fixture transazionale',
        jsonb_build_object('sheet', '3', 'parcel', '24')
    ) ->> 'property_id')::uuid;

    if not exists (
        select 1
        from public.properties
        where id = v_property_id
          and internal_code = 'PROPERTY-RPC-TEST'
          and municipality = 'Roma'
          and cadastral_data ->> 'sheet' = '3'
    ) then
        raise exception 'PROPERTY_RPC_CREATE_FAILED';
    end if;

    select count(*)
    into v_ownership_count
    from public.property_ownerships
    where property_id = v_property_id
      and owner_id = 'c3000000-0000-0000-0000-000000000003'
      and ownership_percentage = 100;

    if v_ownership_count <> 1 then
        raise exception 'PROPERTY_RPC_OWNERSHIP_CREATE_FAILED';
    end if;

    perform public.update_property_details(
        v_property_id,
        'PROPERTY-RPC-TEST-UPDATED',
        'Immobile RPC aggiornato',
        'APARTMENT',
        'INACTIVE',
        'Milano',
        'Via aggiornata 2',
        null,
        '20100',
        'MI',
        'IT',
        90,
        'Note aggiornate',
        jsonb_build_object('sheet', '4', 'parcel', '25')
    );

    if not exists (
        select 1
        from public.properties
        where id = v_property_id
          and internal_code = 'PROPERTY-RPC-TEST-UPDATED'
          and name = 'Immobile RPC aggiornato'
          and status = 'INACTIVE'
          and municipality = 'Milano'
          and surface_sqm = 90
          and cadastral_data ->> 'parcel' = '25'
    ) then
        raise exception 'PROPERTY_RPC_UPDATE_FAILED';
    end if;

    begin
        perform public.create_property_with_ownership(
            'PROPERTY-RPC-BAD-SUM',
            'Quote non valide',
            'APARTMENT',
            'Roma',
            jsonb_build_array(jsonb_build_object(
                'owner_id', 'c3000000-0000-0000-0000-000000000003',
                'ownership_percentage', 90
            ))
        );
        raise exception 'PROPERTY_RPC_ACCEPTED_INVALID_OWNERSHIP_SUM';
    exception
        when sqlstate 'P0001' then
            if sqlerrm <> 'OWNERSHIP_PERCENTAGE_MUST_TOTAL_100' then
                raise;
            end if;
    end;

    begin
        perform public.create_property_with_ownership(
            'PROPERTY-RPC-BAD-CADASTRAL',
            'Catastali non validi',
            'APARTMENT',
            'Roma',
            jsonb_build_array(jsonb_build_object(
                'owner_id', 'c3000000-0000-0000-0000-000000000003',
                'ownership_percentage', 100
            )),
            p_cadastral_data => '[]'::jsonb
        );
        raise exception 'PROPERTY_RPC_ACCEPTED_INVALID_CADASTRAL_DATA';
    exception
        when sqlstate 'P0001' then
            if sqlerrm <> 'INVALID_CADASTRAL_DATA' then
                raise;
            end if;
    end;

    begin
        perform public.create_property_with_ownership(
            'PROPERTY-RPC-OUT-OF-SCOPE',
            'Proprietario non autorizzato',
            'APARTMENT',
            'Roma',
            jsonb_build_array(jsonb_build_object(
                'owner_id', 'c4000000-0000-0000-0000-000000000004',
                'ownership_percentage', 100
            ))
        );
        raise exception 'PROPERTY_RPC_ACCEPTED_OUT_OF_SCOPE_OWNER';
    exception
        when sqlstate 'P0001' then
            if sqlerrm <> 'ACCESS_DENIED' then
                raise;
            end if;
    end;

    if exists (
        select 1
        from public.properties
        where internal_code in (
            'PROPERTY-RPC-BAD-SUM',
            'PROPERTY-RPC-OUT-OF-SCOPE'
        )
    ) then
        raise exception 'PROPERTY_RPC_FAILED_CREATE_LEFT_PARTIAL_DATA';
    end if;

    begin
        perform public.create_property_with_ownership(
            'PROPERTY-RPC-BAD-SURFACE',
            'Superficie non valida',
            'APARTMENT',
            'Roma',
            jsonb_build_array(jsonb_build_object(
                'owner_id', 'c3000000-0000-0000-0000-000000000003',
                'ownership_percentage', 100
            )),
            p_surface_sqm => 0
        );
        raise exception 'PROPERTY_RPC_ACCEPTED_INVALID_SURFACE';
    exception
        when sqlstate 'P0001' then
            if sqlerrm <> 'INVALID_PROPERTY_SURFACE' then
                raise;
            end if;
    end;

    begin
        perform public.create_property_with_ownership(
            'PROPERTY-RPC-OVERSIZED-SURFACE',
            'Superficie fuori limite',
            'APARTMENT',
            'Roma',
            jsonb_build_array(jsonb_build_object(
                'owner_id', 'c3000000-0000-0000-0000-000000000003',
                'ownership_percentage', 100
            )),
            p_surface_sqm => 100000000
        );
        raise exception 'PROPERTY_RPC_ACCEPTED_OVERSIZED_SURFACE';
    exception
        when sqlstate 'P0001' then
            if sqlerrm <> 'INVALID_PROPERTY_SURFACE' then
                raise;
            end if;
    end;

    begin
        perform public.create_property_with_ownership(
            'PROPERTY-RPC-EXCESS-PRECISION',
            'Precisione quota non valida',
            'APARTMENT',
            'Roma',
            jsonb_build_array(
                jsonb_build_object(
                    'owner_id', 'c3000000-0000-0000-0000-000000000003',
                    'ownership_percentage', 33.33334
                ),
                jsonb_build_object(
                    'owner_id', 'd3000000-0000-0000-0000-000000000003',
                    'ownership_percentage', 66.66666
                )
            )
        );
        raise exception 'PROPERTY_RPC_ACCEPTED_EXCESS_OWNERSHIP_PRECISION';
    exception
        when sqlstate 'P0001' then
            if sqlerrm <> 'INVALID_OWNERSHIP_ALLOCATION' then
                raise;
            end if;
    end;

    begin
        perform public.update_property_details(
            'c5000000-0000-0000-0000-000000000005',
            'PROPERTY-RPC-UNAUTHORIZED',
            'Immobile fuori perimetro',
            'APARTMENT',
            'ACTIVE',
            'Roma'
        );
        raise exception 'PROPERTY_RPC_ACCEPTED_UNAUTHORIZED_UPDATE';
    exception
        when sqlstate 'P0001' then
            if sqlerrm <> 'ACCESS_DENIED' then
                raise;
            end if;
    end;
end;
$$;

reset role;

update public.user_owner_accesses
set role = 'VIEWER'
where user_id = '796c3053-6a28-4ff5-aa08-06129dcf942e'
  and owner_id = 'c3000000-0000-0000-0000-000000000003';

select set_config(
    'request.jwt.claims',
    json_build_object(
        'sub', '796c3053-6a28-4ff5-aa08-06129dcf942e',
        'role', 'authenticated'
    )::text,
    true
);
set local role authenticated;

do $$
begin
    if exists (
        select 1
        from public.list_manageable_owners()
        where owner_id = 'c3000000-0000-0000-0000-000000000003'
    ) then
        raise exception 'PROPERTY_RPC_VIEWER_OWNER_LISTED';
    end if;

    begin
        perform public.update_property_details(
            (select id from public.properties where internal_code = 'PROPERTY-RPC-TEST-UPDATED'),
            'PROPERTY-RPC-VIEWER-UPDATE',
            'Viewer update',
            'APARTMENT',
            'ACTIVE',
            'Roma'
        );
        raise exception 'PROPERTY_RPC_VIEWER_UPDATED_PROPERTY';
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

\echo 'PROPERTY MANAGEMENT RPC TEST PASSED'
