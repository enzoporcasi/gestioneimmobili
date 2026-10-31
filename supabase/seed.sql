-- ============================================================
-- GestioneImmobili - Seed locale Supabase
-- Crea due utenti Auth di test e i rispettivi profili applicativi.
-- Il file viene eseguito DOPO tutte le migration durante db reset.
-- SOLO ambiente locale/test. Non usare queste password in remoto.
-- ============================================================

-- UUID fissi per fixture e test automatici:
-- Utente A: 796c3053-6a28-4ff5-aa08-06129dcf942e
-- Utente B: 4a30d9e0-04aa-42f0-93c6-977247230a9c

-- ------------------------------------------------------------
-- 1. Utenti Supabase Auth
-- ------------------------------------------------------------

insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    invited_at,
    confirmation_token,
    confirmation_sent_at,
    recovery_token,
    recovery_sent_at,
    email_change_token_new,
    email_change,
    email_change_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    created_at,
    updated_at,
    phone,
    phone_confirmed_at,
    phone_change,
    phone_change_token,
    phone_change_sent_at,
    email_change_token_current,
    email_change_confirm_status,
    banned_until,
    reauthentication_token,
    reauthentication_sent_at,
    is_sso_user,
    deleted_at,
    is_anonymous
)
values
(
    '00000000-0000-0000-0000-000000000000',
    '796c3053-6a28-4ff5-aa08-06129dcf942e',
    'authenticated',
    'authenticated',
    'utente.a@test.local',
    crypt('TestUserA-2026!', gen_salt('bf')),
    now(),
    null,
    '',
    null,
    '',
    null,
    '',
    '',
    null,
    null,
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"first_name":"Utente","last_name":"A","display_name":"Utente A"}'::jsonb,
    false,
    now(),
    now(),
    null,
    null,
    '',
    '',
    null,
    '',
    0,
    null,
    '',
    null,
    false,
    null,
    false
),
(
    '00000000-0000-0000-0000-000000000000',
    '4a30d9e0-04aa-42f0-93c6-977247230a9c',
    'authenticated',
    'authenticated',
    'utente.b@test.local',
    crypt('TestUserB-2026!', gen_salt('bf')),
    now(),
    null,
    '',
    null,
    '',
    null,
    '',
    '',
    null,
    null,
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"first_name":"Utente","last_name":"B","display_name":"Utente B"}'::jsonb,
    false,
    now(),
    now(),
    null,
    null,
    '',
    '',
    null,
    '',
    0,
    null,
    '',
    null,
    false,
    null,
    false
)
on conflict (id) do update
set
    email = excluded.email,
    encrypted_password = excluded.encrypted_password,
    email_confirmed_at = excluded.email_confirmed_at,
    raw_app_meta_data = excluded.raw_app_meta_data,
    raw_user_meta_data = excluded.raw_user_meta_data,
    updated_at = now(),
    deleted_at = null,
    banned_until = null;

-- ------------------------------------------------------------
-- 2. Identità email Supabase Auth
-- ------------------------------------------------------------

insert into auth.identities (
    id,
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
)
values
(
    'a796c305-6a28-4ff5-aa08-06129dcf942e',
    '796c3053-6a28-4ff5-aa08-06129dcf942e',
    '796c3053-6a28-4ff5-aa08-06129dcf942e',
    jsonb_build_object(
        'sub', '796c3053-6a28-4ff5-aa08-06129dcf942e',
        'email', 'utente.a@test.local',
        'email_verified', true,
        'phone_verified', false
    ),
    'email',
    now(),
    now(),
    now()
),
(
    'b4a30d9e-04aa-42f0-93c6-977247230a9c',
    '4a30d9e0-04aa-42f0-93c6-977247230a9c',
    '4a30d9e0-04aa-42f0-93c6-977247230a9c',
    jsonb_build_object(
        'sub', '4a30d9e0-04aa-42f0-93c6-977247230a9c',
        'email', 'utente.b@test.local',
        'email_verified', true,
        'phone_verified', false
    ),
    'email',
    now(),
    now(),
    now()
)
on conflict (provider_id, provider) do update
set
    user_id = excluded.user_id,
    identity_data = excluded.identity_data,
    updated_at = now();

-- ------------------------------------------------------------
-- 3. Profili applicativi GestioneImmobili
-- ------------------------------------------------------------

insert into public.profiles (
    id,
    first_name,
    last_name,
    display_name,
    status,
    locale,
    time_zone,
    preferred_currency
)
values
(
    '796c3053-6a28-4ff5-aa08-06129dcf942e',
    'Utente',
    'A',
    'Utente A',
    'ACTIVE',
    'it-IT',
    'Europe/Rome',
    'EUR'
),
(
    '4a30d9e0-04aa-42f0-93c6-977247230a9c',
    'Utente',
    'B',
    'Utente B',
    'ACTIVE',
    'it-IT',
    'Europe/Rome',
    'EUR'
)
on conflict (id) do update
set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    display_name = excluded.display_name,
    status = excluded.status,
    locale = excluded.locale,
    time_zone = excluded.time_zone,
    preferred_currency = excluded.preferred_currency,
    updated_at = now();

-- ------------------------------------------------------------
-- 4. Proprietario demo per provare la gestione immobili dal web
-- ------------------------------------------------------------

insert into public.owners (
    id,
    owner_type,
    first_name,
    last_name,
    status,
    notes
)
values (
    'd3000000-0000-0000-0000-000000000003',
    'NATURAL_PERSON',
    'Proprietario',
    'Demo',
    'ACTIVE',
    'Fixture dimostrativa locale'
)
on conflict (id) do update
set owner_type = excluded.owner_type,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    status = excluded.status,
    notes = excluded.notes,
    updated_at = now();

insert into public.user_owner_accesses (
    user_id,
    owner_id,
    role,
    valid_from,
    status
)
select
    '796c3053-6a28-4ff5-aa08-06129dcf942e',
    'd3000000-0000-0000-0000-000000000003',
    'ADMINISTRATOR',
    current_date,
    'ACTIVE'
where not exists (
    select 1
    from public.user_owner_accesses
    where user_id = '796c3053-6a28-4ff5-aa08-06129dcf942e'
      and owner_id = 'd3000000-0000-0000-0000-000000000003'
      and status = 'ACTIVE'
      and current_date >= valid_from
      and (valid_to is null or current_date < valid_to)
);

-- ------------------------------------------------------------
-- 5. Verifica seed: deve fallire se non sono presenti 2 utenti
-- ------------------------------------------------------------

do $$
declare
    v_auth_users integer;
    v_identities integer;
    v_profiles integer;
begin
    select count(*)
      into v_auth_users
      from auth.users
     where id in (
        '796c3053-6a28-4ff5-aa08-06129dcf942e',
        '4a30d9e0-04aa-42f0-93c6-977247230a9c'
     );

    select count(*)
      into v_identities
      from auth.identities
     where user_id in (
        '796c3053-6a28-4ff5-aa08-06129dcf942e',
        '4a30d9e0-04aa-42f0-93c6-977247230a9c'
     )
       and provider = 'email';

    select count(*)
      into v_profiles
      from public.profiles
     where id in (
        '796c3053-6a28-4ff5-aa08-06129dcf942e',
        '4a30d9e0-04aa-42f0-93c6-977247230a9c'
     );

    if v_auth_users <> 2
       or v_identities <> 2
       or v_profiles <> 2 then
        raise exception
            'SEED_TEST_USERS_FAILED: auth=%, identities=%, profiles=%',
            v_auth_users,
            v_identities,
            v_profiles;
    end if;
end;
$$;
