# GestioneImmobili
## Specifica RPC, RLS e Storage Security

**Versione:** 1.1  
**Derivato da:** Requisiti Funzionali v1.3, Modello Logico v1.3, ERD v1.2, Modello Fisico Supabase v1.2  
**Target:** Supabase Auth, Database, RPC e Storage

**Stato:** specifica target più ampia delle RPC/policy attualmente implementate. La sezione 17 descrive l'as-built al 2026-10-31 e prevale per le affermazioni sul comportamento disponibile.

---

## 1. Principi
- `auth.uid()` identifica sempre l'attore; mai accettare un actor ID dal client.
- `anon` non accede a dati patrimoniali.
- RLS e GRANT/REVOKE sono entrambi obbligatori.
- Le operazioni multi-tabella passano da RPC atomiche.
- `service_role` esclusivamente server-side.
- Errori tecnici stabili in inglese, localizzati nella UI.
- Audit senza password, token, segreti o contenuti documentali.

## 2. Ruoli
| Ruolo | Rank | Capacità |
|---|---:|---|
| `VIEWER` | 10 | Lettura del perimetro |
| `MANAGER` | 20 | Gestione operativa |
| `ADMINISTRATOR` | 30 | Gestione operativa e accessi |
| Backend | 100 | Job/processi privilegiati controllati |

## 3. Helper dello schema `security`
Schema non esposto a PostgREST:

```text
role_rank(role_code)
can_access_owner(owner_id, required_role)
can_access_property(property_id, required_role)
can_access_contract(contract_id, required_role)
can_access_installment(installment_id, required_role)
can_access_expense(expense_id, required_role)
can_access_document(document_id, required_role)
can_admin_owner_access(owner_id)
```

Se `SECURITY DEFINER`: owner tecnico controllato, `search_path` fisso, oggetti schema-qualified, `EXECUTE` revocato di default. Gli helper restituiscono boolean/rank, non dataset.

## 4. Convenzioni RPC
- Input `p_idempotency_key uuid` per operazioni ripetibili.
- Unica transazione per invocazione.
- Lock espliciti sulle risorse contese.
- Output con `success`, `data`, `correlation_id`.
- Errori: `AUTHENTICATION_REQUIRED`, `ACCESS_DENIED`, `INSUFFICIENT_ROLE`, `ENTITY_NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT`, `STALE_DATA`, `IDEMPOTENCY_CONFLICT`, `INTEGRITY_ERROR`.

## 5. Catalogo RPC

### Accessi (target)
- `create_owner_with_access`: crea Owner e Accesso Administrator all'attore; idempotente; audit.
- `create_invitation`: Administrator; crea Invito e perimetro; vieta Owner fuori scope.
- `accept_invitation`: valida token/e-mail/stato; crea Accessi senza duplicati.
- `revoke_user_owner_access`: chiude l'accesso; preserva almeno un Administrator se necessario.

### Immobili e Quote (target)
- `create_property_with_ownership`: Manager; crea Property e assetto completo al 100%.
- `replace_property_ownership_structure`: lock Property; chiude vecchio assetto e inserisce il nuovo nella stessa transazione.
- `archive_property`: archiviazione logica, nessuna cancellazione storica.

### Contratti
- `create_contract_draft`: crea Bozza, nessun Canone.
- `activate_contract`: valida spazio, Locatari, Term e prima mensilità; nessuna generazione completa.
- `change_contract_terms`: storicizza nuove condizioni.
- `terminate_contract`: termina, libera Porzioni e marca `NOT_DUE` i Canoni futuri già generati.

### Canoni
- `generate_due_installments`: solo backend/job; genera periodi maturati e mancanti.
- `mark_installment_paid`: lock Canone; crea Receipt e Allocation per il residuo.
- `record_partial_installment_payment`: lock, importo >0 e <= residuo.
- `mark_installment_lost`: registra il residuo perso senza Incasso.

### Spese
- `create_expense_with_allocations`: crea Spesa, competenze, eventuale Pagamento e Conguagli.
- `record_expense_payment`: pagamento <= residuo.
- `replace_expense_allocations`: ripartizione manuale motivata e quadrata.
- `cancel_expense`: annullamento logico/auditato.

