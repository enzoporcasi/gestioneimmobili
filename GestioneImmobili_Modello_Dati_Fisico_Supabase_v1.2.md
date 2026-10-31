# GestioneImmobili
## Modello Dati Fisico - Supabase

**Versione:** 1.2  
**Derivato da:** Modello Dati Logico v1.2 e ERD v1.1  
**Target:** Supabase (Postgres + Auth + Storage + RLS)  
**Lingua UI MVP:** `it-IT`  
**Valuta MVP:** `EUR`

**Stato:** specifica fisica con sezioni progettuali storiche e appendice as-built aggiornata al 2026-10-31. Per il database effettivamente presente prevale la sezione 37; le policy progettuali non sono da intendere come policy già implementate.

---

## 1. Scelte architetturali fisiche

GestioneImmobili utilizzerà Supabase come piattaforma dati. Supabase Auth conserva gli utenti in uno schema Auth dedicato e permette di collegare le tabelle applicative tramite FK; i JWT dell'utente sono utilizzabili nelle policy RLS.

### Decisioni

1. **Autenticazione:** `auth.users` è la fonte autorevole dell'identità autenticata. Non replichiamo password, sessioni OAuth o provider secrets nel dominio applicativo. Supabase supporta password e social provider, inclusi Google e Apple.
2. **Profilo applicativo:** `public.profiles.id` = FK/PK verso `auth.users.id`.
3. **Autorizzazione:** RLS su tutte le tabelle esposte. Supabase raccomanda RLS sulle tabelle degli schema esposti e le policy possono usare `auth.uid()`.
4. **Documenti:** Supabase Storage con bucket privato; anche download/accesso ai bucket privati è soggetto a RLS oppure a URL firmati temporanei.
5. **Servizi privilegiati:** la `service_role` rimane esclusivamente server-side perché bypassa RLS.
6. **MFA:** non obbligatoria nell'MVP, ma il modello non la impedisce; Supabase Auth dispone di MFA tramite TOTP e telefono.
7. **PK dominio:** `uuid`, generato con `gen_random_uuid()` salvo tabelle 1:1 con `auth.users`.
8. **Timestamp:** `timestamptz` in UTC; date contrattuali `date`.
9. **Denaro:** `numeric(14,2)` con `CHECK >= 0`; valuta `char(3)` default `EUR`.
10. **Enum applicativi:** `text` + `CHECK`, per mantenere evoluzione più semplice delle migration.

## 2. Schema e naming

- Schema applicativo MVP: `public`.
- Tabelle: `snake_case`, plurale.
- PK: `id uuid`.
- FK: `<entity>_id`.
- Codici tecnici persistiti in inglese.
- Etichette UI localizzate tramite catalogo i18n, mai persistite come stato.

## 3. Auth e profilo applicativo

### `auth.users` - gestita da Supabase

Non viene creata da migration applicative. Contiene l'identità Auth. Supabase documenta che gli utenti Auth hanno un ID e possono avere più identità/metodi di sign-in.

### `profiles`

```text
id                    uuid PK FK -> auth.users.id
first_name            text NOT NULL
last_name             text NOT NULL
display_name          text NULL
primary_email         citext NULL
status                text NOT NULL DEFAULT 'ACTIVE'
locale                text NOT NULL DEFAULT 'it-IT'
time_zone             text NOT NULL DEFAULT 'Europe/Rome'
preferred_currency    char(3) NOT NULL DEFAULT 'EUR'
last_login_at         timestamptz NULL
created_at            timestamptz NOT NULL DEFAULT now()
updated_at            timestamptz NOT NULL DEFAULT now()
archived_at           timestamptz NULL
```

CHECK `status IN ('ACTIVE','BLOCKED','INACTIVE')`.

Nota: `PENDING_VERIFICATION` resta principalmente stato Auth; l'accesso applicativo verrà derivato dall'identità Supabase verificata, evitando duplicazione non necessaria.

### Tabelle NON replicate

Il modello logico aveva `LOGIN_IDENTITY`, `USER_SESSION` e `AUTH_TOKEN`. Nel target Supabase queste responsabilità sono affidate a Supabase Auth e quindi non vengono replicate nel `public` schema, salvo futura necessità di metadati applicativi aggiuntivi.

## 4. Privacy e Inviti

### `invitations`

```text
id                  uuid PK DEFAULT gen_random_uuid()
inviter_user_id     uuid NOT NULL FK -> profiles.id
recipient_email     citext NOT NULL
role                text NOT NULL
status              text NOT NULL DEFAULT 'SENT'
token_hash           text NOT NULL UNIQUE
expires_at           timestamptz NOT NULL
accepted_by_user_id  uuid NULL FK -> profiles.id
accepted_at          timestamptz NULL
revoked_at           timestamptz NULL
created_at           timestamptz NOT NULL DEFAULT now()
```

CHECK ruolo `ADMINISTRATOR|MANAGER|VIEWER`; stato `SENT|ACCEPTED|EXPIRED|REVOKED`.

### `legal_documents`
`id uuid PK`, `type text`, `title text`, `mandatory boolean`, `status text`, timestamps.

### `legal_document_versions`
`id uuid PK`, `legal_document_id uuid FK`, `version_code text`, `content_path text`, `effective_from date`, `requires_reacceptance boolean`, `published_at timestamptz`, `retired_at timestamptz`.  
UNIQUE `(legal_document_id, version_code)`.

### `legal_acceptances`
`id uuid PK`, `user_id uuid FK`, `legal_document_version_id uuid FK`, `action text`, `occurred_at timestamptz`, `source text`, `evidence jsonb NULL`.  
Indice `(user_id, legal_document_version_id)`.

### `data_subject_requests`
`id uuid PK`, `user_id uuid FK`, `type text`, `status text`, `requested_at timestamptz`, `completed_at timestamptz`, `notes text`.

## 5. Proprietari e perimetro

### `owners`

