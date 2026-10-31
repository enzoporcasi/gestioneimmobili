# GestioneImmobili

## Documento dei Requisiti Funzionali

**Versione:** 1.3  
**Stato:** Baseline funzionale; non rappresenta da sola una dichiarazione di funzionalità già rilasciate.

> **Allineamento al codice (2026-10-31):** questo documento descrive il perimetro funzionale desiderato, inclusi flussi UI e componenti esterni. Lo stato effettivamente implementato nel repository è riepilogato nella sezione 22; tale sezione prevale quando distingue requisiti, schema presente e funzionalità operative. Il repository contiene il livello dati Supabase, non l'app mobile descritta nei wireframe.

---

## 1. Scopo e visione
GestioneImmobili è un'applicazione mobile per la gestione operativa ed economica di patrimoni immobiliari composti principalmente da appartamenti e locali commerciali. L'app consente a ciascun Gestore di amministrare uno o più Proprietari e, in base a tale perimetro, accedere agli immobili posseduti da quei Proprietari.

Il sistema integra anagrafiche, comproprietà, porzioni locabili, locatari, contratti di locazione, generazione canoni, incassi, spese, scadenze, documenti, notifiche e dashboard economiche, con particolare attenzione alla semplicità d'uso da smartphone.

## 2. Principi funzionali
- Il Gestore può creare e amministrare i Proprietari del proprio perimetro.
- La visibilità degli immobili deriva dai Proprietari gestiti dall'utente.
- Un immobile può avere più Proprietari con percentuali di possesso differenti e storicizzabili.
- Un immobile può essere locato interamente oppure per porzioni, ad esempio singole stanze.
- Locatari e Contratti sono entità distinte e la relazione è molti-a-molti: un contratto può avere più Locatari e un Locatario può avere più contratti nel tempo.
- Un contratto attivo genera automaticamente le rate/canoni secondo le proprie condizioni economiche.
- Entrate e uscite sono riconducibili all'immobile e, ove applicabile, a porzione, contratto e Proprietari.
- I documenti sono trasversali e collegabili a immobili, proprietari, locatari, contratti, movimenti e scadenze.
- Le scadenze possono generare notifiche push ed e-mail configurabili.

## 3. Attori e modello di autorizzazione
### Owner / Administrator
Gestisce configurazione generale, utenti, ruoli e tutte le funzioni applicative sul patrimonio autorizzato.

### Gestore / Manager
- Crea e modifica Proprietari.
- Gestisce immobili, porzioni, locatari, contratti, canoni, incassi, spese, scadenze e documenti.
- Vede esclusivamente gli immobili appartenenti ad almeno un Proprietario del proprio perimetro.

### Visualizzatore / Viewer
Consulta dati e documenti senza modificarli, limitatamente ai Proprietari e agli immobili autorizzati.

Ruolo e perimetro sono separati: il ruolo stabilisce **cosa** l'utente può fare; l'associazione Utente-Proprietario stabilisce **su quali dati** può operare.

**RF-AUT-01 - Creazione proprietari.** Un Gestore deve poter creare, modificare e archiviare i Proprietari del proprio perimetro.  
**RF-AUT-02 - Visibilità immobili.** Il Gestore visualizza soltanto gli immobili in cui almeno un Proprietario è associato al suo perimetro.  
**RF-AUT-03 - Condivisione della gestione.** Lo stesso Proprietario può essere gestito da più utenti, eventualmente con ruoli differenti.

## 4. Gestione Proprietari e comproprietà
**RF-PRO-01 - Anagrafica proprietario.** Gestione di persone fisiche e, in prospettiva, persone giuridiche, con dati anagrafici, codice fiscale/partita IVA, recapiti, indirizzo, IBAN, note e documenti.  
**RF-PRO-02 - Quote di proprietà.** Ogni Proprietario può essere associato a uno o più immobili con una percentuale di proprietà.  
**RF-PRO-03 - Controllo quote.** Segnalazione quando la somma delle quote attive non è pari al 100%.  
**RF-PRO-04 - Storicizzazione quote.** Percentuale, decorrenza e data fine opzionale devono essere storicizzate.

## 5. Gestione immobili e porzioni locabili
**RF-IMM-01 - Anagrafica immobile.** Denominazione, tipologia, indirizzo, Comune, provincia, dati catastali, superficie, stato, note e Proprietari/quote.  
**RF-IMM-02 - Tipologie.** Almeno appartamento, locale commerciale, box/posto auto, cantina, magazzino, terreno e altro.  
**RF-IMM-03 - Unità immobiliari.** Il modello deve poter evolvere verso Immobile-Unità immobiliare.  
**RF-IMM-04 - Scheda immobile.** Riepilogo, Proprietari/quote, porzioni, contratti, economia, scadenze e documenti.  
**RF-IMM-05 - Porzioni locabili.** Un immobile può essere suddiviso logicamente in stanze, locali, posti auto o altre porzioni identificabili. Una porzione gestionale non implica una distinta unità catastale e non è obbligatoria quando l'immobile è locato integralmente.  
**RF-IMM-06 - Stato porzione.** Ogni porzione deve poter risultare almeno Libera, Locata o Non disponibile.

## 6. Gestione locatari
**RF-LOC-01 - Anagrafica locatario.** Persone fisiche, persone giuridiche e ditte individuali con recapiti, identificativi fiscali, indirizzo, note e documenti.  
**RF-LOC-02 - Relazioni contrattuali.** Un Locatario può essere associato a più contratti nel tempo e un Contratto può prevedere più Locatari/co-conduttori.  
**RF-LOC-03 - Documenti locatario.** Carta d'identità, codice fiscale, documentazione di garanzia e altri allegati con scadenza opzionale.  
**RF-LOC-04 - Pluralità di locatari.** Un Contratto deve poter essere associato contemporaneamente a uno o più Locatari.  
**RF-LOC-05 - Storico dei locatari contrattuali.** L'associazione Contratto-Locatario deve avere decorrenza e fine opzionale per conservare lo storico delle variazioni dei soggetti contrattuali.

## 7. Gestione contratti di locazione
**RF-CON-01 - Anagrafica contratto.** Il contratto collega immobile/porzione, Proprietari/locatori e uno o più Locatari e contiene decorrenza, scadenze, canone, periodicità, giorno pagamento, deposito cauzionale, regime fiscale, registrazione e note.  
**RF-CON-02 - Tipologia contratto.** Tipologie configurabili: abitativo libero, abitativo concordato, transitorio, studenti, commerciale, comodato e altro.  
**RF-CON-03 - Stato gestionale.** Ogni Contratto deve avere uno stato gestionale **Attivo** o **Inattivo**. Lo stato gestionale è distinto dallo stato del ciclo di vita.  
**RF-CON-03A - Ciclo di vita.** Il sistema può qualificare separatamente il ciclo di vita come Bozza, Da firmare, In corso, In scadenza, Disdetto, Cessato o Risolto anticipatamente.  
**RF-CON-04 - Variazioni.** Storicizzazione di variazioni di canone/condizioni con efficacia, valore precedente, nuovo valore, motivazione e documentazione.  
**RF-CON-05 - Documenti contratto.** Contratto firmato, registrazione, proroghe, risoluzioni, verbali, inventari, deposito cauzionale e altri allegati.  
**RF-CON-06 - Oggetto della locazione.** Il contratto può avere per oggetto l'intero immobile oppure una o più porzioni locabili dello stesso immobile.  
**RF-CON-07 - Contratti contemporanei.** Lo stesso immobile può avere più contratti attivi contemporaneamente se riferiti a porzioni locabili differenti.

## 8. Canoni, rate e incassi
**RF-CAN-01 - Generazione automatica rate.** Le rate vengono generate progressivamente per i periodi maturati in base a decorrenza, termine, importo, periodicità, giorno di pagamento e variazioni programmate; non vengono generate tutte all'attivazione.

**RF-CAN-02 - Stati canone/rata.** Ogni canone/rata deve avere uno stato operativo tra: Creato, Pagato, Parziale, In ritardo, Perso. Lo stato Parziale deve esporre importo incassato e residuo. Lo stato In ritardo identifica un credito ancora aperto oltre la scadenza; Perso identifica un canone definitivamente considerato non recuperabile/non più da incassare.  
**RF-CAN-03 - Pagamenti multipli.** Una rata può essere coperta da più incassi con residuo sempre disponibile.  
**RF-CAN-04 - Pagamento cumulativo.** Un incasso può essere imputato a più rate con tracciabilità dell'importo attribuito.  
**RF-CAN-05 - Componenti economiche.** Distinzione tra canone, oneri accessori e altre componenti.  
**RF-CAN-06 - Aggiornamento canone.** Una variazione incide sulle rate future/non consolidate e non modifica quelle già consolidate.  
**RF-CAN-07 - Soggetto pagatore.** Ogni incasso può indicare il soggetto che ha materialmente pagato senza implicare una suddivisione automatica del canone tra Locatari.  
**RF-CAN-08 - Vista generale Canoni.** Il sistema deve fornire una vista trasversale di tutti i canoni generati dai contratti visibili all'utente, indipendentemente dalla loro periodicità.  
**RF-CAN-09 - Filtri Canoni.** La vista Canoni deve essere filtrabile almeno per periodo, stato, Proprietario, immobile, Contratto e Locatario e offrire accessi rapidi a Tutti, Da incassare e In ritardo.  
**RF-CAN-10 - Riepilogo Canoni.** Per il periodo selezionato devono essere evidenziati almeno totale previsto, totale pagato e totale ancora da incassare.  
**RF-CAN-11 - Pagamento completo da Canone.** L’azione Pagato crea automaticamente un Incasso pari al residuo del Canone e porta il residuo a zero.  
**RF-CAN-12 - Pagamento parziale da Canone.** L’azione Parziale richiede l’importo incassato e crea automaticamente il relativo Incasso; il sistema aggiorna importo incassato e residuo.  
**RF-CAN-13 - Ritardo automatico.** Superata la data di scadenza, se il residuo è maggiore di zero, il Canone passa automaticamente allo stato In ritardo senza generare Incassi.  
**RF-CAN-14 - Canone perso.** L’azione Perso non genera un Incasso e identifica il residuo come non più recuperabile.

## 9. Entrate, uscite e ripartizioni
**RF-ECO-01 - Movimenti.** Data, importo, categoria, descrizione, modalità, pagatore/beneficiario, stato, immobile e allegati; quando pertinente contratto, rata, porzione e Proprietario.  
**RF-ECO-02 - Entrate.** Canone, oneri accessori, deposito cauzionale, rimborso spese, indennità, mora, rimborso assicurativo, altra entrata.  
**RF-ECO-03 - Uscite.** Manutenzione ordinaria/straordinaria, condominio, utenze, imposte e tributi, assicurazione, professionisti, agenzia, costi bancari, arredi, altra spesa.  
**RF-ECO-04 - Ripartizione teorica.** Ripartizione predefinita secondo le quote di proprietà valide alla data del movimento.  
**RF-ECO-05 - Pagamento effettivo.** Distinzione tra quota economica teorica e soggetto che ha materialmente sostenuto/incassato la somma, consentendo conguagli.  
**RF-ECO-06 - Ambito movimento.** Un'entrata o spesa può riguardare l'intero immobile o una specifica porzione. Nella v1.0 le spese comuni restano attribuite all'immobile senza ripartizione automatica tra porzioni.

## 10. Scadenze
**RF-SCA-01 - Automatiche e manuali.** Scadenze generate da contratti/documenti o inserite manualmente.  
**RF-SCA-02 - Categorie.** Contrattuali, amministrative/fiscali, assicurative e tecniche/manutentive.  
**RF-SCA-03 - Attributi.** Tipologia, data, priorità, ricorrenza, elemento collegato, responsabile, promemoria, documento e stato.  
**RF-SCA-04 - Stati.** Da fare, In scadenza, Completata, Scaduta e Annullata.

## 11. Notifiche
**RF-NOT-01 - Canali.** Push ed e-mail.  
**RF-NOT-02 - Regole configurabili.** Uno o più promemoria configurabili rispetto alla data.  
**RF-NOT-03 - Eventi.** Rate, mancati incassi, scadenza/rinnovo contratto, disdetta, variazione canone, scadenza documenti, spese e manutenzioni.  
**RF-NOT-04 - Deep link.** La push apre direttamente l'elemento che ha generato l'avviso.

## 12. Gestione documentale
Il sistema documentale è unico e trasversale. Un singolo file può essere collegato a più oggetti senza duplicazione fisica.

**RF-DOC-01 - Caricamento.** Selezione file o acquisizione tramite fotocamera/scansione da smartphone.  
**RF-DOC-02 - Metadati.** Nome, categoria, descrizione, tipo file, data documento, scadenza opzionale, note, data caricamento e autore del caricamento.  
**RF-DOC-03 - Associazioni.** Proprietario, Immobile, Locatario, Contratto, Spesa, Incasso e Scadenza; sono ammesse associazioni multiple.  
**RF-DOC-04 - Scadenza documento.** Una scadenza documentale può generare una Scadenza con notifiche.  
**RF-DOC-05 - Versioni.** Versionamento logico mantenendo la tracciabilità del documento precedente.

