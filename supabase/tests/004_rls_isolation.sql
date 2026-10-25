-- GestioneImmobili - Test automatico isolamento RLS
-- Prerequisiti:
--   1. Supabase locale avviato e migration applicate.
--   2. Utenti Auth esistenti:
--      utente.a@test.local
--      utente.b@test.local
--
-- Il test crea fixture temporanee dentro una transazione e termina con ROLLBACK.
-- Nessun dato di test rimane nel database.

\set ON_ERROR_STOP on

begin;

-- ============================================================
-- 1. Recupero e verifica utenti Auth
-- ============================================================

do $$
declare
    v_count integer;
begin
    select count(*)
      into v_count
      from auth.users
     where lower(trim(email)) in (
         'utente.a@test.local',
         'utente.b@test.local'
     );

    if v_count <> 2 then
        raise exception
            'RLS_TEST_USERS_MISSING: attesi 2 utenti Auth, trovati %',
            v_count;
    end if;
end;
$$;

-- Profili applicativi, idempotenti nella transazione di test.
insert into public.profiles (
    id,
    first_name,
    last_name,
    display_name,
    status
)
select
    u.id,
    'Utente',
    case lower(trim(u.email))
        when 'utente.a@test.local' then 'A'
        when 'utente.b@test.local' then 'B'
    end,
    case lower(trim(u.email))
        when 'utente.a@test.local' then 'Utente A'
        when 'utente.b@test.local' then 'Utente B'
    end,
    'ACTIVE'
from auth.users u
where lower(trim(u.email)) in (
    'utente.a@test.local',
    'utente.b@test.local'
)
on conflict (id) do update
set first_name = excluded.first_name,
    last_name = excluded.last_name,
    display_name = excluded.display_name,
    status = excluded.status,
    updated_at = now();

-- ============================================================
-- 2. Fixture isolate A/B
-- ============================================================