```text
id              uuid PK
owner_type      text NOT NULL
first_name      text NULL
last_name       text NULL
business_name   text NULL
tax_code        citext NULL
vat_number      citext NULL
email           citext NULL
phone           text NULL
address_line1   text NULL
address_line2   text NULL
postal_code     text NULL
municipality    text NULL
province        text NULL
country_code    char(2) NOT NULL DEFAULT 'IT'
iban            text NULL
linked_user_id  uuid NULL FK -> profiles.id
status          text NOT NULL DEFAULT 'ACTIVE'
notes           text NULL
created_at      timestamptz NOT NULL DEFAULT now()
updated_at      timestamptz NOT NULL DEFAULT now()
archived_at     timestamptz NULL
```

Partial unique index su `tax_code` quando valorizzato; analogo su `vat_number` se necessario.

### `user_owner_accesses`

`id uuid PK`, `user_id uuid FK`, `owner_id uuid FK`, `role text`, `valid_from date`, `valid_to date`, `status text`, `source_invitation_id uuid NULL FK`, timestamps.

CHECK `valid_to IS NULL OR valid_to >= valid_from`.

### `invitation_owners`
PK composta `(invitation_id, owner_id)` con FK reali.

## 6. Immobili e comproprietà

### `properties`

`id uuid PK`, `internal_code text UNIQUE`, `name text`, `property_type text`, `status text`, indirizzo strutturato, `municipality text`, `province text`, `country_code char(2)`, `cadastral_data jsonb`, `surface_sqm numeric(10,2)`, `notes text`, audit timestamps.

### `property_ownerships`

`id uuid PK`, `property_id uuid FK`, `owner_id uuid FK`, `ownership_percentage numeric(7,4)`, `valid_from date`, `valid_to date`, `notes text`, timestamps.

CHECK percentuale `> 0 AND <= 100`; CHECK date. L'enforcement della somma 100% richiederà funzione/trigger transazionale o processo di attivazione, da dettagliare nel DDL.

### `rentable_spaces`

`id uuid PK`, `property_id uuid FK`, `code text`, `name text`, `space_type text`, `management_status text`, `availability_override text NULL`, `surface_sqm numeric(10,2)`, `description text`, `notes text`, timestamps.  
UNIQUE `(property_id, code)`.

## 7. Locatari e Contratti

### `tenants`
Attributi analoghi alle anagrafiche del modello logico; `tenant_type`, dati persona/azienda, CF/PIVA, contatti, indirizzo, `status`, timestamps.

### `contracts`

```text
id                        uuid PK
internal_code             text UNIQUE NOT NULL
property_id               uuid NOT NULL FK -> properties.id
object_type               text NOT NULL
contract_type             text NOT NULL
management_status         text NOT NULL
lifecycle_status          text NOT NULL
start_date                date NOT NULL
end_date                  date NOT NULL
security_deposit_amount   numeric(14,2) NULL
currency                  char(3) NOT NULL DEFAULT 'EUR'
tax_regime                text NULL
registration_number       text NULL
notice_period_days        integer NULL
activated_at              timestamptz NULL
ended_at                  timestamptz NULL
previous_contract_id      uuid NULL FK -> contracts.id
notes                     text NULL
created_at                timestamptz NOT NULL DEFAULT now()
updated_at                timestamptz NOT NULL DEFAULT now()
```

Il canone corrente non deve essere fonte autorevole qui: è storicizzato in `contract_terms`.

### `contract_rentable_spaces`
PK `(contract_id, rentable_space_id)`.

### `contract_tenants`
`id uuid PK`, FK Contratto/Locatario, `role`, `valid_from`, `valid_to`, `status`, note. CHECK date.

### `contract_terms`
`id uuid PK`, `contract_id uuid FK`, `valid_from`, `valid_to`, `base_rent_amount numeric(14,2)`, `billing_frequency text`, `billing_interval integer NULL`, `due_day smallint NULL`, `notes`.

### `contract_changes`
`id uuid PK`, `contract_id uuid FK`, `change_type`, `effective_date`, `previous_values jsonb`, `new_values jsonb`, `reason`, `resulting_contract_id uuid NULL FK`.

## 8. Canoni e Incassi

### `rent_installments`
`id uuid PK`, `contract_id uuid FK`, `contract_term_id uuid FK`, `sequence_number integer`, `period_start date`, `period_end date`, `due_date date`, `currency char(3) DEFAULT 'EUR'`, `amount_due numeric(14,2)`, `amount_lost numeric(14,2) DEFAULT 0`, `status text`, `generated_at timestamptz`, `closed_at timestamptz`, `lost_reason text`.

UNIQUE `(contract_id, sequence_number)` e `(contract_id, period_start, period_end)`.

### `rent_installment_components`
`id uuid PK`, `rent_installment_id uuid FK`, `component_type text`, `amount numeric(14,2)`, `description text`.

### `receipts`
`id uuid PK`, `property_id uuid FK`, `payer_tenant_id uuid NULL FK`, `payer_name text NULL`, `payment_date date`, `amount numeric(14,2)`, `currency char(3)`, `payment_method text`, `status text`, `notes text`, `reversed_at timestamptz`.

CHECK almeno un contesto descrittivo del pagatore quando necessario sarà gestito dalla validazione applicativa; il Pagatore non determina la competenza del Canone.

### `receipt_allocations`
`id uuid PK`, `receipt_id uuid FK`, `rent_installment_id uuid FK`, `allocated_amount numeric(14,2) CHECK > 0`.  
UNIQUE `(receipt_id, rent_installment_id)` salvo necessità futura di allocazioni multiple separate.

## 9. Spese e Conguagli

### `expenses`
`id uuid PK`, `property_id uuid FK`, `rentable_space_id uuid NULL FK`, `category text`, `description text`, `competence_date date`, `total_amount numeric(14,2)`, `currency char(3) DEFAULT EUR`, `status text`, `allocation_mode text`, `notes`, annullamento e timestamps.

### `expense_allocations`
`id uuid PK`, `expense_id uuid FK`, `owner_id uuid FK`, `ownership_id uuid NULL FK`, `percentage numeric(7,4)`, `allocated_amount numeric(14,2)`, `allocation_reason text`.

