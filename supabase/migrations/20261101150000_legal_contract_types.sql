alter table public.contracts
    add column agreed_rent_applied boolean not null default false,
    add column transitory_reason text;

update public.contracts
set agreed_rent_applied = true
where contract_type = 'RESIDENTIAL_AGREED';

drop function public.list_manageable_contracts();

create function public.list_manageable_contracts()
returns table (
    contract_id uuid,
    internal_code text,
    property_id uuid,
    property_name text,
    object_type text,
    contract_type text,
    management_status text,
    lifecycle_status text,
    start_date date,
    end_date date,
    security_deposit_amount numeric,
    base_rent_amount numeric,
    billing_frequency text,
    due_day smallint,
    tenant_id uuid,
    tenant_name text,
    tenant_email text,
    tenant_phone text,
    rentable_space_names text,
    notes text,
    agreed_rent_applied boolean,
    tax_regime text,
    transitory_reason text
)
language sql
stable
security definer
set search_path = pg_catalog, public, security
as $$
    select
        c.id,
        c.internal_code,
        c.property_id,
        p.name,
        c.object_type,
        c.contract_type,
        c.management_status,
        c.lifecycle_status,
        c.start_date,
        c.end_date,
        c.security_deposit_amount,
        ct.base_rent_amount,
        ct.billing_frequency,
        ct.due_day,
        t.id,
        coalesce(
            nullif(btrim(t.business_name), ''),
            nullif(concat_ws(' ', nullif(btrim(t.first_name), ''), nullif(btrim(t.last_name), '')), ''),
            'Locatario'
        ),
        t.email::text,
        t.phone,
        coalesce(spaces.names, ''),
        c.notes,
        c.agreed_rent_applied,
        c.tax_regime,
        c.transitory_reason
    from public.contracts c
    join public.properties p on p.id = c.property_id
    join public.contract_terms ct on ct.contract_id = c.id
    join public.contract_tenants link on link.contract_id = c.id
      and link.role = 'TENANT'
    join public.tenants t on t.id = link.tenant_id
    left join lateral (
        select string_agg(rs.name, ', ' order by rs.code) as names
        from public.contract_rentable_spaces crs
        join public.rentable_spaces rs on rs.id = crs.rentable_space_id
        where crs.contract_id = c.id
    ) spaces on true
    where security.can_access_property(c.property_id, 'MANAGER')
      and exists (
          select 1 from public.profiles profile
          where profile.id = auth.uid()
            and profile.status = 'ACTIVE'
            and profile.archived_at is null
      )
    order by c.created_at desc, c.internal_code;
$$;

