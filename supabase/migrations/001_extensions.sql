create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists btree_gist;

create schema if not exists security;
revoke all on schema security from public, anon, authenticated;

grant usage on schema public to authenticated;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create or replace function public.calculate_due_date(p_period_start date, p_due_day smallint)
returns date language sql immutable strict as $$
  select case when p_due_day between 1 and 31 then
    date_trunc('month', p_period_start)::date
    + (least(p_due_day, extract(day from (date_trunc('month', p_period_start) + interval '1 month - 1 day'))::int) - 1)
  else null end
$$;