### `expense_payments`
`id uuid PK`, `expense_id uuid FK`, `payer_owner_id uuid NULL FK`, `payment_date date`, `amount numeric(14,2)`, `payment_method text`, `status text`, `notes`.

### `owner_settlement_items`
`id uuid PK`, `property_id uuid FK`, `expense_id uuid NULL FK`, `creditor_owner_id uuid FK`, `debtor_owner_id uuid FK`, `amount numeric(14,2)`, `status text`, timestamps.

## 10. Documenti e Supabase Storage

Supabase Storage supporta bucket privati e sulle operazioni dei bucket privati applica controlli di accesso/RLS; sono quindi adatti ai documenti sensibili di GestioneImmobili.

### Bucket

`property-documents` **PRIVATE**.

Path raccomandato:
`<document_id>/<version_number>/<safe_filename>`.

Il DB conserva `storage_bucket` e `storage_path`, non URL pubblici permanenti.

### `documents`
`id uuid PK`, `title`, `category`, `status`, `document_date`, `expiry_date`, `notes`, `sensitivity`, `current_version_id uuid NULL`, timestamps.

### `document_versions`
`id uuid PK`, `document_id uuid FK`, `version_number integer`, `storage_bucket text`, `storage_path text`, `original_file_name text`, `mime_type text`, `size_bytes bigint`, `checksum text`, `malware_scan_status text`, `uploaded_by_user_id uuid FK`, `uploaded_at timestamptz`.  
UNIQUE `(document_id, version_number)`, UNIQUE `(storage_bucket, storage_path)`.

### Tabelle ponte tipizzate
- `owner_documents(document_id, owner_id, link_role)`
- `property_documents(document_id, property_id, link_role)`
- `rentable_space_documents(document_id, rentable_space_id, link_role)`
- `tenant_documents(document_id, tenant_id, link_role)`
- `contract_documents(document_id, contract_id, link_role)`
- `rent_installment_documents(document_id, rent_installment_id, link_role)`
- `receipt_documents(document_id, receipt_id, link_role)`
- `expense_documents(document_id, expense_id, link_role)`
- `deadline_documents(document_id, deadline_id, link_role)`

PK composta sulle prime due colonne. Nessun `document_links` polimorfico.

## 11. Scadenze e Notifiche

### `deadlines`
`id uuid PK`, `title`, `category`, `due_at timestamptz`, `priority`, `status`, `responsible_user_id uuid NULL FK`, `source_type text`, `source_id uuid`, `generator_key text NULL UNIQUE`, `recurrence_rule text`, `parent_deadline_id uuid NULL FK`, completamento e note.

### `notification_rules`
`id`, `deadline_id FK`, `recipient_user_id FK`, `channel`, `offset_minutes`, `enabled`.

### `notification_deliveries`
`id`, `notification_rule_id FK`, `scheduled_at`, `status`, `attempt_count`, `sent_at`, `provider_message_ref`, `last_error_code`.

### `user_notification_preferences`
UNIQUE `(user_id, event_type)` con `push_enabled`, `email_enabled`.

### `message_templates` / `message_template_translations`
Template tecnici e traduzioni per locale. PK traduzione `(message_template_id, locale, version)` da consolidare nel DDL.

## 12. Audit e sicurezza

### `audit_events`
Append-only: `id`, `occurred_at`, `actor_user_id`, `action`, `entity_type`, `entity_id`, `outcome`, snapshot minimizzati `jsonb`, `correlation_id`, metadata non sensibili.

### `security_events`
`id`, `occurred_at`, `user_id`, `event_type`, `severity`, `outcome`, `correlation_id`, dettagli minimizzati.

## 13. RLS - modello di autorizzazione Supabase

Supabase RLS applica policy a livello riga e può usare `auth.uid()`; Supabase raccomanda di abilitare RLS sulle tabelle esposte e di configurare grant e policy con attenzione.

### Funzione centrale proposta

`can_access_property(p_property_id uuid, p_required_role text default 'VIEWER') returns boolean`

Logica: `auth.uid()` -> `user_owner_accesses` attivo -> `property_ownerships` valido -> Property richiesta. Le policy di tabelle figlie attraversano la FK fino a `property_id`/Contratto/Immobile.

### Policy families

- `profiles`: utente legge/modifica il proprio profilo; funzioni amministrative via backend controllato.
- `owners`: visibili se esiste `user_owner_accesses` attivo.
- `properties`: visibili se almeno un Owner corrente è gestito dall'Utente.
- tabelle figlie Property: stessa visibilità della Property.
- write: ruolo `MANAGER` o `ADMINISTRATOR` secondo operazione.
- gestione accessi: solo ruolo autorizzato; mai delegare Owner fuori dal proprio perimetro.
- legal acceptances: User vede/inserisce le proprie accettazioni, senza alterare quelle storiche.
- audit/security: nessun write diretto dal client mobile.

### Storage RLS

Storage usa RLS su `storage.objects`; i bucket privati richiedono policy per le operazioni autorizzate. Le policy Storage dovranno verificare che `document_id` nel path sia associato a un'entità visibile all'Utente oppure passare da signed URL server-side per operazioni controllate.

## 14. Indici prioritari

- `user_owner_accesses(user_id, owner_id, status)`.
- `property_ownerships(property_id, valid_from, valid_to)` e `(owner_id, valid_from, valid_to)`.
- `rentable_spaces(property_id, management_status)`.
- `contracts(property_id, management_status, start_date, end_date)`.
- `contract_rentable_spaces(rentable_space_id, contract_id)`.
- `contract_tenants(contract_id, valid_from, valid_to)`.
- `contract_terms(contract_id, valid_from, valid_to)`.
- `rent_installments(contract_id, due_date, status)` e `(due_date,status)`.
- `receipt_allocations(rent_installment_id)`.
- `expenses(property_id, competence_date, status)`.
- `deadlines(responsible_user_id, due_at, status)`.
- tutte le tabelle ponte Document su entrambe le FK.

Indici aggiuntivi saranno derivati dalle query reali e dalle verifiche di performance delle policy RLS.

