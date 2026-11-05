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
    "version": "1.0.72",
    "date": "05/11/2026",
    "title": "Fix Icona Tab Portieri nel Report Partita",
    "userChanges": [
      "🧤 Ripristinata l'icona dello scudo nella tab 'Portieri' del report partita, ora allineata alle altre tab (Sintesi, Pagelle, Spogliatoio, Stats)."
    ],
    "superUserChanges": [
      "Registrata l'icona shieldOutline in addIcons di StepPrestazioniComponent (era importata ma non registrata)."
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
