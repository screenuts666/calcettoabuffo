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
    "version": "1.0.42",
    "date": "30/10/2026",
    "title": "Restyling Parlante del Bilancio Partite (Vinte, Pareggiate, Perse) e Minuti Giocati",
    "userChanges": [
      "👥 Bilancio Partite 100% Parlante: rimosso il vecchio e criptico formato '8/3/4/1', sostituito da una scheda interattiva con tre riquadri dedicati per Partite Vinte (🟢), Pareggiate (🟡) e Perse (🔴), con totale gare giocate e percentuale di Win Rate.",
      "📊 Barra Visiva di Distribuzione: aggiunta la barra proporzionale stile Sofascore che mostra a colpo d'occhio l'equilibrio e l'andamento dei risultati sportivi del giocatore.",
      "⏱️ Banner Minuti Giocati Rifinito: visualizzazione chiara e moderna a larghezza piena del minutaggio effettivo accumulato sul terreno di gioco."
    ],
    "superUserChanges": [
      "Rilascio e sincronizzazione ufficiale in ambiente di Produzione PROD.",
      "Riprogettato il layout di scheda-giocatore con ion-col a larghezza piena per il bilancio gare e per i minuti giocati.",
      "Aggiunto styling SCSS dedicato (.card-bilancio, .card-minuti-banner, .bilancio-grid-boxes, .bilancio-bar-wrapper).",
      "Rimossa la legenda testuale legacy 'P / W / D / L' ormai superflua e ambigua."
    ]
  },
  {
    "version": "1.0.40",
    "date": "30/10/2026",
    "title": "Rilascio Ufficiale PROD: Nuova Scheda Portieri, Parate Incredibili con Bonus MMR, Note Libere e Filtro Minuti Giocati",
    "userChanges": [
      "🧤 Scheda Dedicata Portieri: ogni partita ha ora una scheda 'Portieri' riservata dove consultare i turni tra i pali, i gol subiti, i Clean Sheet e il resoconto completo per i Bianchi e per i Neri.",
      "✨ Parate Incredibili & Miracoli: aggiunto il parametro opzionale per registrare le parate decisive e gli interventi spettacolari di ciascun portiere, che attribuiscono punti bonus al rendimento MMR.",
      "📝 Note Portieri Libere: introdotta la sezione note specifica (opzionale) per appuntare commenti, salvataggi miracolosi e note tattiche sui portieri visibili a tutti nel resoconto.",
      "⏱️ Minuti Giocati & Filtro Classifica: conteggio dettagliato di minuti e secondi effettivi trascorsi in campo per ogni giocatore, visibile nella scheda giocatore e utilizzabile come nuovo filtro di ordinamento in Classifica."
    ],
    "superUserChanges": [
      "Rilascio e sincronizzazione ufficiale in ambiente di Produzione PROD.",
      "Nuovo componente standalone PrestazioniTabPortieriComponent integrato nello step prestazioni con navigazione a 5 tab.",
      "Aggiunta del contatore parateIncredibili per giocatore nella partita con persistenza Firestore e reattività su MatchStateService.",
      "Aggiunta del parametro bonusParataIncredibile a SeasonEngineConfig con visualizzazione e configurazione dinamica in Area Segreta.",
      "Implementazione del calcolo secondiGiocatiTotali e minutiGiocatiDisplay (formato MM' SS\") in StatsEngineService e ClassificaPage con nuovo CriterioOrdinamento 'minuti'."
    ]
  },
  {
    "version": "1.0.38",
    "date": "30/10/2026",
    "title": "Rilascio in Produzione: Risoluzione Gol Subiti Portieri a Rotazione e Foto Giocatori Dinamiche sulla Piantina Tattica",
    "userChanges": [
      "🧤 Statistiche Gol Subiti Portieri Corrette: risolto il problema di duplicazione dei gol subiti nelle rotazioni dei portieri (i gol vengono ora attribuiti con precisione assoluta al solo turno di porta in cui sono stati incassati).",
      "🗺️ Piantina Tattica con Foto in Tempo Reale: le foto profilo dei giocatori caricate o modificate dopo la creazione della partita compaiono ora istantaneamente sulla piantina tattica e nella schermata match."
    ],
    "superUserChanges": [
      "Rilascio ufficiale e sincronizzazione in ambiente di Produzione PROD.",
      "Corretto il loop di filtraggio in calculateGoalkeeperStatsForPlayer e calculateGoalkeeperStatsForMatch che moltiplicava i gol subiti per il numero di turni giocati dal portiere.",
      "Integrazione reattiva di StatsEngineService.giocatoriRaw in TacticalPitchComponent con mapping dinamico livePlayersMap.",
      "Riconciliazione live dei dati anagrafici e foto profilo in PartitaDetailPage (normalizePlayer)."
    ]
  },
  {
    "version": "1.0.36",
    "date": "30/10/2026",
    "title": "Rilascio in Produzione: Fix Anteprima e Caricamento Foto Giocatore con Badge Fotocamera e Rimozione",
    "userChanges": [
      "📸 Anteprima e Foto Giocatore Immediate: risolto il problema per cui in modifica giocatore l'avatar non caricava la foto del giocatore né la nuova foto selezionata dal dispositivo.",
      "📷 Badge Fotocamera Intuitivo: aggiunto il badge fotocamera sull'avatar per rendere immediata la modifica della foto profilo.",
      "🗑️ Rimozione Foto: aggiunto il pulsante rapido per rimuovere o resettare la foto del giocatore impostando l'avatar predefinito."
    ],
    "superUserChanges": [
      "Rilascio ufficiale e sincronizzazione in ambiente di Produzione PROD.",
      "Risolto il difetto di reattività in PlayerAvatarComponent: collegato @Input() fotoUrl a un Signal Angular reattivo con supporto completo a URL Storage, base64 e blob.",
      "Rimosso opacity: 0 bloccante sul rendering iniziale delle immagini dell'avatar.",
      "Gestione upload asincrono e compressione JPEG automatica (max 384x384px) verificati."
    ]
  },
  {
    "version": "1.0.34",
    "date": "29/10/2026",
    "title": "Rilascio Ufficiale in Produzione: Effetti Stadio Live, Redesign Impostazioni e Ottimizzazioni Mobile",
    "userChanges": [
      "⚽ Effetti Audio Partita Live: fischio d'inizio e triplice fischio finale dell'arbitro, esultanza con fanfara da curva per ogni gol e trombone comico per gli autogol.",
      "🎨 Menu Impostazioni Rinnovato: interfaccia moderna a 3 schede con switch dedicati per gestire ciascun effetto audio e pulsanti di anteprima istantanea.",
      "🧤 Controlli Turni Portieri Ottimizzati: pulsante [Turni] / [Chiudi] e controlli di cambio sempre visibili e perfettamente proporzionati su tutti i dispositivi mobili.",
      "📲 Condivisione Audio WhatsApp Mobile: note vocali AI condivisibili istantaneamente senza blocchi di sistema del browser."
    ],
    "superUserChanges": [
      "Rilascio ufficiale e sincronizzazione in ambiente di Produzione PROD.",
      "Gestione suoni con sintesi armonica Web Audio PCM Float32 WAV, eliminando ogni distorsione acustica.",
      "Setup match e parametri configurazione salvati con persistenza locale e sincronizzati."
    ]
  },
  {
    "version": "1.0.33",
    "date": "29/10/2026",
    "title": "Impostazione Turno Portieri Rapido a 30 Secondi per Ambiente DEV",
    "userChanges": [
      "⚡ Rotazione Portieri Accelerata per Test DEV: impostato il turno automatico dei portieri a 30 secondi (anziché 15s) in modalità DEV per consentire prove più fluide e comode della rotazione e degli allarmi audio.",
      "⏳ Preavviso a 10 Secondi in DEV: avviso a video con countdown a -10 secondi dal cambio per prepararsi al turnover."
    ],
    "superUserChanges": [
      "Aggiornato durataTurnoSecondi() a 30s per ambiente !environment.production in MatchStateService e TacticalPitchComponent.",
      "Allineato il preavviso toast a -10s quando il turno è impostato a 30s."
    ]
  },
  {
    "version": "1.0.32",
    "date": "29/10/2026",
    "title": "Restauro Effetti Match (Fischi e Gol), Redesign Impostazioni e Fix Responsive Turni Portieri",
    "userChanges": [
      "⚽ Effetti Stadio e Fischietto Arbitro Live: tornano i fischi d'inizio e di fine partita, l'esultanza con tromba da stadio per ogni gol e il trombone comico per gli autogol.",
      "🎨 Nuova Scheda \"Match & Gol\" in Impostazioni: menu completamente riprogettato con switch toggle dedicati e pulsanti di ascolto anteprima per ogni suono.",
      "🧤 Tasto Turni e Controlli Portieri Perfetti su Mobile: layout a 4 colonne perfettamente proporzionato che elimina qualsiasi overflow o troncamento del pulsante [Turni] / [Chiudi] su smartphone."
    ],
    "superUserChanges": [
      "Creazione e gestione del branch dedicato git feat/sound-effects-and-settings-turn-controls.",
      "Integrazione SoundSettingsService con sintesi PCM WAV Float32 per fischi e celebrazioni gol, senza distorsioni.",
      "Refactoring responsive per .gk-header-actions e styling globale di .pill-switch."
    ]
  },
  {
    "version": "1.0.31",
    "date": "29/10/2026",
    "title": "Fix Stile e Visualizzazione Scheda Match e Gol nel Menu Impostazioni",
    "userChanges": [
      "🎨 Menu Impostazioni & Match Graficamente Impeccabile: ripristinati tutti gli stili e le card con design moderno e rifinito nella scheda \"Match & Gol\".",
      "🔘 Switch e Pulsanti Anteprima Riconfigurati: i toggle di attivazione stile iOS e i pulsanti di prova rapida per i fischi dell'arbitro e i gol ora sono perfettamente visibili, posizionati e cliccabili.",
      "✨ Header Pulito: risolta la sovrapposizione del testo tra titolo e sottotitolo nella barra superiore."
    ],
    "superUserChanges": [
      "Aggiunte le classi CSS complete per .match-hero-card, .effect-card, .ec-header, .ec-info, .ec-buttons-grid e .ec-btn in impostazioni-modal.component.scss.",
      "Rilasciato lo stile di .pill-switch a livello globale del componente per renderizzare i selettori ON/OFF in tutte le schede della modale.",
      "Strutturato il gruppo titolo con .gear-badge e .mtb-title-text a layout verticale per impedire il collasso testuale."
    ]
  },
  {
    "version": "1.0.30",
    "date": "29/10/2026",
    "title": "Fix Layout e Allineamento Pulsante Turni Portieri su Mobile",
    "userChanges": [
      "🧤 Pulsante Turni Portieri Sempre Visibile: risolto il problema di overflow nella schermata di match dove il tasto [Turni] / [Chiudi] veniva tagliato fuori dal bordo destro dello schermo.",
      "📱 Layout Pulsanti Perfettamente Proporzionato: i controlli rapidi dei portieri (Suono, Chiama, Rimescola, Turni) ora si distribuiscono armoniosamente su tutta la larghezza della card senza mai sbordare o venire tagliati su smartphone."
    ],
    "superUserChanges": [
      "Refactoring responsive di .gk-panel-header e .gk-header-actions in StepMatchComponent.",
      "Impostato width: 100% su .gk-header-actions con flex: 1 1 0, min-width: 0 e text-overflow: ellipsis su .gk-ctrl-btn per garantire una distribuzione uniforme a 4 colonne ed eliminare ogni overflow.",
      "Snellita l'etichetta dell'allarme cambio a \"Chiama\" / \"Ferma\" per ottimizzare lo spazio orizzontale."
    ]
  },
  {
    "version": "1.0.29",
    "date": "29/10/2026",
    "title": "Restauro Effetti Stadio (Fischi Arbitro, Tromba Gol, Trombone Autogol) e Redesign Menu Impostazioni",
    "userChanges": [
      "⚽ Effetti Audio Match Ripristinati: torna la magia dello stadio con i suoni dedicati agli eventi del match! Fischio d'inizio e triplice fischio finale dell'arbitro, fanfara d'ottoni a tutto volume per festeggiare ogni gol segnato e trombone comico \"Wah-Wah-Waaah\" per gli autogol.",
      "🎨 Menu Impostazioni Rinnovato e Più Elegante: schermata impostazioni completamente ridisegnata con grafica moderna, nuova scheda dedicata \"Match e Gol\" e tasti di anteprima istantanea per ascoltare ciascun effetto prima della partita."
    ],
    "superUserChanges": [
      "Aggiunti switch dedicati in Impostazioni per Super User: matchWhistleEffects, goalSoundEffects, autogoalSoundEffects con salvataggio persistente in LocalStorage.",
      "Integrazione nativa in StepMatchComponent: trigger del fischio iniziale all'avvio del timer da 0, fanfara su registraGol (con routing differenziato per autogol) e triplice fischio alla chiusura del match.",
      "Sintesi audio pulita ad alta fedeltà tramite Web Audio PCM Float32 WAV, con inviluppi armonici privi di distorsioni stridenti."
    ]
  },
  {
    "version": "1.0.28",
    "date": "29/10/2026",
    "title": "Fix Condivisione Audio WhatsApp su Safari iOS e Chrome Android",
    "userChanges": [
      "📲 Condivisione Audio WhatsApp Garantita su Mobile: risolto l'errore di sistema del browser (\"Must be handling a user gesture\") che impediva l'invio delle note vocali su smartphone a causa del tempo di elaborazione dell'AI.",
      "🎙️ Dialogo Diretto \"Audio Pronto\": appena la registrazione vocale MP3 è generata, compare una modale pulita per confermare ed effettuare l'invio immediato su WhatsApp in 1 tap senza blocchi."
    ],
    "superUserChanges": [
      "Risolto il blocco di transient user activation su iOS Safari e Android in TtsService.shareAudioToWhatsApp.",
      "Implementato promptShareWithFreshUserGesture con AlertController: aggancia la chiamata a navigator.share() direttamente al click handler dell'utente con il file MP3 già pronto in memoria.",
      "Mantenuto il fallback trasparente su download file MP3 + apertura WhatsApp con link online diretto in caso di mancato supporto della Web Share API."
    ]
  },
  {
    "version": "1.0.27",
    "date": "29/10/2026",
    "title": "Fix Layout Responsive Confronto 1v1 su Schermi Mobile",
    "userChanges": [
      "⚔️ Confronto 1v1 Perfettamente Allineato: risolto il problema di visualizzazione nella schermata di confronto che tagliava il secondo giocatore fuori dallo schermo sui dispositivi mobili.",
      "✨ Gestione Soprannomi AI Lunghi: gli alias generati dall'AI ora si adattano armoniosamente allo spazio disponibile con troncamento automatico a puntini sospensivi (...) senza deformare la card."
    ],
    "superUserChanges": [
      "Refactoring layout CSS Grid in ConfrontoPage: sostituito grid-template-columns: 1fr auto 1fr con minmax(0, 1fr) auto minmax(0, 1fr).",
      "Aggiunto min-width: 0, box-sizing: border-box e overflow: hidden su .player-card, .player-info e .tier-pill per prevenire l'allargamento anomalo della colonna H2H."
    ]
  },
  {
    "version": "1.0.26",
    "date": "29/10/2026",
    "title": "Voce Naturale Umana con Motore AI TtsService & Rimozione Sintetizzatore Robotico",
    "userChanges": [
      "🎙️ Voce Naturale & Umana: risolto definitivamente l'effetto robotico! La chiamata del cambio portiere ora sfrutta il motore vocale AI di Calcetto Abbuffo (ElevenLabs & Gemini TTS) per pronunciare i nomi dei portieri con voce calda e naturale da telecronista.",
      "🚫 Addio Voci Metalliche: eliminate e penalizzate tutte le vecchie voci sintetiche desktop di Windows (escluso Microsoft Cosimo/Elsa robotici) a favore di voci neurali fluide e realistiche."
    ],
    "superUserChanges": [
      "Collegato SoundSettingsService direttamente a TtsService: il richiamo vocale dei portieri sfrutta la pipeline AI con caching MP3 in memoria e su Firebase Storage.",
      "Algoritmo di scoring per la sintesi vocale: prioritizzazione rigida per voci Microsoft Online Natural (100pt), Google Neural (85pt) e Apple Siri/Enhanced (75pt), declassando a 10pt le voci SAPI desktop."
    ]
  },
  {
    "version": "1.0.25",
    "date": "29/10/2026",
    "title": "Salvataggio & Persistenza Automatica dei Setup Match e Sincronizzazione Impostazioni",
    "userChanges": [
      "💾 Setup Match Sempre Memorizzato: il campetto (luogo), l'orario abituale e le impostazioni dei portieri vengono ora ricordati e salvati automaticamente per ogni nuova partita.",
      "🔄 Ripristino Completo Convocati e Dati: se torni indietro o ricarichi la schermata, la lista dei convocati selezionati e le coordinate del campo rimangono perfettamente intatte e salvate in locale."
    ],
    "superUserChanges": [
      "☁️ Sincronizzazione Cloud Setup Audio Super User: le impostazioni suoni (preset audio, voce annunciatore, vibrazione e minuti di turno) vengono ora sincronizzate anche su Firestore in config_stagioni per essere ricordate su qualsiasi dispositivo.",
      "⚙️ Persistenza Continua MatchStateService: salvaSetupPredefinito e ripristinaSnapshotLocale memorizzano e ripristinano integralmente luogo, orario, dataPartita, tutti i giocatori convocati e la rotazione portieri.",
      "⏱️ Risolto l'override cablato a 5 minuti nella rotazione: ora viene sempre rispettata la durata personalizzata configurata dall'admin."
    ]
  },
  {
    "version": "1.0.24",
    "date": "29/10/2026",
    "title": "Conferma Anti-Reset Indietro, Auto-selezione Top 14 (7v7) e Campetto Predefinito in DEV",
    "userChanges": [
      "🛡️ Protezione Anti-Reset Match: tornando indietro dal menu di navigazione durante una partita in corso, una modale di conferma impedisce l'azzeramento accidentale di punteggio, cronometro ed eventi.",
      "📋 Uscita Sicura alla Lista: l'opzione \"Torna alla Lista Partite\" chiarisce esplicitamente che il match rimane attivo e salvato nella scheda In Corso."
    ],
    "superUserChanges": [
      "⚡ Auto-selezione Rapida 7 vs 7 (solo DEV): pulsante rapido nei Convocati che seleziona automaticamente i primi 14 giocatori in classifica per testare istantaneamente partite a 14.",
      "📍 Pre-selezione Campetto (solo DEV): all'avvio di un nuovo match, il campo viene pre-compilato automaticamente con l'ultimo luogo registrato nelle partite recenti.",
      "⚠️ Modale di conferma ad alto contrasto per l'opzione distruttiva di ritorno a Formazioni & Squadre con reset controllato dello stato."
    ]
  },
  {
    "version": "1.0.23",
    "date": "29/10/2026",
    "title": "Fix Scatto Automatico Cambio Portiere & Chiarezza Scheda Rotazione",
    "userChanges": [
      "⚡ Cambio Portiere Automatico Garantito: risolto il problema per cui a fine countdown il cambio non scattava. Ora al raggiungimento dello 00:00 scattano puntualmente sia il segnale acustico che l'annuncio vocale.",
      "🎯 Chiarezza Cockpit Rotazione: corretto il titolo con la dicitura pulita \"Rotazione Portieri · Ogni 15s (DEV ⚡)\" o \"Ogni 5 min\" senza doppie parentesi.",
      "🚨 Tasto Azione Immediato \"Chiama Cambio\": pulsante chiaro che ti permette in ogni momento di chiamare subito il cambio, oppure premere \"Ferma Allarme\"."
    ],
    "superUserChanges": [
      "Sincronizzato il trigger periodico su turnoAttualeIndex() derivato direttamente da durataTurnoSecondi() anziché un calcolo statico a minuti.",
      "Risolto il blocco che impediva lo scatto della rotazione a 15 secondi in ambiente di sviluppo/staging."
    ]
  },
  {
    "version": "1.0.22",
    "date": "29/10/2026",
    "title": "Pulizia Completa Codice & Rimozione Funzioni e Tipi Deprecati",
    "userChanges": [
      "🧹 App più leggera e reattiva: rimosse tutte le opzioni, allarmi e suoni inutilizzati e obsoleti.",
      "Esperienza audio pulita: solo i controlli necessari per la gestione dei portieri (suono, voce nomi, durata e vibrazione)."
    ],
    "superUserChanges": [
      "Rimozione completa di turboVolumeBoost, preAlert30Sec, goalSoundId, autogoalSoundEffect e matchWhistleEffects dalla configurazione SuperUserSoundConfig.",
      "Eliminazione metodi stub e deprecati: playGoalSound, playGoalPresetById, playSadTrombone, playMatchWhistle, playQuickSoundboard e playPreAlert30SecBeep.",
      "Ripulito ImpostazioniModalComponent da tutti i metodi e handler dismessi (toggleTurboBoost, selezionaGoalSound, suonaSoundboard, ecc.).",
      "Rimozione di tutti i vecchi ID sonori deprecati da GkSoundId (ridotto ai soli 6 preset attivi e supportati)."
    ]
  },
  {
    "version": "1.0.21",
    "date": "29/10/2026",
    "title": "Loop Allarme, Nuovi Livelli Suoni Puliti, Nomi su Tasto Chiama & Voce Naturale",
    "userChanges": [
      "🔁 Loop Allarme Ripristinato: il segnale e la voce si ripetono ogni 7.5 secondi fino a quando l'admin non preme il pulsantone STOP.",
      "🗣️ Tasto \"Chiama\" con Nomi Portieri: premendo Chiama nella tab rotazione viene ora sempre annunciato chi deve entrare in porta per Bianchi e Neri.",
      "🎙️ Sintesi Vocale Naturale Italiana: integrata la selezione automatica delle migliori voci neurali/naturali (Google, Apple, Microsoft) senza effetto metallico o robotico.",
      "🔊 5 Livelli di Intensità Sonori Puliti: Originale CAMBIO.wav, Fischietto Arbitro, Campanella Stadio, Tromba da Curva, Buzzer Palazzetto e Solo Voce, tutti a volume pieno e bilanciato."
    ],
    "superUserChanges": [
      "startMatchCambioAlarm gestito con loop continuo e speechText reattivo ai portieri in campo.",
      "Attivazione manuale suonaCambioManuale svincolata dal timer: l'allarme parte e chiama i nomi anche se il timer della partita è in pausa.",
      "Refactoring audio con forme d'onda armoniche pure senza saturazione, distorsione o picchi fastidiosi."
    ]
  },
  {
    "version": "1.0.20",
    "date": "29/10/2026",
    "title": "Eliminazione Completa Suoni Sintetizzati & Audio Originale CAMBIO.wav",
    "userChanges": [
      "🎺 Audio Naturale al 100%: cancellati tutti i suoni artificiali, le frotte di allarmi e i fastidiosi fischi sintetizzati. Ora esiste solo il file audio storico originale CAMBIO.wav e la sola voce naturale.",
      "Nessun disturbo o allarme finto: niente più sirene, tromboni o oscillatori fastidiosi in nessun punto dell'app.",
      "Pannello Suoni pulito e immediato: puoi scegliere tra CAMBIO.wav originale, solo voce o silenzioso."
    ],
    "superUserChanges": [
      "Cancellazione totale di WebAudio synthetic oscillators, PCM wave synthesis e compressore overdrive.",
      "Eliminata la tab soundboard superflua e rimossi tutti i preset acustici fake (hyper_siren, nuclear_klaxon, referee_whistle synth, ecc.).",
      "Ripristinata l'architettura nativa leggera basata unicamente su HTMLAudioElement (/assets/sound/CAMBIO.wav) e SpeechSynthesis."
    ]
  },
  {
    "version": "1.0.19",
    "date": "29/10/2026",
    "title": "Eliminazione Definitiva Suoni Fastidiosi & Audio CAMBIO.wav Pulito",
    "userChanges": [
      "🎺 Audio Cambio Pulito al 100%: rimosso definitivamente ogni suono fastidioso o fischio sintetizzato sovrapposto. Ora parte solo l'audio naturale senza distorsioni.",
      "Riproduzione discreta: l'avviso acustico suona una volta senza ripetersi all'infinito durante la partita.",
      "Sintesi vocale morbida e chiara per chiamare chi entra in porta senza disturbare il gioco."
    ],
    "superUserChanges": [
      "Rimozione completa di generatori di oscillatori ad alta frequenza e sintetizzatori sovrapposti (playWebAudioBoosterOverlay e playWebAudioSynthCycle).",
      "selectedGkSoundId impostato stabilmente su cambio_wav con sanitizzazione automatica delle preferenze salvate in locale.",
      "Preset sonori sportivi ripuliti (fischietto naturale, gong morbido, campana stadio, solo voce)."
    ]
  },
  {
    "version": "1.0.13",
    "date": "28/10/2026",
    "title": "Navigazione Libera & Fix Suoni Fantasma",
    "userChanges": [
      "Risolto il problema del suono o allarme che partiva da solo all'apertura della schermata del match: ora nessun audio viene riprodotto senza un'azione esplicita o a partita ferma.",
      "Navigazione libera durante la partita: tocca la freccia Indietro (←) in qualsiasi momento per consultare la Rosa, le altre partite o la Classifica senza rischiare di chiudere o resettare la gara.",
      "La partita in corso rimane attiva e visibile in cima alle partite ('In Corso'), pronta per essere riaperta con un tocco."
    ],
    "superUserChanges": [
      "Eliminato il pre-warming rumoroso dell'HTMLAudioElement in unlockAudioOnUserGesture che causava la riproduzione indesiderata di CAMBIO.wav all'ingresso nel match.",
      "Aggiunto vincolo isTimerRunning() alla riproduzione automatica dell'allarme cambio portiere: nessun suono può partire a timer fermo o azzerato.",
      "Reset automatico dello stato cambioAttivo all'apertura del match o al reset stato se la partita non è in esecuzione.",
      "Stop istantaneo di ogni audio/allarme in background se il componente viene distrutto o se la navigazione esce dal match."
    ]
  },
  {
    "version": "1.0.11",
    "date": "28/10/2026",
    "title": "Centrale Suoni Portiere & Ottimizzazioni Mobile",
    "userChanges": [
      "Nuovo pannello 'Impostazioni & Suoni' con selettore tema rapido (Chiaro / Scuro / Auto) e centrale audio di gara.",
      "12 Nuovi Segnali di Cambio Portiere ad alto impatto con anteprima live per sentirli anche all'aperto durante la partita.",
      "Header e interfaccia match ottimizzati: titolo e controlli non vengono mai tagliati o sovrapposti su mobile.",
      "Nuovo box di stato sincronizzazione cloud: tocca il badge per vedere subito orario dell'ultimo salvataggio e stato rete."
    ],
    "superUserChanges": [
      "Turbo Boost Bordo Campo: compressore dinamico brickwall + filtro risonanza smartphone (1000-3200 Hz) per la massima pressione acustica.",
      "Sintesi vocale automatica 'Cambio Portiere' con annuncio dei nomi dei giocatori entranti e preavviso a -30s.",
      "Soundboard istantanea da bordocampo con 6 effetti audio rapidi (fischio arbitro, triplice fischio finale, VAR, esultanza, curva, trombone).",
      "Toolbar Partita Detail con layout Flexbox anti-clipping e badge sincronizzazione compatto (nuvoletta + LED luminoso).",
      "Popup di sincronizzazione convertito in AlertController nativo con supporto offline protetto."
    ]
  },
  {
    "version": "1.0.10",
    "date": "28/10/2026",
    "title": "Fix Header Match & Finestra Stato Sincronizzazione",
    "userChanges": [
      "Il titolo 'Gestione Match' nella barra superiore non viene più tagliato o schiacciato su smartphone.",
      "Badge di stato sincronizzazione database compatto con nuvola e indicatore LED luminoso (verde/arancione/rosso).",
      "Nuova finestra informativa pulita al tocco dello stato sync: addio codice HTML grezzo o banner invasivi, ora mostra chiaramente l'orario dell'ultimo salvataggio e lo stato della connessione cloud."
    ],
    "superUserChanges": [
      "Risolto il flexbox layout della toolbar in Partita Detail: titolo impostato su flex-grow con allineamento a sinistra e badges compattati.",
      "La pillola del numero di versione (es. v1.0.x) si nasconde automaticamente su schermi stretti (<480px) lasciando il controllo impostazioni sempre accessibile.",
      "Sostituito il Toast grezzo di sincronizzazione con un AlertController nativo professionale con supporto pre-line e descrizioni dettagliate per online, offline, in sync e salvataggio locale."
    ]
  },
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
    "title": "Calcetto a Buffo 2.0 - Motore MMR & Nuova Architettura",
    "userChanges": [
      "Nuovo algoritmo Matchmaking con bilanciamento ruoli e posizioni difensive.",
      "Classifica generale con punteggi MMR dinamici calcolati su vittorie, gol e rendimento.",
      "Scheda profilo giocatore con cronologia match, trend prestazioni e statistiche dettagliate."
    ],
    "superUserChanges": [
      "Pannello Area Segreta con gestione avanzata parametri MMR (K-factor, bonus portiere, handicap).",
      "Gestione ruoli giocatori con override manuale per ogni singolo match.",
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