## 15. Vincoli che richiedono funzioni/trigger o transazioni

1. Somma Quote = 100% per assetto operativo.
2. No overlap degli assetti proprietari incoerenti.
3. No overlap Contratti su stessa Porzione.
4. No overlap Contratto intero Immobile vs Porzioni.
5. Un solo `contract_term` valido alla data per Contratto Attivo.
6. Somma `expense_allocations` = totale Spesa.
7. Allocazioni Incasso <= importo Incasso e <= Residuo Canone.
8. Azione Pagato/Parziale atomica.
9. Generazione Canoni idempotente.
10. Cessazione Contratto e annullamento Canoni futuri atomici.

## 16. Viste / funzioni di lettura

- `v_current_property_owners`
- `v_user_visible_properties`
- `v_rent_installment_balance`
- `v_expense_balance`
- `v_owner_position`
- `v_property_dashboard`
- `v_deadline_status`

Le viste esposte alla client app devono rispettare RLS o essere sostituite da funzioni/RPC progettate specificamente per non bypassare il perimetro.

## 17. Piano migration progettuale (superato)

```text
001_extensions.sql
002_profiles_and_access.sql
003_privacy_and_invitations.sql
004_properties_and_ownership.sql
005_tenants_and_contracts.sql
006_rent_installments_and_receipts.sql
007_expenses_and_settlements.sql
008_documents.sql
009_deadlines_notifications_i18n.sql
010_audit.sql
011_constraints_functions.sql
012_views.sql
013_rls_policies.sql
014_storage_policies.sql
015_seed_reference_data.sql
```

Questo piano era una proposta precedente e non corrisponde ai file oggi presenti. L'ordine effettivo delle migration è riportato nella sezione 37.

## 18. Decisioni operative e verifiche prima della produzione

- Verificare migration e test su un progetto Supabase locale/remoto compatibile.
- Completare il controllo RLS per tabelle abilitate ma prive di policy esplicite; RLS abilitata non significa che la matrice progettuale sia stata realizzata.
- Integrare lo scanner malware e l'eventuale job che invoca `complete_document_scan`.
- Definire scheduling del generatore, notifiche, retention/audit e gestione degli oggetti Storage orfani.
- Completare test di concorrenza, integrità cross-table, performance e hardening prima della produzione.
- Definire eventuali evoluzioni non presenti, tra cui preferenze notifiche, template e MFA applicativa.

## 19. Criteri di accettazione del modello fisico

Prima di generare il DDL, il modello deve superare test progettuali per:
- isolamento fra due utenti con Proprietari distinti;
- comproprietà 50/50 visibile a entrambi i Gestori autorizzati;
- impossibilità di leggere documenti fuori perimetro;
- conflitti di Contratto/Porzione;
- Canone Pagato -> Incasso + Allocazione atomici;
- Canone Parziale/In ritardo/Perso;
- ripartizione Spesa con Quote storiche;
- modifica Quote senza riscrittura storico;
- cessazione Contratto;
- consensi versionati;
- RLS e Storage RLS.

## 20. Stato dell'artefatto

| Artefatto | Stato |
|---|---|
| Requisiti Funzionali | Baseline di prodotto; diversi flussi non sono implementati |
| Modello Dati Logico / ERD | Modelli di dominio con scope limitato |
| **Migration SQL Supabase** | Presenti nel repository, non equivalgono a certificazione di produzione |
| Specifica RPC/RLS | Definisce anche target non ancora implementati; appendice as-built necessaria |
| Client mobile / UI | Non presente in questo repository |


---

## 21. Correzioni della revisione Supabase v1.1

Questa sezione è normativa e prevale sulle formulazioni meno specifiche delle sezioni precedenti.

### 21.1 Fonte autorevole dell'identità

- `auth.users` è la fonte autorevole per identità, e-mail verificata, provider e sessioni.
- `public.profiles` non replica l'e-mail come fonte autorevole. L'eventuale e-mail visualizzata è ottenuta tramite flusso server controllato o mantenuta soltanto come dato informativo non usato per autorizzazione.
- Un Invito viene accettato esclusivamente tramite RPC controllata che confronta il destinatario con l'identità autenticata.
- Password, token Auth, refresh token e provider secret non risiedono nelle tabelle applicative.

### 21.2 Schema di sicurezza non esposto

Viene introdotto lo schema `security`, non aggiunto agli schema esposti da PostgREST.

Funzioni helper previste:

```text
security.role_rank(role_code text) -> smallint
security.can_access_owner(owner_id uuid, required_role text) -> boolean
security.can_access_property(property_id uuid, required_role text) -> boolean
security.can_access_contract(contract_id uuid, required_role text) -> boolean
security.can_access_document(document_id uuid, required_role text) -> boolean
security.current_user_email() -> citext
```

Regole:

- le funzioni usate dalle policy sono schema-qualified;
- se `SECURITY DEFINER`, hanno owner tecnico controllato e `search_path` fisso, ad esempio `pg_catalog, public, security`;
- nessuna funzione usa SQL dinamico non necessario;
- `EXECUTE` è revocato da `PUBLIC`, `anon` e `authenticated` salvo concessione esplicita;
- le funzioni non devono creare ricorsione interrogando viste o tabelle con policy che richiamano nuovamente lo stesso helper;
- ruoli applicativi confrontati tramite ranking esplicito: `VIEWER=10`, `MANAGER=20`, `ADMINISTRATOR=30`.

### 21.3 Matrice minima GRANT/REVOKE

RLS e privilegi SQL sono controlli separati. Ogni migration deve applicare entrambi.

| Oggetto | `anon` | `authenticated` | `service_role` / backend |
|---|---|---|---|
| Tabelle patrimoniali | Nessun privilegio | Solo operazioni esplicitamente previste e comunque soggette a RLS | Operazioni server controllate |
| `profiles` | Nessuno | SELECT/UPDATE limitati al proprio profilo via RLS | Gestione amministrativa |
| Documenti legali pubblicati | Eventuale SELECT esplicito | SELECT | Gestione pubblicazione |
| Accettazioni legali | Nessuno | SELECT proprie; INSERT tramite flusso controllato | Amministrazione/audit |
| Audit/Security events | Nessuno | Nessun accesso diretto | Inserimento/lettura controllati |
| RPC pubbliche | Nessun EXECUTE di default | EXECUTE solo sulle RPC previste | EXECUTE completo controllato |
| Viste Dashboard | Nessuno | Solo se `security_invoker` e testate; altrimenti RPC | Accesso controllato |