create or replace function public.create_legal_contract_with_term(
    p_property_id uuid,
    p_internal_code text,
    p_contract_type text,
    p_start_date date,
    p_end_date date,
    p_base_rent_amount numeric,
    p_billing_frequency text,
    p_due_day smallint,
    p_tenant_id uuid,
    p_security_deposit_amount numeric default null,
    p_first_billing_period_start date default null,
    p_rentable_space_ids uuid[] default '{}',
    p_notes text default null,
    p_agreed_rent_applied boolean default false,
    p_cedolare_secca boolean default false,
    p_transitory_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, security
as $$
declare
    v_actor_id uuid := auth.uid();
    v_created_contract jsonb;
    v_contract_id uuid;
begin
    if v_actor_id is null
       or not exists (
           select 1 from public.profiles profile
           where profile.id = v_actor_id
             and profile.status = 'ACTIVE'
             and profile.archived_at is null
       )
       or not security.can_access_property(p_property_id, 'MANAGER') then
        raise exception using errcode = 'P0001', message = 'ACCESS_DENIED';
    end if;

    if p_start_date is null or p_end_date is null then
        raise exception using errcode = 'P0001', message = 'INVALID_CONTRACT_DATES';
    end if;

    if p_contract_type not in (
        'RESIDENTIAL_FREE',
        'RESIDENTIAL_AGREED',
        'TRANSITORY',
        'COMMERCIAL'
    ) then
        raise exception using errcode = 'P0001', message = 'INVALID_LEGAL_CONTRACT_TYPE';
    end if;

    if p_contract_type = 'RESIDENTIAL_FREE'
       and p_end_date + 1 < (p_start_date + interval '4 years')::date then
        raise exception using errcode = 'P0001', message = 'CONTRACT_DURATION_BELOW_LEGAL_MINIMUM';
    elsif p_contract_type = 'RESIDENTIAL_AGREED'
       and p_end_date + 1 < (p_start_date + interval '3 years')::date then
        raise exception using errcode = 'P0001', message = 'CONTRACT_DURATION_BELOW_LEGAL_MINIMUM';
    elsif p_contract_type = 'COMMERCIAL'
       and p_end_date + 1 < (p_start_date + interval '6 years')::date then
        raise exception using errcode = 'P0001', message = 'CONTRACT_DURATION_BELOW_LEGAL_MINIMUM';
    elsif p_contract_type = 'TRANSITORY' then
        if p_end_date + 1 < (p_start_date + interval '1 month')::date
           or p_end_date >= (p_start_date + interval '18 months')::date then
            raise exception using errcode = 'P0001', message = 'INVALID_TRANSITORY_DURATION';
        end if;
        if nullif(btrim(p_transitory_reason), '') is null then
            raise exception using errcode = 'P0001', message = 'TRANSITORY_REASON_REQUIRED';
        end if;
        if length(btrim(p_transitory_reason)) > 4000 then
            raise exception using errcode = 'P0001', message = 'TRANSITORY_REASON_TOO_LONG';
        end if;
    end if;

    if p_contract_type = 'RESIDENTIAL_AGREED'
       and p_agreed_rent_applied is distinct from true then
        raise exception using errcode = 'P0001', message = 'AGREED_RENT_REQUIRED';
    end if;
    if p_agreed_rent_applied is true
       and p_contract_type not in ('RESIDENTIAL_AGREED', 'TRANSITORY') then
        raise exception using errcode = 'P0001', message = 'AGREED_RENT_NOT_APPLICABLE';
    end if;
    if p_cedolare_secca is true
       and p_contract_type not in ('RESIDENTIAL_FREE', 'RESIDENTIAL_AGREED', 'TRANSITORY') then
        raise exception using errcode = 'P0001', message = 'CEDOLARE_NOT_APPLICABLE';
    end if;

    v_created_contract := public.create_contract_with_term(
        p_property_id,
        p_internal_code,
        p_contract_type,
        p_start_date,
        p_end_date,
        p_base_rent_amount,
        p_billing_frequency,
        p_due_day,
        p_tenant_id,
        p_security_deposit_amount,
        p_first_billing_period_start,
        p_rentable_space_ids,
        p_notes
    );
    v_contract_id := (v_created_contract ->> 'contract_id')::uuid;

    update public.contracts
    set agreed_rent_applied = p_agreed_rent_applied,
        tax_regime = case when p_cedolare_secca then 'CEDOLARE_SECCA' else 'ORDINARIO' end,
        transitory_reason = case
            when p_contract_type = 'TRANSITORY' then btrim(p_transitory_reason)
            else null
        end
    where id = v_contract_id;

    return v_created_contract || jsonb_build_object(
        'agreed_rent_applied', p_agreed_rent_applied,
        'tax_regime', case when p_cedolare_secca then 'CEDOLARE_SECCA' else 'ORDINARIO' end
    );
end;
$$;

revoke all on function public.list_manageable_contracts() from public, anon;
revoke all on function public.create_contract_with_term(
    uuid, text, text, date, date, numeric, text, smallint, uuid, numeric, date, uuid[], text
) from authenticated;
revoke all on function public.create_legal_contract_with_term(
    uuid, text, text, date, date, numeric, text, smallint, uuid, numeric, date, uuid[], text, boolean, boolean, text
) from public, anon;

grant execute on function public.list_manageable_contracts() to authenticated;
grant execute on function public.create_legal_contract_with_term(
    uuid, text, text, date, date, numeric, text, smallint, uuid, numeric, date, uuid[], text, boolean, boolean, text
) to authenticated;
