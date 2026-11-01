create table public.tenant_property_accesses (
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    property_id uuid not null references public.properties(id) on delete restrict,
    created_at timestamptz not null default now(),
    primary key (tenant_id, property_id)
);

create index tenant_property_accesses_property_idx
    on public.tenant_property_accesses(property_id, tenant_id);

alter table public.tenant_property_accesses enable row level security;

create policy tenant_property_accesses_select
on public.tenant_property_accesses
for select to authenticated
using (security.can_access_property(property_id, 'VIEWER'));

create policy tenants_select
on public.tenants
for select to authenticated
using (
    exists (
        select 1
        from public.tenant_property_accesses tpa
        where tpa.tenant_id = tenants.id
          and security.can_access_property(tpa.property_id, 'VIEWER')
    )
    or exists (
        select 1
        from public.contract_tenants ct
        join public.contracts c on c.id = ct.contract_id
        where ct.tenant_id = tenants.id
          and security.can_access_property(c.property_id, 'VIEWER')
    )
);

create or replace function public.list_manageable_properties()
returns table (
    property_id uuid,
    internal_code text,
    property_name text,
    municipality text
)
language sql
stable
security definer
set search_path = pg_catalog, public, security
as $$
    select p.id, p.internal_code, p.name, p.municipality
    from public.properties p
    where p.status = 'ACTIVE'
      and p.archived_at is null
      and security.can_access_property(p.id, 'MANAGER')
      and exists (
          select 1 from public.profiles profile
          where profile.id = auth.uid()
            and profile.status = 'ACTIVE'
            and profile.archived_at is null
      )
    order by p.name, p.internal_code
$$;