### Documenti
- `reserve_document_upload`: crea Documento/versione `RESERVED`, ponte tipizzato e path controllato.
- `finalize_document_upload`: verifica oggetto e metadati; stato `PENDING_SCAN`.
- `complete_document_scan`: backend; `CLEAN -> AVAILABLE`, altrimenti rifiutato.
- `create_document_download_url`: autorizza e genera signed URL breve.
- `archive_document`: archiviazione logica.

### Privacy (target)
- `accept_legal_document_version`: append-only e idempotente.
- `create_data_subject_request`: richiesta propria; esecuzione backend auditata.

## 6. Calcolo della scadenza nei mesi corti

### `calculate_due_date`

```text
calculate_due_date(p_period_start date, p_due_day smallint) returns date
```

- `p_due_day` tra 1 e 31.
- La scadenza è nel mese di `p_period_start`.
- Giorno effettivo = `MIN(p_due_day, ultimo_giorno_del_mese)`.
- Funzione `IMMUTABLE`, senza accesso a tabelle.
- Unica implementazione usata da `generate_due_installments`.

| Periodo | due_day | Atteso |
|---|---:|---|
| Febbraio 2027 | 31 | 28/02/2027 |
| Febbraio 2028 | 31 | 29/02/2028 |
| Febbraio 2100 | 31 | 28/02/2100 |
| Febbraio 2000 | 31 | 29/02/2000 |
| Aprile 2027 | 31 | 30/04/2027 |
| Maggio 2027 | 31 | 31/05/2027 |

`period_end` resta la chiusura del periodo contabile; `due_date` non modifica la competenza. Per periodicità plurimensili, la scadenza è riferita al mese iniziale nell'MVP.

## 7. Transazionalità e concorrenza

### Regola generale
Tutte le scritture di una RPC appartengono alla stessa transazione. Qualsiasi eccezione non gestita produce rollback completo. Un exception handler non può restituire successo dopo scritture parziali.

### `mark_installment_paid`

```text
1. verifica MANAGER
2. SELECT Canone FOR UPDATE
3. ricalcola residuo
4. verifica pagabilità
5. riserva idempotency key
6. crea RECEIPT
7. crea RECEIPT_ALLOCATION
8. crea AUDIT_EVENT
9. salva risposta idempotente
10. ritorna
```

Errore ai punti 6-9 → rollback di tutto. Due richieste concorrenti vengono serializzate; la seconda restituisce esito idempotente o `INSTALLMENT_ALREADY_SETTLED`.

### `record_partial_installment_payment`
Usa `FOR UPDATE`; rifiuta importo <=0 o > residuo. Se uguale al residuo, il saldo derivato è Pagato.

### `activate_contract`
- lock Contratto;
- advisory transaction lock deterministico sulla Property;
- verifica/lock Porzioni;
- controllo overlap;
- verifica Locatari/Term/prima mensilità;
- aggiorna stato e audit nella stessa transazione.

L'advisory lock coordina, ma non sostituisce exclusion constraint/vincoli finali.

### `replace_property_ownership_structure`
Lock Property; verifica 100% prima di chiudere l'assetto esistente. Se l'inserimento del nuovo assetto fallisce, quello precedente resta integralmente valido.

### `terminate_contract`
Nella stessa transazione termina Contratto/partecipazioni, marca `NOT_DUE` i Canoni futuri già creati, preserva crediti maturati, libera Porzioni e scrive audit.

## 8. Generazione progressiva Canoni
`generate_due_installments(reference_date)`:
- solo backend;
- elabora tutti i periodi maturati e mancanti;
- usa il Term valido a `period_start`;
- chiama `calculate_due_date`;
- usa UNIQUE `(contract_id, period_start, period_end)` e `ON CONFLICT DO NOTHING`;
- nessun Canone dopo cessazione;
- registra `billing_generation_runs`.

## 9. Matrice RLS
Legenda: `R` lettura, `RPC` modifica controllata, `-` nessun accesso client.

