// FILE SINCRONIZZATO AUTOMATICAMENTE DA public/release-notes.json TRAMITE scripts/bump-version.mjs
export interface ReleaseNoteEntry {
  version: string;
  date: string;
  title: string;
  /** Novità visibili a tutti gli utenti dell'app */
  userChanges: string[];
  /** Novità visibili solo in modalità Super User / Admin */
  superUserChanges: string[];
}

export const RELEASE_NOTES_HISTORY: ReleaseNoteEntry[] = [
  {
    "version": "1.0.79",
    "date": "05/11/2026",
    "title": "Nuova Sequenza Wizard Partita: Coordinate Match, Convocati e Squadre",
    "userChanges": [
      "📍 Coordinate Match come Primo Step: la creazione della partita parte subito dall'inserimento di luogo, data, orario e impostazione portieri, così che tutti i dettagli logistici siano definiti fin dal principio.",
      "👥 Gestione Convocati Fluida: posizionato subito dopo le coordinate, lo step Convocati consente la selezione rapida dei giocatori per la gara con contatori in tempo reale.",
      "⚽ Squadre e Formazioni: il bilanciamento e la composizione delle squadre (Bianchi vs Neri) diventano l'ultimo passaggio di preparazione prima dell'inizio del match."
    ],
    "superUserChanges": [
      "Nuovo Wizard Stepper (1. Coordinate -> 2. Convocati -> 3. Squadre): avanzamento logico guidato con sincronizzazione automatica delle rose al passaggio alle formazioni.",
      "Navigazione e Indietro Ottimizzati: transizioni sicure tra i vari step della partita e ritorno protetto alla lista gare."
    ]
  },
  {
    "version": "1.0.78",
    "date": "05/11/2026",
    "title": "Orario Reale di Gara (Inizio - Fine), Timestamp Match e Pulizia Diciture Tecniche",
    "userChanges": [
      "🕒 Orario Reale di Inizio e Fine Gara: nella lista partite e nel report di gioco ora sono ben visibili l'orario effettivo del calcio d'inizio e del fischio finale (es. 19:05 - 20:03), evidenziati in azzurro sia nell'intestazione che accanto alla durata complessiva.",
      "🧹 Interfaccia Pulita e Chiara: rimosse tutte le diciture tecniche superflue (come 'Memorizzato nel profilo', 'Salvata nel database', badge di sincronizzazione non necessari e terminologie informatiche) per offrire un'esperienza fluida, focalizzata sul calcio giocato.",
      "🤝 Chimica di Coppia & Rivalità: grafica e diciture della sezione classifica rese più amichevoli e immediate per tutti i compagni di squadra."
    ],
    "superUserChanges": [
      "Persistenza Timestamp Assoluti: salvataggio su Firestore di inizioPartita e finePartita (Timestamp nativi) insieme alle stringhe orarioInizioReale e orarioFineReale nel documento del match.",
      "Calcolo Durata Intelligente: calcolo automatico della durata reale della gara basato sul delta temporale esatto tra fischio iniziale e fischio finale.",
      "Badge Sincronizzazione Cloud: visibilità del componente SyncStatusBadge riservata ai soli utenti Super User / Admin."
    ]
  },
  {
    "version": "1.0.75",
    "date": "05/11/2026",
    "title": "Timer Match Continuo (Solo Fischio d'Inizio e Finale) & Correzione Durata Partita",
    "userChanges": [
      "⏱️ Scorrimento Continuo del Match: eliminata la possibilità di mettere in pausa o stoppare accidentalmente la partita a metà. Una volta avviato con 'Fischio d'Inizio', il cronometro scorre continuamente fino al definitivo 'Fischio Finale'.",
      "📊 Correzione Durata Ultima Partita: ricalcolata e aggiornata la durata dell'ultimo match giocato, riallineando il minutaggio effettivo e le rotazioni dei portieri."
    ],
    "superUserChanges": [
      "Refactor Modello Timer: introdotto tracciamento assoluto con startedAt e endedAt su Firestore, deprecata toggleTimerState() ed eliminati delta parziali di pausa.",
      "Script Utility Data-Patch: creato script scripts/patch-last-match-duration.mjs per il ricalcolo e aggiornamento automatico della durata dei match (con fallback intelligente sulla media storica)."
    ]
  },
  {
    "version": "1.0.74",
    "date": "05/11/2026",
    "title": "Pulizia Riservatezza Controlli Super User & Fix Icona Portieri",
    "userChanges": [
      "🧹 Riservatezza & Pulizia Impostazioni: l'interfaccia Impostazioni per i giocatori è ora pulita ed essenziale, focalizzata su Tema, Note di Rilascio e Info App. Nascosti completamente il pannello di controllo Super User, i banner di invito login e le schede audio riservate.",
      "🧤 Icona Portieri nel Report: ripristinata l'icona dello scudo nel pulsante della tab 'Portieri' del report partita, allineata a tutte le altre sezioni."
    ],
    "superUserChanges": [
      "Blindatura Rotte Admin con superUserGuard: aggiunta protezione canActivate sugli URL diretti /partite/nuova, /giocatori/nuovo e /giocatori/:id/modifica per reindirizzare chi non ha la sessione Super User attiva.",
      "Accesso Super User Silenzioso: rimosso il pulsante pubblico di login nelle impostazioni; l'autenticazione Admin resta accessibile esclusivamente tramite la consueta gesture segreta dei 5 tocchi sul titolo della Classifica.",
      "Registrazione icona shieldOutline completata in StepPrestazioniComponent."
    ]
  },
  {
    "version": "1.0.71",
    "date": "04/11/2026",
    "title": "Auto-Salvataggio Step Creazione Partita & Fix Input Data Mobile",
    "userChanges": [
      "Risolto il taglio visivo dell'anno nel campo Data durante la creazione partita su schermi mobile.",
      "Aggiunta la sezione In Preparazione nella lista Partite per visualizzare i match in fase di organizzazione prima della conferma delle squadre."
    ],
    "superUserChanges": [
      "Auto-salvataggio continuo su Firestore e in locale ad ogni modifica nei 3 step di preparazione (Convocati, Dettagli, Squadre) per riprendere il lavoro anche chiudendo il browser o cambiando dispositivo.",
      "Persistenza esplicita dello step corrente (step) e dello stato iniziale da_definire: risolto il bug per cui riaprendo una partita non ancora confermata si saltava direttamente al Fischio d'inizio con le squadre sbilanciate.",
      "Aggiunto banner pre-partita e navigazione indietro sicura per modificare formazioni e convocati anche dopo aver confermato le squadre (finché il cronometro è a 00:00)."
    ]
  },
  {
    "version": "1.0.69",
    "date": "30/10/2026",
    "title": "Fix Critico Timer Partita: Eliminato Trigger e Allarme Cambio Portiere all'Avvio (Minuto 00:00)",
    "userChanges": [
      "⏱️ Partenza Pulita del Cronometro: risolta l'anomalia per cui alla pressione di ▶ AVVIA al minuto 00:00 partiva immediatamente l'avviso o l'allarme di cambio portiere.",
      "🛡️ Protezione Blindata del 1° Turno: il cambio portiere (audio, sintesi vocale e banner) può ora attivarsi esclusivamente dopo che sono effettivamente trascorsi tutti i minuti del primo turno di gioco (es. 5 minuti effettivi)."
    ],
    "superUserChanges": [
      "Introdotta guardia rigida in StepMatchComponent, MatchStateService e PartitaDetailPage: cambioAttivo è forzato a false e non può essere valorizzato a true se cronometro < durataTurnoSecondi.",
      "Reset preventivo di cambioAttivo nel payload Firestore e silenziamento di ogni allarme su toggleTimer se il timer parte da 00:00.",
      "Rimossa riproduzione automatica del fischio arbitrale kickoff su toggleTimer per evitare qualsiasi ambiguità con il segnale acustico del turnover."
    ]
  },
  {
    "version": "1.0.67",
    "date": "30/10/2026",
    "title": "UX Partite Raffinata: Navigazione Immediata al Dettaglio, Azioni Ottimizzate e Layout Senza Tagli",
    "userChanges": [
      "🎯 Accesso Diretto al Dettaglio in 1 Tap: ora puoi toccare direttamente il tabellone del punteggio o il comodo pulsante 'Dettagli ➔' sempre presente in testata per aprire all'istante la scheda completa della partita, anche a card chiusa senza passaggi intermedi.",
      "📱 Pulsanti Azione Senza Più Tagli: le azioni rapide della partita (Note, Telecronaca AI, Pronostico, Condividi) sono ora flessibili e fluide su qualsiasi display mobile senza tagli orizzontali.",
      "🌟 Scheda Completa in Evidenza: nuovo pulsante a tutta larghezza 'Apri Scheda Partita Completa' a contrasto elevato in fondo al cassetto aperto per una navigazione chiarissima.",
      "🧹 Pulizia Info & Label Chiare: eliminata la data duplicata accanto al punteggio lasciando spazio ai gol totali, orario posizionato elegantemente in riga 1 e badge portieri reso esplicito ('🧤 Portieri 5'')."
    ],
    "superUserChanges": [
      "Separazione netta degli eventi click: lo scoreboard naviga direttamente alla scheda del match tramite apriPartita(m) con stopPropagation, mentre il toggle accordion gestisce solo l'anteprima.",
      "Refactoring layout SCSS: implementato .match-quick-pills con flex-wrap per prevenire overflow-x orizzontale e pulsante primario full-width .open-detail-full-btn.",
      "Ottimizzazione getHeroStat per l'ordinamento predefinito 'data' per evitare ridondanze grafiche."
    ]
  },
  {
    "version": "1.0.65",
    "date": "30/10/2026",
    "title": "Rinfrescamento Grafico & UX Sezione Chimica: Schede Compatte, Filtri Rapidi e Label Chiare",
    "userChanges": [
      "🤝 Schede Chimica Compatte ad Alto Impatto: le card dei Gemelli del Gol e delle Bestie Nere sono state riprogettate in un layout orizzontale moderno (~68px di altezza), dimezzando lo spazio verticale occupato e consentendo di visualizzare molte più coppie a colpo d'occhio.",
      "🏷️ Informazioni e Label Chiare: il rendimento di coppia è ora spiegato in modo trasparente (es. '+18 MMR/gara'), con bilanci puntuali (V-P-S) e badge contestuali come '🔥 Imbattuti' e '⚽ Gol assistiti' per celebrare le intese perfette.",
      "😈 Rivalità e Nemesi Immediate: evidenziazione visiva immediata di chi domina lo scontro ('😈 Nemesi: Pietro' o '⚖️ Derby in Equilibrio') con bilancio vittorie per singolo giocatore e tasto rapido per aprire il Confronto 1v1.",
      "⚡ Filtri Rapidi in Testata: pulsanti dedicati in alto per alternare istantaneamente tra 'Tutte', solo '🤝 Gemelli' o solo '😈 Bestie Nere'."
    ],
    "superUserChanges": [
      "Refactoring reattivo di ClassificaPage con introduzione del signal filtroChimica ('all' | 'gemelli' | 'rivalita').",
      "Esposizione assistedGoals da statsEngine e normalizzazione dello stato di dominanza con gestione esplicita dei pareggi (Derby in Equilibrio).",
      "Nuova architettura SCSS .chem-row-card e .chem-compact-list con supporto responsive mobile e desktop."
    ]
  }
];

/**
 * Confronta due stringhe semver "x.y.z" (ritorna >0 se a > b, <0 se a < b, 0 se uguali).
 */
export function compareSemver(a: string, b: string): number {
  const pa = (a || '0.0.0').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = (b || '0.0.0').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Restituisce tutte le note di rilascio comprese tra `fromVersion` (esclusa, se inferiore a `toVersion`)
 * e `toVersion` (inclusa). Se `fromVersion` non è specificata o coincide con `toVersion`,
 * restituisce almeno l'ultima release disponibile.
 */
export function getReleaseNotesDelta(
  fromVersion: string | null,
  toVersion: string
): ReleaseNoteEntry[] {
  if (!fromVersion || compareSemver(fromVersion, toVersion) >= 0) {
    return RELEASE_NOTES_HISTORY.slice(0, 1);
  }

  const delta = RELEASE_NOTES_HISTORY.filter(
    (entry) =>
      compareSemver(entry.version, fromVersion) > 0 &&
      compareSemver(entry.version, toVersion) <= 0
  );

  return delta.length > 0 ? delta : RELEASE_NOTES_HISTORY.slice(0, 1);
}
