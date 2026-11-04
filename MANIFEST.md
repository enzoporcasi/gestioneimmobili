# Manifest

## Migration set

The current set is the ordered list in `supabase/migrations/`: base schema (001-011), followed by timestamped migrations for partial payments, contract termination, expense creation, document workflow/RLS, remaining-table RLS enablement, a digest/search-path correction, protected property management and owner creation.

The exact file names and an as-built function inventory are maintained in `README.md` and `GestioneImmobili_Modello_Dati_Fisico_Supabase_v1.2.md`.

## Patch set included after base release
- `20261025000100_record_partial_installment_payment.sql`
- `20261025000200_terminate_contract.sql`
- `20261025000300_create_expense_with_allocations.sql`
- `20261025000400_document_rpcs_and_rls.sql`
- `20261025091342_enable_rls_remaining_tables.sql`
- `20261025125839_fix_terminate_contract_digest.sql`
- `20261031170000_property_management_rpc.sql`
- `20261031171300_create_owner_with_access.sql`

## Functional coverage
- Core schema for owners, properties, contracts, billing, expenses, documents and privacy/audit metadata.
- Security helpers and role-scoped access checks; explicit RLS policies cover only a subset of enabled tables.
- Progressive rent installment generation, balance view, full/partial payment functions.
- The Canoni e incassi frontend provides server-filtered/paginated installment and receipt lists, a full-page installment detail, receipt history and Manager-only partial/full payments through the mandatory-idempotency-key RPC. Pending requests survive a tab refresh using session storage; Viewers remain read-only.
- `20261104100000_billing_workspace.sql` adds three RLS-preserving `security_invoker` views and Manager-scoped manual generation of matured installments for one active contract. Automated scheduling, reversals, write-offs and exports remain out of scope.
- Contract termination and expense creation with allocations, including the optional first payment.
- Document reservation/finalization, scan-result transition and authorized signed-download flow; malware scanning itself is external.
- The web client supports property list/detail/create/edit; creation applies the property and its complete ownership shares atomically.
- Owner registration supports natural persons and legal entities; the creator receives scoped administrator access atomically.
- The web client includes a filterable owner inventory and owner registration form.
- Email/password signup requires name and surname and creates an application profile atomically. New accounts must confirm their email before obtaining a session; the frontend supports resending activation links and handling expired/invalid links.
- Local Auth confirmation emails use `supabase/templates/confirmation.html` and Mailpit at `http://127.0.0.1:54324`; links return to the frontend on port 5173. Hosted projects require separate Auth/redirect/template configuration and a verified custom SMTP sender for real delivery. Existing confirmed accounts remain valid.
- A Capacitor 8 Android project reuses the React web client and Supabase flows; device-level parity, usability verification and release signing remain pending.
- SQL and Node end-to-end test scripts are present; their presence does not assert that they passed in every environment.
- Ownership-share replacement, notification scheduler, application push/e-mail delivery service and the full set of target RPCs are not included. Supabase Auth confirmation email is a separate, implemented flow.

## Test assets
- SQL smoke/integration tests cover schema, due dates, constraints, RLS isolation, billing, payments, contract termination, expenses, property-management RPCs and document security.
- Node scripts cover Storage upload, document-download URL flows and email confirmation.
- `020_billing_workspace.sql` covers scoped generation, idempotent payments, balances/history and Viewer/cross-user authorization. `021_billing_validation.mjs` covers payment amounts and pending-request validation. Both run through the existing test discovery.
- `supabase/tests/019_email_confirmation_e2e.mjs` verifies signup without a session, login denial before confirmation, local email delivery, resend/rate-limit handling, activation, profile access and single-use links, then removes its temporary user and messages. This flow passed locally on 2026-11-04; hosted SMTP delivery and the complete suite are not certified by that result.
- `scripts/run-all-tests.ps1` runs the migrations/reset and SQL/Node suites against local Supabase.
- Test execution status is not inferred from the presence of these files; use the runner and record its actual result.

## Scope note
This project is an implementation snapshot of the GestioneImmobili Supabase data layer. The functional/physical/RPC documents include planned behavior beyond the current implementation; consult their as-built sections for the implemented subset. Environment-specific verification, missing workflows, production hardening, and final performance/security review remain before live deployment.
