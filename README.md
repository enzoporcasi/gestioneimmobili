# GestioneImmobili - Supabase implementation snapshot

Questo repository contiene la base dati PostgreSQL/Supabase per la gestione immobiliare e alcuni flussi backend. Le specifiche funzionali e tecniche descrivono anche funzionalità target non ancora implementate: fare riferimento alle rispettive sezioni di stato as-built prima di considerare disponibile una funzione.

## Stato attuale

Il repository include:
- schema iniziale per profili, proprietari, inviti/accessi, immobili, contratti e canoni;
- tabelle per documenti, scadenze, audit, idempotenza e sicurezza;
- helper di sicurezza per proprietà, contratti, canoni, spese e documenti;
- view e generator di rate;
- RPC per alcuni flussi di billing, cessazione contratto, creazione spesa e ciclo documentale;
- RPC per elenco dei Proprietari gestibili e creazione/modifica protetta degli immobili con quote;
- RLS abilitata sulle tabelle applicative, con policy esplicite ancora parziali;
- bucket Storage dedicato ai documenti immobiliari con upload riservato;
- frontend web React/TypeScript per autenticazione e gestione immobili;
- suite di test SQL e script e2e per validazioni di schema, billing, immobili e storage.

Questa configurazione è da intendere come implementation snapshot di progetto, non come certificazione di produzione. La presenza di migration e test non significa che l'intera suite sia stata eseguita con esito positivo. Il repository non contiene il client mobile descritto dai requisiti.

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
9. `009_rpc_core.sql` - RPC per registrazione pagamento del canone
10. `010_rls.sql` - abilitazione RLS e policy SELECT principali
11. `011_storage.sql` - bucket `property-documents` e policy di upload riservato
12. migration incrementali:
   - `20261025000100_record_partial_installment_payment.sql`
   - `20261025000200_terminate_contract.sql`
   - `20261025000300_create_expense_with_allocations.sql`
   - `20261025000400_document_rpcs_and_rls.sql`
   - `20261025091342_enable_rls_remaining_tables.sql`
   - `20261025125839_fix_terminate_contract_digest.sql`
   - `20261031170000_property_management_rpc.sql`
   - `20261031171300_create_owner_with_access.sql`

## Funzionalità presenti nel codice

### Amministrazione profili e permessi
- `profiles`, `owners`, `user_owner_accesses`, `invitations`
- accessi per property/owner con ruoli `VIEWER`, `MANAGER`, `ADMINISTRATOR`
- helper `security.can_access_*` per controllo autorizzazioni centralizzato
- `create_owner_with_access()` crea un Proprietario e assegna atomicamente il ruolo `ADMINISTRATOR` all'utente autenticato; valida il tipo soggetto e i campi obbligatori, normalizza i codici identificativi, rifiuta duplicati e scrive audit

### Gestione immobili e contratti
- `properties`, `property_ownerships`, `rentable_spaces`
- `list_manageable_owners()` per esporre al client solo i Proprietari attivi gestibili dall'utente
- `create_property_with_ownership()` crea Immobile e quote atomiche; richiede ruolo Manager su tutti i Proprietari e totale quote pari al 100%
- `update_property_details()` modifica i dati descrittivi solo per utenti con ruolo Manager sulla Property
- `contracts`, `contract_terms`, `contract_tenants`, `contract_changes`
- schema e terminazione anticipata del contratto
- generazione progressiva di rate e calcolo due_date

### Economica e billing
- `rent_installments`, `receipt_allocations`, `receipts`
- `expenses`, `expense_allocations`, `expense_payments`
- `owner_settlement_items`
- `v_rent_installment_balance` e `generate_due_installments()`
- `record_partial_installment_payment()` per pagamenti parziali
- `mark_installment_paid()` per registrazione del pagamento del residuo

### Documenti e scadenze
- `documents`, `document_versions`, `deadlines`, `notification_rules`
- workflow documentale `RESERVED` → `PENDING_SCAN` → `AVAILABLE`/`REJECTED`/`FAILED`
- supporto a link documentali verso proprietari, immobili, contratti, rate, incassi, spese, porzioni e scadenze
- audit event sulle operazioni critiche