Baseline per migration:

```sql
revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
```

Dopo il revoke vengono concessi soltanto i privilegi necessari. La `service_role` non deve mai essere distribuita al client.

## 22. Modello RLS dettagliato

### 22.1 Principi

1. RLS abilitata e forzata su tutte le tabelle applicative esposte compatibili con il ruolo owner:
   `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` e, dove opportuno, `FORCE ROW LEVEL SECURITY`.
2. Policy separate per `SELECT`, `INSERT`, `UPDATE`, `DELETE`.
3. `USING` determina le righe visibili/modificabili; `WITH CHECK` valida i nuovi valori.
4. Le policy dichiarano `TO authenticated`; nessuna policy business per `anon`, salvo documenti legali pubblici espressamente autorizzati.
5. Nessuna policy si basa su dati liberamente modificabili dal client, come un'e-mail duplicata nel profilo.
6. Le tabelle append-only non espongono `UPDATE`/`DELETE` al client.

### 22.2 Gerarchia delle policy

| Famiglia | SELECT | INSERT/UPDATE | DELETE |
|---|---|---|---|
| `profiles` | solo proprio profilo | solo campi consentiti del proprio profilo | mai dal client |
| `owners` | `can_access_owner(...,'VIEWER')` | tramite RPC o ruolo `MANAGER` | archiviazione tramite RPC |
| `properties` | `can_access_property(...,'VIEWER')` | tramite RPC/ruolo `MANAGER` | mai distruttivo |
| Figlie Property | accesso ereditato dalla Property | ruolo `MANAGER` + coerenza FK | secondo dominio, normalmente no DELETE fisico |
| `user_owner_accesses` | utente interessato o Administrator del perimetro | soltanto RPC amministrative | revoca logica tramite RPC |
| Accettazioni legali | proprie | RPC/INSERT vincolato all'Utente corrente | mai |
| Audit/Security | nessun accesso client ordinario | solo backend/funzioni controllate | mai |

### 22.3 Accesso ereditato dalle tabelle figlie

Ogni tabella deve avere un percorso deterministico verso `property_id`:

- `contracts.property_id` diretto;
- `rent_installments -> contracts.property_id`;
- `receipts.property_id` diretto;
- `expenses.property_id` diretto;
- Documenti tramite una o più tabelle ponte tipizzate;
- `deadlines` tramite sorgente tipizzata o associazione esplicita.

Per tabelle con più collegamenti, l'accesso è consentito se almeno un legame corrente è visibile, salvo documenti ad alta sensibilità per cui può essere richiesto un ruolo superiore.

## 23. RPC atomiche obbligatorie

Le seguenti operazioni non devono essere eseguite come sequenze libere di INSERT/UPDATE dal client:

### Gestione anagrafiche e perimetro

```text
create_owner_with_access(...)
create_property_with_ownership(...)
replace_property_ownership_structure(...)
create_invitation(...)
accept_invitation(token)
revoke_user_owner_access(...)
```

### Contratti e Canoni

```text
activate_contract(contract_id)
change_contract_terms(...)
extend_contract(...)
terminate_contract(...)
mark_installment_paid(installment_id, payment_data)
record_partial_installment_payment(installment_id, amount, payment_data)
mark_installment_lost(installment_id, reason)
```

### Spese

```text
create_expense_with_allocations(...)
record_expense_payment(...)
replace_expense_allocations(...)
cancel_expense(...)
```

### Documenti

```text
reserve_document_upload(...)
finalize_document_upload(document_version_id, metadata)
link_document_to_entity(...)
archive_document(...)
```

Ogni RPC:

- verifica `auth.uid()` e ruolo tramite helper `security`;
- esegue in un'unica transazione;
- applica idempotency key ove il retry possa duplicare dati;
- ritorna errori tecnici stabili e localizzabili, non testo italiano come contratto API;
- scrive l'Audit Event appropriato;
- non espone `SECURITY DEFINER` senza `search_path` e grants controllati.

## 24. Supabase Storage v1.1

### 24.1 Bucket

```text
bucket: property-documents
public: false
allowed_mime_types: application/pdf, image/jpeg, image/png, image/heic (se supportato dal flusso scelto)
file_size_limit: valore configurabile da approvare nell'architettura tecnica
```

Nessun URL pubblico permanente viene persistito.

### 24.2 Path immutabile

```text
<document_id>/<document_version_id>/<safe_file_name>
```

Ogni nuova versione usa un nuovo `document_version_id`. Upsert/overwrite non è consentito nel normale flusso.

### 24.3 Stato versione documento

A `document_versions` si aggiunge:

```text
upload_status text NOT NULL
-- RESERVED | UPLOADED | PENDING_SCAN | AVAILABLE | REJECTED | FAILED
reserved_by_user_id uuid FK -> profiles.id
reserved_at timestamptz
finalized_at timestamptz
```

Un Documento è scaricabile soltanto se la versione è `AVAILABLE` e `malware_scan_status='CLEAN'`.

### 24.4 Flusso upload

```text
1. reserve_document_upload RPC
   - verifica ruolo/perimetro
   - crea DOCUMENT e DOCUMENT_VERSION RESERVED
   - crea associazione tipizzata
   - restituisce bucket/path

2. upload Storage
   - policy consente INSERT solo al reserving user
   - oggetto nuovo, nessun upsert

3. finalize_document_upload RPC
   - verifica oggetto e prenotazione
   - salva MIME, size, checksum
   - imposta PENDING_SCAN

4. scansione server-side
   - CLEAN -> AVAILABLE e current_version_id aggiornato
   - INFECTED/FAILED -> REJECTED/FAILED, non scaricabile
```

