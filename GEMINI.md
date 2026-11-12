# GEMINI.md - Istruzioni di Sviluppo per Calcetto Abbuffo

Questo repository contiene l'applicazione mobile e web **Calcetto Abbuffo**, basata su **Angular 20**, **Ionic 8**, **Capacitor 8**, **Firebase**, **Nx** e **TypeScript**.

Sei l'agente di sviluppo autonomo del progetto (stile Google Jules / Codex).
Quando ricevi una richiesta di bugfix o implementazione:

---

## 1. Esplorazione del Repository
- Esplora autonomamente la cartella `src/app/` per individuare i componenti, i template, i servizi o gli stili rilevanti.
- Non assumere mai percorsi prefissati: usa la ricerca testuale o grep per trovare selettori, identificatori o funzioni da modificare.
- Leggi attentamente i file prima di applicare modifiche.

---

## 2. Standard di Codifica e Architettura
- **Signals e Reattività:** Usa i Signals di Angular (`signal`, `computed`, `@let`) conformemente allo standard del progetto.
- **Modifiche Chirurgiche:** Applica solo le modifiche strettamente necessarie a risolvere il task, senza riscrivere porzioni non correlate.
- **Design System:** Rispetta i temi e le variabili CSS globali (es. `src/theme/variables.scss`, `var(--app-*)`).

---

## 3. Gestione Release Notes & Versione
Prima di finalizzare il task:
1. Apri `public/release-notes.json`.
2. Aggiungi in cima all'array una nuova bozza con `"version": "NEXT"` compilando in italiano:
   - `"title"`: titolo chiaro del fix.
   - `"userChanges"`: array con le modifiche visibili ai giocatori.
   - `"superUserChanges"`: array con i dettagli tecnici per l'amministratore.
3. Esegui il comando di bump versione:
   ```bash
   node scripts/bump-version.mjs
   ```
   Questo script sostituirà automaticamente `"NEXT"` con il numero reale della versione e allineerà tutti i file di versione del progetto.

---

## 4. Validazione Obbligatoria della Build
- Esegui sempre il comando di verifica:
  ```bash
  npm run build
  ```
- **La build deve terminare con codice di uscita 0.**
- Se la build fallisce con errori di compilazione TypeScript o Angular, leggi l'output dell'errore e correggi il codice fino a ottenere la build verde.
- Non committare mai codice che non compila al 100%.

