create or replace function public.create_profile_for_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_first_name text := nullif(btrim(new.raw_user_meta_data ->> 'first_name'), '');
    v_last_name text := nullif(btrim(new.raw_user_meta_data ->> 'last_name'), '');
begin
    if v_first_name is null or v_last_name is null then
        raise exception 'PROFILE_NAME_REQUIRED';
    end if;

    insert into public.profiles (id, first_name, last_name, display_name)
    values (
        new.id,
        v_first_name,
        v_last_name,
        nullif(btrim(new.raw_user_meta_data ->> 'display_name'), '')
    );

    return new;
end;
$$;

revoke all on function public.create_profile_for_new_auth_user() from public, anon, authenticated;

create trigger create_profile_after_auth_signup
    after insert on auth.users
    for each row execute function public.create_profile_for_new_auth_user();