create or replace function public.list_manageable_rentable_spaces(
    p_property_id uuid
)
returns table (
    space_id uuid,
    space_code text,
    space_name text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, security
as $$
begin
    if not exists (
        select 1 from public.profiles profile
        where profile.id = auth.uid()
          and profile.status = 'ACTIVE'
          and profile.archived_at is null
    ) then
        raise exception using errcode = 'P0001', message = 'ACCESS_DENIED';
    end if;
    if not security.can_access_property(p_property_id, 'MANAGER') then
        raise exception using errcode = 'P0001', message = 'ACCESS_DENIED';
    end if;

    return query
    select rs.id, rs.code, rs.name
    from public.rentable_spaces rs
    where rs.property_id = p_property_id
      and rs.management_status = 'ACTIVE'
      and rs.availability_override is distinct from 'UNAVAILABLE'
    order by rs.code;
end;
$$;

create or replace function public.list_manageable_tenants()
returns table (
    tenant_id uuid,
    property_id uuid,
    tenant_type text,
    first_name text,
    last_name text,
    business_name text,
    tax_code text,
    email text,
    phone text
)
language sql
stable
security definer
set search_path = pg_catalog, public, security
as $$
    select
        t.id,
        tpa.property_id,
        t.tenant_type,
        t.first_name,
        t.last_name,
        t.business_name,
        t.tax_code::text,
        t.email::text,
        t.phone
    from public.tenants t
    join public.tenant_property_accesses tpa on tpa.tenant_id = t.id
    where t.status = 'ACTIVE'
      and security.can_access_property(tpa.property_id, 'MANAGER')
      and exists (
          select 1 from public.profiles profile
          where profile.id = auth.uid()
            and profile.status = 'ACTIVE'
            and profile.archived_at is null
      )
    order by t.business_name nulls last, t.last_name nulls last;
$$;

create or replace function public.list_manageable_contracts()
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
    notes text
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
        c.notes
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
    order by c.start_date desc, c.internal_code;
$$;

create or replace function public.create_tenant_for_property(
    p_property_id uuid,
    p_tenant_type text,
    p_first_name text default null,
    p_last_name text default null,
    p_business_name text default null,
    p_tax_code text default null,
    p_email text default null,
    p_phone text default null,
    p_address_line1 text default null,
    p_postal_code text default null,
    p_municipality text default null,
    p_province text default null,
    p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, security
as $$
declare
    v_actor_id uuid := auth.uid();
    v_tenant_id uuid := gen_random_uuid();
    v_first_name text := nullif(btrim(p_first_name), '');
    v_last_name text := nullif(btrim(p_last_name), '');
    v_business_name text := nullif(btrim(p_business_name), '');
    v_email text := nullif(lower(btrim(p_email)), '');
    v_phone text := nullif(btrim(p_phone), '');
    v_tax_code text := nullif(upper(regexp_replace(btrim(p_tax_code), '\s+', '', 'g')), '');
begin
    if v_actor_id is null then
        raise exception using errcode = 'P0001', message = 'AUTHENTICATION_REQUIRED';
    end if;
    if not exists (
        select 1 from public.profiles p
        where p.id = v_actor_id and p.status = 'ACTIVE' and p.archived_at is null
    ) then
        raise exception using errcode = 'P0001', message = 'ACCESS_DENIED';
    end if;
    if not security.can_access_property(p_property_id, 'MANAGER') then
        raise exception using errcode = 'P0001', message = 'ACCESS_DENIED';
    end if;
    if p_tenant_type is null
       or p_tenant_type not in ('NATURAL_PERSON', 'LEGAL_ENTITY', 'SOLE_PROPRIETOR') then
        raise exception using errcode = 'P0001', message = 'INVALID_TENANT_TYPE';
    end if;
    if (p_tenant_type = 'NATURAL_PERSON' and (v_first_name is null or v_last_name is null))
       or (p_tenant_type in ('LEGAL_ENTITY', 'SOLE_PROPRIETOR') and v_business_name is null) then
        raise exception using errcode = 'P0001', message = 'REQUIRED_TENANT_FIELD_MISSING';
    end if;
    if v_email is not null and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
        raise exception using errcode = 'P0001', message = 'INVALID_TENANT_EMAIL';
    end if;
    if v_phone is not null and length(v_phone) > 50 then
        raise exception using errcode = 'P0001', message = 'INVALID_TENANT_PHONE';
    end if;
    if v_tax_code is not null and length(v_tax_code) > 32 then
        raise exception using errcode = 'P0001', message = 'INVALID_TENANT_TAX_CODE';
    end if;

    insert into public.tenants (
        id, tenant_type, first_name, last_name, business_name, tax_code,
        email, phone, address_line1, postal_code, municipality, province, status, notes
    )
    values (
        v_tenant_id,
        p_tenant_type,
        case when p_tenant_type = 'NATURAL_PERSON' then v_first_name end,
        case when p_tenant_type = 'NATURAL_PERSON' then v_last_name end,
        case when p_tenant_type <> 'NATURAL_PERSON' then v_business_name end,
        v_tax_code,
        v_email,
        v_phone,
        nullif(btrim(p_address_line1), ''),
        nullif(btrim(p_postal_code), ''),
        nullif(btrim(p_municipality), ''),
        nullif(upper(btrim(p_province)), ''),
        'ACTIVE',
        nullif(btrim(p_notes), '')
    );

    insert into public.tenant_property_accesses (tenant_id, property_id)
    values (v_tenant_id, p_property_id);

    insert into public.audit_events (
        actor_user_id, action, entity_type, entity_id, outcome, metadata
    )
    values (
        v_actor_id,
        'TENANT_CREATED',
        'TENANT',
        v_tenant_id,
        'SUCCESS',
        jsonb_build_object('property_id', p_property_id, 'tenant_type', p_tenant_type)
    );

    return jsonb_build_object('tenant_id', v_tenant_id);
end;
$$;

create or replace function public.create_contract_with_term(
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
    p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, security
as $$
declare
    v_actor_id uuid := auth.uid();
    v_contract_id uuid := gen_random_uuid();
    v_term_id uuid := gen_random_uuid();
    v_space_count integer;
    v_requested_space_count integer := coalesce(cardinality(p_rentable_space_ids), 0);
    v_object_type text;
    v_first_period date := coalesce(p_first_billing_period_start, p_start_date);
    v_property_status text;
begin
    if v_actor_id is null then
        raise exception using errcode = 'P0001', message = 'AUTHENTICATION_REQUIRED';
    end if;
    if not exists (
        select 1 from public.profiles p
        where p.id = v_actor_id and p.status = 'ACTIVE' and p.archived_at is null
    ) then
        raise exception using errcode = 'P0001', message = 'ACCESS_DENIED';
    end if;
    if not security.can_access_property(p_property_id, 'MANAGER') then
        raise exception using errcode = 'P0001', message = 'ACCESS_DENIED';
    end if;

    select p.status into v_property_status
    from public.properties p
    where p.id = p_property_id
    for update;
    if not found or v_property_status <> 'ACTIVE' then
        raise exception using errcode = 'P0001', message = 'PROPERTY_NOT_ACTIVE';
    end if;
    if nullif(btrim(p_internal_code), '') is null
       or length(btrim(p_internal_code)) > 100 then
        raise exception using errcode = 'P0001', message = 'INVALID_CONTRACT_CODE';
    end if;
    if p_contract_type is null or p_contract_type not in (
        'RESIDENTIAL_FREE', 'RESIDENTIAL_AGREED', 'TRANSITORY',
        'STUDENT', 'COMMERCIAL', 'COMMODATUM', 'OTHER'
    ) then
        raise exception using errcode = 'P0001', message = 'INVALID_CONTRACT_TYPE';
    end if;
    if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
        raise exception using errcode = 'P0001', message = 'INVALID_CONTRACT_DATES';
    end if;
    if p_base_rent_amount is null or p_base_rent_amount < 0
       or p_base_rent_amount > 999999999999.99 then
        raise exception using errcode = 'P0001', message = 'INVALID_BASE_RENT';
    end if;
    if p_security_deposit_amount is not null
       and (p_security_deposit_amount < 0 or p_security_deposit_amount > 999999999999.99) then
        raise exception using errcode = 'P0001', message = 'INVALID_SECURITY_DEPOSIT';
    end if;
    if p_billing_frequency is null
       or p_billing_frequency not in ('MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL') then
        raise exception using errcode = 'P0001', message = 'INVALID_BILLING_FREQUENCY';
    end if;
    if p_due_day is null or p_due_day < 1 or p_due_day > 31 then
        raise exception using errcode = 'P0001', message = 'INVALID_DUE_DAY';
    end if;
    if v_first_period is null or v_first_period < p_start_date or v_first_period > p_end_date then
        raise exception using errcode = 'P0001', message = 'INVALID_FIRST_BILLING_PERIOD';
    end if;
    if not exists (
        select 1 from public.tenants t
        join public.tenant_property_accesses tpa on tpa.tenant_id = t.id
        where t.id = p_tenant_id
          and t.status = 'ACTIVE'
          and tpa.property_id = p_property_id
    ) then
        raise exception using errcode = 'P0001', message = 'TENANT_NOT_ACCESSIBLE';
    end if;

    if v_requested_space_count <> (
        select count(distinct requested.id)
        from unnest(coalesce(p_rentable_space_ids, '{}')) requested(id)
    ) then
        raise exception using errcode = 'P0001', message = 'DUPLICATE_RENTABLE_SPACE';
    end if;
    select count(*) into v_space_count
    from public.rentable_spaces rs
    where rs.id = any(coalesce(p_rentable_space_ids, '{}'))
      and rs.property_id = p_property_id
      and rs.management_status = 'ACTIVE'
      and rs.availability_override is distinct from 'UNAVAILABLE';
    if v_space_count <> v_requested_space_count then
        raise exception using errcode = 'P0001', message = 'INVALID_RENTABLE_SPACE';
    end if;
    v_object_type := case when v_requested_space_count = 0
        then 'WHOLE_PROPERTY' else 'RENTABLE_SPACES' end;

    if exists (
        select 1
        from public.contracts existing
        where existing.property_id = p_property_id
          and existing.management_status = 'ACTIVE'
          and existing.start_date <= p_end_date
          and p_start_date <= existing.end_date
          and (
              existing.object_type = 'WHOLE_PROPERTY'
              or v_object_type = 'WHOLE_PROPERTY'
              or exists (
                  select 1
                  from public.contract_rentable_spaces crs
                  where crs.contract_id = existing.id
                    and crs.rentable_space_id = any(coalesce(p_rentable_space_ids, '{}'))
              )
          )
    ) then
        raise exception using errcode = 'P0001', message = 'CONTRACT_OBJECT_ALREADY_RENTED';
    end if;

    insert into public.contracts (
        id, internal_code, property_id, object_type, contract_type,
        management_status, lifecycle_status, start_date, end_date,
        security_deposit_amount, currency, notes
    )
    values (
        v_contract_id, btrim(p_internal_code), p_property_id, v_object_type, p_contract_type,
        'INACTIVE', 'DRAFT', p_start_date, p_end_date,
        p_security_deposit_amount, 'EUR', nullif(btrim(p_notes), '')
    );

    insert into public.contract_terms (
        id, contract_id, valid_from, valid_to, base_rent_amount,
        billing_frequency, billing_interval, first_billing_period_start, due_day
    )
    values (
        v_term_id, v_contract_id, p_start_date, p_end_date + 1, p_base_rent_amount,
        p_billing_frequency, null, v_first_period, p_due_day
    );

    insert into public.contract_tenants (
        contract_id, tenant_id, role, valid_from, status
    )
    values (v_contract_id, p_tenant_id, 'TENANT', p_start_date, 'ACTIVE');

    insert into public.contract_rentable_spaces (contract_id, rentable_space_id)
    select v_contract_id, requested.id
    from unnest(coalesce(p_rentable_space_ids, '{}')) requested(id);

    insert into public.audit_events (
        actor_user_id, action, entity_type, entity_id, outcome, metadata
    )
    values (
        v_actor_id,
        'CONTRACT_CREATED',
        'CONTRACT',
        v_contract_id,
        'SUCCESS',
        jsonb_build_object(
            'property_id', p_property_id,
            'tenant_id', p_tenant_id,
            'object_type', v_object_type,
            'management_status', 'INACTIVE'
        )
    );

    return jsonb_build_object(
        'contract_id', v_contract_id,
        'management_status', 'INACTIVE'
    );
end;
$$;

create or replace function public.set_contract_management_status(
    p_contract_id uuid,
    p_management_status text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, security
as $$
declare
    v_actor_id uuid := auth.uid();
    v_contract public.contracts%rowtype;
    v_lifecycle_status text;
begin
    if v_actor_id is null then
        raise exception using errcode = 'P0001', message = 'AUTHENTICATION_REQUIRED';
    end if;
    if p_management_status is null or p_management_status not in ('ACTIVE', 'INACTIVE') then
        raise exception using errcode = 'P0001', message = 'INVALID_CONTRACT_STATUS';
    end if;

    select c.* into v_contract
    from public.contracts c
    where c.id = p_contract_id
    for update;
    if not found or not security.can_access_property(v_contract.property_id, 'MANAGER') then
        raise exception using errcode = 'P0001', message = 'ACCESS_DENIED';
    end if;
    if not exists (
        select 1 from public.profiles p
        where p.id = v_actor_id and p.status = 'ACTIVE' and p.archived_at is null
    ) then
        raise exception using errcode = 'P0001', message = 'ACCESS_DENIED';
    end if;
    if p_management_status = 'ACTIVE' and v_contract.end_date < current_date then
        raise exception using errcode = 'P0001', message = 'CONTRACT_ALREADY_ENDED';
    end if;
    if p_management_status = 'ACTIVE' and exists (
        select 1
        from public.contracts existing
        where existing.id <> v_contract.id
          and existing.property_id = v_contract.property_id
          and existing.management_status = 'ACTIVE'
          and existing.start_date <= v_contract.end_date
          and v_contract.start_date <= existing.end_date
          and (
              existing.object_type = 'WHOLE_PROPERTY'
              or v_contract.object_type = 'WHOLE_PROPERTY'
              or exists (
                  select 1
                  from public.contract_rentable_spaces a
                  join public.contract_rentable_spaces b
                    on b.rentable_space_id = a.rentable_space_id
                  where a.contract_id = v_contract.id
                    and b.contract_id = existing.id
              )
          )
    ) then
        raise exception using errcode = 'P0001', message = 'CONTRACT_OBJECT_ALREADY_RENTED';
    end if;

    v_lifecycle_status := case
        when p_management_status = 'INACTIVE' then 'DRAFT'
        when v_contract.start_date > current_date then 'SCHEDULED'
        else 'IN_PROGRESS'
    end;

    update public.contracts
    set management_status = p_management_status,
        lifecycle_status = v_lifecycle_status,
        activated_at = case
            when p_management_status = 'ACTIVE' then coalesce(activated_at, now())
            else activated_at
        end,
        updated_at = now()
    where id = p_contract_id;

    insert into public.audit_events (
        actor_user_id, action, entity_type, entity_id, outcome,
        before_snapshot, after_snapshot
    )
    values (
        v_actor_id,
        'CONTRACT_STATUS_UPDATED',
        'CONTRACT',
        p_contract_id,
        'SUCCESS',
        jsonb_build_object('management_status', v_contract.management_status),
        jsonb_build_object('management_status', p_management_status)
    );

    return jsonb_build_object(
        'contract_id', p_contract_id,
        'management_status', p_management_status,
        'lifecycle_status', v_lifecycle_status
    );
end;
$$;

revoke all on function public.list_manageable_properties() from public, anon;
revoke all on function public.list_manageable_rentable_spaces(uuid) from public, anon;
revoke all on function public.list_manageable_tenants() from public, anon;
revoke all on function public.list_manageable_contracts() from public, anon;
revoke all on function public.create_tenant_for_property(
    uuid, text, text, text, text, text, text, text, text, text, text, text, text
) from public, anon;
revoke all on function public.create_contract_with_term(
    uuid, text, text, date, date, numeric, text, smallint, uuid, numeric, date, uuid[], text
) from public, anon;
revoke all on function public.set_contract_management_status(uuid, text) from public, anon;

grant execute on function public.list_manageable_properties() to authenticated;
grant execute on function public.list_manageable_rentable_spaces(uuid) to authenticated;
grant execute on function public.list_manageable_tenants() to authenticated;
grant execute on function public.list_manageable_contracts() to authenticated;
grant execute on function public.create_tenant_for_property(
    uuid, text, text, text, text, text, text, text, text, text, text, text, text
) to authenticated;
grant execute on function public.create_contract_with_term(
    uuid, text, text, date, date, numeric, text, smallint, uuid, numeric, date, uuid[], text
) to authenticated;
grant execute on function public.set_contract_management_status(uuid, text) to authenticated;
