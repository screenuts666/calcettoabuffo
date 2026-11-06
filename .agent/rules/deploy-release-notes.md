---
trigger: always_on
description: Regola automatica di aggiornamento Release Notes JSON ad ogni richiesta di deploy (DEV o PROD)
---

# Gestione Automatica Release Notes & Deploy Allineato (DEV & PROD)

Ogni volta che l'utente chiede di fare un **deploy** (`npm run deploy`, `npm run deploy:all`, `npm run deploy:dev`, `npm run deploy:prod` o "deploya"):

1. **Prima di lanciare il comando di deploy**, aggiorna SEMPRE il file `public/release-notes.json`:
   - Aggiungi in cima all'array JSON (oppure aggiorna la voce corrente in cima se fa parte della stessa sessione di lavoro) un oggetto con `"version": "NEXT"` (lo script `scripts/bump-version.mjs` sostituirà automaticamente `"NEXT"` con il numero esatto della nuova versione generata, es. `"2.0.22"`, e rigenererà `src/app/models/release-notes.model.ts`).
   - Compila in italiano chiaro e amichevole:
     - `"title"`: titolo sintetico dell'aggiornamento.
     - `"userChanges"`: array di stringhe con le novità utili/visibili ai **Giocatori (User semplice)**.
     - `"superUserChanges"`: array di stringhe con le novità tecniche, di gestione match o di Area Segreta dedicate al **Super User / Admin**.
2. **Esecuzione Deploy**:
   - Per deployare sia DEV che PROD mantenendo la **stessa identica versione**, esegui il comando unificato:
     `npm run deploy` (oppure `npm run deploy:all`).
   - Se invece deployi solo DEV (`npm run deploy:dev`) e successivamente PROD (`npm run deploy:prod`), lo script rileverà automaticamente che DEV è già stato incrementato e **NON incrementerà nuovamente la versione su PROD**, garantendo sempre il perfetto allineamento tra DEV e PROD.

