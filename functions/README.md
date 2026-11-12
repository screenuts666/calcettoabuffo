# Remote Hotfixing Bot (@CalcettoHotfixBot) su Firebase Cloud Functions v2

Questo modulo implementa il sistema di Remote Hotfixing multimodale per il progetto Calcetto Abbuffo, interamente ospitato su **Google Cloud / Firebase Cloud Functions v2**.

## Architettura

- **`telegramHotfix` (HTTP v2 `onRequest`):**
  - Configurazione: `europe-west1`, `2GiB` RAM, 2 CPU, timeout 540s.
  - Riceve gli update Telegram dal webhook ufficiale (`setWebhook`).
  - Supporta messaggi testuali, screenshot/foto e note vocali (`.ogg`).
  - Utilizza l'SDK ufficiale `@google/genai` con il modello **`gemini-3.8-flash`** in modalità **`ThinkingLevel.HIGH`**.
  - Pipeline autonoma in `/tmp/workspace`: clone da GitHub via PAT, patch con Gemini, bump versione & release notes, loop di compilazione/self-healing con Angular (`nx build`), commit, push, PR su GitHub e deploy programmatico su Firebase Hosting.
  - Invia notifica live su Telegram con i dettagli dell'aggiornamento e bottoni rapidi `/merge` e `/discard`.

- **`morningReminder` (Scheduler v2 `onSchedule`):**
  - Configurazione: schedulata ogni mattina alle **08:30 Europe/Rome** (`30 8 * * *`).
  - Ispeziona via GitHub API se ci sono branch `hotfix/*` o PR aperte dalla sera prima.
  - Se presenti, invia un promemoria su Telegram con i link diretti e le azioni per mergiare o cestinare il branch.

## Comandi

- **Build locale TypeScript delle functions:**
  ```bash
  npm --prefix functions run build
  ```

- **Deploy completo e configurazione Webhook:**
  ```bash
  npm run deploy:hotfix-bot
  ```

- **Registrazione manuale del Webhook:**
  ```bash
  node functions/scripts/set-webhook.mjs
  ```