### 24.5 Download

Due modalità ammesse:

- policy Storage che verifica l'associazione del `document_id` con un'entità visibile;
- preferibilmente per documenti sensibili, funzione server/Edge Function che verifica `security.can_access_document` e genera signed URL a breve durata.

La possibilità di upload non implica automaticamente il diritto di download. L'autorizzazione è rivalutata al momento della richiesta.

### 24.6 Cleanup

Job server-side per:

- prenotazioni `RESERVED` scadute;
- oggetti caricati ma mai finalizzati;
- righe `document_versions` senza oggetto;
- oggetti Storage senza riga DB;
- versioni `REJECTED` secondo retention.

## 25. Intervalli temporali

### 25.1 Convenzione

Tutti gli intervalli storicizzati usano semantica semiaperta:

```text
[valid_from, valid_to)
```

`valid_from` incluso, `valid_to` escluso; `NULL` equivale a infinito.

Applicata a:

- `user_owner_accesses`;
- `property_ownerships`;
- `contract_tenants`;
- `contract_terms`;
- intervalli Contratto/occupazione Porzioni.

Esempio:

```text
Quota precedente [2027-01-01, 2027-07-01)
Quota nuova       [2027-07-01, infinity)
```

Nel DDL verranno valutate colonne `daterange` generate o range espliciti e `EXCLUDE USING gist`, con estensione `btree_gist` se necessaria.

### 25.2 Assetto proprietario

Le Quote non si modificano liberamente riga per riga. La RPC `replace_property_ownership_structure`:

1. riceve l'intero nuovo assetto;
2. verifica autorizzazione;
3. controlla somma = 100%;
4. controlla percentuali positive e Owner distinti;
5. chiude l'assetto precedente alla nuova decorrenza;
6. inserisce tutte le nuove Quote;
7. lascia intatte competenze economiche consolidate;
8. scrive evento audit.

## 26. Vincoli cross-table obbligatori

I seguenti vincoli devono essere applicati da FK composite, trigger constraint o RPC transazionali:

1. `expenses.rentable_space_id`, se valorizzato, appartiene a `expenses.property_id`.
2. Ogni `contract_rentable_spaces.rentable_space_id` appartiene a `contracts.property_id`.
3. Ogni `rent_installments.contract_term_id` appartiene allo stesso `contract_id`.
4. Un'allocazione collega RECEIPT e RENT_INSTALLMENT dello stesso Immobile.
5. `documents.current_version_id` appartiene allo stesso Documento; FK differibile oppure valorizzazione successiva alla prima versione.
6. `owner_settlement_items.creditor_owner_id <> debtor_owner_id` e `amount > 0`.
7. Somma allocazioni valide di un Incasso non supera l'importo dell'Incasso.
8. Somma allocata a un Canone non supera il Residuo, salvo futura gestione esplicita sovrappagamenti.
9. Somma componenti Canone, se presenti, coincide con `amount_due` oppure è validata come breakdown informativo secondo decisione definitiva DDL.
10. Somma competenze Spesa coincide con `total_amount`.
11. Una Porzione inattiva/non disponibile non viene inclusa in una nuova attivazione Contratto.
12. Un Contratto `ACTIVE/IN_PROGRESS` ha almeno un Locatario corrente e un solo Term valido alla data.

## 27. Stati persistiti e stati derivati

Per evitare disallineamenti temporali:

### Persistiti

- Canone: `CREATED`, `PAID`, `LOST`, `NOT_DUE`, `CANCELLED` più dati economici autorevoli;
- Scadenza: `TODO`, `COMPLETED`, `CANCELLED`;
- stati terminali e azioni manuali.

### Derivati nelle viste

- Canone `PARTIAL`: `amount_received > 0 AND active_residual > 0` prima della scadenza;
- Canone `OVERDUE`: scadenza superata e `active_residual > 0`;
- Scadenza `DUE_SOON`: nella finestra configurata;
- Scadenza `OVERDUE`: data superata e non completata/annullata;
- Porzione `RENTED/FREE`: presenza/assenza di Contratto attivo nell'intervallo.

Le viste `v_rent_installment_balance`, `v_deadline_status` e `v_rentable_space_availability` sono fonti per la UI. Gli stati derivati non richiedono job giornalieri per restare aggiornati.

## 28. Viste, RPC e sicurezza

- Le viste esposte devono usare comportamento `security_invoker` quando disponibile/configurato e devono essere testate con RLS.
- Se una vista non garantisce l'isolamento richiesto, non viene esposta e viene sostituita da RPC sicura.
- Nessuna materialized view contenente dati multi-tenant viene esposta direttamente senza strategia esplicita di isolamento.
- Le funzioni RPC ritornano solo colonne necessarie e riapplicano il perimetro.

## 29. Indici per RLS e vincoli

Oltre agli indici già previsti:

```text
user_owner_accesses(user_id, status, valid_from, valid_to, owner_id)
property_ownerships(owner_id, property_id, valid_from, valid_to)
property_ownerships(property_id, valid_from, valid_to)
contract_rentable_spaces(rentable_space_id, contract_id)
contract_tenants(contract_id, valid_from, valid_to)
contract_terms(contract_id, valid_from, valid_to)
receipt_allocations(receipt_id)
receipt_allocations(rent_installment_id)
```

Tutte le FK hanno indice sul lato figlio, salvo evidenza contraria. Le query delle policy RLS saranno verificate con `EXPLAIN` su volumi sintetici rappresentativi.

## 30. Test di sicurezza e integrità obbligatori

### RLS negativi

- User A non legge/modifica Owner, Immobili, Contratti, Canoni, Spese o Documenti di User B.
- Viewer legge ma non modifica.
- Manager non concede accesso oltre il proprio perimetro.
- Utente rimosso da un Owner perde immediatamente gli Immobili raggiungibili solo tramite quell'Owner.
- `anon` non accede a dati patrimoniali.

### Storage negativi