| Famiglia | Viewer | Manager | Administrator | Backend |
|---|---:|---:|---:|---:|
| profiles proprio | RU limitato | RU limitato | RU limitato | CRUD |
| owners | R | R+RPC | R+RPC | CRUD |
| user_owner_accesses | R proprie | R proprie | R+RPC | CRUD |
| invitations | - | - | R+RPC | CRUD |
| properties/ownerships/spaces | R | R+RPC | R+RPC | CRUD |
| tenants | R | R+RPC | R+RPC | CRUD |
| contracts e legami | R | R+RPC | R+RPC | CRUD |
| contract_terms/changes | R | RPC | RPC | CRUD |
| installments/receipts | R | RPC | RPC | CRUD/job |
| expenses e conguagli | R | RPC | RPC | CRUD |
| documents e bridge | R secondo sensibilità | RPC | RPC | CRUD |
| deadlines | R | R+RPC | R+RPC | CRUD/job |
| legal acceptances proprie | R+RPC | R+RPC | R+RPC | R |
| audit/security/billing runs | - | - | - | IR |

Nessun DELETE fisico dal client.

## 10. Storage RLS
Bucket privato `property-documents`.

- INSERT solo per path prenotato da una versione `RESERVED`, stesso `auth.uid()`, prenotazione valida e ruolo Manager corrente.
- SELECT diretto non generalizzato; download preferito via signed URL dopo `can_access_document`.
- UPDATE/upsert negato.
- DELETE client negato.
- Download solo versione `AVAILABLE` e scan `CLEAN`.
- Autorizzazione rivalutata al download, non basata sul solo uploader.

## 11. GRANT/REVOKE

```text
REVOKE ALL tabelle public da anon/authenticated
REVOKE EXECUTE funzioni da PUBLIC/anon/authenticated
GRANT SELECT solo alle tabelle leggibili
GRANT UPDATE solo ai campi profilo consentiti
GRANT EXECUTE solo sulle RPC client previste
Nessun grant client su audit/security/billing runs
```

## 12. Idempotenza
Tabella `idempotency_keys` con:

```text
user_id, operation_name, idempotency_key, request_hash,
response_payload, status, created_at, expires_at
UNIQUE(user_id, operation_name, idempotency_key)
```

Stessa chiave + hash differente → `IDEMPOTENCY_CONFLICT`; completata + stesso hash → risposta precedente.

## 13. Performance RLS

### Helper con `EXISTS`
Gli helper usano `EXISTS (SELECT 1 ...)`, non array/lista completa di ID. Dipendenza unidirezionale: Owner → Property → Contract → Installment/Expense/Document.

Pattern:

```sql
exists (
 select 1
 from public.user_owner_accesses uoa
 join public.property_ownerships po on po.owner_id=uoa.owner_id
 where uoa.user_id=(select auth.uid())
   and uoa.status='ACTIVE'
   and current_date>=uoa.valid_from
   and (uoa.valid_to is null or current_date<uoa.valid_to)
   and po.property_id=p_property_id
   and current_date>=po.valid_from
   and (po.valid_to is null or current_date<po.valid_to)
   and security.role_rank(uoa.role)>=security.role_rank(p_required_role)
)
```

### Indici obbligatori

```text
user_owner_accesses(user_id,status,owner_id,valid_from,valid_to)
property_ownerships(owner_id,property_id,valid_from,valid_to)
property_ownerships(property_id,owner_id,valid_from,valid_to)
contracts(property_id,id)
rent_installments(contract_id,id)
expenses(property_id,id)
contract_rentable_spaces(rentable_space_id,contract_id)
```

Tutte le FK usate nelle policy hanno indice lato figlio salvo prova contraria.

### Piano prestazionale
Prima del go-live eseguire `EXPLAIN (ANALYZE, BUFFERS)` su:
- Immobili visibili;
- Canoni periodo/In ritardo;
- Spese;
- Dashboard;
- Documenti/Storage;
- Contratti/Locatari.

Dataset sintetico progettuale: 100 Utenti, 500 Proprietari, 1.000 Immobili, 3.000 Porzioni, 2.000 Contratti, 50.000 Canoni, 20.000 Incassi, 20.000 Spese, 25.000 Documenti/versioni.

