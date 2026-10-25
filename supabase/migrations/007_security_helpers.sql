create or replace function security.role_rank(p_role text) returns smallint language sql immutable as $$
 select case p_role when 'VIEWER' then 10 when 'MANAGER' then 20 when 'ADMINISTRATOR' then 30 else 0 end::smallint
$$;

create or replace function security.can_access_owner(p_owner_id uuid,p_required_role text default 'VIEWER')
returns boolean language sql stable security definer set search_path=pg_catalog,public,security as $$
 select exists(select 1 from public.user_owner_accesses u
 where u.user_id=(select auth.uid()) and u.owner_id=p_owner_id and u.status='ACTIVE'
 and current_date>=u.valid_from and (u.valid_to is null or current_date<u.valid_to)
 and security.role_rank(u.role)>=security.role_rank(p_required_role))
$$;

create or replace function security.can_access_property(p_property_id uuid,p_required_role text default 'VIEWER')
returns boolean language sql stable security definer set search_path=pg_catalog,public,security as $$
 select exists(select 1 from public.user_owner_accesses u join public.property_ownerships po on po.owner_id=u.owner_id
 where u.user_id=(select auth.uid()) and u.status='ACTIVE' and po.property_id=p_property_id
 and current_date>=u.valid_from and (u.valid_to is null or current_date<u.valid_to)
 and current_date>=po.valid_from and (po.valid_to is null or current_date<po.valid_to)
 and security.role_rank(u.role)>=security.role_rank(p_required_role))
$$;

create or replace function security.can_access_contract(p_contract_id uuid,p_required_role text default 'VIEWER')
returns boolean language sql stable security definer set search_path=pg_catalog,public,security as $$
 select security.can_access_property(c.property_id,p_required_role) from public.contracts c where c.id=p_contract_id
$$;
create or replace function security.can_access_installment(p_id uuid,p_required_role text default 'VIEWER')
returns boolean language sql stable security definer set search_path=pg_catalog,public,security as $$
 select security.can_access_contract(r.contract_id,p_required_role) from public.rent_installments r where r.id=p_id
$$;
create or replace function security.can_access_expense(p_id uuid,p_required_role text default 'VIEWER')
returns boolean language sql stable security definer set search_path=pg_catalog,public,security as $$
 select security.can_access_property(e.property_id,p_required_role) from public.expenses e where e.id=p_id
$$;

revoke all on all functions in schema security from public,anon,authenticated;
grant usage on schema security to authenticated;
grant execute on function security.role_rank(text),security.can_access_owner(uuid,text),security.can_access_property(uuid,text),security.can_access_contract(uuid,text),security.can_access_installment(uuid,text),security.can_access_expense(uuid,text) to authenticated;