### Sicurezza e robustezza
- RLS abilitata sulle tabelle applicative; le policy esplicite non coprono ancora tutta la matrice target
- `idempotency_keys` usata da alcune operazioni mutanti, non da tutte
- validazione input su RPC
- `security definer` con `search_path` ristretto
- log e correlazione per eventi di audit e sicurezza

L'elenco completo delle funzioni implementate e delle lacune è in [GestioneImmobili_RPC_e_RLS_v1.1.md](./GestioneImmobili_RPC_e_RLS_v1.1.md), sezione 17. I requisiti non ancora coperti restano target, non API disponibili.

## Comandi tipici

```bash
npm install
npm run dev
npm run build

supabase start
supabase db reset
```

Su Windows, prima dell'avvio:

```powershell
Copy-Item .env.example .env
```

Poi impostare `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` nel file `.env`.
Il frontend web è basato su React, TypeScript e Vite. Include autenticazione email/password con Supabase Auth, panoramica, elenco e dettaglio immobili, creazione/modifica tramite RPC protette e una sezione Proprietari con elenco filtrabile e form per persone fisiche e giuridiche. La creazione del Proprietario assegna l'accesso amministrativo al creatore; l'Immobile richiede quote che totalizzino il 100%. La modifica della struttura delle quote non è ancora implementata. Il seed locale fornisce un Proprietario demo accessibile a `utente.a@test.local`. Non inserire mai `service_role` o secret key nelle variabili `VITE_*`.

Il test runner locale esegue tutte le migration tramite `db reset`, tutti i test SQL, e i test Node/e2e. Richiede Docker, Node/npm, Supabase CLI, le chiavi publishable e secret locali e il file environment della Edge Function:

```powershell
.\scripts\run-all-tests.ps1 -PublishableKey $env:SUPABASE_PUBLISHABLE_KEY -SecretKey $env:SUPABASE_SECRET_KEY
```

Le chiavi vanno caricate da un secret store/ambiente locale e non versionate. È possibile omettere il reset con `-SkipDbReset` o la Edge Function con `-SkipEdgeFunction` se già avviata.

Per eseguire manualmente i test SQL:

```bash
psql "$DATABASE_URL" -f supabase/tests/001_schema_smoke.sql
psql "$DATABASE_URL" -f supabase/tests/002_due_date.sql
psql "$DATABASE_URL" -f supabase/tests/003_constraints.sql
psql "$DATABASE_URL" -f supabase/tests/004_rls_isolation.sql
psql "$DATABASE_URL" -f supabase/tests/005_billing_generation.sql
psql "$DATABASE_URL" -f supabase/tests/006_mark_installment_paid.sql
psql "$DATABASE_URL" -f supabase/tests/006_storage_security.sql
psql "$DATABASE_URL" -f supabase/tests/007_partial_installment_payment.sql
psql "$DATABASE_URL" -f supabase/tests/008_terminate_contract.sql
psql "$DATABASE_URL" -f supabase/tests/009_create_expense_with_allocations.sql
psql "$DATABASE_URL" -f supabase/tests/010_document_rls.sql
psql "$DATABASE_URL" -f supabase/tests/012_property_management_rpc.sql
node supabase/tests/011_storage_upload_e2e.mjs
node supabase/tests/012_create_document_download_url_e2e.mjs
```

## Avvertenze e caveats
1. Eseguire prima in ambiente locale e verificare il setup Auth/Storage.
2. Lo scanner malware, il job di generazione canoni e il canale di notifiche email/push sono esterni alle migration SQL e richiedono componenti server-side aggiuntivi.
3. La `service role` non va usata lato app mobile o frontend.
4. I test RLS richiedono utenti Auth di test; vedi `supabase/tests/004_rls_isolation.sql`.
5. Non tutte le RPC mutanti sono idempotenti: verificare la specifica e le firme SQL, in particolare per i pagamenti delle rate.
6. Prima del deployment in produzione occorre completare test di performance e sicurezza, inclusi `EXPLAIN (ANALYZE, BUFFERS)` per query critiche e controllo dei permessi Storage.
7. Scheduler del generatore, invio push/e-mail e scanner malware sono componenti esterni non forniti da queste migration.

## Obiettivo del repository

Il repo costituisce una base dati e backend parziale per la gestione immobiliare. Prima di considerare completo l'MVP occorre realizzare i flussi mancanti, completare e verificare la copertura RLS e integrare client e servizi esterni.
