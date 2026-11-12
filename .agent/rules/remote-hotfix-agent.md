# Remote Hotfix Agent Guidelines (Cloud & PC Spento)

Questo file definisce le convenzioni e il workflow per il Remote Hotfix Agent attivato da Telegram (`@CalcettoHotfixBot`) ed eseguito nel Cloud tramite GitHub Actions.

## 1. Architettura Asincrona a PC Spento
- **Ingresso / Dispatcher:** Telegram Webhook -> Firebase Cloud Functions (`europe-west1`).
- **Ruolo Firebase:** "Passa-carte" leggero (1s). Scarica eventuali allegati (screenshot, vocali), trascrive l'audio con Gemini Flash e attiva il workflow di GitHub Actions via `repository_dispatch`.
- **Esecutore:** GitHub Actions Cloud Runner (`ubuntu-latest`) con `scripts/remote-hotfix-runner.mjs`.

## 2. Garanzia Anti-Troncamento (Zero-Truncation Guarantee)
- Il modello non deve riscrivere interi file da centinaia di righe.
- Deve generare patch chirurgiche snippet search/replace (`{ path, search, replace }`).
- Ogni risposta deve essere verificata con `finishReason === 'STOP'`.

## 3. Gestione Release Notes & Versione
- Ogni hotfix DEVE aggiungere la bozza con `"version": "NEXT"` in cima a `public/release-notes.json`.
- Compilare sempre in italiano amichevole:
  - `userChanges`: novità utili ai giocatori.
  - `superUserChanges`: dettagli tecnici o di configurazione per l'admin.
- Eseguire `node scripts/bump-version.mjs` che converte `"NEXT"` nel numero effettivo della versione e sincronizza tutti i file del repository (`package.json`, `version.json`, `version.ts`, `release-notes.model.ts`).

## 4. Validazione & Self-Healing
- La build (`npm run build`) deve essere verde al 100%.
- In caso di errori TypeScript/Angular, il runner attiva un ciclo di self-healing (fino a 2 tentativi) passando l'errore del compilatore a Gemini.
- Se la build non passa, il branch non viene pubblicato su `main` e l'utente riceve la notifica dell'errore.

