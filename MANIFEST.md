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
- `20261104100000_billing_workspace.sql` adds three RLS-preserving `security_invoker` views and Manager-scoped manual generation of matured installments for one active contract. Reversals, write-offs and exports remain out of scope.
- `20261104120000_billing_automation.sql` and the Node/Docker worker add automatic installment generation and SMTP reminders for confirmed active Managers/Administrators. The queue checks balances and current scope, uses unique keys, leases, bounded retries and backend-only RPCs; upcoming, due-day and overdue reminders use Europe/Rome time.
- `scripts/start-local-automation.ps1` starts the local non-root, read-only worker with restart policy `unless-stopped`; `-Stop` stops it without deleting the database queue. Local SMTP uses Mailpit; real delivery requires separately configured SMTP credentials and deployment on an always-on backend.
- Contract termination and expense creation with allocations, including the optional first payment.
- A dedicated Spese menu provides a filtered/paginated expense inventory and allocation/payment detail. The same full-page editor is available from the menu with property selection and from property detail with a fixed property. It supports ownership-based allocation and an optional first payment, with session-persisted idempotent retries; Viewers remain read-only.
- `20261104110000_expenses_workspace.sql` adds RLS-preserving expense views and the partial-payment status catalog entry. Manual allocation UI, portions, expense attachments, later payments, editing/cancellation and dashboard changes are outside this first expense UI.
- Document reservation/finalization, scan-result transition and authorized signed-download flow; malware scanning itself is external.
- The web client supports property list/detail/create/edit; creation applies the property and its complete ownership shares atomically.
- Owner registration supports natural persons and legal entities; the creator receives scoped administrator access atomically.
- The web client includes a filterable owner inventory and owner registration form.
- Email/password signup requires name and surname and creates an application profile atomically. New accounts must confirm their email before obtaining a session; the frontend supports resending activation links and handling expired/invalid links.
- Local Auth confirmation emails use `supabase/templates/confirmation.html` and Mailpit at `http://127.0.0.1:54324`; links return to the frontend on port 5173. Hosted projects require separate Auth/redirect/template configuration and a verified custom SMTP sender for real delivery. Existing confirmed accounts remain valid.
- A Capacitor 8 Android project reuses the React web client and Supabase flows; device-level parity, usability verification and release signing remain pending.
- SQL and Node end-to-end test scripts are present; their presence does not assert that they passed in every environment.
- Ownership-share replacement, push delivery, notification-preference UI and the full set of target RPCs are not included. SMTP rent reminders and Supabase Auth confirmation emails are separate implemented flows. SMTP acknowledgements cannot provide strict exactly-once delivery across process crashes.

## Test assets
- SQL smoke/integration tests cover schema, due dates, constraints, RLS isolation, billing, payments, contract termination, expenses, property-management RPCs and document security.
- Node scripts cover Storage upload, document-download URL flows and email confirmation.
- `020_billing_workspace.sql` covers scoped generation, idempotent payments, balances/history and Viewer/cross-user authorization. `021_billing_validation.mjs` covers payment amounts and pending-request validation. Both run through the existing test discovery.
- `022_expenses_workspace.sql` covers expense creation/replay, partial first payment, allocations and cross-user/Viewer permissions. `023_expense_draft_validation.mjs` covers pending-request restoration. Both use the existing test discovery.
- `024_billing_automation.sql` covers generation/queue deduplication, future reminders, claim exclusivity, retries, invalid leases, revoked permissions and closed installments. `025_notification_worker.mjs` covers message composition, SMTP failure and acknowledgement failure. Real local SMTP delivery to Mailpit was verified separately with temporary data; no external SMTP provider has been tested.
- `supabase/tests/019_email_confirmation_e2e.mjs` verifies signup without a session, login denial before confirmation, local email delivery, resend/rate-limit handling, activation, profile access and single-use links, then removes its temporary user and messages. This flow passed locally on 2026-11-04; hosted SMTP delivery and the complete suite are not certified by that result.
- `scripts/run-all-tests.ps1` runs the migrations/reset and SQL/Node suites against local Supabase.
- Test execution status is not inferred from the presence of these files; use the runner and record its actual result.

## Scope note
This project is an implementation snapshot of the GestioneImmobili Supabase data layer. The functional/physical/RPC documents include planned behavior beyond the current implementation; consult their as-built sections for the implemented subset. Environment-specific verification, missing workflows, production hardening, and final performance/security review remain before live deployment.
