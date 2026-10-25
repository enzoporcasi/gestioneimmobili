-- Abilitazione RLS sulle tabelle applicative residue

alter table public.invitations enable row level security;
alter table public.invitation_owners enable row level security;
alter table public.legal_documents enable row level security;
alter table public.legal_document_versions enable row level security;

alter table public.contract_rentable_spaces enable row level security;
alter table public.contract_tenants enable row level security;
alter table public.contract_terms enable row level security;
alter table public.contract_changes enable row level security;

alter table public.rent_installment_components
    enable row level security;

alter table public.receipts enable row level security;
alter table public.receipt_allocations enable row level security;

alter table public.expense_allocations enable row level security;
alter table public.expense_payments enable row level security;
alter table public.owner_settlement_items
    enable row level security;

alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.owner_documents enable row level security;
alter table public.property_documents enable row level security;
alter table public.rentable_space_documents
    enable row level security;
alter table public.tenant_documents enable row level security;
alter table public.contract_documents enable row level security;
alter table public.rent_installment_documents
    enable row level security;
alter table public.receipt_documents enable row level security;
alter table public.expense_documents enable row level security;
alter table public.deadline_documents enable row level security;

alter table public.notification_rules enable row level security;
alter table public.notification_deliveries enable row level security;

alter table public.audit_events enable row level security;
alter table public.security_events enable row level security;
alter table public.billing_generation_runs
    enable row level security;
alter table public.idempotency_keys enable row level security;