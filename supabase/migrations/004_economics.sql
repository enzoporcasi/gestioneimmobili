create table public.rent_installments (
 id uuid primary key default gen_random_uuid(), contract_id uuid not null references public.contracts(id) on delete restrict,
 contract_term_id uuid not null references public.contract_terms(id) on delete restrict,
 sequence_number integer not null, period_start date not null, period_end date not null, due_date date not null,
 currency char(3) not null default 'EUR' check(currency='EUR'), amount_due numeric(14,2) not null check(amount_due>=0),
 amount_lost numeric(14,2) not null default 0 check(amount_lost>=0 and amount_lost<=amount_due),
 status text not null default 'CREATED' check(status in ('CREATED','PAID','LOST','NOT_DUE','CANCELLED')),
 generated_at timestamptz not null default now(), closed_at timestamptz, lost_reason text,
 unique(contract_id,sequence_number), unique(contract_id,period_start,period_end), check(period_end>=period_start)
);
create index installment_due_idx on public.rent_installments(due_date,status);

create table public.rent_installment_components (
 id uuid primary key default gen_random_uuid(), rent_installment_id uuid not null references public.rent_installments(id) on delete cascade,
 component_type text not null, amount numeric(14,2) not null check(amount>=0), description text
);
create table public.receipts (
 id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id),
 payer_tenant_id uuid references public.tenants(id), payer_name text, payment_date date not null,
 amount numeric(14,2) not null check(amount>0), currency char(3) not null default 'EUR' check(currency='EUR'),
 payment_method text, status text not null default 'RECORDED' check(status in ('RECORDED','REVERSED')),
 notes text, reversed_at timestamptz, created_at timestamptz not null default now()
);
create table public.receipt_allocations (
 id uuid primary key default gen_random_uuid(), receipt_id uuid not null references public.receipts(id) on delete restrict,
 rent_installment_id uuid not null references public.rent_installments(id) on delete restrict,
 allocated_amount numeric(14,2) not null check(allocated_amount>0), unique(receipt_id,rent_installment_id)
);
create index ra_installment_idx on public.receipt_allocations(rent_installment_id);

create table public.expenses (
 id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id),
 rentable_space_id uuid references public.rentable_spaces(id), category text not null, description text not null,
 competence_date date not null, total_amount numeric(14,2) not null check(total_amount>0), currency char(3) not null default 'EUR' check(currency='EUR'),
 status text not null default 'TO_PAY', allocation_mode text not null check(allocation_mode in ('OWNERSHIP_QUOTAS','MANUAL')),
 notes text, cancelled_at timestamptz, cancellation_reason text, created_at timestamptz not null default now()
);
create table public.expense_allocations (
 id uuid primary key default gen_random_uuid(), expense_id uuid not null references public.expenses(id) on delete restrict,
 owner_id uuid not null references public.owners(id), ownership_id uuid references public.property_ownerships(id),
 percentage numeric(7,4), allocated_amount numeric(14,2) not null check(allocated_amount>=0), allocation_reason text
);
create table public.expense_payments (
 id uuid primary key default gen_random_uuid(), expense_id uuid not null references public.expenses(id),
 payer_owner_id uuid references public.owners(id), payment_date date not null, amount numeric(14,2) not null check(amount>0),
 payment_method text, status text not null default 'RECORDED', notes text
);
create table public.owner_settlement_items (
 id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id),
 expense_id uuid references public.expenses(id), creditor_owner_id uuid not null references public.owners(id),
 debtor_owner_id uuid not null references public.owners(id), amount numeric(14,2) not null check(amount>0),
 status text not null default 'OPEN', calculated_at timestamptz not null default now(), settled_at timestamptz,
 check(creditor_owner_id<>debtor_owner_id)
);

create table public.billing_generation_runs (
 id uuid primary key default gen_random_uuid(), started_at timestamptz not null default now(), completed_at timestamptz,
 reference_date date not null, status text not null check(status in ('RUNNING','COMPLETED','FAILED')),
 periods_checked integer not null default 0, installments_created integer not null default 0,
 error_summary text, correlation_id uuid not null
);
