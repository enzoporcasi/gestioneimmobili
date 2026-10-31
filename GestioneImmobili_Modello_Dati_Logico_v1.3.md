# GestioneImmobili
## Modello Dati Logico

**Versione:** 1.3  
**Derivato da:** Requisiti Funzionali v1.3  
**Allineato con:** ERD v1.2

**Stato:** modello logico con appendice di confronto as-built al 2026-10-31. Il modello descrive il dominio; non tutte le entità o operazioni funzionali sono già implementate.

## 1. Variazione rispetto alla v1.2
La generazione integrale dei Canoni all'attivazione è sostituita dalla generazione progressiva per periodo di competenza.

## 2. Entità interessate

### CONTRACT_TERM
Aggiunge:

```text
first_billing_period_start  date NOT NULL
billing_frequency           MONTHLY|BIMONTHLY|QUARTERLY|SEMIANNUAL|ANNUAL|CUSTOM
billing_interval            integer NULL
base_rent_amount            money NOT NULL
due_day                     smallint NULL
valid_from                  date NOT NULL
valid_to                    date NULL
```

`first_billing_period_start` identifica l'inizio del primo periodo da generare. Per `MONTHLY` rappresenta la prima mensilità.

### RENT_INSTALLMENT
Confermati:

```text
contract_id
contract_term_id
period_start
period_end
due_date
generated_at
amount_due
amount_lost
status
```

Vincolo funzionale univoco `(contract_id, period_start, period_end)`.

### BILLING_GENERATION_RUN
Nuova entità operativa:

```text
id
started_at
completed_at
reference_date
status           RUNNING|COMPLETED|FAILED
periods_checked
installments_created
error_summary
correlation_id
```

Serve per osservabilità e audit del generatore, non determina la correttezza dei Canoni.

## 3. Regole logiche
1. Attivare un Contratto non genera tutte le rate future.
2. Il primo periodo è obbligatorio e non anteriore alla decorrenza contrattuale nell'MVP senza prorata.
3. La successiva data di periodo deriva da periodicità/intervallo.
4. L'importo deriva dal `CONTRACT_TERM` valido a `period_start`.
5. `due_date` è distinta da `period_start`.
6. Il generatore elabora tutti i periodi dovuti fino alla `reference_date`, non soltanto il giorno corrente.
7. Il vincolo univoco impedisce duplicati su retry/concorrenza.
8. Nessun periodo inizia dopo `contracts.ended_at`/data effettiva di cessazione.
9. Periodi già generati e successivamente non dovuti diventano `NOT_DUE`.
10. Canoni consolidati non sono modificati dalle variazioni successive.

## 4. Cardinalità
```text
CONTRACT 1 -> 0..N CONTRACT_TERM
CONTRACT 1 -> 0..N RENT_INSTALLMENT
CONTRACT_TERM 1 -> 0..N RENT_INSTALLMENT
BILLING_GENERATION_RUN 1 -> 0..N eventi di audit/log correlati
```

## 5. Funzioni logiche

```text
calculate_billing_period(term, previous_period?)
generate_due_installments(reference_date)
mark_future_installments_not_due(contract_id, effective_end_date)
```

## 6. Localizzazione
Codici tecnici in inglese. UI italiana:
- `first_billing_period_start` → Prima mensilità, se mensile;
- `first_billing_period_start` → Primo periodo di competenza, negli altri casi.

## 7. Esito
Il Modello Dati Logico v1.3 recepisce la generazione progressiva. La corrispondenza col database implementato e le differenze note sono riportate nell'appendice seguente.

## 8. Confronto con lo schema implementato (2026-10-31)

Le migration Supabase sono la fonte autorevole per lo schema fisico. Il modello logico resta valido come modello di dominio, ma non deve essere interpretato come inventario delle funzionalità già esposte.

| Dominio | Oggetti implementati | Stato rispetto al modello |
|---|---|---|
| Identità e accesso | `profiles`, `owners`, `invitations`, `invitation_owners`, `user_owner_accesses`, documenti/accettazioni legali, richieste interessato | Schema presente; helper e policy soltanto su una parte dei flussi. |
| Patrimonio e locazione | `properties`, `property_ownerships`, `rentable_spaces`, `tenants`, `contracts`, `contract_rentable_spaces`, `contract_tenants`, `contract_terms`, `contract_changes` | Schema presente; diversi vincoli di dominio e operazioni RPC del modello restano da realizzare. |
| Canoni e incassi | `rent_installments`, `rent_installment_components`, `receipts`, `receipt_allocations`, `billing_generation_runs` | Schema, view saldo e funzioni per generazione e registrazione di pagamenti presenti. |
| Spese e conguagli | `expenses`, `expense_allocations`, `expense_payments`, `owner_settlement_items` | Schema presente; RPC presente per creazione con allocazioni e pagamento iniziale, non per l'intero ciclo spesa. |
| Documenti | `documents`, `document_versions` e bridge tipizzati verso le entità | Schema e flusso upload/download parziale presenti; scansione e notifiche operative dipendono da componenti esterni. |
| Scadenze e audit | `deadlines`, `notification_rules`, `notification_deliveries`, `audit_events`, `security_events`, `idempotency_keys` | Schema presente; scheduler/notifiche e tutte le policy operative non sono inclusi. |

### Regole implementate rilevanti
- `contract_terms.first_billing_period_start` è il punto di partenza del generatore progressivo.
- `rent_installments.status` persiste gli stati `CREATED`, `PAID`, `LOST`, `NOT_DUE`, `CANCELLED`; `PARTIAL`, `OVERDUE` e saldo sono calcolati dalla view `v_rent_installment_balance`.
- Gli importi sono rappresentati fisicamente come `numeric(14,2)` e la valuta è limitata a EUR; evitare il tipo generico `money` nella descrizione del modello logico.
- La cessazione anticipata conserva le rate già maturate e può marcare `NOT_DUE` quelle future già create; nuove rate successive alla data effettiva non vengono generate.
- Documenti e versioni hanno stati di prenotazione/finalizzazione/scansione; l'esito `CLEAN` rende la versione disponibile, ma il servizio antivirus è esterno.
- Le tabelle per inviti, privacy e notifiche descrivono dati persistiti; la loro presenza non implica che i flussi applicativi completi siano disponibili.

### Relazioni e integrità da non presumere
La presenza di FK e vincoli locali non equivale all'implementazione di ogni regola cross-table del modello. In particolare, controllo completo della somma quote, sovrapposizione delle locazioni, coerenza di tutte le allocazioni, ciclo di vita completo dei contratti e gestione completa di inviti/notifiche devono essere verificati o completati nelle migration/RPC e nei test.