Criteri: nessuna ricorsione, nessuna materializzazione di tutti gli ID, uso degli indici nei piani, isolamento corretto prima dell'ottimizzazione.

## 14. Test obbligatori

### Mese corto
Casi 28/29 febbraio, anni 2000/2100, aprile 30, mesi 31.

### Rollback/concorrenza
- errore tra Receipt e Allocation → nessun residuo parziale;
- due saldi concorrenti → uno solo;
- doppia attivazione stessa Porzione → una sola;
- due cambi Quote → uno solo;
- cessazione vs generazione → nessun Canone successivo valido.

### RLS
- anon isolato;
- User A non vede User B;
- Viewer non modifica;
- Manager non delega fuori scope;
- revoca accesso immediatamente efficace;
- helper senza ricorsione.

### Storage
- path non prenotato negato;
- upload fuori scope negato;
- overwrite negato;
- download non CLEAN negato;
- download dopo revoca negato.

## 15. Audit minimo
- Accessi: grant/revoke/Inviti.
- Property: creazione/cambio Quote.
- Contratti: attivazione/term/cessazione.
- Canoni: generazione/pagato/parziale/perso.
- Spese: creazione/pagamento/riallocazione/annullamento.
- Documenti: reserve/available/archive/malware.
- Privacy: accettazione versione/richiesta interessato.

## 16. Esito della specifica
La v1.1 definisce il comportamento target per RPC, RLS, Storage, atomicità e test. Non è un inventario delle funzioni o policy già consegnate; la sezione 17 fornisce il confronto con le migration correnti.

## 17. Stato implementato nel repository (2026-10-31)

### 17.1 RPC e helper presenti

| Funzione | Stato / note |
|---|---|
| `calculate_due_date` | Implementata; gestisce il limite del giorno nei mesi corti. |
| `create_owner_with_access` | Implementata; crea Owner persona fisica/giuridica e Accesso Administrator per l'attore nella stessa transazione; normalizza i dati, rifiuta codice fiscale/partita IVA duplicati e scrive audit. |
| `list_manageable_owners` | Implementata; restituisce solo Proprietari attivi nel perimetro Manager dell'attore autenticato. |
| `create_property_with_ownership` | Implementata; crea Property e quote atomiche, verifica input, accesso Manager a ogni Owner e totale quote pari al 100%; audit. |
| `update_property_details` | Implementata; aggiorna i dati descrittivi e catastali per utenti Manager sulla Property; audit. Quote e Proprietari non sono modificabili con questa RPC. |
| `security.role_rank`, `can_access_owner`, `can_access_property`, `can_access_contract`, `can_access_installment`, `can_access_expense` | Implementati in `security`. |
| `generate_due_installments` | Implementata per generazione progressiva; crea un record `billing_generation_runs`. |
| `mark_installment_paid` | Implementata; registra un incasso per il residuo e lo alloca alla rata. |
| `record_partial_installment_payment` | Implementata; valida l'importo rispetto al residuo e registra incasso/allocazione/audit in transazione. |
| `terminate_contract` | Implementata; chiude contratto/locatari e marca `NOT_DUE` le rate future già generate secondo le regole SQL. |
| `create_expense_with_allocations` | Implementata per creazione spesa, ripartizioni e pagamento iniziale opzionale. |
| `security.can_access_document` | Implementata usando collegamenti documentali supportati. |
| `reserve_document_upload`, `finalize_document_upload` | Implementate per prenotazione e finalizzazione upload. |
| `complete_document_scan` | Implementata come passaggio backend; non eseguibile dal ruolo `authenticated`. Il servizio di scansione effettivo è esterno. |
| `authorize_document_download` | Implementata; autorizza una versione `AVAILABLE` e `CLEAN` e restituisce i metadati per la signed URL. |
| Edge Function `create-document-download-url` | Implementata; verifica il chiamante, invoca la RPC autorizzativa e usa la chiave privilegiata solo per creare la signed URL. |

