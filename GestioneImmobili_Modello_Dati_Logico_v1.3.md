# GestioneImmobili
## Modello Dati Logico

**Versione:** 1.3  
**Derivato da:** Requisiti Funzionali v1.3  
**Allineato con:** ERD v1.2

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
Il Modello Dati Logico v1.3 recepisce la generazione progressiva e resta coerente con Canoni/Incassi, variazioni contrattuali e cessazione.
