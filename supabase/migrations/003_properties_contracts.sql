create table public.properties (
 id uuid primary key default gen_random_uuid(), internal_code text not null unique, name text not null,
 property_type text not null, status text not null default 'ACTIVE' check(status in ('ACTIVE','INACTIVE')),
 address_line1 text, address_line2 text, postal_code text, municipality text not null, province text,
 country_code char(2) not null default 'IT', cadastral_data jsonb, surface_sqm numeric(10,2) check(surface_sqm is null or surface_sqm>0),
 notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz
);
create table public.property_ownerships (
 id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id) on delete restrict,
 owner_id uuid not null references public.owners(id) on delete restrict,
 ownership_percentage numeric(7,4) not null check(ownership_percentage>0 and ownership_percentage<=100),
 valid_from date not null, valid_to date, notes text, created_at timestamptz not null default now(),
 check(valid_to is null or valid_to>valid_from)
);
create index po_owner_property_idx on public.property_ownerships(owner_id,property_id,valid_from,valid_to);
create index po_property_owner_idx on public.property_ownerships(property_id,owner_id,valid_from,valid_to);

create table public.rentable_spaces (
 id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id) on delete restrict,
 code text not null, name text not null, space_type text not null,
 management_status text not null default 'ACTIVE' check(management_status in ('ACTIVE','INACTIVE')),
 availability_override text check(availability_override is null or availability_override='UNAVAILABLE'),
 surface_sqm numeric(10,2), description text, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(property_id,code)
);

create table public.tenants (
 id uuid primary key default gen_random_uuid(), tenant_type text not null,
 first_name text, last_name text, business_name text, tax_code citext, vat_number citext,
 email citext, phone text, address_line1 text, postal_code text, municipality text, province text,
 status text not null default 'ACTIVE' check(status in ('ACTIVE','INACTIVE')), notes text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.contracts (
 id uuid primary key default gen_random_uuid(), internal_code text not null unique,
 property_id uuid not null references public.properties(id) on delete restrict,
 object_type text not null check(object_type in ('WHOLE_PROPERTY','RENTABLE_SPACES')),
 contract_type text not null, management_status text not null default 'INACTIVE' check(management_status in ('ACTIVE','INACTIVE')),
 lifecycle_status text not null default 'DRAFT', start_date date not null, end_date date not null,
 security_deposit_amount numeric(14,2) check(security_deposit_amount is null or security_deposit_amount>=0),
 currency char(3) not null default 'EUR' check(currency='EUR'), tax_regime text, registration_number text,
 notice_period_days integer, activated_at timestamptz, ended_at timestamptz,
 previous_contract_id uuid references public.contracts(id), notes text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(end_date>=start_date)
);
create index contracts_property_idx on public.contracts(property_id,management_status,start_date,end_date);

create table public.contract_rentable_spaces (
 contract_id uuid not null references public.contracts(id) on delete cascade,
 rentable_space_id uuid not null references public.rentable_spaces(id) on delete restrict,
 primary key(contract_id,rentable_space_id)
);
create index crs_space_idx on public.contract_rentable_spaces(rentable_space_id,contract_id);

create table public.contract_tenants (
 id uuid primary key default gen_random_uuid(), contract_id uuid not null references public.contracts(id) on delete cascade,
 tenant_id uuid not null references public.tenants(id) on delete restrict,
 role text not null check(role in ('TENANT','CO_TENANT')), valid_from date not null, valid_to date,
 status text not null default 'ACTIVE' check(status in ('ACTIVE','INACTIVE')), notes text,
 check(valid_to is null or valid_to>valid_from)
);
create index ct_contract_period_idx on public.contract_tenants(contract_id,valid_from,valid_to);

create table public.contract_terms (
 id uuid primary key default gen_random_uuid(), contract_id uuid not null references public.contracts(id) on delete cascade,
 valid_from date not null, valid_to date, base_rent_amount numeric(14,2) not null check(base_rent_amount>=0),
 billing_frequency text not null check(billing_frequency in ('MONTHLY','BIMONTHLY','QUARTERLY','SEMIANNUAL','ANNUAL','CUSTOM')),
 billing_interval integer, first_billing_period_start date not null, due_day smallint check(due_day between 1 and 31), notes text,
 check(valid_to is null or valid_to>valid_from),
 check((billing_frequency='CUSTOM' and billing_interval>0) or (billing_frequency<>'CUSTOM' and billing_interval is null))
);
create index contract_terms_period_idx on public.contract_terms(contract_id,valid_from,valid_to,first_billing_period_start);

create table public.contract_changes (
 id uuid primary key default gen_random_uuid(), contract_id uuid not null references public.contracts(id),
 change_type text not null, effective_date date not null, previous_values jsonb, new_values jsonb, reason text,
 resulting_contract_id uuid references public.contracts(id), created_at timestamptz not null default now()
);