Non risultano presenti RPC per gestione inviti/accessi, modifica/archiviazione Owner, sostituzione delle quote di una proprietà già creata, archiviazione proprietà, attivazione/variazione/estensione contratto, `mark_installment_lost`, gestione completa dei pagamenti/ripartizioni/annullamento spese, archiviazione documento, accettazioni legali o workflow DSR.

### 17.2 RLS e GRANT effettivi

- RLS è abilitata sulle tabelle applicative tramite le migration base, documentali e successive.
- Le policy esplicite non coprono tutte le tabelle abilitate: tabelle senza policy permissiva restano inaccessibili tramite le richieste client soggette a RLS. L'abilitazione RLS non equivale alla matrice target della sezione 9.
- Le policy di lettura base riguardano profilo proprio, Proprietari, Immobili, quote, porzioni, Contratti, Canoni, spese, accettazioni legali proprie e richieste interessato proprie. Esistono inoltre policy SELECT per documenti/versioni e relativi bridge supportati.
- L'aggiornamento diretto autenticato è limitato ai campi profilo indicati nei GRANT. Le operazioni di business mutanti disponibili passano dalle RPC con GRANT esplicito.
- La creazione e modifica degli immobili usa le RPC `SECURITY DEFINER` della migration `20261031170000_property_management_rpc.sql`; l'esecuzione è concessa solo a `authenticated`. Non sono concessi INSERT/UPDATE diretti sulle tabelle `properties` e `property_ownerships`.
- La registrazione Owner usa `create_owner_with_access` dalla migration `20261031171300_create_owner_with_access.sql`; il chiamante autenticato attivo riceve `ADMINISTRATOR` solo sul nuovo Owner. La creazione dell'Owner, dell'accesso e dell'audit è atomica; non sono concessi INSERT/UPDATE diretti sulle tabelle `owners` e `user_owner_accesses`.
- La creazione non accetta Owner fuori perimetro o inattivi e valida che le quote attive inserite totalizzino il 100%. Il client può elencare esclusivamente gli Owner attivi sui quali l'utente ha ruolo Manager o Administrator.
- La migration di Storage crea un bucket privato e una policy `INSERT` per oggetti che corrispondono a una versione `RESERVED` prenotata dall'utente autenticato. Non è prevista una policy di SELECT Storage diretta; il download passa dalla Edge Function.
- Le funzioni elencate nella specifica target ma non presenti nelle migration non devono essere considerate callable né sicure per uso applicativo.

### 17.3 Differenze rispetto alla specifica target

- Gli output RPC correnti non seguono uniformemente l'involucro `success/data/correlation_id`: consultare la definizione SQL per il contratto reale di ciascuna funzione.
- `mark_installment_paid` e `record_partial_installment_payment` non accettano una idempotency key; non promettere replay idempotente di queste operazioni.
- `terminate_contract` e `create_expense_with_allocations` supportano idempotenza tramite chiave opzionale; il comportamento effettivo è definito nelle rispettive migration.
- Le RPC immobili attuali non implementano idempotency key né la sostituzione delle quote in una seconda operazione. `update_property_details` non modifica la struttura proprietaria.
- `create_owner_with_access` non implementa idempotency key; email e identificativi fiscali non creano né collegano un account Auth.
- La matrice RLS della sezione 9 è il target desiderato, non la descrizione delle policy effettivamente presenti.
- I casi di concorrenza, rollback, autorizzazione Storage e performance elencati nella sezione 14 sono criteri di verifica; la presenza dei test nel repository non attesta che ogni caso sia già validato nell'ambiente target.
- `supabase/tests/012_property_management_rpc.sql` copre registrazione Owner, accesso del creatore, normalizzazione e duplicati, insieme a accesso per ruolo/perimetro, creazione/modifica immobili e validazione delle quote; le fixture vengono annullate con rollback.

### 17.4 Fonte autorevole e validazione

Per la firma, i privilegi e il comportamento effettivi fare riferimento alle migration in `supabase/migrations/` e alla Edge Function in `supabase/functions/create-document-download-url/`. La specifica target richiede completamento e test delle funzioni/policy mancanti prima di poter dichiarare coperto l'intero perimetro.