- upload con `document_id` non prenotato: negato;
- upload su Documento fuori perimetro: negato;
- overwrite della versione: negato;
- download di versione non `AVAILABLE/CLEAN`: negato;
- signed URL non generato per Utente privo di accesso;
- revoca accesso prima del download: nuova richiesta negata.

### Integrità

- Quote diverse da 100%: transazione rigettata;
- overlap Contratti/Porzioni: rigettato;
- allocazione oltre Residuo: rigettata;
- competenze Spesa non quadrate: rigettate;
- retry di attivazione/generazione Canoni: nessun duplicato;
- cessazione: Canoni futuri non maturati annullati, crediti maturati preservati.

## 31. Piano migration aggiornato

```text
001_extensions.sql
002_security_schema_and_helpers.sql
003_profiles_and_grants.sql
004_privacy_and_invitations.sql
005_properties_and_ownership.sql
006_tenants_and_contracts.sql
007_rent_installments_and_receipts.sql
008_expenses_and_settlements.sql
009_documents.sql
010_deadlines_notifications_i18n.sql
011_audit.sql
012_cross_table_constraints.sql
013_transactional_rpcs.sql
014_views.sql
015_rls_policies.sql
016_storage_bucket_and_policies.sql
017_seed_reference_data.sql
018_rls_and_integrity_tests.sql
```

## 32. Decisioni ancora da approvare prima del DDL

1. Limite dimensione file e MIME definitivi.
2. Servizio/processo per malware scanning.
3. Durata signed URL.
4. Rolling horizon Canoni.
5. Retention di audit, oggetti orfani e documenti rifiutati.
6. Uso effettivo di `citext` e `btree_gist` nel progetto Supabase.
7. MFA opzionale oppure obbligatoria per Administrator.
8. Gestione futura dei sovrappagamenti.

Queste decisioni non modificano le entità principali, ma influenzano migration e architettura operativa.

## 33. Esito della revisione v1.1

| Ambito | Esito |
|---|---|
| Supabase Auth / profiles | Corretto |
| GRANT/REVOKE | Definito |
| RLS | Definita per famiglie e ruoli |
| Helper di sicurezza | Definiti nello schema non esposto `security` |
| RPC atomiche | Identificate |
| Storage privato | Flusso completo reserve/upload/finalize/scan |
| Vincoli temporali | Convenzione semiaperta definita |
| Quote 100% | RPC transazionale definita |
| Vincoli cross-table | Elencati |
| Stati temporali | Resi derivati |
| Viste | Strategia di sicurezza definita |
| Test RLS/Storage | Casi obbligatori definiti |

**Modello Dati Fisico Supabase v1.1: pronto per la produzione delle migration SQL, previo completamento delle decisioni operative del paragrafo 32.**


---

## 34. Generazione progressiva dei Canoni

Questa sezione sostituisce qualsiasi precedente ipotesi di generazione completa fino alla fine del Contratto.

### 34.1 Colonne fisiche aggiuntive

`contract_terms` aggiunge:

```sql
first_billing_period_start date not null,
billing_interval integer null,
constraint contract_terms_billing_interval_ck
  check (
    (billing_frequency <> 'CUSTOM' and billing_interval is null)
    or
    (billing_frequency = 'CUSTOM' and billing_interval > 0)
  )
```

Vincolo applicativo/RPC: `first_billing_period_start >= contracts.start_date` per l'MVP senza prorata.

### 34.2 Tabella `billing_generation_runs`

```text
id                     uuid PK default gen_random_uuid()
started_at             timestamptz NOT NULL default now()
completed_at           timestamptz NULL
reference_date         date NOT NULL
status                 text NOT NULL -- RUNNING|COMPLETED|FAILED
periods_checked        integer NOT NULL default 0
installments_created   integer NOT NULL default 0
error_summary          text NULL
correlation_id         uuid NOT NULL
```

Accesso diretto client negato. Scrittura e lettura operativa solo backend/job controllato.

### 34.3 Funzione di generazione

RPC/job server-side:

```text
generate_due_installments(p_reference_date date default current_date)
```

Algoritmo normativo:

1. seleziona Contratti `ACTIVE` con un `CONTRACT_TERM` valido;
2. determina tutti i periodi attesi a partire da `first_billing_period_start` e non successivi a `p_reference_date`;
3. esclude periodi che iniziano dopo la cessazione effettiva;
4. per ogni periodo mancante individua il Term valido a `period_start`;
5. calcola `period_end` secondo periodicità;
6. calcola `due_date` separatamente usando `due_day`;
7. inserisce il Canone con `ON CONFLICT DO NOTHING` sul vincolo funzionale;
8. registra conteggi/esito in `billing_generation_runs` e audit.

Il job può essere eseguito giornalmente. Non richiede esecuzione esatta il primo del mese: recupera tutti i periodi maturati e mancanti.

### 34.4 Vincoli e indici

```sql
unique (contract_id, period_start, period_end)
```

Indici:

```text
contract_terms(contract_id, first_billing_period_start, valid_from, valid_to)
rent_installments(contract_id, period_start, period_end)
rent_installments(due_date, status)
billing_generation_runs(reference_date, status)
```

Cross-table da validare in RPC/constraint trigger:

- `contract_term_id` appartiene al medesimo `contract_id`;
- il Term è valido al `period_start`;
- il primo periodo è allineato alla periodicità prevista;
- nessun periodo è successivo alla cessazione effettiva.

### 34.5 Scadenza del Canone

La generazione non coincide con la scadenza:

```text
period_start = 01/02/2027
due_day      = 5
due_date     = 05/02/2027
```

Se `due_day` non esiste nel mese, nell'MVP la scadenza è l'ultimo giorno del mese. Questa regola deve essere implementata in un'unica funzione di calcolo e testata per febbraio/anni bisestili.

### 34.6 Variazioni contrattuali

Una nuova condizione economica crea un nuovo `contract_terms` con decorrenza. Poiché i Canoni futuri non sono stati ancora creati, il generatore usa automaticamente il Term valido quando il periodo matura.

I Canoni già generati/consolidati restano invariati, salvo rettifica esplicita e auditata.

### 34.7 Cessazione

