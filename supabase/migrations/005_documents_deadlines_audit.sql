create table public.documents (
 id uuid primary key default gen_random_uuid(), title text not null, category text not null,
 status text not null default 'ACTIVE', document_date date, expiry_date date, notes text,
 sensitivity text not null default 'STANDARD', current_version_id uuid,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz
);
create table public.document_versions (
 id uuid primary key default gen_random_uuid(), document_id uuid not null references public.documents(id),
 version_number integer not null check(version_number>0), storage_bucket text not null, storage_path text not null,
 original_file_name text not null, mime_type text, size_bytes bigint, checksum text,
 malware_scan_status text not null default 'PENDING', upload_status text not null default 'RESERVED',
 reserved_by_user_id uuid references public.profiles(id), reserved_at timestamptz not null default now(),
 finalized_at timestamptz, uploaded_at timestamptz, unique(document_id,version_number), unique(storage_bucket,storage_path)
);
alter table public.documents add constraint documents_current_version_fk foreign key(current_version_id) references public.document_versions(id) deferrable initially deferred;

create table public.deadlines (
 id uuid primary key default gen_random_uuid(), title text not null, category text not null, due_at timestamptz not null,
 priority text not null, status text not null default 'TODO', responsible_user_id uuid references public.profiles(id),
 source_type text, source_id uuid, generator_key text unique, recurrence_rule text,
 parent_deadline_id uuid references public.deadlines(id), completed_at timestamptz, completed_by_user_id uuid references public.profiles(id), notes text
);
create table public.notification_rules (
 id uuid primary key default gen_random_uuid(), deadline_id uuid not null references public.deadlines(id),
 recipient_user_id uuid not null references public.profiles(id), channel text not null check(channel in ('PUSH','EMAIL')),
 offset_minutes integer not null, enabled boolean not null default true
);
create table public.notification_deliveries (
 id uuid primary key default gen_random_uuid(), notification_rule_id uuid not null references public.notification_rules(id),
 scheduled_at timestamptz not null, status text not null default 'SCHEDULED', attempt_count integer not null default 0,
 sent_at timestamptz, provider_message_ref text, last_error_code text
);
create index deadline_user_due_idx on public.deadlines(responsible_user_id,due_at,status);

create table public.audit_events (
 id uuid primary key default gen_random_uuid(), occurred_at timestamptz not null default now(), actor_user_id uuid references public.profiles(id),
 action text not null, entity_type text not null, entity_id uuid, outcome text not null,
 before_snapshot jsonb, after_snapshot jsonb, correlation_id uuid, metadata jsonb
);
create table public.security_events (
 id uuid primary key default gen_random_uuid(), occurred_at timestamptz not null default now(), user_id uuid references public.profiles(id),
 event_type text not null, severity text not null, outcome text not null, correlation_id uuid, details jsonb
);

create table public.idempotency_keys (
 id uuid primary key default gen_random_uuid(), user_id uuid, operation_name text not null, idempotency_key uuid not null,
 request_hash text not null, response_payload jsonb, status text not null, created_at timestamptz not null default now(), expires_at timestamptz,
 unique(user_id,operation_name,idempotency_key)
);
