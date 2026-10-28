---
trigger: always_on
description: Regola automatica di aggiornamento Release Notes JSON ad ogni richiesta di deploy (DEV o PROD)
---

# Gestione Automatica Release Notes su Deploy

Ogni volta che l'utente chiede di fare un **deploy** (`npm run deploy:dev` o `npm run deploy:prod` o "deploya su dev/prod"):

1. **Prima di lanciare il comando di deploy**, aggiorna SEMPRE il file `public/release-notes.json`:
   - Aggiungi in cima all'array JSON (oppure aggiorna la voce corrente in cima se fa parte della stessa sessione di lavoro) un oggetto con `"version": "NEXT"` (lo script `scripts/bump-version.mjs` sostituirà automaticamente `"NEXT"` con il numero esatto della nuova versione generata, es. `"1.0.7"`, e rigenererà `src/app/models/release-notes.model.ts`).
   - Compila in italiano chiaro e amichevole:
     - `"title"`: titolo sintetico dell'aggiornamento.
     - `"userChanges"`: array di stringhe con le novità utili/visibili ai **Giocatori (User semplice)**.
     - `"superUserChanges"`: array di stringhe con le novità tecniche, di gestione match o di Area Segreta dedicate al **Super User / Admin**.
2. Subito dopo aver salvato `public/release-notes.json`, esegui `npm run deploy:dev` (o `npm run deploy:prod`), che lancerà `node scripts/bump-version.mjs` sincronizzando automaticamente `public/release-notes.json`, `public/version.json`, `src/environments/version.ts` e `src/app/models/release-notes.model.ts`.