`terminate_contract(...)` deve:

1. impostare la data effettiva di cessazione;
2. impedire generazioni con `period_start` successivo;
3. portare a `NOT_DUE` i Canoni già generati che iniziano dopo la cessazione;
4. preservare Canoni maturati, Incassi e crediti aperti.

### 34.8 RLS e privilegi

- `billing_generation_runs`: nessun privilegio ad `anon` o `authenticated`.
- `generate_due_installments`: nessun `EXECUTE` al client mobile; invocazione esclusivamente da job/backend con credenziali server protette.
- Il client può leggere i Canoni soltanto tramite le normali policy RLS basate sul perimetro Property.

### 34.9 Scheduling Supabase

Il meccanismo concreto di pianificazione sarà scelto nell'architettura tecnica. Requisito del modello fisico: il job deve poter invocare quotidianamente la funzione server-side e poter essere rilanciato senza produrre duplicati.

### 34.10 Test obbligatori

- mensile: generazione il primo giorno;
- job eseguito il giorno 2: recupera il Canone mancante;
- doppia esecuzione: un solo Canone;
- trimestrale/semestrale/annuale;
- variazione Canone con decorrenza sul nuovo periodo;
- cessazione prima di un periodo futuro;
- cessazione retroattiva: Canone già creato → `NOT_DUE`;
- due job concorrenti: nessun duplicato;
- `due_day` 29/30/31 su mesi più corti;
- assenza prorata automatica nel MVP.

## 35. Aggiornamento piano migration (progettuale, superato)

Aggiungere/aggiornare:

```text
006_tenants_and_contracts.sql
  - first_billing_period_start
  - billing_interval

007_rent_installments_and_receipts.sql
  - vincolo univoco periodo
  - billing_generation_runs

013_transactional_rpcs.sql
  - generate_due_installments
  - terminate_contract aggiornata

018_rls_and_integrity_tests.sql
  - test generazione progressiva/idempotenza
```

## 36. Esito v1.2

La specifica v1.2 recepisce la generazione progressiva dei Canoni. La corrispondenza con il DDL corrente e le differenze implementative sono descritte nella sezione 37.

## 37. Allineamento as-built alle migration (2026-10-31)

Questa sezione prevale sulle sezioni progettuali precedenti quando descrive il database realmente presente.

### 37.1 Sequenza delle migration presenti

1. `001_extensions.sql`
2. `002_profiles_privacy_access.sql`
3. `003_properties_contracts.sql`
4. `004_economics.sql`
5. `005_documents_deadlines_audit.sql`
6. `006_document_bridges.sql`
7. `007_security_helpers.sql`
8. `008_views_and_billing.sql`
9. `009_rpc_core.sql`
10. `010_rls.sql`
11. `011_storage.sql`
12. `20261025000100_record_partial_installment_payment.sql`
13. `20261025000200_terminate_contract.sql`
14. `20261025000300_create_expense_with_allocations.sql`
15. `20261025000400_document_rpcs_and_rls.sql`
16. `20261025091342_enable_rls_remaining_tables.sql`
17. `20261025125839_fix_terminate_contract_digest.sql`

Le migration vanno applicate in ordine lessicografico tramite Supabase CLI. Le migration timestampate sono già incluse nel set, non un backlog futuro.

### 37.2 Funzioni e view presenti

- Funzioni di supporto: `set_updated_at`, `calculate_due_date`, `security.role_rank`, `security.can_access_owner`, `security.can_access_property`, `security.can_access_contract`, `security.can_access_installment`, `security.can_access_expense`, `security.can_access_document`.
- Billing: `v_rent_installment_balance`, `generate_due_installments`.
- Pagamenti: `mark_installment_paid`, `record_partial_installment_payment`.
- Contratti: `terminate_contract`.
- Spese: `create_expense_with_allocations`.
- Documenti: `reserve_document_upload`, `finalize_document_upload`, `complete_document_scan`, `authorize_document_download`; la Edge Function `create-document-download-url` crea la signed URL dopo l'autorizzazione.

Non risultano implementate nel set di migration altre RPC elencate nella specifica target, incluse gestione inviti/accessi completa, attivazione/variazione contratti, perdita canone, ciclo completo pagamenti/riallocazione/annullamento spese e gestione completa scadenze/privacy.

### 37.3 Differenze fisiche da tenere presenti

- `profiles.primary_email` non è presente; l'identità/e-mail è gestita da Supabase Auth.
- `document_versions` usa `reserved_by_user_id`, `reserved_at`, `finalized_at`, `uploaded_at`, `upload_status` e `malware_scan_status`; non ha `uploaded_by_user_id`.
- Non sono presenti `user_notification_preferences`, `message_templates` o `message_template_translations`.
- Il database abilita RLS sulle tabelle applicative tramite le migration base e successive, ma le policy esplicite coprono solo una parte delle tabelle. Tabelle senza policy applicabile restano non leggibili/modificabili dal client autenticato; non assumere che la matrice target della sezione 22 sia interamente operativa.
- Le migration non applicano `FORCE ROW LEVEL SECURITY`; la protezione effettiva dipende inoltre dai privilegi del ruolo database e dai percorsi server-side.
- La policy Storage implementata autorizza l'`INSERT` dell'oggetto prenotato dall'utente registrato nella versione. Il `SELECT` diretto non è previsto: il download usa la Edge Function e la RPC autorizzativa.
- Il bucket `property-documents` è privato, limita upload a PDF/JPEG/PNG e imposta un massimo di 20 MiB nelle migration. La scansione automatica non è fornita dal DDL.
- Il modello contiene regole cross-table progettuali che non sono tutte enforce-ate da FK/constraint nel database: verificare specificamente quote al 100%, overlap, coerenza delle allocazioni e limiti di accesso.

### 37.4 Stato di validazione

Sono presenti test SQL ed e2e; non si deve dedurre dalla loro presenza che siano stati tutti eseguiti con esito positivo. La produzione richiede validazione sull'ambiente target, integrazione dei componenti esterni e revisione finale di sicurezza/prestazioni.