Esempi: Immobile (visura, planimetria, APE, assicurazione); Locatario (carta d'identità, codice fiscale, garanzie); Contratto (contratto firmato, registrazione, proroga, risoluzione, verbale, inventario).

## 13. Dashboard e controllo economico
**RF-DAS-01 - Dashboard generale.** Canoni previsti/incassati/da incassare, spese, saldo gestionale, anomalie e prossime scadenze.  
**RF-DAS-02 - Filtri.** Proprietario, città, immobile e periodo.  
**RF-DAS-03 - Scheda economica immobile.** Ricavi, spese, canoni previsti/incassati, crediti e risultato netto gestionale.  
**RF-DAS-04 - Ripartizione Proprietari.** Quote economiche e disallineamenti tra competenza e pagamento/incasso effettivo.  
**RF-DAS-05 - Esportazione.** CSV o Excel.

## 14. Regole di business principali
- **RB-01:** un utente vede un immobile solo se gestisce almeno uno dei Proprietari associati.
- **RB-02:** le percentuali di proprietà appartengono alla relazione Proprietario-Immobile e sono storicizzabili.
- **RB-03:** l'attivazione di un contratto non genera tutte le rate future; la generazione è progressiva secondo le regole RF-CAN-15–RF-CAN-19.
- **RB-04:** le rate consolidate non sono modificate retroattivamente da successive variazioni di canone.
- **RB-05:** il residuo di una rata è l'importo dovuto meno gli incassi imputati.
- **RB-06:** entrate e uscite sono ripartite di default secondo le quote valide, salvo eccezione.
- **RB-07:** quota economica e soggetto che materialmente paga/incassa sono distinti.
- **RB-08:** un documento può essere collegato a più entità senza duplicazione del file.
- **RB-09:** una scadenza documentale può alimentare Scadenze e Notifiche.
- **RB-10:** un contratto può riferirsi all'intero immobile oppure a una o più porzioni locabili.
- **RB-11:** più contratti possono coesistere sullo stesso immobile quando insistono su porzioni differenti.
- **RB-12:** la suddivisione in porzioni non è obbligatoria per immobili locati integralmente.
- **RB-13:** un movimento può essere attribuito all'immobile o a una porzione; nella v1.0 le spese comuni non sono ripartite automaticamente tra porzioni.
- **RB-14:** un contratto può avere più Locatari contemporaneamente e l'associazione deve mantenere lo storico.
- **RB-15:** lo stato gestionale Attivo/Inattivo del contratto è indipendente dal suo ciclo di vita.
- **RB-16:** la periodicità del canone deriva dal Contratto e la vista generale Canoni deve aggregare rate con periodicità differenti.
- **RB-17:** In ritardo rappresenta un credito scaduto ancora aperto; Perso rappresenta un credito che non si prevede più di incassare; Parziale mantiene evidenza del residuo.
- **RB-18:** l’azione Pagato sul Canone genera automaticamente un Incasso per il residuo dovuto.
- **RB-19:** l’azione Parziale sul Canone richiede l’importo e genera il relativo Incasso.
- **RB-20:** superata la scadenza, un Canone con residuo maggiore di zero passa automaticamente a In ritardo.
- **RB-21:** lo stato Perso non genera Incassi.

## 15. Navigazione mobile proposta
La navigazione principale prevede:
- **Home** - dashboard economica, anomalie e prossime scadenze.
- **Immobili** - elenco degli immobili visibili e dettaglio.
- **Canoni** - vista trasversale dei canoni/rate di tutti i contratti, con periodicità, importi, residui e stato.
- **Scadenze** - calendario/elenco delle attività.
- **Altro** - Contratti, Proprietari, Locatari, Documenti, Impostazioni e accessi.

Scheda Immobile: `Riepilogo | Contratti | Economia | Scadenze | Documenti`  
Scheda Locatario: `Anagrafica | Contratti | Documenti`  
Scheda Contratto: `Riepilogo | Canoni | Pagamenti | Scadenze | Documenti`

## 16. Wireframe funzionale di dettaglio
I wireframe seguenti definiscono gerarchia delle informazioni e azioni principali, non lo stile grafico definitivo.

### 16.1 Home / Dashboard
```text
┌────────────────────────────────┐
│ GestioneImmobili       [Profilo]│
│ [Tutti i proprietari ▼]        │
│ [Periodo: mese corrente ▼]     │
├────────────────────────────────┤
│ PATRIMONIO                     │
│ 8 immobili   6 locati   2 liberi│
├────────────────────────────────┤
│ ECONOMIA                       │
│ Previsto          € 5.200      │
│ Incassato         € 4.200      │
│ Da incassare      € 1.000      │
│ Spese               € 750      │
│ Saldo gestionale  € 3.450      │
├────────────────────────────────┤
│ ATTENZIONE                     │
│ ⚠ 2 canoni scaduti             │
│ ◷ 3 scadenze prossime          │
│ ◷ 1 contratto in scadenza      │
├────────────────────────────────┤
│ Home  Immobili  Canoni  Scad. │
└────────────────────────────────┘
```
Azioni: filtro per Proprietario/periodo; apertura elenco anomalie; accesso rapido a immobile, contratto, rata o scadenza.

### 16.2 Elenco Immobili
```text
┌────────────────────────────────┐
│ Immobili                 [+]   │
│ [Cerca...]  [Roma ▼] [Filtri] │
├────────────────────────────────┤
│ Via Verdi 15 - Roma            │
│ Appartamento • 3 porzioni      │
│ 2 locate • 1 libera            │
│ Canoni mese € 1.050            │
├────────────────────────────────┤
│ Via Roma 20 - Palermo          │
│ Locale commerciale • Locato   │
│ Canone mese € 900              │
└────────────────────────────────┘
```
Azioni: nuovo immobile, ricerca, filtri, apertura scheda.

### 16.3 Nuovo / modifica Immobile
```text
┌────────────────────────────────┐
│ Nuovo immobile                 │
├────────────────────────────────┤
│ Denominazione [_____________]  │
│ Tipologia     [Appartamento ▼] │
│ Indirizzo     [_____________]  │
│ Città         [_____________]  │
│ Superficie    [____] mq        │
│ Dati catastali [____________]  │
├────────────────────────────────┤
│ PROPRIETARI                    │
│ Enzo                  50%      │
│ Sorella                50%      │
│ [+ Aggiungi proprietario]      │
├────────────────────────────────┤
│ [Annulla]              [Salva] │
└────────────────────────────────┘
```
Validazione: segnalazione della somma quote diversa dal 100%.

### 16.4 Scheda Immobile
```text
┌────────────────────────────────┐
│ Via Verdi 15 - Roma       [⋮]  │
│ Appartamento                    │
│ [Riep][Contr][Econ][Scad][Doc] │
├────────────────────────────────┤
│ Proprietari                    │
│ Enzo 50% • Sorella 50%         │
├────────────────────────────────┤
│ PORZIONI                       │
│ Stanza A     LOCATA            │
│ Stanza B     LOCATA            │
│ Stanza C     LIBERA            │
│ [+ Aggiungi porzione]          │
├────────────────────────────────┤
│ Canoni mese           € 1.050  │
│ Da incassare            € 500  │
│ Spese anno            € 2.340  │
└────────────────────────────────┘
```
Se non esistono porzioni, la sezione può essere omessa e i contratti possono riferirsi direttamente all'intero immobile.

### 16.5 Scheda Porzione locabile
```text
┌────────────────────────────────┐
│ Stanza A                  [⋮]  │
│ Via Verdi 15 - Roma            │
├────────────────────────────────┤
│ Stato          LOCATA          │
│ Descrizione    Camera grande   │
│ Superficie     18 mq           │
├────────────────────────────────┤
│ CONTRATTO ATTIVO               │
│ Contratto #25                  │
│ € 550 / mese                   │
│ Scadenza 31/08/2027            │
│ [Apri contratto]               │
└────────────────────────────────┘
```

### 16.6 Elenco Contratti
```text
┌────────────────────────────────┐
│ Contratti                [+]   │
│ [Attivi ▼] [Cerca...]          │
├────────────────────────────────┤
│ Via Verdi 15 • Stanza A        │
│ Mario Rossi + 1                │
│ € 550/mese       ATTIVO        │
│ Prossima rata: 05/11           │
├────────────────────────────────┤
│ Via Roma 20 • Intero immobile  │
│ Azienda XYZ                    │
│ € 900/mese       ATTIVO        │
└────────────────────────────────┘
```
Filtri minimi: Attivo/Inattivo, Proprietario, immobile, Locatario.

### 16.7 Creazione Contratto
```text
┌────────────────────────────────┐
│ Nuovo contratto          1/4   │
├────────────────────────────────┤
│ OGGETTO                        │
│ Immobile [Via Verdi 15 ▼]      │
│ (•) Intero immobile            │
│ ( ) Una o più porzioni         │
│     [Stanza A □] [Stanza B □]  │
│                         [Avanti]│
└────────────────────────────────┘

Passo 2 - LOCATARI
[+ Aggiungi/crea locatario]
Mario Rossi       Conduttore
Luca Bianchi      Co-conduttore

Passo 3 - CONDIZIONI
Tipologia [Abitativo libero ▼]
Decorrenza [__/__/____]
Scadenza  [__/__/____]
Canone    [€ ______]
Periodicità [Mensile ▼]
Giorno pagamento [__]
Deposito cauzionale [€ ____]

Passo 4 - RIEPILOGO
Stato gestionale [Attivo ▼]
Documento contratto [Carica]
[Genera anteprima rate]
[Salva e attiva]
```
L'attivazione rende operativo il contratto e genera le rate previste secondo le condizioni impostate.

### 16.8 Scheda Contratto
```text
┌────────────────────────────────┐
│ Contratto #25             [⋮]  │
│ ATTIVO • In corso              │
│ [Riep][Canoni][Pag][Scad][Doc]│
├────────────────────────────────┤
│ Via Verdi 15 • Stanza A        │
│ Locatari                       │
│ • Mario Rossi - Conduttore     │
│ • Luca Bianchi - Co-conduttore │
├────────────────────────────────┤
│ Canone              € 550/mese│
│ Decorrenza          01/09/2026 │
│ Scadenza            31/08/2027 │
│ Deposito                  €550 │
├────────────────────────────────┤
│ Prossima rata                  │
│ 05/11/2026 • €550 • PREVISTA   │
└────────────────────────────────┘
```
Azioni: modifica condizioni, Attivo/Inattivo, gestione Locatari, caricamento documenti, registrazione variazione e cessazione.

### 16.9 Vista generale Canoni
```text
┌─────────────────────────────────────┐
│ Canoni                              │
│ [Ottobre 2026 ▼]          [Filtri] │
│ [Tutti] [Da incassare] [In ritardo]│
├─────────────────────────────────────┤
│ PREVISTO                 € 5.200    │
│ INCASSATO                € 4.000    │
│ RESIDUO                  € 1.200    │
├─────────────────────────────────────┤
│ Via Verdi 15 • Stanza A             │
│ Mario Rossi + 1                     │
│ Mensile • Scadenza 05/10   € 550    │
│ ● PAGATO                   € 550    │
│ [Apri]                              │
├─────────────────────────────────────┤
│ Via Verdi 15 • Stanza B             │
│ Anna Verdi                          │
│ Mensile • Scadenza 05/10   € 500    │
│ ◐ PARZIALE                          │
│ Incassato € 300 • Residuo € 200     │
│ [Pagato] [Parziale] [Perso]         │
├─────────────────────────────────────┤
│ Via Roma 20 • Palermo               │
│ Azienda XYZ                         │
│ Trimestrale • Scad. 01/10  € 900    │
│ ⚠ IN RITARDO • Residuo € 900        │
│ [Pagato] [Parziale] [Perso]         │
└─────────────────────────────────────┘
```

La vista mostra tutti i canoni generati dai Contratti visibili all'utente, anche con periodicità differenti. I filtri comprendono almeno periodo, stato, Proprietario, immobile, Contratto e Locatario.

#### Azioni sul Canone

**Imposta Pagato**
```text
Utente seleziona PAGATO
        ↓
Sistema calcola il residuo del Canone
        ↓
Crea automaticamente un INCASSO
per l'intero importo residuo
        ↓
Residuo Canone = € 0
        ↓
Stato Canone = PAGATO
```
Se esistono già incassi parziali, l'incasso automatico è creato esclusivamente per il residuo ancora dovuto.

**Imposta Parziale**
```text
Utente seleziona PARZIALE
        ↓
┌──────────────────────────────┐
│ Registra pagamento parziale │
│ Canone dovuto      € 1.000   │
│ Già incassato        € 200   │
│ Residuo              € 800   │
│                              │
│ Importo incassato [€ ____]   │
│ Data              [__/__/__] │
│ Pagatore          [_______▼] │
│ Metodo            [_______▼] │
│                    [Conferma]│
└──────────────────────────────┘
        ↓
Crea INCASSO per l'importo indicato
        ↓
Aggiorna totale incassato e residuo
        ↓
Stato Canone = PARZIALE
```

**Passaggio automatico a In ritardo**
```text
Data corrente > data scadenza
             +
Residuo Canone > € 0
             ↓
Stato = IN RITARDO
```
Il passaggio a In ritardo è automatico e non crea alcun Incasso. Un Canone già parzialmente incassato può quindi risultare In ritardo conservando il valore già incassato e il residuo ancora dovuto.

**Imposta Perso**
```text
Utente seleziona PERSO
        ↓
Nessun nuovo Incasso
        ↓
Il residuo viene considerato non più recuperabile
        ↓
Stato Canone = PERSO
```

#### Principio di interazione
Nell'operatività ordinaria l'utente aggiorna il pagamento partendo dal **Canone**. Gli **Incassi** rimangono entità distinte per consentire pagamenti parziali, più incassi sullo stesso Canone, identificazione del pagatore e tracciabilità economica.

### 16.10 Canoni / Rate del Contratto
```text
┌────────────────────────────────┐
│ Canoni - Contratto #25         │
├────────────────────────────────┤
│ Ott 2026   €550  INCASSATA     │
│ Nov 2026   €550  PREVISTA      │
│ Dic 2026   €550  PREVISTA      │
│ Gen 2027   €550  PREVISTA      │
└────────────────────────────────┘
```
Selezionando una rata: dettaglio importo, componenti, scadenza, incassi imputati, residuo e azione **Registra incasso**.

### 16.11 Registrazione Incasso
```text
┌────────────────────────────────┐
│ Registra incasso               │
├────────────────────────────────┤
│ Data       [__/__/____]        │
│ Importo    [€ ______]          │
│ Pagatore   [Mario Rossi ▼]     │
│ Metodo     [Bonifico ▼]        │
│ Rata       [Novembre 2026 ▼]   │
│ Note       [______________]    │
│ Documento  [+ allega]          │
├────────────────────────────────┤
│ Residuo rata dopo incasso € __ │
│                       [Salva]  │
└────────────────────────────────┘
```
Un incasso può successivamente essere allocato a più rate mantenendo gli importi di associazione.

### 16.12 Registrazione Spesa
```text
┌────────────────────────────────┐
│ Nuova spesa                    │
├────────────────────────────────┤
│ Immobile [Via Verdi 15 ▼]      │
│ Ambito   [Intero immobile ▼]   │
│ Categoria [Manutenzione ▼]     │
│ Data      [__/__/____]         │
│ Importo   [€ ______]           │
│ Pagata da [Enzo ▼]             │
│ Note      [______________]     │
│ Documento [+ Fattura/Ricevuta] │
├────────────────────────────────┤
│ Ripartizione teorica           │
│ Enzo       50%      € ____     │
│ Sorella     50%      € ____     │
│                       [Salva]  │
└────────────────────────────────┘
```

### 16.13 Scadenze
```text
┌────────────────────────────────┐
│ Scadenze                 [+]   │
│ [Elenco] [Calendario]          │
├────────────────────────────────┤
│ OGGI                           │
│ ⚠ Canone Via Verdi 15          │
│                                │
│ PROSSIME                       │
│ ◷ Assicurazione Via Roma 20    │
│ ◷ Rinnovo contratto #25        │
│ ◷ Manutenzione caldaia         │
└────────────────────────────────┘
```
La scheda scadenza mostra elemento collegato, data, priorità, ricorrenza, stato e regole push/e-mail.

### 16.14 Documenti
```text
┌────────────────────────────────┐
│ Documenti                [+]   │
│ [Tutti ▼] [Cerca...]           │
├────────────────────────────────┤
│ Visura catastale               │
│ Via Verdi 15 • Immobile        │
├────────────────────────────────┤
│ Carta identità Mario Rossi     │
│ Locatario • Scade 12/2029      │
├────────────────────────────────┤
│ Contratto firmato #25          │
│ Contratto • Via Verdi 15       │
└────────────────────────────────┘
```
Caricamento: file, fotocamera/scansione; nome, categoria, data documento, scadenza opzionale, note e associazioni.

### 16.15 Proprietari
```text
┌────────────────────────────────┐
│ Proprietari              [+]   │
├────────────────────────────────┤
│ Enzo                           │
│ 2 immobili • quota patrimonio  │
├────────────────────────────────┤
│ Sorella                        │
│ 2 immobili                     │
└────────────────────────────────┘
```
Dalla scheda Proprietario: anagrafica, immobili/quote, situazione economica, documenti.

### 16.16 Locatari
```text
┌────────────────────────────────┐
│ Locatari                 [+]   │
├────────────────────────────────┤
│ Mario Rossi                    │
│ 1 contratto attivo             │
│ Via Verdi 15 • Stanza A        │
├────────────────────────────────┤
│ Luca Bianchi                   │
│ 1 contratto attivo             │
│ Via Verdi 15 • Stanza A        │
└────────────────────────────────┘
```
Dalla scheda Locatario: anagrafica, contratti attuali/storici, documenti e contatti.

### 16.17 Flusso nuovo patrimonio
```text
Crea Proprietario
       ↓
Crea Immobile
       ↓
Associa Proprietari + quote
       ↓
Opzionale: crea Porzioni locabili
       ↓
Carica Documenti
       ↓
Immobile disponibile per Contratti e gestione economica
```

### 16.18 Flusso nuova locazione
```text
Seleziona Immobile
       ↓
Intero immobile / Porzione
       ↓
Seleziona o crea uno o più Locatari
       ↓
Definisci tipologia e condizioni del Contratto
       ↓
Carica documentazione
       ↓
Imposta stato Attivo
       ↓
Genera e verifica Rate
       ↓
Genera Scadenze e regole di Notifica
```

## 16.19 Casi d'uso Canoni

### UC-CAN-01 - Consultare i Canoni
**Precondizioni**
- Utente autenticato e autorizzato al relativo perimetro di Proprietari.
- Esistono Contratti che hanno generato Canoni/Rate.

**Azione utente**
- Apre la sezione **Canoni** e, se necessario, applica periodo e filtri.

**Comportamento del sistema**
- Mostra i Canoni di tutti i Contratti visibili, indipendentemente dalla periodicità.
- Per ogni elemento mostra immobile/porzione, Locatari, periodicità, scadenza, dovuto, incassato, residuo e stato.
- Ricalcola i riepiloghi del periodo.

**Risultato**
- Vista unica della situazione dei Canoni del patrimonio gestito.

**Casi limite**
- Nessun Canone nel periodo: empty state.
- Più Locatari: visualizzazione sintetica con possibilità di dettaglio.
- Più Incassi sullo stesso Canone: totale Incassato e Residuo sono aggregati.
- Periodicità differenti: nessuna trasformazione artificiale in mensilità.

### UC-CAN-02 - Segnare un Canone come Pagato
**Precondizioni**
- Canone esistente, non Perso, con Residuo > 0.

**Azione utente**
- Seleziona **Pagato**, verifica i dati dell'Incasso e conferma.

**Comportamento del sistema**
1. Calcola il Residuo corrente.
2. Propone almeno importo, data Incasso, Pagatore e Metodo.
3. Alla conferma crea un Incasso pari al Residuo.
4. Collega l'Incasso al Canone.
5. Porta il Residuo a zero e lo stato a Pagato.

**Risultato**
- Canone completamente saldato e Incasso tracciato.

**Casi limite**
- Se esistono Incassi parziali, il nuovo Incasso copre solamente il Residuo.
- Se Residuo = 0, non è consentito creare un nuovo Incasso tramite Pagato.
- Se l'utente annulla, nessun dato viene modificato.

### UC-CAN-03 - Registrare un pagamento Parziale
**Precondizioni**
- Canone non Perso con Residuo > 0.

**Azione utente**
- Seleziona **Parziale** e specifica importo, data, Pagatore e Metodo.

**Comportamento del sistema**
- Valida che l'importo sia maggiore di zero e non superiore al Residuo.
- Crea il relativo Incasso.
- Aggiorna Incassato e Residuo.
- Se resta un Residuo e la scadenza non è superata, lo stato è Parziale.

**Risultato**
- Incasso parziale registrato e Residuo aggiornato.

**Casi limite**
- Importo <= 0: operazione bloccata.
- Importo > Residuo: operazione bloccata.
- Importo = Residuo: il Canone viene portato a Pagato.
- Sono ammessi più Incassi parziali, conservati separatamente.

### UC-CAN-04 - Passaggio automatico a In ritardo
**Precondizioni**
- Data corrente successiva alla scadenza.
- Residuo > 0.
- Canone non Perso.

**Azione utente**
- Nessuna: la transizione è automatica.

**Comportamento del sistema**
- Imposta lo stato In ritardo quando `data corrente > data scadenza` e `Residuo > 0`.
- Non crea Incassi.
- Conserva eventuali Incassi parziali precedenti.

**Risultato**
- Il Canone resta un credito aperto ed evidenzia il Residuo dovuto.

**Casi limite**
- Nel giorno di scadenza non è ancora In ritardo.
- Se Residuo = 0 è Pagato.
- Un pagamento parziale successivo alla scadenza riduce il Residuo ma mantiene In ritardo finché Residuo > 0.

### UC-CAN-05 - Completare un Canone precedentemente Parziale
**Precondizioni**
- Esistono uno o più Incassi e Residuo > 0.

**Azione utente**
- Seleziona **Pagato**.

**Comportamento del sistema**
- Crea un nuovo Incasso esclusivamente per il Residuo.
- Mantiene tutti gli Incassi precedenti.
- Porta Residuo a zero e stato a Pagato.

**Risultato**
- Canone saldato con storico completo dei diversi Incassi.

**Casi limite**
- Annullamento della conferma: nessuna modifica.

### UC-CAN-06 - Segnare un Canone come Perso
**Precondizioni**
- Canone con Residuo > 0.

**Azione utente**
- Seleziona **Perso** e conferma il Residuo non recuperabile.

**Comportamento del sistema**
- Non genera Incassi.
- Mantiene eventuali Incassi precedenti.
- Memorizza il Residuo considerato perso e chiude il Residuo attivo.
- Imposta lo stato Perso.

**Risultato**
- Il credito residuo non è più considerato da incassare ma resta tracciato come perso.

**Casi limite**
- Canone già interamente Pagato: azione non disponibile.
- Canone parzialmente incassato: viene perso solamente il Residuo.

### UC-CAN-07 - Consultare gli Incassi di un Canone
**Precondizioni**
- Canone esistente.

**Azione utente**
- Apre il dettaglio del Canone.

**Comportamento del sistema**
- Mostra Dovuto, Incassato, Residuo, Stato e lista degli Incassi con almeno data, importo, Pagatore e Metodo.

**Risultato**
- Ricostruzione completa delle modalità con cui il Canone è stato incassato.

**Casi limite**
- Nessun Incasso: lista vuota.
- Più Pagatori o Metodi: ogni Incasso conserva le proprie informazioni.

### UC-CAN-08 - Filtrare i Canoni
**Precondizioni**
- Utente nella sezione Canoni.

**Azione utente**
- Imposta uno o più filtri tra Periodo, Stato, Proprietario, Immobile, Contratto e Locatario, oppure usa Tutti / Da incassare / In ritardo.

**Comportamento del sistema**
- Applica cumulativamente i filtri e aggiorna elenco e indicatori economici.

**Risultato**
- Vista Canoni limitata al perimetro richiesto.

**Casi limite**
- Nessun risultato: empty state con possibilità di rimuovere i filtri.
- Immobili fuori dal perimetro utente: non disponibili tra le opzioni.

## 16.20 Tabella stati dei Canoni

| Stato | Significato | Residuo | Come si raggiunge | Genera Incasso | Uscite possibili |
|---|---|---:|---|---|---|
| **Creato** | Canone generato e non ancora incassato; scadenza non superata. | > 0 | Generazione dal Contratto | No | Pagato, Parziale, In ritardo, Perso |
| **Parziale** | È stato registrato almeno un Incasso, ma rimane un importo da ricevere e la scadenza non è superata. | > 0 | Azione Parziale | **Sì**, per l'importo indicato | Parziale, Pagato, In ritardo, Perso |
| **Pagato** | Il Canone è integralmente saldato. | = 0 | Azione Pagato oppure pagamento parziale pari al Residuo | **Sì**, per il Residuo | Stato terminale operativo salvo futura gestione di rettifiche |
| **In ritardo** | La scadenza è superata e rimane un credito aperto. | > 0 | Automaticamente dopo la scadenza | No per la transizione | Pagato, In ritardo con nuovo Incasso parziale, Perso |
| **Perso** | Il Residuo è stato dichiarato non più recuperabile. | Attivo = 0; importo perso tracciato separatamente | Azione esplicita Perso | No | Stato terminale operativo salvo futura gestione di riapertura/rettifica |

### 16.21 Matrice delle transizioni dei Canoni

| Stato iniziale | Evento / condizione | Stato finale | Azione automatica del sistema |
|---|---|---|---|
| Creato | Utente seleziona Pagato | Pagato | Crea Incasso pari al Residuo e azzera il Residuo |
| Creato | Utente seleziona Parziale con importo inferiore al Residuo | Parziale | Crea Incasso dell'importo indicato e ricalcola il Residuo |
| Creato | Scadenza superata e Residuo > 0 | In ritardo | Cambia stato senza creare Incasso |
| Creato | Utente seleziona Perso | Perso | Registra il Residuo come perso; nessun Incasso |
| Parziale | Nuovo Incasso parziale prima della scadenza, Residuo > 0 | Parziale | Crea nuovo Incasso e riduce il Residuo |
| Parziale | Utente seleziona Pagato | Pagato | Crea Incasso pari al Residuo |
| Parziale | Scadenza superata e Residuo > 0 | In ritardo | Cambia stato mantenendo gli Incassi già registrati |
| Parziale | Utente seleziona Perso | Perso | Conserva gli Incassi precedenti e registra come perso solo il Residuo |
| In ritardo | Utente registra un Incasso inferiore al Residuo | In ritardo | Crea Incasso e riduce il Residuo |
| In ritardo | Utente seleziona Pagato | Pagato | Crea Incasso pari al Residuo |
| In ritardo | Utente seleziona Perso | Perso | Registra come perso il Residuo; nessun nuovo Incasso |
| Qualsiasi stato aperto | Incasso registrato porta Residuo a zero | Pagato | Chiude economicamente il Canone |

### 16.22 Macchina a stati dei Canoni
```text
                         CONTRATTO
                             |
                             | genera
                             v
                          CREATO
                       /     |      \
                      /      |       \
             Parziale       Pagato    Perso
                |             |         |
                v             v         v
            PARZIALE       PAGATO     PERSO
                |
      scadenza superata
        + Residuo > 0
                |
                v
           IN RITARDO
             /     \
            /       \
    Incasso residuo  Perso
          |            |
          v            v
       PAGATO         PERSO

Da PARZIALE:
- nuovo Incasso inferiore al Residuo -> resta PARZIALE prima della scadenza;
- Incasso pari al Residuo -> PAGATO.

Da IN RITARDO:
- Incasso inferiore al Residuo -> resta IN RITARDO;
- Incasso pari al Residuo -> PAGATO.
```

## 16.23 Approfondimento Utenti / Gestori / Proprietari

### 16.23.1 Distinzione tra Utente e Proprietario
**Utente** è il soggetto che accede a GestioneImmobili. Ha account, e-mail di accesso, nome/cognome, stato Attivo/Inattivo, ruolo, preferenze e associazioni ai Proprietari che può gestire.

**Proprietario** è il soggetto titolare di quote di uno o più Immobili. Può esistere anche senza account applicativo e può essere persona fisica o, in prospettiva, persona giuridica.

```text
UTENTE Enzo
   |
   +-- gestisce --> PROPRIETARIO Enzo
   |
   +-- gestisce --> PROPRIETARIO Sorella
```

Se il Proprietario diventa anche Utente, il collegamento anagrafico non attribuisce automaticamente permessi: l'accesso continua a dipendere dalla relazione di gestione.

### 16.23.2 Ruoli applicativi
- **Administrator**: gestisce utenti, autorizzazioni, Proprietari e tutte le funzionalità del patrimonio autorizzato.
- **Gestore / Manager**: crea e modifica Proprietari e gestisce Immobili, Porzioni, Contratti, Canoni, Incassi, Spese, Scadenze e Documenti esclusivamente nel proprio perimetro.
- **Viewer**: consulta senza modificare i dati del perimetro assegnato.

La v1.0 mantiene volutamente un sistema di ruoli semplice. Ruolo e perimetro restano separati.

### 16.23.3 Perimetro di gestione
La relazione `GESTIONE_PROPRIETARIO` collega Utente e Proprietario e deve mantenere almeno: ruolo, data inizio, data fine opzionale e stato.

```text
UTENTE
   |
   +-- GESTIONE_PROPRIETARIO
               |
               +-- PROPRIETARIO
```

Lo stesso Utente può gestire più Proprietari e lo stesso Proprietario può essere gestito da più Utenti.

### 16.23.4 Regola di visibilità degli Immobili
L'Utente può accedere a un Immobile se gestisce almeno uno dei Proprietari che possiedono una quota di tale Immobile.

Quando questa condizione è soddisfatta, l'Utente accede all'intero Immobile nei limiti del proprio ruolo. La percentuale di proprietà serve alla ripartizione economica e non limita la visibilità a una porzione percentuale dell'Immobile.

Esempio:

| Immobile | Proprietario Enzo | Proprietario Sorella |
|---|---:|---:|
| Roma A | 50% | 50% |
| Roma B | 100% | - |
| Palermo A | - | 100% |

Un Utente che gestisce soltanto il Proprietario Enzo vede Roma A e Roma B, ma non Palermo A. Se perde l'accesso a Enzo ma continua a gestire Sorella, Roma A rimane visibile tramite Sorella.

### UC-PRO-01 - Creare un Proprietario
**Precondizioni**
- Utente autenticato.
- Ruolo Administrator o Gestore.

**Azione utente**
- Da Proprietari seleziona **Nuovo Proprietario** e inserisce i dati anagrafici.

Dati iniziali per persona fisica: nome, cognome, codice fiscale, e-mail, telefono, indirizzo, CAP, Comune, Provincia, IBAN e note. Per una persona giuridica il modello prevede ragione sociale e partita IVA/codice fiscale.

**Comportamento del sistema**
1. Valida i dati identificativi.
2. Crea il Proprietario.
3. Crea automaticamente la relazione `GESTIONE_PROPRIETARIO` con l'Utente che lo ha creato.
4. Rende il Proprietario immediatamente disponibile nel perimetro dell'Utente.

**Risultato**
- Proprietario creato e gestibile dall'Utente corrente.

**Casi limite**
- Codice fiscale/partita IVA già presente: il sistema segnala il possibile duplicato e impedisce la creazione duplicata nella normale operatività.

### UC-PRO-02 - Modificare un Proprietario
**Precondizioni**
- Utente con permesso di modifica sul Proprietario.

**Azione utente**
- Apre la scheda e seleziona **Modifica**.

**Comportamento del sistema**
- Aggiorna anagrafica, contatti, IBAN e note senza modificare Quote, Immobili, Contratti e Documenti collegati.

**Risultato**
- Anagrafica aggiornata mantenendo inalterate le relazioni gestionali.

**Casi limite**
- La modifica dell'indirizzo del Proprietario non modifica l'indirizzo degli Immobili.

### UC-PRO-03 - Archiviare un Proprietario
**Precondizioni**
- Proprietario esistente.
- Utente autorizzato alla modifica.

**Azione utente**
- Seleziona **Archivia / Rendi inattivo**.

**Comportamento del sistema**
- Imposta il Proprietario come Inattivo senza cancellarne storico e relazioni.

**Risultato**
- Proprietario escluso dalla normale operatività corrente ma conservato nello storico.

**Casi limite**
- Quote storiche, Contratti, Canoni, Incassi, Spese e Documenti non vengono eliminati.

### UC-UTE-01 - Invitare un Utente alla gestione
**Precondizioni**
- Utente corrente autorizzato alla gestione accessi.
- Esiste almeno un Proprietario assegnabile.

**Azione utente**
- Da Gestione accessi seleziona **Invita utente**, indica e-mail, ruolo e uno o più Proprietari autorizzati.

**Comportamento del sistema**
- Predispone/attiva l'accesso dell'Utente e crea le relative associazioni `GESTIONE_PROPRIETARIO` per i Proprietari scelti.

**Risultato**
- Il nuovo Utente vede gli Immobili derivati dai Proprietari assegnati, secondo il proprio ruolo.

**Casi limite**
- Nessun Proprietario assegnato: l'Utente non ottiene visibilità su Immobili tramite il perimetro patrimoniale.

### UC-UTE-02 - Modificare o rimuovere un accesso
**Precondizioni**
- Utente corrente autorizzato alla gestione accessi.

**Azione utente**
- Modifica ruolo o elenco dei Proprietari assegnati a un altro Utente.

**Comportamento del sistema**
- Aggiorna `GESTIONE_PROPRIETARIO` e ricalcola il perimetro visibile.
- Quando viene rimossa l'associazione con un Proprietario, vengono persi gli Immobili raggiungibili esclusivamente tramite tale Proprietario.
- Un Immobile rimane visibile se raggiungibile tramite un altro Proprietario ancora gestito.

**Risultato**
- Perimetro e autorizzazioni aggiornati senza modificare proprietà, quote o dati immobiliari.

**Casi limite**
- La rimozione dell'accesso non elimina alcun dato patrimoniale o storico.

### 16.23.5 Proprietario collegato a un Utente
Il Proprietario può avere un collegamento opzionale a un Utente per rappresentare la stessa persona fisica nell'app. Tale collegamento non attribuisce permessi: l'accesso deriva sempre da `GESTIONE_PROPRIETARIO`.

### 16.23.6 Wireframe Gestione accessi
```text
┌──────────────────────────────────┐
│ Gestione accessi                 │
├──────────────────────────────────┤
│ Enzo                             │
│ ADMINISTRATOR                    │
│ Gestisce                         │
│ ✓ Enzo                           │
│ ✓ Sorella                        │
│                     [Modifica]   │
├──────────────────────────────────┤
│ Sorella                          │
│ GESTORE                          │
│ Gestisce                         │
│ ✓ Sorella                        │
│                     [Modifica]   │
├──────────────────────────────────┤
│                    [+ Invita]    │
└──────────────────────────────────┘
```

### 16.23.7 Wireframe Proprietario
```text
┌──────────────────────────────────┐
│ Proprietario               [⋮]   │
│ ATTIVO                           │
├──────────────────────────────────┤
│ [Riepilogo] [Immobili] [Doc.]    │
├──────────────────────────────────┤
│ DATI                             │
│ Codice fiscale  ********         │
│ Email            ...             │
│ Telefono         ...             │
│ IBAN             ...             │
├──────────────────────────────────┤
│ IMMOBILI                         │
│ Via Verdi 15 - Roma              │
│ Quota 50%                        │
│                                  │
│ Via Roma 20 - Palermo            │
│ Quota 100%                       │
├──────────────────────────────────┤
│ SITUAZIONE ECONOMICA             │
│ Canoni competenza      € ...     │
│ Incassato              € ...     │
│ Spese competenza       € ...     │
└──────────────────────────────────┘
```
La situazione economica sarà consolidata nell'approfondimento Spese/Ripartizioni.

### 16.23.8 Regole di business Utenti / Gestori / Proprietari
- **RB-UTE-01:** Utente e Proprietario sono entità indipendenti.
- **RB-UTE-02:** un Proprietario può esistere senza un Utente associato.
- **RB-UTE-03:** un Utente può gestire più Proprietari.
- **RB-UTE-04:** lo stesso Proprietario può essere gestito da più Utenti.
- **RB-UTE-05:** la creazione di un Proprietario da parte di un Gestore associa automaticamente il Proprietario al Gestore che lo ha creato.
- **RB-UTE-06:** l'accesso agli Immobili deriva dal perimetro dei Proprietari gestiti.
- **RB-UTE-07:** la gestione di almeno un Proprietario di un Immobile consente l'accesso all'intero Immobile, nei limiti del ruolo dell'Utente.
- **RB-UTE-08:** ruolo applicativo e perimetro dei Proprietari sono indipendenti.
- **RB-UTE-09:** l'associazione anagrafica tra Utente e Proprietario non attribuisce automaticamente permessi.
- **RB-UTE-10:** rimuovendo l'accesso a un Proprietario, l'Utente perde gli Immobili raggiungibili esclusivamente tramite quel Proprietario.
- **RB-UTE-11:** i Proprietari con storico gestionale non devono essere eliminati fisicamente, ma possono essere resi Inattivi.

### 16.23.9 Cruscotto maturità funzionale

| Area | Maturità | Cosa manca |
|---|---|---|
| **Utenti / Gestori / Proprietari** | 🟢 **molto solida** | Solo validazione nello scenario end-to-end |
| Immobili / comproprietà | 🟡 buona | Casi d'uso e gestione variazioni quote |
| Porzioni / stanze | 🟡 buona | Casi d'uso e vincoli tra contratti |
| Locatari | 🟡 buona | Casi d'uso, subentro/uscita |
| Contratti | 🟡 buona | Ciclo di vita e impatto sui Canoni |
| **Canoni / Incassi** | 🟢 **molto solida** | Solo validazione end-to-end |
| Spese | 🟡 da approfondire | Competenza, pagamento, conguagli |
| Documenti | 🟡 da approfondire | Ciclo di vita, versioni e sicurezza |
| Scadenze / notifiche | 🟡 da approfondire | Stati, ricorrenze e motore notifiche |
| Dashboard / report | 🟡 da approfondire | KPI e regole di aggregazione |

## 16.24 Approfondimento Immobili / Comproprietà

### 16.24.1 Principi del dominio
L'**Immobile** rappresenta il bene patrimoniale gestito. È distinto sia dalle eventuali Porzioni locabili sia dai dati di proprietà. La comproprietà è rappresentata dalla relazione storicizzata `QUOTA_PROPRIETA` tra Proprietario e Immobile.

```text
PROPRIETARIO
     |
     +-- QUOTA_PROPRIETA
               |
               +-- IMMOBILE
```

La quota non è quindi un attributo fisso né del Proprietario né dell'Immobile. Questo permette di rappresentare cambi di proprietà nel tempo conservando la corretta situazione storica.

### 16.24.2 Anagrafica Immobile
Per la v1.0 la scheda Immobile deve prevedere almeno:
- denominazione/nome breve;
- tipologia;
- stato gestionale Attivo/Inattivo;
- indirizzo, CAP, Comune, Provincia;
- dati catastali disponibili, mantenuti come informazioni dell'Immobile;
- superficie e note;
- Proprietari e quote attuali;
- eventuali Porzioni locabili;
- Contratti;
- situazione economica;
- Scadenze;
- Documenti.

L'indirizzo dell'Immobile è indipendente dagli indirizzi dei Proprietari.

### 16.24.3 Stato gestionale dell'Immobile
Lo stato gestionale iniziale è:
- **Attivo**: Immobile facente parte della gestione corrente.
- **Inattivo**: Immobile non più gestito operativamente, ma conservato nello storico.

Un Immobile con storico economico, contrattuale o documentale non deve essere cancellato fisicamente nella normale operatività.

### 16.24.4 Comproprietà e storicizzazione quote
Ogni associazione Proprietario-Immobile deve contenere almeno:
- percentuale di proprietà;
- data inizio validità;
- data fine validità opzionale;
- note opzionali.

Esempio:

| Proprietario | Quota | Dal | Al |
|---|---:|---|---|
| Enzo | 50% | 01/01/2020 | - |
| Sorella | 50% | 01/01/2020 | - |

La somma delle quote valide nello stesso periodo è attesa pari al 100%. Il sistema deve segnalare configurazioni incoerenti prima di renderle operative.

### 16.24.5 Variazione delle quote
Una variazione non deve sovrascrivere la quota precedente. Deve chiudere il periodo precedente e creare le nuove quote con una nuova decorrenza.

Esempio:

```text
Fino al 30/06/2027
Enzo      50%
Sorella   50%

Dal 01/07/2027
Enzo      75%
Sorella   25%
```

Le operazioni economiche già consolidate devono mantenere la ripartizione storica applicata. Le nuove operazioni soggette a ripartizione automatica utilizzano le quote valide alla propria data di competenza.

### UC-IMM-01 - Creare un Immobile
**Precondizioni**
- Utente autenticato con ruolo che consente la modifica.
- Esiste almeno un Proprietario nel perimetro dell'Utente.

**Azione utente**
- Seleziona **Nuovo Immobile**, compila l'anagrafica e associa uno o più Proprietari indicando le quote e la decorrenza.

**Comportamento del sistema**
1. Valida i campi obbligatori.
2. Verifica le quote indicate.
3. Crea l'Immobile.
4. Crea le relazioni `QUOTA_PROPRIETA`.
5. Rende disponibili Documenti, Porzioni, Contratti, Spese e Scadenze per l'Immobile.

**Risultato**
- Immobile Attivo e disponibile nella gestione.

**Casi limite**
- Quote non coerenti: il sistema segnala l'incongruenza e non rende definitiva la configurazione di proprietà.
- Proprietario fuori dal perimetro: non deve essere selezionabile dall'Utente nella normale operatività.

### UC-IMM-02 - Modificare l'anagrafica di un Immobile
**Precondizioni**
- Immobile visibile e Utente autorizzato alla modifica.

**Azione utente**
- Modifica dati descrittivi, indirizzo, superficie, dati catastali o note.

**Comportamento del sistema**
- Aggiorna l'anagrafica senza modificare automaticamente Proprietari, Quote, Porzioni, Contratti o movimenti economici.

**Risultato**
- Scheda Immobile aggiornata.

**Casi limite**
- Una modifica anagrafica non deve essere utilizzata implicitamente per rappresentare un cambio di proprietà.

### UC-IMM-03 - Aggiungere un comproprietario
**Precondizioni**
- Immobile esistente.
- Nuovo Proprietario presente nel perimetro dell'Utente oppure creato contestualmente tramite il flusso Proprietari.

**Azione utente**
- Seleziona **Modifica proprietà**, specifica nuova decorrenza e nuove percentuali.

**Comportamento del sistema**
1. Mostra la situazione precedente.
2. Richiede la situazione completa delle quote dal giorno di efficacia.
3. Verifica che le nuove quote siano coerenti.
4. Chiude le quote precedenti al giorno precedente la nuova decorrenza.
5. Crea il nuovo assetto di proprietà.

**Risultato**
- Nuova composizione proprietaria valida dalla decorrenza indicata e storico precedente conservato.

**Casi limite**
- Non è consentito modificare retroattivamente quote già utilizzate da movimenti economici consolidati senza una futura gestione esplicita di rettifica.

### UC-IMM-04 - Cessione o variazione di una quota
**Precondizioni**
- Immobile con Quote attive.

**Azione utente**
- Indica data di efficacia e nuovo assetto percentuale.

**Comportamento del sistema**
- Non modifica la relazione storica esistente.
- Chiude il vecchio assetto e crea quello nuovo.
- Utilizza il nuovo assetto per le ripartizioni automatiche con data di competenza successiva o uguale alla decorrenza.

**Risultato**
- Possibilità di ricostruire chi possedeva l'Immobile e in quale percentuale in qualsiasi periodo registrato.

**Casi limite**
- Vendita totale: il Proprietario uscente termina al 0% e il nuovo assetto deve continuare a rappresentare il 100%.
- Passaggio da 50/50 a 100/0: la relazione storica del Proprietario uscente viene chiusa, non eliminata.

### UC-IMM-05 - Rendere Inattivo un Immobile
**Precondizioni**
- Immobile esistente e Utente autorizzato.

**Azione utente**
- Seleziona **Rendi inattivo / Archivia**.

**Comportamento del sistema**
- Imposta lo stato gestionale Inattivo e conserva integralmente lo storico.
- Il sistema deve avvisare l'Utente della presenza di elementi operativi ancora attivi, quali Contratti o Canoni aperti, prima di completare l'operazione.

**Risultato**
- Immobile non più presente nelle normali viste operative Attive, ma consultabile nello storico.

**Casi limite**
- Presenza di Contratti attivi: richiesta esplicita di risoluzione della situazione prima dell'archiviazione definitiva o blocco secondo la regola che verrà consolidata nell'area Contratti.

### UC-IMM-06 - Consultare lo storico della proprietà
**Precondizioni**
- Immobile con uno o più assetti proprietari registrati.

**Azione utente**
- Dalla scheda Immobile apre **Proprietari / Storico quote**.

**Comportamento del sistema**
- Mostra gli assetti proprietari ordinati per periodo con percentuali e date di validità.

**Risultato**
- Ricostruzione della comproprietà nel tempo.

**Casi limite**
- Un unico assetto dalla creazione: viene comunque mostrato come assetto corrente senza data fine.

### UC-IMM-07 - Consultare il riepilogo economico per Immobile
**Precondizioni**
- Immobile visibile all'Utente.

**Azione utente**
- Apre la scheda Immobile, sezione **Economia**.

**Comportamento del sistema**
- Aggrega Canoni, Incassi e Spese attribuiti all'Immobile e alle sue Porzioni secondo periodo e filtri disponibili.
- La ripartizione per Proprietario deve utilizzare le informazioni economiche consolidate e le Quote storicamente applicabili.

**Risultato**
- Visione economica del singolo Immobile e, quando richiesto, della competenza per Proprietario.

**Casi limite**
- Le metriche fiscali non devono essere confuse con il risultato gestionale.
- Le regole definitive di competenza delle Spese saranno consolidate nell'approfondimento Spese.

### 16.24.6 Vincoli temporali sulle Quote
Per evitare ambiguità, la v1.0 adotta i seguenti principi:
1. per uno stesso Immobile non devono esistere assetti proprietari concorrenti incoerenti nello stesso intervallo;
2. a una specifica data deve essere determinabile un solo assetto valido;
3. la somma delle Quote dell'assetto valido è attesa pari al 100%;
4. le Quote usate da operazioni economiche già consolidate non sono riscritte implicitamente da una variazione successiva;
5. le variazioni devono essere storicizzate tramite decorrenza, non mediante sovrascrittura.

### 16.24.7 Wireframe dettaglio Immobile - Proprietà
```text
┌────────────────────────────────────┐
│ Via Verdi 15 - Roma           [⋮]  │
│ ATTIVO • Appartamento              │
│ [Riep][Proprietà][Contr][Econ][Doc]│
├────────────────────────────────────┤
│ PROPRIETÀ ATTUALE                  │
│ Enzo                   50%         │
│ Sorella                 50%         │
│ Valida dal 01/01/2020              │
│                                    │
│ [Modifica proprietà]               │
│ [Storico quote]                    │
├────────────────────────────────────┤
│ PORZIONI                           │
│ Stanza A   LOCATA                  │
│ Stanza B   LOCATA                  │
│ Stanza C   LIBERA                  │
├────────────────────────────────────┤
│ ECONOMIA                           │
│ Canoni periodo          € ...      │
│ Incassato               € ...      │
│ Spese                   € ...      │
│ Risultato gestionale    € ...      │
└────────────────────────────────────┘
```

### 16.24.8 Wireframe variazione Quote
```text
┌────────────────────────────────────┐
│ Modifica proprietà                 │
├────────────────────────────────────┤
│ Situazione attuale                 │
│ Enzo                    50%        │
│ Sorella                  50%        │
│                                    │
│ Nuova decorrenza [01/07/2027]      │
├────────────────────────────────────┤
│ NUOVO ASSETTO                      │
│ Enzo                    [75] %     │
│ Sorella                  [25] %     │
│ [+ Proprietario]                   │
│                                    │
│ Totale                  100%       │
│                          [Conferma]│
└────────────────────────────────────┘
```
Alla conferma il vecchio assetto viene chiuso e il nuovo viene creato: non si sovrascrivono le Quote precedenti.

### 16.24.9 Regole di business Immobili / Comproprietà
- **RB-IMM-01:** Immobile, Proprietario e Quota di proprietà sono concetti distinti.
- **RB-IMM-02:** la Quota appartiene alla relazione Proprietario-Immobile.
- **RB-IMM-03:** ogni Quota deve avere una decorrenza e può avere una data fine.
- **RB-IMM-04:** la variazione della proprietà non sovrascrive le Quote precedenti ma crea un nuovo assetto storicizzato.
- **RB-IMM-05:** a una determinata data deve essere determinabile un unico assetto proprietario valido per l'Immobile.
- **RB-IMM-06:** la somma delle Quote dell'assetto valido è attesa pari al 100% e configurazioni incoerenti devono essere segnalate prima di essere rese operative.
- **RB-IMM-07:** le ripartizioni economiche automatiche usano le Quote valide alla data di competenza dell'operazione.
- **RB-IMM-08:** una modifica successiva delle Quote non modifica implicitamente ripartizioni economiche già consolidate.
- **RB-IMM-09:** l'archiviazione di un Immobile non elimina storico, Contratti, Canoni, Incassi, Spese o Documenti.
- **RB-IMM-10:** l'indirizzo dell'Immobile è indipendente dagli indirizzi dei Proprietari.
- **RB-IMM-11:** il cambio di proprietà deve essere gestito tramite variazione delle Quote e non mediante modifica anagrafica dell'Immobile.
- **RB-IMM-12:** l'accesso dell'Utente all'Immobile continua a derivare dai Proprietari che gestisce, applicando le Quote valide e le regole di perimetro definite nell'area Utenti.

### 16.24.10 Cruscotto maturità funzionale

| Area | Maturità | Cosa manca |
|---|---|---|
| **Utenti / Gestori / Proprietari** | 🟢 **molto solida** | Solo validazione nello scenario end-to-end |
| **Immobili / comproprietà** | 🟢 **molto solida** | Solo validazione con Spese e scenario end-to-end |
| Porzioni / stanze | 🟡 buona | Casi d'uso e vincoli tra contratti |
| Locatari | 🟡 buona | Casi d'uso, subentro/uscita |
| Contratti | 🟡 buona | Ciclo di vita e impatto sui Canoni |
| **Canoni / Incassi** | 🟢 **molto solida** | Solo validazione end-to-end |
| Spese | 🟡 da approfondire | Competenza, pagamento, conguagli |
| Documenti | 🟡 da approfondire | Ciclo di vita, versioni e sicurezza |
| Scadenze / notifiche | 🟡 da approfondire | Stati, ricorrenze e motore notifiche |
| Dashboard / report | 🟡 da approfondire | KPI e regole di aggregazione |

## 16.25 Approfondimento Porzioni / Stanze

### 16.25.1 Principi del dominio
Una **Porzione locabile** è una suddivisione gestionale di un Immobile che può essere oggetto autonomo di locazione senza essere necessariamente una distinta unità catastale. Esempi: Stanza A, Stanza B, locale interno, posto auto o altra porzione identificabile.

La Porzione è sempre subordinata a un solo Immobile e non può esistere autonomamente.

```text
IMMOBILE
   |
   +-- PORZIONE LOCABILE
   |       +-- Stanza A
   |       +-- Stanza B
   |       +-- Stanza C
   |
   +-- oppure locazione INTERO IMMOBILE
```

La creazione di Porzioni è opzionale. Un Immobile locato interamente non necessita di Porzioni.

### 16.25.2 Anagrafica Porzione
Per la v1.0 una Porzione deve prevedere almeno:
- denominazione univoca nell'ambito dell'Immobile;
- tipologia (Stanza, Locale, Posto auto, Altro);
- descrizione;
- superficie opzionale;
- stato gestionale Attiva/Inattiva;
- stato di disponibilità derivato: Libera, Locata, Non disponibile;
- note;
- eventuali Documenti associati.

### 16.25.3 Stato gestionale e disponibilità
Si distinguono due concetti:

**Stato gestionale**
- Attiva: Porzione utilizzabile nella gestione corrente.
- Inattiva: Porzione conservata nello storico ma non utilizzabile per nuove locazioni.

**Disponibilità**
- Libera: nessun Contratto attivo insiste sulla Porzione e la Porzione è disponibile.
- Locata: almeno un Contratto attivo valido insiste sulla Porzione.
- Non disponibile: esclusa temporaneamente dalla locazione per scelta gestionale.

Lo stato Locata deve essere derivato dai Contratti e non impostato manualmente.

### 16.25.4 Oggetto del Contratto
Un Contratto deve dichiarare esplicitamente se riguarda:
1. **Intero Immobile**, oppure
2. **una o più Porzioni locabili** dello stesso Immobile.

Nella v1.0 non è ammesso nello stesso Contratto combinare l'intero Immobile e una sua Porzione, perché rappresenterebbe una sovrapposizione dello stesso oggetto locativo.

### 16.25.5 Vincoli di sovrapposizione
Il sistema deve evitare Contratti attivi temporalmente incompatibili sullo stesso spazio.

Regole iniziali:
- se esiste un Contratto attivo sull'**Intero Immobile**, non può essere attivato nello stesso periodo un Contratto su una sua Porzione;
- se esiste un Contratto attivo su una o più **Porzioni**, non può essere attivato nello stesso periodo un Contratto sull'intero Immobile;
- possono coesistere Contratti su Porzioni differenti;
- sulla stessa Porzione non possono coesistere Contratti attivi con intervalli temporali sovrapposti;
- un Contratto può comprendere più Porzioni dello stesso Immobile, ad esempio Stanza A + Posto auto.

Esempio valido:
```text
Via Verdi 15
├── Stanza A → Contratto Rossi, ATTIVO
├── Stanza B → Contratto Bianchi, ATTIVO
└── Stanza C → LIBERA
```

Esempio non valido nello stesso periodo:
```text
Via Verdi 15 → Contratto Intero Immobile, ATTIVO
       +
Stanza A      → altro Contratto, ATTIVO
```

### UC-POR-01 - Creare una Porzione
**Precondizioni**
- Immobile esistente, Attivo e visibile all'Utente.
- Utente autorizzato alla modifica.

**Azione utente**
- Dalla scheda Immobile seleziona **Aggiungi Porzione** e inserisce denominazione, tipologia e dati opzionali.

**Comportamento del sistema**
1. Verifica che la denominazione sia distinguibile nell'ambito dell'Immobile.
2. Crea la Porzione come Attiva.
3. Se non esistono Contratti attivi sulla Porzione, determina la disponibilità iniziale come Libera, salvo scelta Non disponibile.

**Risultato**
- Porzione disponibile per essere associata a futuri Contratti.

**Casi limite**
- Immobile Inattivo: non è consentita la creazione di nuove Porzioni operative.
- Denominazione duplicata nello stesso Immobile: segnalazione e richiesta di un identificativo distinguibile.

### UC-POR-02 - Modificare una Porzione
**Precondizioni**
- Porzione esistente e Utente autorizzato.

**Azione utente**
- Modifica nome, descrizione, tipologia, superficie o note.

**Comportamento del sistema**
- Aggiorna l'anagrafica senza alterare Contratti e storico economico collegati.

**Risultato**
- Porzione aggiornata.

**Casi limite**
- Una rinomina non crea una nuova Porzione e non interrompe le relazioni esistenti.

### UC-POR-03 - Rendere una Porzione Non disponibile
**Precondizioni**
- Porzione Attiva.

**Azione utente**
- Seleziona **Non disponibile**, eventualmente specificando una nota/motivazione.

**Comportamento del sistema**
- Se non esiste un Contratto attivo incompatibile, imposta la disponibilità Non disponibile e la esclude dalla selezione per nuove locazioni nel periodo corrente.

**Risultato**
- Porzione mantenuta nell'Immobile ma non locabile finché non viene resa nuovamente disponibile.

**Casi limite**
- Contratto attivo sulla Porzione: il sistema non deve usare Non disponibile come scorciatoia per cessare un Contratto; la situazione deve essere gestita dal ciclo di vita del Contratto.

### UC-POR-04 - Rendere Inattiva una Porzione
**Precondizioni**
- Porzione esistente.

**Azione utente**
- Seleziona **Archivia / Rendi inattiva**.

**Comportamento del sistema**
- Conserva lo storico e impedisce l'utilizzo della Porzione in nuovi Contratti.
- Verifica preventivamente la presenza di Contratti attivi o Canoni aperti collegati.

**Risultato**
- Porzione storica, non più disponibile nella normale operatività.

**Casi limite**
- Contratto attivo: l'archiviazione deve essere bloccata finché il Contratto non viene gestito secondo il proprio ciclo di vita.

### UC-POR-05 - Creare un Contratto su una Porzione
**Precondizioni**
- Porzione Attiva e disponibile nel periodo contrattuale richiesto.
- Nessun Contratto sull'intero Immobile incompatibile temporalmente.

**Azione utente**
- Nel wizard Contratto sceglie **Porzione** e seleziona una o più Porzioni dello stesso Immobile.

**Comportamento del sistema**
1. Controlla sovrapposizioni temporali per ciascuna Porzione.
2. Controlla l'assenza di un Contratto incompatibile sull'intero Immobile.
3. Se i controlli sono superati, consente l'attivazione.
4. Nel periodo di validità del Contratto la disponibilità delle Porzioni risulta Locata.

**Risultato**
- Contratto associato alle Porzioni selezionate.

**Casi limite**
- Se anche una sola Porzione selezionata è occupata in un intervallo sovrapposto, l'attivazione deve essere impedita finché il conflitto non viene risolto.
- Porzioni appartenenti a Immobili diversi non possono essere combinate nello stesso Contratto v1.0.

### UC-POR-06 - Creare un Contratto sull'intero Immobile
**Precondizioni**
- Immobile Attivo.
- Nessuna Porzione con Contratto attivo temporalmente sovrapposto alla locazione dell'intero Immobile.

**Azione utente**
- Nel wizard Contratto seleziona **Intero Immobile**.

**Comportamento del sistema**
- Verifica l'assenza di Contratti incompatibili su tutte le Porzioni e, se non ci sono conflitti, consente l'attivazione.

**Risultato**
- Contratto riferito all'intero Immobile.

**Casi limite**
- Una o più Porzioni già locate nel periodo: attivazione bloccata.

### UC-POR-07 - Consultare occupazione dell'Immobile
**Precondizioni**
- Immobile visibile all'Utente.

**Azione utente**
- Apre la sezione Riepilogo/Porzioni dell'Immobile.

**Comportamento del sistema**
- Mostra per ogni Porzione disponibilità, eventuale Contratto attivo, Locatari sintetici, Canone e prossima scadenza contrattuale quando disponibili.
- Se l'Immobile è locato integralmente, mostra l'occupazione a livello di intero Immobile e rende evidente che le singole Porzioni non sono disponibili per contratti concorrenti.

**Risultato**
- Vista immediata dell'occupazione dell'Immobile.

**Casi limite**
- Nessuna Porzione configurata: viene mostrato solo lo stato dell'intero Immobile.

### UC-POR-08 - Spesa riferita a una Porzione
**Precondizioni**
- Porzione esistente.

**Azione utente**
- Durante la registrazione di una Spesa seleziona l'ambito **Porzione**.

**Comportamento del sistema**
- Associa la Spesa sia all'Immobile padre sia alla specifica Porzione, preservando la possibilità di aggregare il costo a entrambi i livelli.

**Risultato**
- Spesa identificabile come specifica della Porzione e inclusa nel totale dell'Immobile.

**Casi limite**
- Le regole di ripartizione economica fra Proprietari restano quelle dell'Immobile e saranno consolidate nell'area Spese.

### 16.25.6 Intervalli temporali e disponibilità futura
La disponibilità deve poter essere verificata rispetto al periodo del Contratto, non soltanto rispetto alla data odierna. Una Porzione oggi Locata può quindi essere selezionabile per un futuro Contratto solo se gli intervalli contrattuali non si sovrappongono.

Esempio:
```text
Stanza A
Contratto corrente: 01/09/2026 - 31/08/2027

Nuovo contratto dal 01/09/2027 → compatibile
Nuovo contratto dal 01/08/2027 → conflitto
```

### 16.25.7 Wireframe elenco Porzioni
```text
┌────────────────────────────────────┐
│ Via Verdi 15 • Porzioni       [+] │
├────────────────────────────────────┤
│ Stanza A                           │
│ ● LOCATA                           │
│ Contratto #25 • €550/mese          │
│ [Apri]                             │
├────────────────────────────────────┤
│ Stanza B                           │
│ ● LOCATA                           │
│ Contratto #31 • €500/mese          │
│ [Apri]                             │
├────────────────────────────────────┤
│ Stanza C                           │
│ ○ LIBERA                           │
│ [Nuovo contratto]                  │
├────────────────────────────────────┤
│ Posto auto                         │
│ ⊘ NON DISPONIBILE                  │
│ [Rendi disponibile]                │
└────────────────────────────────────┘
```

### 16.25.8 Wireframe selezione oggetto Contratto
```text
┌────────────────────────────────────┐
│ Nuovo contratto • Oggetto          │
├────────────────────────────────────┤
│ Immobile                           │
│ [Via Verdi 15 - Roma ▼]            │
│                                    │
│ Oggetto locazione                  │
│ ( ) Intero immobile                │
│ (•) Una o più porzioni             │
│                                    │
│ ☑ Stanza A                         │
│ ☐ Stanza B                         │
│ ☐ Stanza C                         │
│ ☑ Posto auto                       │
│                                    │
│ Periodo                            │
│ Dal [__/__/____] Al [__/__/____]   │
│                                    │
│ ✓ Nessun conflitto rilevato        │
│                           [Avanti]  │
└────────────────────────────────────┘
```
Il controllo di conflitto deve considerare l'intero intervallo contrattuale e non solo lo stato corrente della Porzione.

### 16.25.9 Regole di business Porzioni / Stanze
- **RB-POR-01:** una Porzione appartiene a uno e un solo Immobile.
- **RB-POR-02:** la creazione di Porzioni è opzionale.
- **RB-POR-03:** una Porzione gestionale non implica necessariamente una distinta unità catastale.
- **RB-POR-04:** lo stato Locata deriva dai Contratti e non può essere impostato manualmente.
- **RB-POR-05:** un Contratto può riguardare l'intero Immobile oppure una o più Porzioni dello stesso Immobile.
- **RB-POR-06:** un Contratto non può riguardare contemporaneamente l'intero Immobile e una sua Porzione.
- **RB-POR-07:** un Contratto attivo sull'intero Immobile è incompatibile temporalmente con Contratti attivi sulle sue Porzioni.
- **RB-POR-08:** Contratti su Porzioni differenti possono coesistere se non violano altri vincoli.
- **RB-POR-09:** sulla stessa Porzione non possono esistere Contratti attivi con periodi sovrapposti.
- **RB-POR-10:** tutte le Porzioni associate allo stesso Contratto devono appartenere allo stesso Immobile nella v1.0.
- **RB-POR-11:** la disponibilità deve essere valutata rispetto all'intervallo temporale richiesto, non solo rispetto allo stato corrente.
- **RB-POR-12:** una Porzione Inattiva non è selezionabile per nuovi Contratti.
- **RB-POR-13:** rendere una Porzione Non disponibile non cessa né modifica automaticamente un Contratto esistente.
- **RB-POR-14:** una Spesa specifica di una Porzione concorre anche al totale economico dell'Immobile padre.

### 16.25.10 Cruscotto maturità funzionale

| Area | Maturità | Cosa manca |
|---|---|---|
| **Utenti / Gestori / Proprietari** | 🟢 **molto solida** | Solo validazione nello scenario end-to-end |
| **Immobili / comproprietà** | 🟢 **molto solida** | Solo validazione con Spese e scenario end-to-end |
| **Porzioni / stanze** | 🟢 **molto solida** | Solo validazione con Contratti e scenario end-to-end |
| Locatari | 🟡 buona | Casi d'uso, subentro/uscita |
| Contratti | 🟡 buona | Ciclo di vita e impatto sui Canoni |
| **Canoni / Incassi** | 🟢 **molto solida** | Solo validazione end-to-end |
| Spese | 🟡 da approfondire | Competenza, pagamento, conguagli |
| Documenti | 🟡 da approfondire | Ciclo di vita, versioni e sicurezza |
| Scadenze / notifiche | 🟡 da approfondire | Stati, ricorrenze e motore notifiche |
| Dashboard / report | 🟡 da approfondire | KPI e regole di aggregazione |

## 16.26 Approfondimento Locatari

### 16.26.1 Principi del dominio
Il **Locatario** è un soggetto anagrafico indipendente dal Contratto. Può partecipare a più Contratti nel tempo e uno stesso Contratto può avere uno o più Locatari contemporaneamente.

La relazione molti-a-molti deve essere rappresentata da `CONTRATTO_LOCATARIO`, che mantiene lo storico della partecipazione del singolo Locatario al Contratto.

```text
LOCATARIO
    |
    +-- CONTRATTO_LOCATARIO -- CONTRATTO
             |
             +-- ruolo
             +-- data inizio
             +-- data fine
             +-- stato
```

L'uscita di un Locatario da un Contratto non deve eliminare né il Locatario né la relazione storica.

### 16.26.2 Anagrafica Locatario
La v1.0 deve supportare:
- persona fisica;
- persona giuridica;
- ditta individuale.

Dati iniziali previsti, secondo il tipo di soggetto:
- nome/cognome o ragione sociale;
- codice fiscale e/o partita IVA;
- e-mail e telefono;
- indirizzo di residenza/sede;
- note;
- stato gestionale Attivo/Inattivo;
- Documenti associati.

I Documenti possono includere carta d'identità, codice fiscale, garanzie, fideiussioni e altra documentazione pertinente.

### 16.26.3 Ruolo nel Contratto
Il ruolo appartiene alla relazione `CONTRATTO_LOCATARIO`, non all'anagrafica Locatario. La baseline prevede:
- **Conduttore**;
- **Co-conduttore**.

Il modello resta estendibile ad altri ruoli senza modificare l'anagrafica del Locatario.

### 16.26.4 Stato gestionale e partecipazione contrattuale
Un Locatario può essere **Attivo** o **Inattivo** come anagrafica. Separatamente, la sua partecipazione a un Contratto ha una validità temporale.

Esempio:
```text
Contratto #25
01/09/2026 - 31/08/2029

Mario Rossi
  ruolo: Conduttore
  dal: 01/09/2026
  al: 31/08/2029

Luca Bianchi
  ruolo: Co-conduttore
  dal: 01/09/2026
  al: 30/06/2027

Anna Verdi
  ruolo: Co-conduttore
  dal: 01/07/2027
  al: 31/08/2029
```

Il Contratto resta unico; cambia la composizione dei Locatari nel tempo.

### UC-LOC-01 - Creare un Locatario
**Precondizioni**
- Utente autenticato e autorizzato alla modifica nel proprio perimetro.

**Azione utente**
- Seleziona **Nuovo Locatario** dalla relativa area o direttamente dal wizard di creazione Contratto.

**Comportamento del sistema**
1. Valida i dati identificativi disponibili.
2. Verifica possibili duplicati tramite codice fiscale/partita IVA quando valorizzati.
3. Crea l'anagrafica Attiva.
4. La rende selezionabile per i Contratti nel perimetro dell'Utente.

**Risultato**
- Locatario disponibile per associazione a uno o più Contratti.

**Casi limite**
- Possibile duplicato: segnalazione prima della creazione.
- La creazione del Locatario non crea automaticamente un Contratto.

### UC-LOC-02 - Modificare un Locatario
**Precondizioni**
- Locatario visibile e Utente autorizzato.

**Azione utente**
- Modifica i dati anagrafici e di contatto.

**Comportamento del sistema**
- Aggiorna l'anagrafica senza modificare retroattivamente le relazioni contrattuali.

**Risultato**
- Dati correnti aggiornati e storico contrattuale preservato.

**Casi limite**
- Il cambio di indirizzo del Locatario non modifica Immobile o Contratto.

### UC-LOC-03 - Associare più Locatari a un Contratto
**Precondizioni**
- Contratto in creazione o modificabile.
- Locatari esistenti oppure creabili contestualmente.

**Azione utente**
- Aggiunge uno o più Locatari e specifica il ruolo di ciascuno.

**Comportamento del sistema**
- Crea una relazione `CONTRATTO_LOCATARIO` per ciascun soggetto, con decorrenza coerente con il Contratto salvo diversa data esplicita.

**Risultato**
- Un unico Contratto associato a più Locatari.

**Casi limite**
- Lo stesso Locatario non può essere duplicato due volte nello stesso intervallo e nello stesso Contratto.
- La presenza di più Locatari non divide automaticamente il Canone tra loro.

### UC-LOC-04 - Aggiungere un Locatario a un Contratto già attivo
**Precondizioni**
- Contratto Attivo.
- Nuovo Locatario disponibile.

**Azione utente**
- Seleziona **Aggiungi Locatario**, ruolo e data di decorrenza.

**Comportamento del sistema**
- Crea una nuova relazione `CONTRATTO_LOCATARIO` a partire dalla data indicata senza ricreare il Contratto né alterare le relazioni precedenti.

**Risultato**
- Composizione dei Locatari aggiornata e storico preservato.

**Casi limite**
- Decorrenza fuori dal periodo del Contratto: operazione bloccata.
- La modifica dei Locatari non modifica automaticamente importo o generazione dei Canoni.

### UC-LOC-05 - Far uscire un Locatario da un Contratto
**Precondizioni**
- Locatario associato a un Contratto Attivo.

**Azione utente**
- Seleziona **Termina partecipazione** e indica la data di fine.

**Comportamento del sistema**
- Chiude la relazione `CONTRATTO_LOCATARIO` alla data specificata.
- Non elimina Locatario, Contratto, Canoni, Incassi o Documenti storici.

**Risultato**
- Dal giorno successivo alla data di fine il soggetto non risulta più tra i Locatari correnti del Contratto, ma resta nello storico.

**Casi limite**
- Data fine precedente alla data inizio: operazione bloccata.
- Uscita dell'ultimo Locatario: il sistema segnala che il Contratto rimarrebbe privo di Locatari correnti; la gestione definitiva di questo caso viene coordinata con il ciclo di vita Contratti.

### UC-LOC-06 - Subentro/Sostituzione di un Locatario
**Precondizioni**
- Contratto esistente.
- Un Locatario esce e un altro entra senza creare necessariamente un nuovo Contratto gestionale.

**Azione utente**
- Registra uscita del Locatario precedente e ingresso del nuovo, indicando le rispettive date.

**Comportamento del sistema**
- Chiude la vecchia relazione e ne crea una nuova.
- Conserva un'unica identità del Contratto.
- Non riassegna retroattivamente Canoni e Incassi precedenti al nuovo Locatario.

**Risultato**
- Storico completo della composizione dei Locatari.

**Casi limite**
- Periodi sovrapposti sono ammessi se rappresentano effettivamente co-conduttori; non devono essere interpretati automaticamente come errore.

### UC-LOC-07 - Rendere Inattivo un Locatario
**Precondizioni**
- Locatario esistente.

**Azione utente**
- Seleziona **Archivia / Rendi inattivo**.

**Comportamento del sistema**
- Mantiene anagrafica e storico.
- Impedisce l'uso del Locatario Inattivo in nuovi Contratti senza una riattivazione esplicita.
- Verifica se esistono partecipazioni correnti a Contratti attivi.

**Risultato**
- Locatario escluso dalla normale selezione per nuovi Contratti.

**Casi limite**
- Partecipazione a Contratto attivo: l'archiviazione non può sostituire l'uscita dal Contratto; il sistema richiede prima la gestione della relazione contrattuale.

### UC-LOC-08 - Consultare la scheda Locatario
**Precondizioni**
- Locatario visibile all'Utente.

**Azione utente**
- Apre il dettaglio del Locatario.

**Comportamento del sistema**
- Mostra anagrafica, contatti, Contratti correnti e storici, ruolo e intervallo di partecipazione, Documenti e, ove pertinente, Incassi in cui il Locatario è indicato come Pagatore.

**Risultato**
- Vista unificata del rapporto gestionale con il Locatario.

**Casi limite**
- Un Incasso pagato da un Locatario non implica automaticamente che l'intero Canone sia di sua competenza.

### UC-LOC-09 - Gestire Documenti del Locatario
**Precondizioni**
- Locatario esistente.

**Azione utente**
- Carica un Documento e ne specifica categoria e metadati.

**Comportamento del sistema**
- Collega il Documento al Locatario; una eventuale data di scadenza può alimentare una Scadenza secondo le regole documentali.

**Risultato**
- Documento disponibile nella scheda Locatario e, se collegato anche ad altre entità, nelle relative viste.

**Casi limite**
- I vincoli definitivi di privacy, versionamento ed eliminazione saranno consolidati nell'area Documenti.

### 16.26.5 Locatario e Pagatore
Il **Locatario contrattuale** e il **Pagatore di un Incasso** sono concetti distinti.

Esempio:
```text
Contratto #25
Locatari: Mario Rossi, Luca Bianchi
Canone: €1.000

Incasso 1: Mario Rossi   €600
Incasso 2: Luca Bianchi  €400

Canone totale incassato: €1.000
```

Il sistema non deve presumere che ciascun Locatario debba una quota specifica del Canone salvo futura introduzione di una regola esplicita di ripartizione tra Locatari.

### 16.26.6 Vincoli temporali della relazione Contratto-Locatario
1. La data inizio della partecipazione deve ricadere nel periodo del Contratto.
2. La data fine, se presente, non può precedere la data inizio.
3. La data fine non deve eccedere il termine gestionale del Contratto, salvo gestione esplicita di proroga/rinnovo.
4. Lo storico non viene sovrascritto per rappresentare ingressi o uscite.
5. Un Locatario può partecipare contemporaneamente a più Contratti distinti.

### 16.26.7 Wireframe elenco Locatari
```text
┌────────────────────────────────────┐
│ Locatari                       [+] │
│ [Cerca...]        [Attivi ▼]       │
├────────────────────────────────────┤
│ Mario Rossi                        │
│ ATTIVO                             │
│ 1 contratto corrente               │
│ Via Verdi 15 • Stanza A            │
├────────────────────────────────────┤
│ Luca Bianchi                       │
│ ATTIVO                             │
│ 1 contratto corrente               │
│ Via Verdi 15 • Stanza A            │
├────────────────────────────────────┤
│ Anna Verdi                         │
│ INATTIVO                           │
│ 2 contratti storici                │
└────────────────────────────────────┘
```

### 16.26.8 Wireframe dettaglio Locatario
```text
┌────────────────────────────────────┐
│ Mario Rossi                   [⋮]  │
│ ATTIVO                             │
│ [Anagrafica] [Contratti] [Doc.]    │
├────────────────────────────────────┤
│ Email      mario@...               │
│ Telefono   ...                     │
│ C.F.       ***********             │
├────────────────────────────────────┤
│ CONTRATTO CORRENTE                 │
│ #25 • Via Verdi 15 • Stanza A      │
│ Conduttore                         │
│ Dal 01/09/2026                     │
│ [Apri contratto]                   │
├────────────────────────────────────┤
│ STORICO                            │
│ #12 • Via ...                      │
│ 01/09/2024 - 31/08/2026            │
├────────────────────────────────────┤
│ DOCUMENTI                          │
│ Carta identità • scad. ...         │
│ [+ Documento]                      │
└────────────────────────────────────┘
```

### 16.26.9 Wireframe gestione Locatari nel Contratto
```text
┌────────────────────────────────────┐
│ Contratto #25 • Locatari           │
├────────────────────────────────────┤
│ Mario Rossi                        │
│ Conduttore                         │
│ 01/09/2026 - ...                   │
│ [Termina partecipazione]           │
├────────────────────────────────────┤
│ Luca Bianchi                       │
│ Co-conduttore                      │
│ 01/09/2026 - 30/06/2027            │
│ STORICO                            │
├────────────────────────────────────┤
│ Anna Verdi                         │
│ Co-conduttore                      │
│ dal 01/07/2027                     │
├────────────────────────────────────┤
│ [+ Aggiungi Locatario]             │
└────────────────────────────────────┘
```

### 16.26.10 Regole di business Locatari
- **RB-LOC-01:** Locatario e Contratto sono entità indipendenti.
- **RB-LOC-02:** la relazione Contratto-Locatario è molti-a-molti ed è rappresentata da una relazione storicizzata.
- **RB-LOC-03:** un Contratto può avere uno o più Locatari contemporaneamente.
- **RB-LOC-04:** un Locatario può partecipare a più Contratti, anche contemporaneamente.
- **RB-LOC-05:** il ruolo Conduttore/Co-conduttore appartiene alla relazione col Contratto, non al Locatario.
- **RB-LOC-06:** ingressi e uscite modificano la validità della relazione senza cancellare lo storico.
- **RB-LOC-07:** l'uscita di un Locatario non modifica automaticamente Canoni o Incassi già registrati.
- **RB-LOC-08:** aggiungere un Locatario non modifica automaticamente importo, periodicità o generazione dei Canoni.
- **RB-LOC-09:** la presenza di più Locatari non comporta una ripartizione automatica del Canone tra essi.
- **RB-LOC-10:** il Pagatore di un Incasso non deve necessariamente coincidere con l'unico o con tutti i Locatari del Contratto.
- **RB-LOC-11:** un Locatario Inattivo non è utilizzabile in nuovi Contratti senza riattivazione.
- **RB-LOC-12:** rendere Inattivo un Locatario non sostituisce la chiusura delle sue partecipazioni a Contratti attivi.
- **RB-LOC-13:** il Locatario non deve essere eliminato fisicamente quando esiste storico contrattuale, economico o documentale.
- **RB-LOC-14:** la creazione di un Locatario non crea automaticamente alcun Contratto.

### 16.26.11 Cruscotto maturità funzionale

| Area | Maturità | Cosa manca |
|---|---|---|
| **Utenti / Gestori / Proprietari** | 🟢 **molto solida** | Solo validazione nello scenario end-to-end |
| **Immobili / comproprietà** | 🟢 **molto solida** | Solo validazione con Spese e scenario end-to-end |
| **Porzioni / stanze** | 🟢 **molto solida** | Solo validazione con Contratti e scenario end-to-end |
| **Locatari** | 🟢 **molto solida** | Solo validazione con ciclo di vita Contratti e scenario end-to-end |
| Contratti | 🟡 buona | Ciclo di vita e impatto sui Canoni |
| **Canoni / Incassi** | 🟢 **molto solida** | Solo validazione end-to-end |
| Spese | 🟡 da approfondire | Competenza, pagamento, conguagli |
| Documenti | 🟡 da approfondire | Ciclo di vita, versioni e sicurezza |
| Scadenze / notifiche | 🟡 da approfondire | Stati, ricorrenze e motore notifiche |
| Dashboard / report | 🟡 da approfondire | KPI e regole di aggregazione |

## 16.27 Approfondimento Contratti

### 16.27.1 Principi e stati
Il Contratto collega un Immobile intero oppure una o più Porzioni dello stesso Immobile, uno o più Locatari e le condizioni economiche che generano Canoni e Scadenze.

Si mantengono distinti:
- **stato gestionale**: Attivo / Inattivo;
- **fase del ciclo di vita**: Bozza, Da firmare, In corso, In scadenza, Disdetto, Cessato, Risolto anticipatamente.

Lo stato Attivo abilita l'operatività. Inattivo conserva integralmente lo storico ma esclude il Contratto dalla gestione corrente.

### 16.27.2 Condizioni economiche
Il Contratto deve mantenere almeno: decorrenza, termine, importo, periodicità, giorno di scadenza, deposito cauzionale, componenti accessorie, regime fiscale informativo, regole di rinnovo, preavviso e dati di registrazione.

La periodicità può essere mensile, bimestrale, trimestrale, semestrale, annuale o personalizzata. L'attivazione genera i Canoni fino al termine contrattuale o all'orizzonte operativo configurato.

### UC-CON-01 - Creare una Bozza
**Precondizioni:** Immobile Attivo, oggetto locativo disponibile nel periodo, almeno un Locatario selezionato.  
**Azione:** l'Utente completa il wizard Contratto.  
**Sistema:** valida oggetto, periodo, Locatari e condizioni economiche; crea una Bozza senza generare Canoni.  
**Risultato:** Contratto modificabile non operativo.  
**Casi limite:** conflitti temporali bloccano l'attivazione, ma la Bozza può essere salvata indicando le anomalie.

### UC-CON-02 - Attivare un Contratto
**Precondizioni:** Bozza completa, nessun conflitto sull'oggetto, almeno un Locatario corrente, condizioni economiche valide.  
**Azione:** seleziona **Salva e attiva**.  
**Sistema:** imposta Attivo/In corso, genera Canoni, Scadenze contrattuali e rende Locata la disponibilità dell'oggetto.  
**Risultato:** Contratto operativo.  
**Casi limite:** se la generazione non è completabile, l'attivazione deve essere atomica: nessun Contratto parzialmente attivato e nessun doppio Canone.

### UC-CON-03 - Modificare dati non economici
**Precondizioni:** Contratto esistente e Utente autorizzato.  
**Azione:** modifica note, dati di registrazione o metadati.  
**Sistema:** aggiorna senza rigenerare Canoni.  
**Risultato:** dati aggiornati e storico auditabile.  
**Casi limite:** oggetto, periodo e condizioni economiche seguono flussi specifici e non una modifica generica.

### UC-CON-04 - Variare il Canone
**Precondizioni:** Contratto Attivo e nuova decorrenza valida.  
**Azione:** registra nuovo importo/componenti, decorrenza e motivazione.  
**Sistema:** storicizza la variazione; ricalcola solo Canoni futuri non consolidati dalla decorrenza.  
**Risultato:** vecchie condizioni preservate, nuove condizioni applicate in avanti.  
**Casi limite:** Canoni Pagati, Parziali, In ritardo o Persi non sono riscritti automaticamente.

### UC-CON-05 - Prorogare o rinnovare
**Precondizioni:** Contratto esistente prossimo al termine o terminato secondo regole consentite.  
**Azione:** indica nuova scadenza e condizioni.  
**Sistema:** conserva l'identità del Contratto se si tratta di proroga; estende il periodo, genera nuovi Canoni e aggiorna Scadenze. Un rinnovo con condizioni sostanzialmente nuove può produrre un nuovo Contratto collegato al precedente.  
**Risultato:** continuità gestionale e storico.  
**Casi limite:** nessuna duplicazione di Canoni già generati.

### UC-CON-06 - Registrare disdetta
**Precondizioni:** Contratto Attivo.  
**Azione:** registra data comunicazione, mittente, termine previsto e Documento.  
**Sistema:** imposta fase Disdetto ma mantiene Attivo fino alla cessazione effettiva; crea Scadenze collegate.  
**Risultato:** disdetta tracciata senza cessazione immediata impropria.  
**Casi limite:** una disdetta può essere revocata solo con evento tracciato.

### UC-CON-07 - Cessare o risolvere anticipatamente
**Precondizioni:** Contratto Attivo.  
**Azione:** indica data effettiva, causale e documenti.  
**Sistema:** chiude la disponibilità contrattuale alla data; annulla o rende Non dovuti i Canoni futuri non consolidati successivi; conserva Canoni precedenti e crediti aperti; termina le partecipazioni dei Locatari.  
**Risultato:** Contratto Inattivo/Cessato o Risolto anticipatamente.  
**Casi limite:** Canoni Pagati non eliminati; eventuali crediti In ritardo restano esigibili e consultabili.

### UC-CON-08 - Rendere Inattivo
**Precondizioni:** Contratto non più operativo.  
**Azione:** archivia.  
**Sistema:** impedisce nuove generazioni operative e conserva tutti i dati.  
**Risultato:** Contratto storico.  
**Casi limite:** se ancora In corso, richiede prima cessazione/risoluzione.

### UC-CON-09 - Cambiare oggetto locativo
Il cambio da Intero Immobile a Porzioni, o tra Porzioni, non deve modificare implicitamente un Contratto Attivo. Richiede cessazione del Contratto corrente e creazione di un nuovo Contratto collegato, salvo correzione di una Bozza non attivata.

### 16.27.3 Tabella impatti sui Canoni
| Evento Contratto | Canoni passati/consolidati | Canoni futuri non consolidati | Nuovi Canoni |
|---|---|---|---|
| Attivazione | Nessuno | Generati | Sì |
| Variazione canone | Invariati | Ricalcolati dalla decorrenza | Secondo nuove condizioni |
| Proroga | Invariati | Invariati | Generati nel periodo prorogato |
| Disdetta | Invariati | Ancora validi fino alla cessazione | Secondo periodo ancora dovuto |
| Cessazione anticipata | Invariati | Annullati/Non dovuti dopo la data effettiva | No dopo cessazione |
| Inattivazione | Invariati | Nessuna generazione ulteriore | No |

### 16.27.4 Wireframe azioni Contratto
```text
Contratto #25 • ATTIVO • IN CORSO
[Modifica dati] [Varia canone] [Proroga]
[Registra disdetta] [Cessa/Risolvi] [Documenti]

Prima di confermare un'azione:
- riepilogo impatto sui Canoni;
- Scadenze create/chiuse;
- Locatari interessati;
- disponibilità dell'Immobile/Porzioni.
```

### 16.27.5 Regole Contratti
- **RB-CON-01:** una Bozza non genera Canoni.
- **RB-CON-02:** l'attivazione genera Canoni e Scadenze in modo atomico e idempotente.
- **RB-CON-03:** stato gestionale e ciclo di vita sono distinti.
- **RB-CON-04:** variazioni economiche sono storicizzate e non riscrivono Canoni consolidati.
- **RB-CON-05:** la cessazione conserva crediti e Incassi precedenti.
- **RB-CON-06:** Canoni non maturati dopo cessazione diventano Non dovuti/annullati secondo la data effettiva.
- **RB-CON-07:** la disdetta non coincide automaticamente con la cessazione.
- **RB-CON-08:** un Contratto Attivo richiede almeno un Locatario corrente.
- **RB-CON-09:** il cambio sostanziale dell'oggetto locativo richiede un nuovo Contratto.
- **RB-CON-10:** proroga e rinnovo non devono duplicare Canoni.

## 16.28 Approfondimento Spese

### 16.28.1 Concetti
La Spesa rappresenta un costo gestionale riferibile a Immobile, Porzione o patrimonio. Si distinguono:
- **competenza economica**: chi deve sostenere il costo;
- **pagamento effettivo**: chi ha materialmente pagato;
- **conguaglio**: differenza tra competenza e pagamento.

### UC-SPE-01 - Registrare una Spesa
**Precondizioni:** Immobile visibile e Utente autorizzato.  
**Azione:** indica ambito, categoria, data competenza, data pagamento, importo, pagatore, metodo, note e Documento.  
**Sistema:** crea la Spesa e propone la ripartizione secondo le Quote valide alla data di competenza.  
**Risultato:** costo tracciato e attribuito.  
**Casi limite:** Spesa non ancora pagata ammessa con stato Da pagare.

### UC-SPE-02 - Ripartire secondo Quote
Il sistema calcola automaticamente le competenze dei Proprietari usando le Quote valide alla data di competenza. Gli arrotondamenti devono chiudere esattamente sul totale, assegnando l'eventuale differenza minima in modo deterministico.

### UC-SPE-03 - Ripartizione manuale
L'Utente può sostituire la proposta con importi o percentuali manuali, specificando una motivazione. La somma delle competenze deve coincidere con il totale della Spesa.

### UC-SPE-04 - Registrare pagamento di un solo Proprietario
Se Enzo paga €600 per una Spesa 50/50, il sistema registra:
- competenza Enzo €300;
- competenza Sorella €300;
- pagamento Enzo €600;
- credito/conguaglio di Enzo verso Sorella €300.

### UC-SPE-05 - Pagamenti multipli/parziali
Una Spesa può avere più Pagamenti. Stato: Da pagare, Parzialmente pagata, Pagata, Annullata. Il residuo è totale Spesa meno Pagamenti validi.

### UC-SPE-06 - Rettificare/annullare
Una Spesa consolidata non viene cancellata senza traccia. Rettifica e annullamento devono preservare originale, motivazione, autore e data e aggiornare competenze/conguagli.

### UC-SPE-07 - Collegare a Porzione
Una Spesa specifica di una Porzione concorre sia al totale della Porzione sia al totale dell'Immobile. La competenza tra Proprietari continua a derivare dall'Immobile salvo ripartizione manuale.

### 16.28.2 Tabella stati Spesa
| Stato | Condizione |
|---|---|
| Da pagare | Nessun Pagamento valido e importo dovuto > 0 |
| Parzialmente pagata | Pagamenti > 0 e inferiori al totale |
| Pagata | Somma Pagamenti = totale |
| Annullata | Spesa neutralizzata con traccia della causale |

### 16.28.3 Wireframe Spesa e conguaglio
```text
Nuova spesa • €600 • Via Verdi 15
Competenza: Enzo €300 | Sorella €300
Pagamenti: Enzo €600
Conguaglio: Enzo +€300 | Sorella -€300
[Conferma ripartizione] [Allega documento]
```

### 16.28.4 Regole Spese
- **RB-SPE-01:** competenza e pagamento sono distinti.
- **RB-SPE-02:** ripartizione predefinita secondo Quote alla data di competenza.
- **RB-SPE-03:** ripartizione manuale richiede motivazione e quadratura sul totale.
- **RB-SPE-04:** più Pagamenti possono coprire una Spesa.
- **RB-SPE-05:** il conguaglio deriva dalla differenza tra pagato e competenza.
- **RB-SPE-06:** rettifiche non eliminano lo storico.
- **RB-SPE-07:** gli arrotondamenti devono preservare il totale.
- **RB-SPE-08:** una Spesa di Porzione confluisce nell'Immobile padre.

## 16.29 Approfondimento Documenti

### 16.29.1 Ciclo di vita e sicurezza
Il Documento è una risorsa unica collegabile a più entità tramite associazioni. Metadati minimi: nome, categoria, mime type, dimensione, data documento, scadenza, note, autore caricamento, data caricamento, stato e versione.

Stati: Attivo, Sostituito, Archiviato. La cancellazione fisica non è l'operazione ordinaria quando esistono relazioni o storico.

### UC-DOC-01 - Caricare
Selezione file, foto o scansione; validazione formato/dimensione; caricamento protetto; creazione metadati e associazioni.

### UC-DOC-02 - Collegare a più entità
Un unico file può essere associato, per esempio, a Contratto, Locatario e Immobile. La rimozione di un'associazione non elimina il file se restano altre associazioni.

### UC-DOC-03 - Versionare/Sostituire
Il nuovo file crea una nuova versione; il precedente passa a Sostituito ma resta consultabile nello storico autorizzato.

### UC-DOC-04 - Documento con scadenza
La data di scadenza può generare/aggiornare una Scadenza. Modifica o rimozione della data aggiorna la Scadenza collegata senza duplicarla.

### UC-DOC-05 - Archiviare
Archiviazione logica con conferma. Documento non mostrato nelle viste correnti ma preservato.

### UC-DOC-06 - Consultare/Scaricare
Accesso consentito solo se l'Utente ha visibilità su almeno una entità associata e permesso documentale coerente. Ogni accesso sensibile deve essere auditabile secondo il livello definito tecnicamente.

### 16.29.2 Wireframe dettaglio Documento
```text
Carta identità - Mario Rossi
ATTIVO • Versione 2
Categoria: Identità
Scadenza: 12/12/2029
Associato a: Locatario Mario Rossi; Contratto #25
[Apri] [Nuova versione] [Modifica metadati] [Archivia]
```

### 16.29.3 Regole Documenti
- **RB-DOC-01:** file e associazioni sono distinti.
- **RB-DOC-02:** un Documento può avere più associazioni senza duplicazione fisica.
- **RB-DOC-03:** rimuovere un'associazione non elimina automaticamente il file.
- **RB-DOC-04:** nuove versioni preservano le precedenti.
- **RB-DOC-05:** una Scadenza documentale collegata non deve essere duplicata.
- **RB-DOC-06:** visibilità Documento deriva dalle entità associate e dai permessi.
- **RB-DOC-07:** dati d'identità richiedono protezione e accesso autorizzato.
- **RB-DOC-08:** archiviazione ordinaria è logica, non distruttiva.

## 16.30 Approfondimento Scadenze / Notifiche

### 16.30.1 Separazione concettuale
La **Scadenza** rappresenta un obbligo/evento da gestire. La **Notifica** rappresenta un avviso inviato a un destinatario rispetto a quella Scadenza.

Stati Scadenza: Da fare, In scadenza, Scaduta, Completata, Annullata. `In scadenza` dipende dalla finestra configurata; `Scaduta` quando la data è superata e non Completata/Annullata.

### UC-SCA-01 - Creare manualmente
L'Utente indica titolo, categoria, data/ora, priorità, ricorrenza, responsabile, entità collegata e regole di promemoria.

### UC-SCA-02 - Generare automaticamente
Contratto, Documento o altra entità genera una Scadenza con collegamento alla fonte. La rigenerazione deve aggiornare quella esistente tramite chiave funzionale, non duplicarla.

### UC-SCA-03 - Completare
Registra data completamento, autore, note e Documento opzionale. Interrompe i promemoria futuri.

### UC-SCA-04 - Ricorrenza
Al completamento di una Scadenza ricorrente viene generata la successiva occorrenza secondo la regola configurata, preservando lo storico.

### UC-SCA-05 - Configurare Notifiche
Per ogni Scadenza o tipologia: canale Push/E-mail, destinatari e offset, ad esempio 30, 7 e 1 giorno prima e il giorno stesso.

### UC-SCA-06 - Invio e tracciamento
Il sistema registra almeno Notifica pianificata, inviata, fallita o annullata. Un errore di invio non modifica lo stato della Scadenza.

### 16.30.2 Tabella transizioni Scadenza
| Condizione/evento | Stato finale |
|---|---|
| Creazione, fuori finestra imminenza | Da fare |
| Entra nella finestra configurata | In scadenza |
| Data superata senza completamento | Scaduta |
| Utente completa | Completata |
| Utente annulla | Annullata |

### 16.30.3 Wireframe Scadenza
```text
Assicurazione Via Verdi 15
IN SCADENZA • 31/12/2026
Responsabile: Enzo
Promemoria: 30gg e 7gg E-mail; 1gg Push
[Completa] [Modifica] [Annulla]
```

### 16.30.4 Regole Scadenze/Notifiche
- **RB-SCA-01:** Scadenza e Notifica sono entità distinte.
- **RB-SCA-02:** completamento interrompe Notifiche future non inviate.
- **RB-SCA-03:** fallimento Notifica non completa né annulla la Scadenza.
- **RB-SCA-04:** generatori automatici devono essere idempotenti.
- **RB-SCA-05:** ricorrenze creano nuove occorrenze preservando lo storico.
- **RB-SCA-06:** Scaduta è determinato automaticamente dalla data.
- **RB-SCA-07:** destinatari devono appartenere al perimetro autorizzato.

## 16.31 Approfondimento Dashboard / Report

### 16.31.1 Obiettivo e filtri
La Dashboard deve offrire controllo gestionale, non fiscale. Filtri comuni: periodo, Proprietario, città, Immobile, Porzione, Contratto e stato. Ogni KPI deve essere apribile nel dettaglio filtrato che lo compone.

### KPI baseline
- Patrimonio: Immobili Attivi, Porzioni Libere/Locate/Non disponibili.
- Canoni: Previsto, Incassato, Residuo, In ritardo, Perso.
- Spese: competenza, pagato, residuo da pagare.
- Risultato gestionale: Incassi meno Spese pagate nel periodo; separato dal risultato per competenza.
- Scadenze: imminenti, scadute, completate.
- Contratti: Attivi, In scadenza, cessati nel periodo.

### UC-DAS-01 - Consultare Dashboard
Applica perimetro utente e filtri; mostra KPI e anomalie. Nessun dato fuori perimetro deve contribuire agli aggregati.

### UC-DAS-02 - Drill-down
Selezionando un KPI, apre la lista degli elementi che compongono il valore con gli stessi filtri.

### UC-DAS-03 - Vista Proprietario
Mostra quote di competenza, Incassi attribuiti, Spese di competenza, pagamenti effettivi e conguagli.

### UC-DAS-04 - Vista Immobile/Porzione
Aggrega Contratti, Canoni, Incassi e Spese dell'Immobile; le Spese di Porzione confluiscono nell'Immobile senza doppio conteggio.

### UC-DAS-05 - Esportare
CSV/Excel con filtri applicati, data estrazione e colonne esplicite. Gli importi esportati devono riconciliarsi con il dettaglio mostrato.

### 16.31.2 Regole di aggregazione
- **Previsto Canoni:** somma importi dovuti nel periodo, inclusi Pagati, Parziali, In ritardo e Persi; esclusi Non dovuti/annullati.
- **Incassato:** somma Incassi con data nel periodo selezionato.
- **Residuo:** parte ancora aperta dei Canoni inclusi nel perimetro/filtro.
- **Perso:** importo residuo dichiarato perso nel periodo/evento di perdita.
- **Spese per competenza:** data di competenza.
- **Spese pagate:** data del Pagamento.
- **Nessun doppio conteggio:** aggregare una Spesa di Porzione una sola volta nel totale dell'Immobile.

### 16.31.3 Wireframe Dashboard consolidata
```text
Dashboard [Periodo ▼] [Proprietario ▼] [Città ▼]
PATRIMONIO: 8 immobili | 6 locati | 2 liberi
CANONI: previsto €5.200 | incassato €4.000 | residuo €1.200
ANOMALIE: in ritardo €900 | perso €200 | 3 scadenze scadute
SPESE: competenza €750 | pagato €600 | da pagare €150
RISULTATO GESTIONALE DI CASSA: €3.400
[Apri canoni] [Apri spese] [Apri scadenze]
```

### 16.31.4 Regole Dashboard/Report
- **RB-DAS-01:** tutti gli aggregati rispettano perimetro e filtri.
- **RB-DAS-02:** KPI e dettaglio devono riconciliarsi.
- **RB-DAS-03:** cassa e competenza sono distinti.
- **RB-DAS-04:** risultato gestionale non è reddito fiscale.
- **RB-DAS-05:** Spese di Porzione non sono duplicate nel totale Immobile.
- **RB-DAS-06:** export riporta filtri e data estrazione.
- **RB-DAS-07:** Canoni Non dovuti/annullati non concorrono al Previsto.

## 16.32 Cruscotto consolidato di maturità funzionale

| Area | Maturità | Cosa manca |
|---|---|---|
| **Utenti / Gestori / Proprietari** | 🟢 **molto solida** | Validazione end-to-end |
| **Immobili / comproprietà** | 🟢 **molto solida** | Validazione con Spese e scenario end-to-end |
| **Porzioni / stanze** | 🟢 **molto solida** | Validazione con Contratti |
| **Locatari** | 🟢 **molto solida** | Validazione con ciclo Contratti |
| **Contratti** | 🟢 **molto solida** | Validazione end-to-end e normativa fuori MVP |
| **Canoni / Incassi** | 🟢 **molto solida** | Validazione end-to-end |
| **Spese** | 🟢 **molto solida** | Validazione con Quote/conguagli reali |
| **Documenti** | 🟢 **molto solida** | Limiti tecnici formati/dimensioni in analisi tecnica |
| **Scadenze / notifiche** | 🟢 **molto solida** | Provider e retry in analisi tecnica |
| **Dashboard / report** | 🟢 **molto solida** | Validazione KPI sullo scenario end-to-end |

**Esito:** tutte le aree funzionali principali sono ora sufficientemente dettagliate. Prima del modello dati logico resta un unico passaggio consigliato: scenario end-to-end realistico e freeze della baseline v1.0.

## 16.33 Scenario end-to-end realistico di validazione

> **Nota:** tutti i nominativi, indirizzi, importi e documenti di questa simulazione sono dati esemplificativi. Lo scenario serve a verificare la coerenza della baseline funzionale v1.0.

### 16.33.1 Obiettivo e perimetro
Lo scenario verifica nello stesso flusso:
- Utenti e perimetri di gestione;
- Proprietari e comproprietà storica;
- Immobile e Porzioni;
- Locatari multipli e subentro;
- Contratto, variazione, disdetta e cessazione;
- Canoni, Incassi parziali, ritardo e perdita;
- Spese, pagamenti e conguagli;
- Documenti, Scadenze e Notifiche;
- Dashboard e riconciliazione dei KPI.

Periodo principale simulato: **gennaio-aprile 2027**, con una successiva variazione delle Quote dal **1 luglio 2027**.

### 16.33.2 Passo 1 - Utenti, Proprietari e perimetro
Vengono configurati:

| Entità | Configurazione |
|---|---|
| Utente Enzo | Administrator; gestisce Proprietario Enzo e Proprietario Sorella |
| Utente Sorella | Gestore; gestisce Proprietario Sorella |
| Proprietario Enzo | Persona fisica, Attivo |
| Proprietario Sorella | Persona fisica, Attivo |

**Verifica**
- Enzo vede tutti gli Immobili posseduti da almeno uno dei due Proprietari.
- Sorella vede gli Immobili di cui Proprietario Sorella possiede una Quota.
- Il collegamento Utente-Proprietario non sostituisce `GESTIONE_PROPRIETARIO`.

**Esito:** superato.

### 16.33.3 Passo 2 - Immobile e comproprietà
Viene creato l'Immobile esemplificativo:

```text
Appartamento Roma Centro
Tipologia: Appartamento
Stato: Attivo
Proprietari dal 01/01/2020:
- Proprietario Enzo: 50%
- Proprietario Sorella: 50%
```

La somma delle Quote è 100%. Vengono associate quattro Porzioni:

| Porzione | Tipo | Stato iniziale |
|---|---|---|
| Stanza A | Stanza | Libera |
| Stanza B | Stanza | Libera |
| Stanza C | Stanza | Non disponibile |
| Posto auto | Posto auto | Libero |

**Verifica:** Immobile, Quote e Porzioni sono separati; la Porzione Non disponibile non è selezionabile per una nuova locazione.

**Esito:** superato.

### 16.33.4 Passo 3 - Documenti iniziali e Scadenze
Sono caricati:

| Documento | Associazione | Scadenza |
|---|---|---|
| Visura catastale | Immobile | Nessuna |
| Planimetria | Immobile | Nessuna |
| Polizza assicurativa | Immobile | 31/12/2027 |
| Carta d'identità Mario | Locatario Mario | 30/09/2029 |
| Carta d'identità Luca | Locatario Luca | 31/05/2028 |

La Polizza genera una sola Scadenza collegata, con notifiche esemplificative 30 e 7 giorni prima via e-mail e 1 giorno prima via push.

**Verifica:** un unico Documento può essere collegato a più entità; la rigenerazione non duplica la Scadenza.

**Esito:** superato.

### 16.33.5 Passo 4 - Contratto su Stanza A con due Locatari
Viene creata una Bozza:

```text
Oggetto: Stanza A + Posto auto
Locatari:
- Mario, Conduttore
- Luca, Co-conduttore
Decorrenza: 01/01/2027
Scadenza: 31/12/2027
Periodicità: Mensile
Canone: €1.000
Scadenza Canone: giorno 5
Deposito cauzionale: €1.000
```

La Bozza non genera Canoni. All'attivazione:
- Contratto = Attivo / In corso;
- Stanza A e Posto auto = Locati nell'intervallo;
- vengono generati 12 Canoni da gennaio a dicembre 2027;
- vengono generate Scadenze di fine Contratto/preavviso secondo configurazione;
- viene collegato il Documento Contratto firmato.

**Controllo negativo:** un nuovo Contratto sull'intero Immobile dal 1 febbraio 2027 viene bloccato perché confligge con Stanza A e Posto auto già locati.

**Esito:** superato.

### 16.33.6 Passo 5 - Canoni e Incassi gennaio-aprile

#### Gennaio: Pagato integralmente
L'Utente seleziona **Pagato** sul Canone di €1.000.

Il sistema crea automaticamente:
```text
Incasso gennaio: €1.000
Pagatore: Mario
Canone gennaio: Pagato
Residuo: €0
```

#### Febbraio: Pagamento parziale poi saldo
L'Utente seleziona **Parziale** e registra €600 pagati da Mario. Il sistema crea un Incasso di €600 e lascia Residuo €400. Prima della scadenza lo stato è Parziale.

Successivamente seleziona **Pagato**: il sistema crea un secondo Incasso di €400, non di €1.000. Stato finale Pagato, Residuo €0.

#### Marzo: Parziale e poi In ritardo
Viene registrato un Incasso di €400 pagato da Luca. Dopo il 5 marzo, Residuo €600 > 0: lo stato diventa automaticamente In ritardo senza creare un nuovo Incasso.

#### Aprile: Perso
Il Canone di aprile non riceve Incassi. Superata la scadenza diventa In ritardo. L'Utente lo dichiara Perso: nessun Incasso viene creato e €1.000 sono tracciati come importo perso.

#### Riconciliazione Canoni gennaio-aprile

| Mese | Dovuto | Incassato | Residuo aperto | Perso | Stato finale |
|---|---:|---:|---:|---:|---|
| Gennaio | €1.000 | €1.000 | €0 | €0 | Pagato |
| Febbraio | €1.000 | €1.000 | €0 | €0 | Pagato |
| Marzo | €1.000 | €400 | €600 | €0 | In ritardo |
| Aprile | €1.000 | €0 | €0 | €1.000 | Perso |
| **Totale** | **€4.000** | **€2.400** | **€600** | **€1.000** | - |

Controllo: `Dovuto €4.000 = Incassato €2.400 + Residuo aperto €600 + Perso €1.000`.

**Esito:** superato.

### 16.33.7 Passo 6 - Subentro di un Locatario
Luca termina la partecipazione al Contratto il 30/06/2027. Anna entra come Co-conduttrice dal 01/07/2027.

Il sistema:
- chiude `CONTRATTO_LOCATARIO` di Luca;
- crea la relazione di Anna;
- conserva Mario come Conduttore;
- non modifica Canoni e Incassi precedenti;
- non divide automaticamente i Canoni futuri tra Mario e Anna.

**Esito:** superato.

### 16.33.8 Passo 7 - Spesa, Pagamento e conguaglio
Il 15/03/2027 viene registrata una Spesa di manutenzione dell'Immobile:

```text
Importo: €600
Data competenza: 15/03/2027
Quote valide: Enzo 50%, Sorella 50%
Competenza: Enzo €300, Sorella €300
Pagamento effettivo: Enzo €600
```

Il sistema calcola:

| Proprietario | Competenza | Pagato | Conguaglio |
|---|---:|---:|---:|
| Enzo | €300 | €600 | +€300 |
| Sorella | €300 | €0 | -€300 |

Il Documento Fattura manutenzione viene collegato a Spesa e Immobile.

**Esito:** superato.

### 16.33.9 Passo 8 - Spesa specifica di Porzione
Viene registrata una Spesa di €120 per la serratura di Stanza A. La Spesa:
- è associata a Stanza A e all'Immobile padre;
- appare nel totale economico della Porzione;
- confluisce una sola volta nel totale dell'Immobile;
- è ripartita 50/50 per competenza salvo eccezione manuale.

**Esito:** superato; verificato il non doppio conteggio.

### 16.33.10 Passo 9 - Variazione delle Quote
Dal 01/07/2027 cambia l'assetto:

```text
Fino al 30/06/2027
Enzo 50% | Sorella 50%

Dal 01/07/2027
Enzo 75% | Sorella 25%
```

Il sistema chiude le vecchie Quote il 30/06 e crea il nuovo assetto dal 01/07. La Spesa di marzo resta ripartita 50/50. Una nuova Spesa di €400 con competenza 10/07/2027 viene proposta:
- Enzo €300;
- Sorella €100.

**Esito:** superato; lo storico economico non viene riscritto.

### 16.33.11 Passo 10 - Disdetta e cessazione anticipata
Il 15/09/2027 viene registrata una disdetta con cessazione effettiva al 31/10/2027.

Il sistema:
- imposta fase Disdetto, mantenendo operativo il Contratto fino al 31/10;
- mantiene dovuti i Canoni fino a ottobre;
- rende Non dovuti/annulla i Canoni futuri novembre e dicembre non consolidati;
- dal 01/11 rende nuovamente libere Stanza A e Posto auto;
- termina le partecipazioni correnti dei Locatari al 31/10;
- conserva eventuali crediti In ritardo precedenti.

**Esito:** superato.

### 16.33.12 Passo 11 - Dashboard e riconciliazione
Applicando il filtro gennaio-aprile 2027 all'Immobile, la Dashboard deve mostrare almeno:

| KPI | Valore atteso nello scenario |
|---|---:|
| Canoni previsti | €4.000 |
| Incassato | €2.400 |
| Residuo aperto | €600 |
| Perso | €1.000 |
| Spese di competenza registrate nel periodo | €720 |
| Spese pagate nel periodo | €720 |
| Risultato gestionale di cassa | €1.680 |

Calcolo di cassa: `Incassi €2.400 - Pagamenti Spese €720 = €1.680`.

Il drill-down di ciascun KPI deve riconciliarsi con gli elementi di dettaglio. La Spesa della serratura appare sia nel dettaglio Stanza A sia nell'Immobile, ma è conteggiata una sola volta nel KPI dell'Immobile.

**Esito:** superato.

### 16.33.13 Controlli negativi eseguiti

| Tentativo | Risposta attesa |
|---|---|
| Contratto Intero Immobile sovrapposto a Stanza A locata | Blocco |
| Secondo Contratto sovrapposto sulla stessa Stanza | Blocco |
| Quote correnti per totale 90% | Blocco/segnalazione prima dell'attivazione |
| Pagamento parziale superiore al Residuo | Blocco |
| Pagato su Canone con Residuo zero | Azione non disponibile |
| Archiviare Locatario ancora corrente nel Contratto | Blocco e richiesta gestione partecipazione |
| Archiviare Porzione con Contratto attivo | Blocco |
| Duplicare Scadenza dalla stessa Polizza | Aggiornamento della Scadenza esistente |
| Rimuovere un'associazione Documento con altre associazioni attive | File conservato |
| Cessare Contratto eliminando Canoni Pagati | Non consentito |

Tutti i comportamenti attesi sono coperti dalle regole funzionali definite.

### 16.33.14 Anomalie e decisioni emerse
La simulazione non evidenzia contraddizioni bloccanti. Sono emerse quattro precisazioni, da mantenere nella baseline:

1. **Orizzonte di generazione Canoni:** per Contratti molto lunghi, la scelta tra generazione completa e rolling horizon è tecnica/operativa; funzionalmente i Canoni devono risultare disponibili senza duplicazioni.
2. **Canone Perso:** occorre conservare separatamente `importo_perso` e chiudere il Residuo operativo, in modo che la riconciliazione resti verificabile.
3. **Cessazione:** i Canoni futuri non maturati devono diventare Non dovuti/annullati, mentre crediti già maturati restano aperti.
4. **Conguagli:** nella v1.0 sono calcolati e consultabili; un eventuale modulo di regolazione/pagamento dei conguagli può essere evolutivo.

### 16.33.15 Matrice di copertura end-to-end

| Area | Evidenza nello scenario | Esito |
|---|---|---|
| Utenti / Gestori / Proprietari | Perimetri differenti Enzo/Sorella | Superato |
| Immobili / comproprietà | Quote 50/50 poi 75/25 storicizzate | Superato |
| Porzioni / stanze | Stanza A + Posto auto, conflitti controllati | Superato |
| Locatari | Due Locatari e subentro Luca/Anna | Superato |
| Contratti | Bozza, attivazione, disdetta, cessazione | Superato |
| Canoni / Incassi | Pagato, Parziale, In ritardo, Perso | Superato |
| Spese | Competenza, Pagamento, Conguaglio, Porzione | Superato |
| Documenti | Associazioni, scadenza e versionabilità | Superato |
| Scadenze / Notifiche | Generazione, reminder e idempotenza | Superato |
| Dashboard / report | KPI riconciliati e nessun doppio conteggio | Superato |

### 16.33.16 Cruscotto maturità dopo la validazione

| Area | Maturità | Cosa manca |
|---|---|---|
| **Utenti / Gestori / Proprietari** | 🟢 **validata** | Traduzione nel modello logico |
| **Immobili / comproprietà** | 🟢 **validata** | Traduzione nel modello logico |
| **Porzioni / stanze** | 🟢 **validata** | Traduzione nel modello logico |
| **Locatari** | 🟢 **validata** | Traduzione nel modello logico |
| **Contratti** | 🟢 **validata** | Dettagli normativi/fiscali fuori MVP |
| **Canoni / Incassi** | 🟢 **validata** | Traduzione nel modello logico |
| **Spese** | 🟢 **validata** | Eventuale regolazione conguagli evolutiva |
| **Documenti** | 🟢 **validata** | Limiti tecnici in analisi tecnica |
| **Scadenze / notifiche** | 🟢 **validata** | Provider e retry in analisi tecnica |
| **Dashboard / report** | 🟢 **validata** | Implementazione e test di riconciliazione |

### 16.33.17 Esito finale e freeze funzionale
Lo scenario end-to-end è **superato**. I domini principali sono coerenti tra loro e non richiedono modifiche strutturali ulteriori prima del modello dati logico.

La baseline funzionale **GestioneImmobili v1.0 può essere dichiarata congelata (functional freeze)** con le quattro precisazioni del paragrafo 16.33.14. Nuove esigenze successive saranno gestite come variazioni della baseline e non come correzioni implicite del modello.

## 17. Perimetro MVP
### Incluso nella prima versione
- accesso utenti e perimetro Gestore-Proprietario;
- Proprietari, quote, immobili e porzioni;
- Locatari multipli per contratto;
- contratti con stato Active/Inactive e ciclo di vita separato;
- generazione rate e registrazione incassi;
- spese e ripartizione economica;
- scadenze e notifiche push/e-mail;
- documenti trasversali;
- dashboard ed export economico.

### Evoluzioni successive
- accesso dedicato Locatario e commercialista/tecnico;
- riconciliazione bancaria automatica;
- estrazione automatica da fatture/ricevute;
- adeguamento ISTAT assistito/automatizzato;
- firma elettronica e workflow avanzati;
- report fiscali evoluti;
- gestione manutentori e portale esteso.

## 18. Requisiti non funzionali iniziali
- **Mobile-first:** Android e iOS, semplice anche per utenti non tecnici.
- **Sicurezza:** autenticazione, autorizzazione per perimetro e protezione degli allegati.
- **Privacy:** dati personali e documenti d'identità solo agli utenti autorizzati.
- **Auditabilità:** autore e data almeno per modifiche sensibili.
- **Affidabilità:** prevenzione duplicazioni nelle operazioni economiche e generazione rate; mantenimento storico.
- **Scalabilità logica:** evoluzione da uso familiare a più patrimoni senza riprogettare le entità fondamentali.

## 19. Modello concettuale sintetico
```text
UTENTE
  |
  +-- GESTIONE_PROPRIETARIO --> PROPRIETARIO
                                  |
                                  +-- QUOTA_PROPRIETA --> IMMOBILE
                                                           |
                                           +---------------+---------------+
                                           |                               |
                                      PORZIONE                          SPESA
                                      LOCABILE                             |
                                           |                               |
                                           +----------> CONTRATTO <---------+
                                                          |
                                  +-----------------------+-------------------+
                                  |                       |                   |
                         CONTRATTO_LOCATARIO            RATA              SCADENZA
                                  |                       |                   |
                              LOCATARIO                INCASSO            NOTIFICA

DOCUMENTO <--> PROPRIETARIO / IMMOBILE / LOCATARIO / CONTRATTO /
               SPESA / INCASSO / SCADENZA
```

## 20. Vincoli e assunzioni della baseline
- La prima versione supporta gestione patrimoniale e controllo economico e non sostituisce adempimenti fiscali o consulenza professionale.
- Le regole fiscali/normative dipendenti dalla tipologia contrattuale saranno specificate prima di eventuali automazioni fiscali.
- Il risultato netto mostrato è un **risultato gestionale**, non reddito fiscale.
- Database, API, provider notifiche, storage e autenticazione saranno definiti nell'analisi tecnica.

## 21. Prossima fase di analisi
Con requisiti, modello concettuale e wireframe funzionale consolidati, la fase successiva è la definizione del **modello dati logico**, con entità, attributi, chiavi, relazioni/cardinalità e vincoli; a seguire architettura tecnica e backlog dell'MVP.


---

## Aggiornamento MVP - Generazione progressiva dei Canoni

### Principio
I Canoni non vengono generati integralmente all'attivazione del Contratto. Sono generati progressivamente all'inizio di ciascun periodo di competenza, secondo la periodicità contrattuale e a partire dal primo periodo esplicitamente indicato nel Contratto.

### RF-CAN-15 - Primo periodo di competenza
Durante la creazione del Contratto è obbligatorio indicare il **primo periodo di competenza**. Per periodicità mensile la UI lo presenta come **Prima mensilità**.

### RF-CAN-16 - Generazione progressiva
Il sistema genera ciascun Canone all'inizio del relativo periodo:
- mensile: il primo giorno di ogni mese;
- bimestrale/trimestrale/semestrale/annuale: il primo giorno del relativo periodo;
- personalizzata: secondo l'intervallo configurato.

### RF-CAN-17 - Distinzione fra generazione e scadenza
La data di generazione coincide con l'inizio del periodo di competenza. La data di scadenza è calcolata separatamente applicando la regola contrattuale (`due_day`).

### RF-CAN-18 - Recupero periodi mancanti
Il generatore deve essere recuperabile e idempotente: a ogni esecuzione identifica tutti i periodi maturati fino alla data corrente che avrebbero dovuto generare un Canone e crea soltanto quelli mancanti.

### RF-CAN-19 - Fine generazione
Non vengono generati Canoni con periodo iniziale successivo alla data effettiva di cessazione del Contratto. In caso di cessazione retroattiva, i Canoni già generati ma non dovuti passano a `NOT_DUE` senza cancellazione.

### RF-CON-10 - Prima mensilità / primo periodo
Il wizard Contratto richiede:
- periodicità;
- primo periodo di competenza;
- giorno di pagamento;
- importo valido per quel periodo.

### Wireframe aggiornato
```text
CONDIZIONI ECONOMICHE
Canone                  [€ 1.000]
Periodicità             [Mensile ▼]
Prima mensilità         [Febbraio 2027 ▼]
Giorno di pagamento     [5]

Anteprima:
Periodo                 01/02/2027 - 28/02/2027
Data generazione        01/02/2027
Scadenza                05/02/2027
```

Per periodicità non mensile l'etichetta diventa **Primo periodo di competenza**.

### Casi d'uso

#### UC-CAN-09 - Generare il Canone del periodo
**Precondizioni:** Contratto Attivo, data corrente uguale o successiva all'inizio del periodo, periodo compreso nella durata effettiva, Canone non già esistente.  
**Evento:** job pianificato o recupero manuale amministrativo.  
**Sistema:** individua il `CONTRACT_TERM` valido all'inizio del periodo, calcola importo/periodo/scadenza e crea il Canone.  
**Risultato:** un solo Canone `CREATED` per Contratto e periodo.  
**Casi limite:** retry o doppia esecuzione non creano duplicati.

#### UC-CAN-10 - Recuperare Canoni mancanti
**Precondizioni:** uno o più periodi maturati privi di Canone.  
**Evento:** esecuzione successiva del generatore.  
**Sistema:** genera tutti e soltanto i periodi mancanti fino alla data corrente.  
**Risultato:** riallineamento senza duplicazioni.

### Regole di business
- **RB-CAN-22:** il primo periodo di competenza è obbligatorio.
- **RB-CAN-23:** il primo periodo non può iniziare prima della decorrenza contrattuale, salvo regola esplicita futura di prorata non compresa nell'MVP.
- **RB-CAN-24:** la generazione avviene all'inizio del periodo, non alla data di scadenza.
- **RB-CAN-25:** la scadenza è calcolata separatamente dal periodo.
- **RB-CAN-26:** il generatore è idempotente e recupera i periodi mancanti.
- **RB-CAN-27:** l'importo deriva dal `CONTRACT_TERM` valido al `period_start`.
- **RB-CAN-28:** variazioni future non richiedono rigenerazione di Canoni non ancora creati.
- **RB-CAN-29:** cessazione impedisce la generazione dei periodi successivi.
- **RB-CAN-30:** Canoni già generati e resi non dovuti non vengono eliminati.

### Decisione MVP sul prorata
La v1.3 non calcola automaticamente il prorata per periodi parziali. Il primo periodo è scelto esplicitamente dall'Utente e deve iniziare in una data coerente con la periodicità. Il prorata potrà essere introdotto come evoluzione con regole dedicate.

---

## 22. Stato di implementazione nel repository (2026-10-31)

Questa sezione fotografa il codice presente, non certifica il completamento funzionale, la validazione in produzione o la presenza di un client UI. “Schema presente” indica che esistono tabelle/migrazioni; non implica che ogni flusso descritto sia disponibile all'utente.

| Area | Stato nel repository | Confine attuale |
|---|---|---|
| Profili, Proprietari, accessi e inviti | Schema presente; helper e policy parziali | Non sono presenti RPC applicative per creare/accettare/revocare inviti o amministrare l'intero perimetro. |
| Immobili, quote, porzioni, Locatari e Contratti | Schema presente | Non risultano implementati tutti i flussi CRUD, attivazione, variazione termini, controllo completo di quote/occupazioni descritti nei requisiti. |
| Canoni e Incassi | Implementazione database parziale/operativa | Generazione progressiva, vista saldo, registrazione pagamento totale e parziale e cessazione contratto hanno funzioni SQL; dashboard e UI non sono incluse. |
| Spese e conguagli | Implementazione parziale | Esiste `create_expense_with_allocations`, con modalità quote/manuale e pagamento iniziale; non risultano le RPC generali di pagamento successivo, riallocazione e annullamento. |
| Documenti | Flusso database/API parziale | Prenotazione, finalizzazione, registrazione esito scansione e autorizzazione download sono presenti; la scansione malware effettiva è esterna. |
| Scadenze e notifiche | Schema presente | Non sono implementati nel repository scheduler, invio push/e-mail, template, preferenze utente e motore di consegna. |
| Privacy e consensi | Schema presente | Sono presenti tabelle per accettazioni e richieste interessato; non è presente l'intero workflow RPC di gestione/esecuzione. |
| Dashboard, report ed esportazioni | Requisiti progettuali | Non risultano viste/RPC applicative per dashboard e non è presente un frontend o un'esportazione CSV/Excel. |
| App mobile e wireframe | Specifica UX | Non fanno parte del codice presente. |

### Regole di lettura
- I wireframe, i casi d'uso e le feature senza implementazione indicata sopra restano requisiti di prodotto, non funzionalità già consegnate.
- Le migration SQL e gli script di test sono presenti; la loro presenza non dimostra che l'intera suite sia stata eseguita con esito positivo nell'ambiente corrente.
- Per il comportamento implementato del billing fare riferimento alle migration e alla relativa documentazione tecnica; per le funzionalità non coperte occorre completare design, RPC, RLS e test prima di dichiararle disponibili.
