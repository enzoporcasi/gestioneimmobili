# Manifest

## Migrations implemented
1. Extensions/common functions and schema bootstrap
2. Profiles/privacy/access model
3. Properties, contracts, tenants, terms and ownerships
4. Economics: installments, payments, expenses and settlement
5. Documents, deadlines, auditing and idempotency requirements
6. Document-to-entity bridges
7. Security helpers and RBAC access checks
8. Billing views and due-installment generator
9. Core RPC for installment payment, partial payment and contract lifecycle logic
10. RLS enablement and table grants
11. Storage bucket and reserved upload policy

## Patch set included after base release
- `20261025000100_record_partial_installment_payment.sql`
- `20261025000200_terminate_contract.sql`
- `20261025000300_create_expense_with_allocations.sql`
- `20261025000400_document_rpcs_and_rls.sql`
- `20261025091342_enable_rls_remaining_tables.sql`
- `20261025125839_fix_terminate_contract_digest.sql`

## Functional coverage
- schema core for owners, properties, contracts and billing
- multi-role access control and security helpers
- automated generation of rent installments
- payment recording, allocation and residual tracking
- contract termination handling with idempotency and audit trail
- expense creation with allocations and settlement logic
- document management and reserved upload workflow for private storage
- SQL smoke tests and end-to-end validation scripts

## Test status
- Executable SQL smoke tests present: schema, due-date, constraints, billing, payment and document checks.
- RLS isolation tests included.
- Storage upload/download tests included via Node scripts.
- The implementation is validated at code-level and local-db level, but not yet production-certified.

## Scope note
This project is now an implementation snapshot of the GestioneImmobili data layer and business logic in Supabase SQL. It includes the main MVP and advanced operational flows expected by the current codebase, but it still requires environment-specific verification, production hardening, and final performance/security review before a live deployment.
