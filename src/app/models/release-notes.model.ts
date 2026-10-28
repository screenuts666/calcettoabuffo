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
    "version": "1.0.9",
    "date": "28/10/2026",
    "title": "Fix Layout Header & Navigazione Pannello Impostazioni",
    "userChanges": [
      "Interfaccia del pannello 'Impostazioni & Suoni' ripulita per evitare troncamenti o sovrapposizioni su qualsiasi smartphone.",
      "Pulsante cambio rapido Tema compatto (☀️/🌙/⚙️) integrato direttamente nella barra superiore.",
      "Schede di navigazione snelle 'Portieri (12)', 'Suoni Match' e 'Tema & App' perfettamente visibili e comode al tocco."
    ],
    "superUserChanges": [
      "Risolto il problema di overflow in cui il badge '👑 Admin' e il titolo venivano coperti dal pulsante di chiusura (X).",
      "Rimosso il banner intermedio del tema guadagnando prezioso spazio verticale per la lista suoni e controlli bordo campo.",
      "Header e tab bar ingegnerizzati con layout Flexbox/Grid responsive e pulsanti circolari ad azione rapida."
    ]
  },
  {
    "version": "1.0.8",
    "date": "28/10/2026",
    "title": "Nuova Centrale Suoni Cambio Portiere & Pannello Impostazioni",
    "userChanges": [
      "Nuovo pannello 'Impostazioni & Suoni' accessibile direttamente toccando il pulsante delle impostazioni in alto a destra su ogni schermata.",
      "Selettore rapido del Tema (☀️ Chiaro / 🌙 Scuro / ⚙️ Automatico) con un tocco immediato da qualsiasi pagina dell'applicazione."
    ],
    "superUserChanges": [
      "12 Nuovi Segnali di Cambio Portiere Iper-Avvisanti: sirena antiaerea da stadio, bomboletta da curva, fischietto arbitrale Fox-40, klaxon nucleare, buzzer NBA, sirena bitonale, gong da boxe, allarme laser UFO, corno da nave e bomba a tempo.",
      "Anteprima audio live con tasto '▶ PROVA' per ascoltare e testare ogni segnale a volume massimo prima di sceglierlo.",
      "Turbo Boost Bordo Campo (0 dBFS Overdrive + Compressore Brickwall): massimizza la resa fisica dello speaker del telefono sulle frequenze 1000–3200 Hz.",
      "Annuncio Vocale Nomi Portieri: lo speaker vocale urla 'Cambio portiere!' annunciando chi deve entrare in porta per Bianchi e Neri.",
      "Preavviso sonoro a -30 secondi dal cambio e durata turni portiere configurabile (3, 4, 5, 6, 7, 8, 10 min).",
      "Soundboard istantanea da bordo campo con 6 effetti sonori rapidi (fischio arbitro, triplice fischio finale, tromba curva, VAR, esultanza gol e trombone per papere).",
      "Pannello Super User dedicato con accesso diretto all'Area Segreta e reset impostazioni audio."
    ]
  },
  {
    "version": "1.0.7",
    "date": "28/10/2026",
    "title": "Gestione Match Bordo Campo & Release Notes Automatiche",
    "userChanges": [
      "Banner 'Novità di Versione' automatico: ad ogni aggiornamento puoi leggere cosa è cambiato rispetto alla versione che avevi installata sul telefono.",
      "Storico completo delle versioni sempre consultabile dal menu in alto a destra (accanto al badge versione).",
      "Sincronizzazione in tempo reale migliorata per gol e assist dei singoli giocatori durante le partite live."
    ],
    "superUserChanges": [
      "Nuovo Cockpit 'Bordo Campo' in Gestione Match: cronometro compatto e tabellone punteggio gigante subito in primo piano senza dover scrollare.",
      "Gol Lampo 1-Tap con Foto: tocca direttamente la faccia del giocatore in campo per assegnare il gol e passare subito alla scelta dell'assist.",
      "Nuovo Selettore Visuale Gol & Assist con foto grandi a prova di pollice e maxi-bottone '⚡ Nessun Assist · Azione Personale'.",
      "Corretto il layout mobile della sezione Rotazione Portieri (Sequenza Bianchi/Neri impilata senza tagli laterali) e rimosso il doppio badge di sincronizzazione.",
      "Pipeline Release Notes JSON automatica sincronizzata ad ogni deploy."
    ]
  },
  {
    "version": "1.0.2",
    "date": "28/10/2026",
    "title": "Aggiornamento Automatico Anti-Cache & Strumenti DEV",
    "userChanges": [
      "Addio modalità Incognito: l'app controlla automaticamente ad ogni avvio il rilascio di nuove versioni, pulendo cache, cookie e vecchi file salvati da Chrome/PWA.",
      "Badge versione (v1.0.x) sempre visibile in alto a destra e pulsante manuale 'Forza Aggiornamento & Svuota Cache' nel menu rapido."
    ],
    "superUserChanges": [
      "Etichetta 'DEV MODE' visibile nella barra superiore quando si lavora sull'ambiente di sviluppo.",
      "Nuovo pulsante in Area Segreta ('Copia DB PROD → DEV') protetto da Super-Lock PIN per clonare in sola lettura i dati reali di produzione nell'ambiente di test ripulendo i record di prova."
    ]
  },
  {
    "version": "1.0.0",
    "date": "28/10/2026",
    "title": "Classifica Portieri, Piantina Tattica & Area Segreta Motore",
    "userChanges": [
      "Nuova Classifica Portieri 🧤 dedicata: media Gol Subiti su 50 min, Clean Sheet da 5 min e minuti giocati tra i pali.",
      "Piantina Tattica in lista partite con schieramento automatico dei portieri in porta e formazione espandibile.",
      "Poster Face-Off dinamico con i volti delle due squadre per le partite senza foto ufficiale."
    ],
    "superUserChanges": [
      "Area Segreta del Motore con formule matematiche in chiaro, ricalcolo storico per-stagione salvato su Firestore e simulatore What-If singola partita.",
      "Sistema di sicurezza a 2 livelli: sessione Admin + Cassaforte Super-Lock con PIN Master (default: 1000) e auto-lock dopo 5 minuti.",
      "Regole di congelamento stagione conclusa per preservare immutabile l'albo d'oro storico."
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
