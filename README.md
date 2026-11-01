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
- shell Android Capacitor che riutilizza il frontend React e i flussi Supabase;
- suite di test SQL e script e2e per validazioni di schema, billing, immobili e storage.

Questa configurazione è da intendere come implementation snapshot di progetto, non come certificazione di produzione. La shell Android riutilizza le funzionalità web implementate; la verifica completa su dispositivi Android e la pubblicazione non sono ancora state completate. La presenza di migration e test non significa che l'intera suite sia stata eseguita con esito positivo.

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
   - `20261101092300_update_owner_contact_details.sql`
   - `20261101120000_contract_management.sql`
   - `20261101130000_serialize_contract_activation.sql`
   - `20261101133000_preserve_contract_lifecycle.sql`
   - `20261101150000_legal_contract_types.sql`
   - `20261101160000_reference_catalogs.sql`
   - `20261101161000_limit_legacy_contract_catalog_items.sql`
   - `20261101162000_restrict_contract_type_options.sql`
   - `20261101163000_preserve_legacy_contract_codes.sql`
   - `20261101164000_add_early_terminated_catalog_status.sql`
   - `20261101165000_add_pending_scan_catalog_item.sql`
   - `20261101170000_entity_document_categories.sql`
   - `20261101171000_document_workspace_rpcs.sql`
   - `20261101172000_add_highly_sensitive_document_level.sql`
   - `20261101173000_raise_attachment_sensitivity.sql`
   - `20261101174000_cancel_reserved_document_upload.sql`
   - `20261101175000_allow_reserved_upload_cleanup.sql`

## Funzionalità presenti nel codice

### Amministrazione profili e permessi
- `profiles`, `owners`, `user_owner_accesses`, `invitations`
- accessi per property/owner con ruoli `VIEWER`, `MANAGER`, `ADMINISTRATOR`
- helper `security.can_access_*` per controllo autorizzazioni centralizzato
- `create_owner_with_access()` crea un Proprietario e assegna atomicamente il ruolo `ADMINISTRATOR` all'utente autenticato; valida il tipo soggetto e i campi obbligatori, normalizza i codici identificativi, rifiuta duplicati e scrive audit
- `update_owner_contact_details()` aggiorna esclusivamente email e cellulare per utenti Manager del Proprietario e registra l'operazione nell'audit
- `reference_catalogs` e `reference_catalog_items` centralizzano classificazioni e stati del dominio; le tabelle applicative hanno riferimenti FK ai valori e trigger di sincronizzazione. La lettura avviene tramite RLS/RPC; il catalogo è modificato con migration, non da utenti applicativi.

### Gestione immobili e contratti
- `properties`, `property_ownerships`, `rentable_spaces`
- Tipologie Immobile, porzioni, Proprietario/Locatario, Contratto e periodicità vengono caricate dal catalogo centrale invece che da liste duplicate nel frontend.
- `list_manageable_owners()` per esporre al client solo i Proprietari attivi gestibili dall'utente
- RPC per elencare immobili, porzioni, Locatari e contratti nel perimetro Manager
- `create_tenant_for_property()` crea una scheda Locatario associata all'immobile gestito e registra l'operazione nell'audit
- `create_legal_contract_with_term()` crea atomicamente contratto inattivo e condizioni economiche; limita le nuove registrazioni a 4+4, 3+2, transitorio abitativo e commerciale 6+6, richiede motivazione per il transitorio e registra canone concordato/regime fiscale scelti
- `set_contract_management_status()` attiva/disattiva il contratto con controllo dei conflitti; la generazione delle rate considera solo i contratti attivi
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
- tipologie documentali associate all'entità: identità e codice fiscale del Proprietario; planimetria, visura catastale, APE, atto di proprietà e altro per l'Immobile; identità, codice fiscale, permesso di soggiorno, documenti camerali e documentazione reddituale/transitoria per il Locatario; contratto firmato, registrazione, appendici e verbale per il Contratto
- allegati selezionabili durante la creazione di Proprietari, Immobili, Locatari e Contratti oppure dalla sezione Documenti per entità esistenti; accettati PDF/JPG/PNG fino a 20 MB e acquisizione foto da dispositivo mobile
- download disponibile soltanto dopo esito scansione `CLEAN`; il servizio antivirus effettivo resta da integrare. Le integrazioni dirette OAuth con provider cloud sono rinviate; in questa fase si usano file del dispositivo e fotocamera
- audit event sulle operazioni critiche
- la Edge Function `create-document-download-url` usa `APP_PUBLIC_SUPABASE_URL` come override opzionale e `SUPABASE_URL` come fallback per l'host delle signed URL

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
Il frontend web è basato su React, TypeScript e Vite. Include autenticazione email/password con Supabase Auth, panoramica, immobili, Proprietari, Locatari e contratti. Il MVP contratti consente di creare anagrafiche Locatario e contratti per intero immobile o porzioni, con tipologie abitative 4+4, 3+2 e transitorie e commerciali 6+6; richiede la motivazione transitoria, registra l'eventuale canone concordato e la scelta opzionale della cedolare secca per contratti abitativi. Il 3+2 richiede per definizione il canone concordato; il rispetto dell'accordo territoriale e i requisiti fiscali devono essere verificati dall'utente. I contratti nascono inattivi e vanno attivati esplicitamente per generare rate. Ogni contratto ha un solo Locatario principale; modifica/archiviazione contratti, co-conduttori, variazioni storiche e prorata non sono inclusi. Per un Proprietario esistente sono modificabili solo email e cellulare. I moduli di modifica e inserimento di Immobili, Proprietari, Locatari e contratti occupano una pagina intera, non una scheda sovrapposta; la stessa regola vale per le future funzionalità. L'Immobile richiede quote che totalizzino il 100%; la modifica della struttura delle quote non è ancora implementata. Il seed locale fornisce un Proprietario demo accessibile a `utente.a@test.local`. Non inserire mai `service_role` o secret key nelle variabili `VITE_*`.

## App Android

L'app Android usa Capacitor 8 e lo stesso frontend React della versione web, così le funzionalità già implementate e l'autenticazione Supabase restano condivise. Il layout responsive è comune alle due piattaforme; prima di una release sono necessari test funzionali e di usabilità su dispositivi Android reali.

Prerequisiti: Node.js/npm, Android Studio con Android SDK Platform 36 e un JDK compatibile con la versione Gradle del progetto.

```powershell
npm install
# Configurare VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nel file .env
npm run android:sync
npm run android:open
```

`android:sync` compila il frontend e copia gli asset nell'app nativa; `android:open` apre il progetto in Android Studio. Da Android Studio selezionare un emulatore o un dispositivo con debug USB per eseguire l'app. In alternativa, con SDK e dispositivo già configurati, usare `npm run android:run`. Il sito web per PC continua a usare `npm run dev` e `npm run build`.

L'identificativo Android configurato (`it.gestioneimmobili.app`) è provvisorio e va confermato prima di pubblicare: dopo la pubblicazione non è opportuno cambiarlo. Non inserire mai `service_role` o secret key nell'app; usare esclusivamente la chiave pubblica Supabase e le policy/RPC protette.

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
psql "$DATABASE_URL" -f supabase/tests/016_document_category_catalogs.sql
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
