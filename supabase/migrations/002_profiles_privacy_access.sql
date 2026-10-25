create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 first_name text not null, last_name text not null, display_name text,
 status text not null default 'ACTIVE' check(status in ('ACTIVE','BLOCKED','INACTIVE')),
 locale text not null default 'it-IT', time_zone text not null default 'Europe/Rome',
 preferred_currency char(3) not null default 'EUR' check(preferred_currency='EUR'),
 last_login_at timestamptz, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), archived_at timestamptz
);
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();

create table public.owners (
 id uuid primary key default gen_random_uuid(),
 owner_type text not null check(owner_type in ('NATURAL_PERSON','LEGAL_ENTITY')),
 first_name text, last_name text, business_name text, tax_code citext, vat_number citext,
 email citext, phone text, address_line1 text, address_line2 text, postal_code text,
 municipality text, province text, country_code char(2) not null default 'IT', iban text,
 linked_user_id uuid references public.profiles(id) on delete set null,
 status text not null default 'ACTIVE' check(status in ('ACTIVE','INACTIVE')),
 notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
 check((owner_type='NATURAL_PERSON' and first_name is not null and last_name is not null) or (owner_type='LEGAL_ENTITY' and business_name is not null))
);
create unique index owners_tax_code_uq on public.owners(lower(tax_code::text)) where tax_code is not null;
create unique index owners_vat_number_uq on public.owners(lower(vat_number::text)) where vat_number is not null;

create table public.invitations (
 id uuid primary key default gen_random_uuid(), inviter_user_id uuid not null references public.profiles(id),
 recipient_email citext not null, role text not null check(role in ('VIEWER','MANAGER','ADMINISTRATOR')),
 status text not null default 'SENT' check(status in ('SENT','ACCEPTED','EXPIRED','REVOKED')),
 token_hash text not null unique, expires_at timestamptz not null,
 accepted_by_user_id uuid references public.profiles(id), accepted_at timestamptz, revoked_at timestamptz,
 created_at timestamptz not null default now()
);

create table public.user_owner_accesses (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 owner_id uuid not null references public.owners(id) on delete restrict,
 role text not null check(role in ('VIEWER','MANAGER','ADMINISTRATOR')),
 valid_from date not null default current_date, valid_to date,
 status text not null default 'ACTIVE' check(status in ('ACTIVE','INACTIVE')),
 source_invitation_id uuid references public.invitations(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(valid_to is null or valid_to > valid_from)
);
create index uoa_rls_idx on public.user_owner_accesses(user_id,status,owner_id,valid_from,valid_to);

create table public.invitation_owners (
 invitation_id uuid not null references public.invitations(id) on delete cascade,
 owner_id uuid not null references public.owners(id) on delete cascade,
 primary key(invitation_id,owner_id)
);

create table public.legal_documents (
 id uuid primary key default gen_random_uuid(), type text not null, title text not null,
 mandatory boolean not null default true, status text not null default 'ACTIVE' check(status in ('ACTIVE','INACTIVE'))
);
create table public.legal_document_versions (
 id uuid primary key default gen_random_uuid(), legal_document_id uuid not null references public.legal_documents(id),
 version_code text not null, content_path text not null, effective_from date not null,
 requires_reacceptance boolean not null default false, published_at timestamptz not null default now(), retired_at timestamptz,
 unique(legal_document_id,version_code)
);
create table public.legal_acceptances (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 legal_document_version_id uuid not null references public.legal_document_versions(id),
 action text not null check(action in ('ACCEPTED','WITHDRAWN')), occurred_at timestamptz not null default now(),
 source text not null, evidence jsonb, unique(user_id,legal_document_version_id,action)
);
create table public.data_subject_requests (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 type text not null check(type in ('ACCESS','EXPORT','RECTIFICATION','DELETION','RESTRICTION')),
 status text not null default 'OPEN' check(status in ('OPEN','IN_PROGRESS','COMPLETED','REJECTED','CANCELLED')),
 requested_at timestamptz not null default now(), completed_at timestamptz, notes text
);