insert into public.owners (
    id, owner_type, first_name, last_name, tax_code, status
)
values
(
    'a1000000-0000-0000-0000-000000000001',
    'NATURAL_PERSON', 'Proprietario', 'A', 'RLSAUTOTESTA', 'ACTIVE'
),
(
    'b2000000-0000-0000-0000-000000000002',
    'NATURAL_PERSON', 'Proprietario', 'B', 'RLSAUTOTESTB', 'ACTIVE'
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
    u.id,
    case lower(trim(u.email))
        when 'utente.a@test.local'
            then 'a1000000-0000-0000-0000-000000000001'::uuid
        when 'utente.b@test.local'
            then 'b2000000-0000-0000-0000-000000000002'::uuid
    end,
    'ADMINISTRATOR',
    current_date,
    'ACTIVE'
from auth.users u
where lower(trim(u.email)) in (
    'utente.a@test.local',
    'utente.b@test.local'
)
and not exists (
    select 1
      from public.user_owner_accesses uoa
     where uoa.user_id = u.id
       and uoa.owner_id = case lower(trim(u.email))
           when 'utente.a@test.local'
               then 'a1000000-0000-0000-0000-000000000001'::uuid
           when 'utente.b@test.local'
               then 'b2000000-0000-0000-0000-000000000002'::uuid
       end
);

insert into public.properties (
    id, internal_code, name, property_type, status, municipality
)
values
(
    'a1100000-0000-0000-0000-000000000001',
    'IMM-RLS-A', 'Immobile RLS A', 'APARTMENT', 'ACTIVE', 'Roma'
),
(
    'b2200000-0000-0000-0000-000000000002',
    'IMM-RLS-B', 'Immobile RLS B', 'APARTMENT', 'ACTIVE', 'Roma'
)
on conflict (id) do update
set internal_code = excluded.internal_code,
    name = excluded.name,
    property_type = excluded.property_type,
    status = excluded.status,
    municipality = excluded.municipality,
    updated_at = now();

insert into public.property_ownerships (
    id, property_id, owner_id, ownership_percentage, valid_from
)
values
(
    'a1200000-0000-0000-0000-000000000001',
    'a1100000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    100, current_date
),
(
    'b2300000-0000-0000-0000-000000000002',
    'b2200000-0000-0000-0000-000000000002',
    'b2000000-0000-0000-0000-000000000002',
    100, current_date
)
on conflict (id) do update
set ownership_percentage = excluded.ownership_percentage,
    valid_from = excluded.valid_from,
    valid_to = null;

insert into public.rentable_spaces (
    id, property_id, code, name, space_type, management_status
)
values
(
    'a1300000-0000-0000-0000-000000000001',
    'a1100000-0000-0000-0000-000000000001',
    'STANZA-RLS-A', 'Stanza RLS A', 'ROOM', 'ACTIVE'
),
(
    'b2400000-0000-0000-0000-000000000002',
    'b2200000-0000-0000-0000-000000000002',
    'STANZA-RLS-B', 'Stanza RLS B', 'ROOM', 'ACTIVE'
)
on conflict (id) do update
set code = excluded.code,
    name = excluded.name,
    management_status = excluded.management_status,
    updated_at = now();

-- ============================================================
-- 3. Test Utente A
-- ============================================================

select set_config(
    'request.jwt.claims',
    json_build_object(
        'sub', (
            select id::text
              from auth.users
             where lower(trim(email)) = 'utente.a@test.local'
        ),
        'role', 'authenticated'
    )::text,
    true
);

set local role authenticated;

do $$
declare
    v_visible_properties integer;
    v_visible_spaces integer;
    v_code text;
begin
    if auth.uid() is null then
        raise exception 'RLS_TEST_A_AUTH_UID_NULL';
    end if;

    if not security.can_access_property(
        'a1100000-0000-0000-0000-000000000001',
        'VIEWER'
    ) then
        raise exception 'RLS_TEST_A_CANNOT_ACCESS_PROPERTY_A';
    end if;

    if security.can_access_property(
        'b2200000-0000-0000-0000-000000000002',
        'VIEWER'
    ) then
        raise exception 'RLS_TEST_A_CAN_ACCESS_PROPERTY_B';
    end if;

    select count(*), min(internal_code)
      into v_visible_properties, v_code
      from public.properties
     where internal_code in ('IMM-RLS-A', 'IMM-RLS-B');

    if v_visible_properties <> 1 or v_code <> 'IMM-RLS-A' then
        raise exception
            'RLS_TEST_A_PROPERTIES_FAILED: count=%, code=%',
            v_visible_properties, v_code;
    end if;

    select count(*)
      into v_visible_spaces
      from public.rentable_spaces
     where code in ('STANZA-RLS-A', 'STANZA-RLS-B');

    if v_visible_spaces <> 1 then
        raise exception
            'RLS_TEST_A_SPACES_FAILED: count=%',
            v_visible_spaces;
    end if;
end;
$$;

reset role;

-- ============================================================
-- 4. Test Utente B
-- ============================================================

select set_config(
    'request.jwt.claims',
    json_build_object(
        'sub', (
            select id::text
              from auth.users
             where lower(trim(email)) = 'utente.b@test.local'
        ),
        'role', 'authenticated'
    )::text,
    true
);

set local role authenticated;

do $$
declare
    v_visible_properties integer;
    v_visible_spaces integer;
    v_code text;
begin
    if auth.uid() is null then
        raise exception 'RLS_TEST_B_AUTH_UID_NULL';
    end if;

    if security.can_access_property(
        'a1100000-0000-0000-0000-000000000001',
        'VIEWER'
    ) then
        raise exception 'RLS_TEST_B_CAN_ACCESS_PROPERTY_A';
    end if;

    if not security.can_access_property(
        'b2200000-0000-0000-0000-000000000002',
        'VIEWER'
    ) then
        raise exception 'RLS_TEST_B_CANNOT_ACCESS_PROPERTY_B';
    end if;

    select count(*), min(internal_code)
      into v_visible_properties, v_code
      from public.properties
     where internal_code in ('IMM-RLS-A', 'IMM-RLS-B');

    if v_visible_properties <> 1 or v_code <> 'IMM-RLS-B' then
        raise exception
            'RLS_TEST_B_PROPERTIES_FAILED: count=%, code=%',
            v_visible_properties, v_code;
    end if;

    select count(*)
      into v_visible_spaces
      from public.rentable_spaces
     where code in ('STANZA-RLS-A', 'STANZA-RLS-B');

    if v_visible_spaces <> 1 then
        raise exception
            'RLS_TEST_B_SPACES_FAILED: count=%',
            v_visible_spaces;
    end if;
end;
$$;

reset role;

-- ============================================================
-- 5. Test ruolo Viewer
-- ============================================================

update public.user_owner_accesses
   set role = 'VIEWER'
 where owner_id = 'a1000000-0000-0000-0000-000000000001';

select set_config(
    'request.jwt.claims',
    json_build_object(
        'sub', (
            select id::text
              from auth.users
             where lower(trim(email)) = 'utente.a@test.local'
        ),
        'role', 'authenticated'
    )::text,
    true
);

set local role authenticated;

do $$
begin
    if not security.can_access_property(
        'a1100000-0000-0000-0000-000000000001',
        'VIEWER'
    ) then
        raise exception 'RLS_TEST_VIEWER_CANNOT_READ';
    end if;

    if security.can_access_property(
        'a1100000-0000-0000-0000-000000000001',
        'MANAGER'
    ) then
        raise exception 'RLS_TEST_VIEWER_HAS_MANAGER_ACCESS';
    end if;
end;
$$;

reset role;

-- Tutte le fixture e le modifiche vengono annullate.
rollback;

\echo 'RLS ISOLATION TEST PASSED'
