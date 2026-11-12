# SPEC TECNICA: Sistema di Remote Hotfixing Multimodale via Telegram (`@CalcettoHotfixBot`) + Fix Cronometro

Agisci come il mio solito AI Pair Programmer qui su Antigravity. Hai accesso completo al workspace del progetto **calcettoabuffone**.

## 1. Obiettivo e Flusso di Lavoro
Voglio replicare esattamente il workflow che facciamo quando lavoro qui su Antigravity (ti passo un problema o uno screenshot -> analizzi il codice -> applichi il fix -> aggiorni versione e release notes -> fai build -> git commit/push -> deploy su DEV e su PROD), ma **attivabile da remoto tramite il mio Bot Telegram `@CalcettoHotfixBot`** quando sono al campo da gioco.

Prima di costruire il sistema, **analizza questo progetto per capire come gestiamo attualmente**:
- I due repository / ambienti (**DEV** e **PROD**) e i relativi target Firebase / Git remote.
- Il sistema di **versioning** (`package.json`, file `environment.ts`, o costanti dell'app) e dove vengono scritte o mostrate le **Release Notes / Changelog** nell'app.
- Gli script di build e deploy che usiamo di solito.

---

## 2. TASK 1: Risoluzione Immediata Bug Cronometro (Oggi)
Sul campo, al momento del fischio d'inizio, cliccando sul pulsante di start il cronometro non partiva:
1. Individua il componente/servizio che gestisce il cronometro della partita.
2. Correggi il bug assicurandoti che:
   - L'avvio non dipenda da un semplice contatore incrementale (`setInterval` puro che si congela su mobile in lockscreen), ma calcoli il delta rispetto al timestamp di avvio (`Date.now() - startTime`).
   - Il tap sul pulsante aggiorni immediatamente lo stato visivo (verifica `NgZone`, `ChangeDetectorRef` o Signals e rimuovi eventuali attese bloccanti su chiamate Firestore prima di far partire la UI).
3. Incrementa la versione, aggiorna le Release Notes secondo lo standard del progetto, verifica la build (`npm run build`) e prepara il deploy come facciamo sempre.

---

## 3. TASK 2: Architettura del Bot Telegram `@CalcettoHotfixBot`
Crea nel progetto (es. in `/tools/telegram-hotfix-agent`) il servizio collegato al bot Telegram:
- **Token Bot:** `YOUR_TELEGRAM_BOT_TOKEN_HERE` (salvalo SOLO in `.env` e verifica subito che `.env` sia in `.gitignore`!).
- **Sicurezza:** Risponde solo al mio `TELEGRAM_ALLOWED_CHAT_ID` (aggiungi il comando `/myid` per farmelo leggere al primo avvio).

### Input supportati dal Bot (Multimodale come su Antigravity):
Il bot deve accettare qualsiasi combinazione di:
1. **Messaggi di testo** (descrizione del bug o modifica UI/logica).
2. **Screenshot / Foto con o senza didascalia** (scarica l'immagine da Telegram e la passa come `inlineData` image/jpeg a Gemini per vedere l'errore grafico, il bottone bloccato o la console).
3. **Messaggi vocali** (scarica l'audio `.ogg` e lo passa a Gemini per ascoltare le istruzioni).

---

## 4. TASK 3: Pipeline Automatica "Antigravity-Style" (Code -> Version & Release Notes -> Build -> Git & Deploy DEV + PROD)
Quando invio un problema o uno screenshot al bot, l'agente deve eseguire in automatico tutta la nostra catena standard:

1. **Analisi & Codice (Multi-File):**
   - Scansiona l'albero di `src/` per individuare i file coinvolti dal testo o dallo screenshot.
   - Legge i file e genera la patch completa.
2. **Bump Versione & Release Notes:**
   - Aumenta automaticamente il numero di versione (patch/hotfix) nei file del progetto (`package.json`, `environment`, ecc.).
   - Aggiunge automaticamente la voce nelle **Release Notes / Changelog** dell'app descrivendo il fix appena applicato, esattamente nel formato che usiamo nel progetto.
3. **Build & Auto-Fix Loop:**
   - Lancia `npm run build` di verifica.
   - Se il compilatore Angular/TypeScript dà errore, passa l'output dell'errore a Gemini e corregge il codice in loop (fino a 3 tentativi) finché la build non è verde al 100%.
4. **Git & Deploy Doppio (DEV + Branch PROD):**
   - **Su DEV:** Applica le modifiche (con versione e release notes aggiornate), fa commit, push sul repo/ambiente **DEV** ed esegue il deploy su DEV.
   - **Su PROD:** Crea un branch dedicato `hotfix/<versione>-<slug>` sul repo di **PROD**, fa commit, push ed esegue il deploy (su canale di preview o ambiente live del branch in base alla nostra configurazione), aprendo la Pull Request verso `main`.
5. **Conferma su Telegram:**
   - Mi invia un messaggio di riepilogo su Telegram con:
     - Numero nuova versione e testo della Release Note aggiunta.
     - Elenco file modificati.
     - Esito build e link diretti a **DEV** e **PROD** aggiornati.
     - Comandi rapidi `/merge` (per mergiare il branch di hotfix su `main` di PROD) e `/rollback` (per scartare il branch di hotfix se qualcosa non va).

---

## 5. TASK 4: Sveglia / Promemoria Mattutino (Ore 08:30)
Configura un job schedulato ogni mattina alle **08:30** (ora italiana) che controlla se ci sono branch `hotfix/*` ancora non mergiati su PROD dalla sera prima:
- Se presenti, mi manda una notifica su Telegram: *"☀️ Buongiorno! Ieri sera hai fatto l'hotfix [Versione] dal campo. Ricordati di controllare il codice dal PC e fare il merge definitivo su PROD (o usa /merge qui in chat)."*

---

## 6. Esecuzione
1. Prima di scrivere codice, ispeziona il workspace attuale per mappare dove si trovano i file del cronometro, dove sono gestite le release notes/versioni e come sono configurati i remote/deploy di DEV e PROD.
2. Applica il TASK 1 (fix cronometro + release note + build).
3. Costruisci i file dei TASK 2, 3 e 4 e dammi le istruzioni rapide per avviare il bot.