insert into public.profiles (
    id,
    first_name,
    last_name,
    display_name,
    status
)
select
    u.id,
    case
        when lower(u.email) = lower('utente.a@test.local')
            then 'Utente'
        when lower(u.email) = lower('utente.b@test.local')
            then 'Utente'
    end,
    case
        when lower(u.email) = lower('utente.a@test.local')
            then 'A'
        when lower(u.email) = lower('utente.b@test.local')
            then 'B'
    end,
    case
        when lower(u.email) = lower('utente.a@test.local')
            then 'Utente A'
        when lower(u.email) = lower('utente.b@test.local')
            then 'Utente B'
    end,
    'ACTIVE'
from auth.users u
where lower(u.email) in (
    lower('utente.a@test.local'),
    lower('utente.b@test.local')
)
on conflict (id) do update
set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    display_name = excluded.display_name,
    status = excluded.status,
    updated_at = now()
returning
    id,
    display_name,
    status;