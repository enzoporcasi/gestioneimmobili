# GestioneImmobili - Supabase implementation snapshot

Questa directory contiene la base dati implementata in PostgreSQL/Supabase per la gestione immobiliare, in linea con il modello logico, il modello fisico e i requisiti funzionali del progetto. Il codice attuale è più avanzato rispetto al manifesto iniziale: include non solo lo schema base, ma anche RPC, RLS, logica di billing, pagamento di canoni, chiusura contratti, gestione spese e documenti.

## Stato attuale

Il repository include:
- schema iniziale per profili, proprietari, proposte/accessi, immobili, contratti e canoni;
- tabelle per documenti, scadenze, audit, idempotenza e sicurezza;
- helper di sicurezza e gestione autorizzazioni per proprietà e contratti;
- view e generator di rate;
- RPC core per il ciclo di vendita/locazione e gestione contabile;
- policy RLS per il perimetro logico aziendale;
- bucket Storage dedicato ai documenti immobiliari con upload riservato;
- suite di test SQL e script e2e per validazioni di schema, billing e storage.

Questa configurazione è da intendere come implementation snapshot di progetto, non come certificazione di produzione. È pronta per validazione locale e test funzionali, ma richiede ancora verifica ambientale e hardening prima del go-live definitivo.

## Prerequisiti
- Progetto Supabase locale o remoto;
- Supabase CLI configurata;
- accesso a un database PostgreSQL compatibile con le migration;
- (per test avanzati) utenti Auth di test e bucket Storage configurati.

## Ordine di esecuzione
Le migration vanno eseguite in ordine lessicografico. Il set attuale include:

1. `001_extensions.sql` - estensioni e schema security
2. `002_profiles_privacy_access.sql` - profili, owners, accessi, documenti legali, DSR
3. `003_properties_contracts.sql` - proprietà, contratti, locazioni e variazioni di contratto
4. `004_economics.sql` - canoni, incassi, spese, saldi e patti di gestione
5. `005_documents_deadlines_audit.sql` - documenti, scadenze, audit, sicurezza, idempotenza
6. `006_document_bridges.sql` - bridge tra documenti e entità principali
7. `007_security_helpers.sql` - helper RBAC e autorizzazioni
8. `008_views_and_billing.sql` - view, generator di rate e logica di billing
9. `009_rpc_core.sql` - RPC principali per gestione pagamenti e operazioni di business
10. `010_rls.sql` - abilitazione RLS e policy sui table principali
11. `011_storage.sql` - bucket `property-documents` e policy di upload riservato
12. patch incremental di rilascio per casi d'uso avanzati:
   - `20261025000100_record_partial_installment_payment.sql`
   - `20261025000200_terminate_contract.sql`
   - `20261025000300_create_expense_with_allocations.sql`
   - `20261025000400_document_rpcs_and_rls.sql`
   - `20261025091342_enable_rls_remaining_tables.sql`
   - `20261025125839_fix_terminate_contract_digest.sql`

## Funzionalità implementate

### Amministrazione profili e permessi
- `profiles`, `owners`, `user_owner_accesses`, `invitations`
- accessi per property/owner con ruoli `VIEWER`, `MANAGER`, `ADMINISTRATOR`
- helper `security.can_access_*` per controllo autorizzazioni centralizzato

### Gestione immobili e contratti
- `properties`, `property_ownerships`, `rentable_spaces`
- `contracts`, `contract_terms`, `contract_tenants`, `contract_changes`
- supporto a lifecycle status e terminazione anticipata del contratto
- generazione automatica di rate e calcolo due_date

### Economica e billing
- `rent_installments`, `receipt_allocations`, `receipts`
- `expenses`, `expense_allocations`, `expense_payments`
- `owner_settlement_items`
- `v_rent_installment_balance` e `generate_due_installments()`
- `record_partial_installment_payment()` per pagamenti parziali
- `mark_installment_paid()` per chiusura del canone

### Documenti e scadenze
- `documents`, `document_versions`, `deadlines`, `notification_rules`
- storage bucket dedicato con stato `RESERVED`/`FINALIZED`
- supporto a link documentali verso proprietà, immobili, contratti, rate e spese
- audit event sulle operazioni critiche

### Sicurezza e robustezza
- policy RLS per tabelle sensibili
- `idempotency_keys` per operazioni mutanti critiche
- validazione input su RPC
- `security definer` con `search_path` ristretto
- log e correlazione per eventi di audit e sicurezza

## Comandi tipici

```bash
supabase start
supabase db reset
supabase db push

psql "$DATABASE_URL" -f supabase/tests/001_schema_smoke.sql
psql "$DATABASE_URL" -f supabase/tests/002_due_date.sql
psql "$DATABASE_URL" -f supabase/tests/003_constraints.sql
psql "$DATABASE_URL" -f supabase/tests/004_rls_isolation.sql
psql "$DATABASE_URL" -f supabase/tests/005_billing_generation.sql
psql "$DATABASE_URL" -f supabase/tests/006_mark_installment_paid.sql
psql "$DATABASE_URL" -f supabase/tests/007_partial_installment_payment.sql
psql "$DATABASE_URL" -f supabase/tests/008_terminate_contract.sql
psql "$DATABASE_URL" -f supabase/tests/009_create_expense_with_allocations.sql
psql "$DATABASE_URL" -f supabase/tests/010_document_rls.sql
node supabase/tests/011_storage_upload_e2e.mjs
node supabase/tests/012_create_document_download_url_e2e.mjs
```

## Avvertenze e caveats
1. Eseguire prima in ambiente locale e verificare il setup Auth/Storage.
2. Lo scanner malware, il job di generazione canoni e il canale di notifiche email/push sono esterni alle migration SQL e richiedono componenti server-side aggiuntivi.
3. La `service role` non va usata lato app mobile o frontend.
4. I test RLS richiedono utenti Auth di test; vedi `supabase/tests/004_rls_isolation.sql`.
5. I casi d'uso avanzati di terminazione contratti, pagamento canoni e spese sono gestiti da RPC con idempotenza e audit; verificare comunque i casi limite con test di regressione.
6. Prima del deployment in produzione occorre completare test di performance e sicurezza, inclusi `EXPLAIN (ANALYZE, BUFFERS)` per query critiche e controllo dei permessi Storage.

## Obiettivo del repository

Il repo è stato costruito come base dati operativa per la gestione immobiliare, con logica di business centralizzata in SQL e con policy di accesso coerenti con i ruoli aziendali. È adatto a supportare un MVP funzionale e a costituire la piattaforma di riferimento per le successive integrazioni applicative e UI.
