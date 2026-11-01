-- Block access immediately when a profile is disabled or archived.
create or replace function security.can_access_owner(
    p_owner_id uuid,
    p_required_role text default 'VIEWER'
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, security
as $$
    select exists (
        select 1
        from public.profiles profile
        where profile.id = (select auth.uid())
          and profile.status = 'ACTIVE'
          and profile.archived_at is null
    )
    and exists (
        select 1
        from public.user_owner_accesses access
        where access.user_id = (select auth.uid())
          and access.owner_id = p_owner_id
          and access.status = 'ACTIVE'
          and current_date >= access.valid_from
          and (access.valid_to is null or current_date < access.valid_to)
          and security.role_rank(access.role)
              >= security.role_rank(p_required_role)
    );
$$;

create or replace function security.can_access_property(
    p_property_id uuid,
    p_required_role text default 'VIEWER'
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, security
as $$
    select exists (
        select 1
        from public.profiles profile
        where profile.id = (select auth.uid())
          and profile.status = 'ACTIVE'
          and profile.archived_at is null
    )
    and exists (
        select 1
        from public.user_owner_accesses access
        join public.property_ownerships ownership
          on ownership.owner_id = access.owner_id
        where access.user_id = (select auth.uid())
          and access.status = 'ACTIVE'
          and ownership.property_id = p_property_id
          and current_date >= access.valid_from
          and (access.valid_to is null or current_date < access.valid_to)
          and current_date >= ownership.valid_from
          and (ownership.valid_to is null or current_date < ownership.valid_to)
          and security.role_rank(access.role)
              >= security.role_rank(p_required_role)
    );
$$;
