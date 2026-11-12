# 🤖 Remote Hotfix Agent per Telegram (`@CalcettoHotfixBot`)

Agente multimodale alimentato da **Google Gemini 3.8 Flash con modalità High Thinking** (`ThinkingLevel.HIGH` via SDK ufficiale `@google/genai`) per eseguire modifiche al codice, bump di versione, aggiornamento delle Release Notes, build con self-healing e doppio deploy (DEV + branch PROD con PR) direttamente da Telegram mentre sei sul campo da calcetto.

---

## ⚡ Caratteristiche Principali

1. **AI Engine Potenziato:**
   - **Modello:** `gemini-3.8-flash`
   - **Reasoning Level:** `ThinkingLevel.HIGH` (ragionamento profondo per comprensione del contesto e zero errori di compilazione)
   - **SDK:** Ufficiale `@google/genai`

2. **Input Multimodali da Mobile:**
   - 📝 **Testo:** descrivi qualsiasi problema o usa `/fix <problema>`
   - 📸 **Screenshot / Foto:** invia una foto dal cellulare con o senza didascalia; il bot scarica l'immagine JPEG e la passa a Gemini per analizzare l'errore visivo
   - 🎙 **Messaggi Vocali:** manda un audio vocale dal campo da gioco; il bot scarica il file `.ogg` (Opus) e lo passa a Gemini per comprendere le istruzioni parlate in italiano

3. **Pipeline Automatica Self-Healing:**
   - Scansione albero file in `src/` e identificazione componenti coinvolti
   - Patch multi-file atomica con backup automatico di sicurezza
   - Aggiornamento automatico `public/release-notes.json` e bump di versione con `scripts/bump-version.mjs`
   - Test di compilazione con `npm run build`
   - **Self-Healing Loop:** se la compilazione TypeScript fallisce, passa l'errore a Gemini e auto-corregge il codice in loop (fino a 3 tentativi) prima di arrendersi
   - Se irreversibile: rollback automatico e avviso su Telegram

4. **Doppio Deploy & GitHub PR:**
   - Deploy immediato su **DEV** (`calcettoabuffone.web.app`)
   - Creazione branch dedicato `hotfix/v<versione>-<slug>`
   - Commit e push su GitHub (`screenuts666/calcettoabuffo`)
   - Deploy su **PROD** (`calcettoabuffone-prod.web.app`) per test immediato sul campo
   - Creazione automatica Pull Request verso `main` tramite `gh` CLI
   - Comandi rapidi `/merge` (unisce la PR su `main`) e `/discard` (chiude la PR e cancella il branch)

5. **Sveglia / Promemoria Mattutino (Ore 08:30 Europe/Rome):**
   - Ogni mattina alle 08:30 controlla se ci sono branch `hotfix/*` o PR aperte dalla sera prima
   - Se presenti, invia un alert su Telegram con link e comandi rapidi per completare il merge dal PC

---

## 🚀 Avvio Rapido

### 1. Configurazione `.env`
Assicurati che il file `tools/telegram-hotfix-agent/.env` contenga:
```env
TELEGRAM_BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN_HERE
TELEGRAM_ALLOWED_CHAT_ID=
GEMINI_API_KEY=tuo_token_gemini_qui
GEMINI_MODEL=gemini-3.8-flash
GEMINI_THINKING_LEVEL=HIGH
GITHUB_REPO=screenuts666/calcettoabuffo
FIREBASE_PROJECT_DEV=calcettoabuffone
FIREBASE_PROJECT_PROD=calcettoabuffone-prod
URL_DEV=https://calcettoabuffone.web.app
URL_PROD=https://calcettoabuffone-prod.web.app
MORNING_CHECK_TIME=08:30
```

> **Nota Sicurezza:** Il file `.env` è categoricamente protetto in `.gitignore` e non viene mai incluso nei commit Git.

### 2. Primo Avvio e Configurazione Chat ID
1. Avvia l'agente dal terminale:
   ```bash
   npm run bot
   ```
2. Apri Telegram, cerca **`@CalcettoHotfixBot`** e premi **Avvia** o invia:
   ```text
   /myid
   ```
3. Il bot rileverà automaticamente il tuo Chat ID e lo salverà in `.env`, diventando privato e protetto per il tuo solo utilizzo.

### 3. Comandi Telegram Disponibili
- `/fix <problema>`: avvia la pipeline di risoluzione
- Invia foto o vocale: avvia direttamente la pipeline multimodale
- `/status`: mostra versione corrente, status build e PR aperte
- `/merge`: unisce l'hotfix aperto su `main` di PROD
- `/discard`: chiude la PR e cestina il branch di hotfix
- `/myid`: verifica il tuo Chat ID
- `/help`: guida rapida ai comandi
