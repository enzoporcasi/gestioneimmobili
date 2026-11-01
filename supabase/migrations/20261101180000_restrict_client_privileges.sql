-- Remove broad grants inherited from the Supabase default ACLs. RLS does not
-- protect tables from TRUNCATE, and direct writes must go through audited RPCs.
revoke all on all tables in schema public from public, anon;
revoke insert, update, delete, truncate, references, trigger
    on all tables in schema public
    from public, anon, authenticated;
grant update (first_name, last_name, display_name, locale, time_zone)
    on public.profiles to authenticated;

revoke all on all sequences in schema public
    from public, anon, authenticated;

-- These helpers are safe for signed-in callers, but are not anonymous APIs.
revoke execute on function public.calculate_due_date(date, smallint)
    from public, anon;
revoke execute on function public.set_updated_at()
    from public, anon;
grant execute on function public.calculate_due_date(date, smallint)
    to authenticated;
grant execute on function public.set_updated_at()
    to authenticated;

-- Application migrations run as postgres. New public objects receive no
-- client privileges until a migration grants them.
alter default privileges for role postgres in schema public
    revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public
    revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public
    revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres
    revoke execute on functions from public;
