# GestioneImmobili
## Entity Relationship Diagram

**Versione:** 1.2  
**Derivato da:** Modello Dati Logico v1.3

## 1. Dominio Contratti e generazione Canoni
```mermaid
erDiagram
  CONTRACT ||--o{ CONTRACT_TERM : terms
  CONTRACT ||--o{ RENT_INSTALLMENT : generates_progressively
  CONTRACT_TERM ||--o{ RENT_INSTALLMENT : determines
  BILLING_GENERATION_RUN ||--o{ AUDIT_EVENT : correlates

  CONTRACT {
    uuid id PK
    date start_date
    date end_date
    datetime ended_at
    string management_status
    string lifecycle_status
  }
  CONTRACT_TERM {
    uuid id PK
    uuid contract_id FK
    date valid_from
    date valid_to
    decimal base_rent_amount
    string billing_frequency
    int billing_interval
    date first_billing_period_start
    int due_day
  }
  RENT_INSTALLMENT {
    uuid id PK
    uuid contract_id FK
    uuid contract_term_id FK
    date period_start
    date period_end
    date due_date
    decimal amount_due
    string status
    datetime generated_at
  }
  BILLING_GENERATION_RUN {
    uuid id PK
    datetime started_at
    datetime completed_at
    date reference_date
    string status
    int periods_checked
    int installments_created
    string correlation_id
  }
```

## 2. Vincoli
- `CONTRACT_TERM.first_billing_period_start` obbligatorio per un Contratto attivabile.
- `first_billing_period_start >= CONTRACT.start_date` nell'MVP senza prorata.
- Un solo `CONTRACT_TERM` valido a una data.
- UNIQUE `(contract_id, period_start, period_end)`.
- Il `contract_term_id` del Canone appartiene al medesimo Contratto.
- Nessun Canone con `period_start` successivo alla cessazione effettiva.
- Il generatore recupera periodi mancanti e non dipende dall'esecuzione esatta nel primo giorno.

## 3. Esempio mensile
```text
Contratto decorre: 15/01/2027
Prima mensilità:   01/02/2027
Periodicità:       MONTHLY
Due day:           5

Canone Febbraio:
period_start       01/02/2027
period_end         28/02/2027
due_date           05/02/2027
generated_at       01/02/2027 o al primo recupero successivo
```

## 4. Coerenza con ERD v1.1
Tutte le altre entità e relazioni dell'ERD v1.1 restano invariate. La v1.2 modifica esclusivamente il sottodominio di generazione Canoni e aggiunge `BILLING_GENERATION_RUN`.
