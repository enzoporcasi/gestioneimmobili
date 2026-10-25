# GestioneImmobili - Supabase Migrations v1.0

Pacchetto iniziale derivato da Requisiti v1.3, Modello Logico v1.3, ERD v1.2, Modello Fisico Supabase v1.2 e RPC/RLS v1.1.

## Prerequisiti
- Progetto Supabase locale o remoto.
- Supabase CLI configurata.
- Esecuzione delle migration nell'ordine lessicografico.

## Comandi tipici
```bash
supabase start
supabase db reset
psql "$DATABASE_URL" -f supabase/tests/001_schema_smoke.sql
psql "$DATABASE_URL" -f supabase/tests/002_due_date.sql
```

## Contenuto
- schema e tabelle del core MVP;
- helper di sicurezza e grants baseline;
- RPC principali per Proprietari, Immobili, Contratti, Canoni e pagamenti;
- RLS per perimetro Proprietario/Immobile;
- bucket privato e policy Storage per upload prenotati;
- generazione progressiva dei Canoni;
- test smoke, mese corto, vincoli e isolamento RLS.

## Avvertenze
1. Eseguire prima in ambiente locale.
2. Lo scanner malware, lo scheduler del job Canoni e l'invio e-mail/push richiedono componenti server-side esterni alle sole migration.
3. La service role non deve essere inserita nell'app mobile.
4. I test RLS richiedono utenti Auth di test; vedere `tests/004_rls_isolation.sql`.
5. Prima della produzione completare performance test con `EXPLAIN (ANALYZE, BUFFERS)`.
