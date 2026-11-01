create or replace function public.update_owner_contact_details(
    p_owner_id uuid,
    p_email text default null,
    p_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, security
as $$
declare
    v_actor_id uuid := auth.uid();
    v_email text := nullif(lower(btrim(p_email)), '');
    v_phone text := nullif(btrim(p_phone), '');
    v_before jsonb;
    v_saved_email text;
    v_saved_phone text;
begin
    if v_actor_id is null then
        raise exception using
            errcode = 'P0001',
            message = 'AUTHENTICATION_REQUIRED';
    end if;

    if not exists (
        select 1
        from public.profiles p
        where p.id = v_actor_id
          and p.status = 'ACTIVE'
          and p.archived_at is null
    ) then
        raise exception using
            errcode = 'P0001',
            message = 'ACCESS_DENIED';
    end if;

    if not security.can_access_owner(p_owner_id, 'MANAGER') then
        raise exception using
            errcode = 'P0001',
            message = 'ACCESS_DENIED';
    end if;

    if v_email is not null
       and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
        raise exception using
            errcode = 'P0001',
            message = 'INVALID_OWNER_EMAIL';
    end if;

    if v_phone is not null and length(v_phone) > 50 then
        raise exception using
            errcode = 'P0001',
            message = 'INVALID_OWNER_PHONE';
    end if;

    select jsonb_build_object(
        'email', o.email::text,
        'phone', o.phone
    )
    into v_before
    from public.owners o
    where o.id = p_owner_id;

    if not found then
        raise exception using
            errcode = 'P0001',
            message = 'OWNER_NOT_FOUND';
    end if;

    update public.owners
    set email = v_email,
        phone = v_phone,
        updated_at = now()
    where id = p_owner_id
    returning email::text, phone
    into v_saved_email, v_saved_phone;

    insert into public.audit_events (
        actor_user_id,
        action,
        entity_type,
        entity_id,
        outcome,
        before_snapshot,
        after_snapshot
    )
    values (
        v_actor_id,
        'OWNER_CONTACT_UPDATED',
        'OWNER',
        p_owner_id,
        'SUCCESS',
        v_before,
        jsonb_build_object('email', v_saved_email, 'phone', v_saved_phone)
    );

    return jsonb_build_object(
        'owner_id', p_owner_id,
        'email', v_saved_email,
        'phone', v_saved_phone
    );
end;
$$;

revoke all on function public.update_owner_contact_details(uuid, text, text)
from public, anon;

grant execute on function public.update_owner_contact_details(uuid, text, text)
to authenticated;
