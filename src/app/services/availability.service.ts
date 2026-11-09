import { Injectable, inject, signal, computed, effect } from '@angular/core';
import {
  Firestore,
  doc,
  docData,
  setDoc,
  updateDoc,
} from '@angular/fire/firestore';
import { Timestamp, serverTimestamp } from 'firebase/firestore';
import { AuthService } from './auth.service';
import { StatsEngineService } from './stats-engine.service';
import {
  WeeklyAvailabilityDoc,
  DaySummary,
  SeasonCalendarConfig,
} from '../models/weekly-availability.model';
import { getMatchFormatByPlayerCount, Partita } from '../models/partita.model';
import { environment } from 'src/environments/environment';

export function getLocalIsoDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

@Injectable({
  providedIn: 'root',
})
export class AvailabilityService {
  private firestore = inject(Firestore, { optional: true });
  private auth = inject(AuthService);
  private statsEngine = inject(StatsEngineService);

  readonly calendarConfig = signal<SeasonCalendarConfig>({
    summerBreakEnabled: false,
    preferredMatchTime: '21:00',
  });

  readonly isSummerBreakActive = computed(() => {
    return this.calendarConfig().summerBreakEnabled;
  });

  private userHasManuallyChangedWeek = false;

  /** Chiave settimana attiva (es. "2026-W46") */
  readonly activeWeekKey = signal<string>(this.calculateDefaultWeekKey());

  /** Documento real-time da Firestore per la settimana attiva */
  readonly activeWeekDoc = signal<WeeklyAvailabilityDoc | null>(null);

  /** I giorni (Lun-Dom) della settimana attiva */
  readonly activeWeekDays = computed(() => {
    return this.generateWeekDays(this.activeWeekKey());
  });

  /** Date che l'utente loggato ha votato con certezza ("Ci sono") per la settimana corrente */
  readonly myVotedDates = computed<string[]>(() => {
    const doc = this.activeWeekDoc();
    const uid = this.auth.firebaseUser()?.uid;
    if (!doc || !uid || !doc.votes?.[uid]) return [];
    return doc.votes[uid].availableDates || [];
  });

  /** Date che l'utente loggato ha votato in dubbio ("Forse") per la settimana corrente */
  readonly myMaybeDates = computed<string[]>(() => {
    const doc = this.activeWeekDoc();
    const uid = this.auth.firebaseUser()?.uid;
    if (!doc || !uid || !doc.votes?.[uid]) return [];
    return doc.votes[uid].maybeDates || [];
  });

  /** Riepilogo dei 7 giorni della settimana con contatori e atleti disponibili */
  readonly daySummaries = computed<DaySummary[]>(() => {
    const doc = this.activeWeekDoc();
    const days = this.activeWeekDays();
    const allVotes = Object.values(doc?.votes || {});

    const currentUid = this.auth.firebaseUser()?.uid;
    const currentPid = this.auth.linkedPlayerId();

    // Ordinamento deterministico stabile: l'utente loggato in testa, poi tutti in ordine alfabetico
    allVotes.sort((a, b) => {
      const isAMe =
        (currentUid && a.uid === currentUid) ||
        (currentPid && a.playerId === currentPid);
      const isBMe =
        (currentUid && b.uid === currentUid) ||
        (currentPid && b.playerId === currentPid);
      if (isAMe && !isBMe) return -1;
      if (!isAMe && isBMe) return 1;
      return (
        (a.displayName || '').localeCompare(b.displayName || '') ||
        (a.uid || '').localeCompare(b.uid || '')
      );
    });

    return days.map((d) => {
      const voters = allVotes.filter((v) =>
        (v.availableDates || []).includes(d.date),
      );
      const maybeVoters = allVotes.filter((v) =>
        (v.maybeDates || []).includes(d.date),
      );
      const count = voters.length;
      const maybeCount = maybeVoters.length;
      const formatInfo = getMatchFormatByPlayerCount(count);
      const hasQuorum = count >= 10;
      const missingForQuorum = count >= 10 ? 0 : 10 - count;

      return {
        date: d.date,
        dayName: d.dayName,
        dayNumber: d.dayNumber,
        voters,
        voterCount: count,
        maybeVoters,
        maybeCount,
        formatInfo,
        hasQuorum,
        missingForQuorum,
      };
    });
  });

  /** Atleti in rosa registrati che non hanno ancora espresso disponibilità */
  readonly missingAthletes = computed<string[]>(() => {
    const doc = this.activeWeekDoc();
    const votedUids = new Set(Object.keys(doc?.votes || {}));
    const allPlayers = this.statsEngine.giocatoriRaw() || [];

    return allPlayers
      .filter((p) => p.linkedUid && !votedUids.has(p.linkedUid))
      .map((p) => p.nome);
  });

  /** Etichetta pulita del range di date della settimana (es. "9 - 15 Novembre") */
  readonly activeWeekRangeLabel = computed(() => {
    const days = this.activeWeekDays();
    if (!days || days.length < 7) return '';
    const dStart = new Date(days[0].date);
    const dEnd = new Date(days[6].date);

    const startDay = dStart.getDate();
    const endDay = dEnd.getDate();
    const month = dEnd.toLocaleDateString('it-IT', { month: 'long' });
    const capitalizedMonth = month.charAt(0).toUpperCase() + month.slice(1);

    return `${startDay} - ${endDay} ${capitalizedMonth}`;
  });

  /** Tag contestuale della settimana ("Questa Settimana" / "Prossima Settimana" / null) */
  readonly activeWeekTag = computed(() => {
    const now = new Date();
    const thisWeekKey = this.getIsoWeekKey(now);
    const nextWeekDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const nextWeekKey = this.getIsoWeekKey(nextWeekDate);

    if (this.activeWeekKey() === thisWeekKey) {
      return 'Questa Settimana';
    }
    if (this.activeWeekKey() === nextWeekKey) {
      return 'Prossima Settimana';
    }
    return null;
  });

  /** Settimana ISO della data odierna */
  readonly currentIsoWeekKey = computed<string>(() => {
    return this.getIsoWeekKey(new Date());
  });

  /** Data della prima partita registrata nel sistema (per non navigare mai più indietro della storia reale nelle viste Mese/Anno) */
  readonly earliestMatchDate = computed<string | null>(() => {
    const partite = this.statsEngine.partiteRaw() || [];
    const dates = partite
      .map((p) => {
        let d = (p.dataPartita || p.dataOra || '').split('T')[0].trim();
        if (d.includes('/')) {
          const parts = d.split('/');
          if (parts.length === 3) {
            d = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          }
        }
        return d;
      })
      .filter((d) => d && d.length >= 10 && !isNaN(new Date(d).getTime()))
      .sort();
    return dates.length > 0 ? dates[0] : null;
  });

  /**
   * Possibilità di navigare indietro nel sondaggio settimanale:
   * BLOCCATO tassativamente alla settimana corrente (nel sondaggio settimanale non si va nel passato dove i voti sono chiusi).
   */
  readonly canGoToPreviousWeek = computed<boolean>(() => {
    return this.activeWeekKey() > this.currentIsoWeekKey();
  });

  /** Etichetta completa retrocompatibile */
  readonly activeWeekLabel = computed(() => {
    const tag = this.activeWeekTag();
    return tag
      ? `${this.activeWeekRangeLabel()} (${tag})`
      : this.activeWeekRangeLabel();
  });

  constructor() {
    // Sincronizza la settimana di default non appena i dati delle partite arrivano da Firestore
    effect(() => {
      this.statsEngine.partiteRaw();
      if (
        !this.userHasManuallyChangedWeek ||
        this.activeWeekKey() < this.currentIsoWeekKey()
      ) {
        this.activeWeekKey.set(this.calculateDefaultWeekKey());
      }
    });

    // Sottoscrizione Firestore in tempo reale per la settimana attiva con auto-cleanup
    effect((onCleanup) => {
      const weekKey = this.activeWeekKey();
      if (!this.firestore || !weekKey) return;
      const docRef = doc(this.firestore, `weekly_availability/${weekKey}`);
      const sub = docData(docRef).subscribe({
        next: (data) => {
          this.activeWeekDoc.set(data ? (data as WeeklyAvailabilityDoc) : null);
        },
        error: (err) => {
          console.warn('DocData weekly_availability listen warning:', err);
          this.activeWeekDoc.set(null);
        },
      });
      onCleanup(() => sub.unsubscribe());
    });

    this.loadSeasonConfig();
  }

  settimanaPrecedente(): void {
    if (!this.canGoToPreviousWeek()) return;
    this.userHasManuallyChangedWeek = true;
    const cur = this.activeWeekKey();
    const days = this.generateWeekDays(cur);
    const [y, m, d] = days[0].date.split('-').map(Number);
    const prevMon = new Date(Date.UTC(y, m - 1, d - 7));
    const targetKey = this.getIsoWeekKey(prevMon);
    if (targetKey >= this.currentIsoWeekKey()) {
      this.activeWeekKey.set(targetKey);
    }
  }

  settimanaSuccessiva(): void {
    this.userHasManuallyChangedWeek = true;
    const cur = this.activeWeekKey();
    const days = this.generateWeekDays(cur);
    const [y, m, d] = days[0].date.split('-').map(Number);
    const nextMon = new Date(Date.UTC(y, m - 1, d + 7));
    this.activeWeekKey.set(this.getIsoWeekKey(nextMon));
  }

  vaiASettimanaDefault(): void {
    this.userHasManuallyChangedWeek = false;
    this.activeWeekKey.set(this.calculateDefaultWeekKey());
  }

  vaiASettimanaCorrente(): void {
    this.userHasManuallyChangedWeek = false;
    this.activeWeekKey.set(this.getIsoWeekKey(new Date()));
  }

  /**
   * Calcola la settimana di default:
   * Solo se siamo nel weekend (Sabato o Domenica) o se la gara settimanale è già stata giocata e conclusa,
   * passa automaticamente alla settimana successiva per raccogliere i nuovi voti.
   * Durante la settimana in corso (Lun-Ven prima della gara) rimane sempre sulla settimana corrente di OGGI.
   */
  calculateDefaultWeekKey(): string {
    const now = new Date();
    const currentWeekKey = this.getIsoWeekKey(now);

    const partite = this.statsEngine.partiteRaw?.() || [];
    const hasConcludedMatchThisWeek = partite.some((m) => {
      if (!m.dataPartita || !m.matchConcluso) return false;
      const mDate = new Date(m.dataPartita);
      return (
        !isNaN(mDate.getTime()) && this.getIsoWeekKey(mDate) === currentWeekKey
      );
    });

    const dayOfWeek = now.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sabato o Domenica
    const isLateWeekDone = dayOfWeek >= 5 && hasConcludedMatchThisWeek;

    if (isWeekend || isLateWeekDone) {
      const nextWeekDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      return this.getIsoWeekKey(nextWeekDate);
    }

    return currentWeekKey;
  }

  /**
   * Toggle scelta giorno atleta: 'yes' (Ci sono) oppure 'maybe' (Forse).
   */
  async toggleDayVote(
    date: string,
    type: 'yes' | 'maybe' = 'yes',
  ): Promise<void> {
    const user = this.auth.firebaseUser();
    if (!user) return;

    let currentYes = [...this.myVotedDates()];
    let currentMaybe = [...this.myMaybeDates()];

    if (type === 'yes') {
      if (currentYes.includes(date)) {
        currentYes = currentYes.filter((d) => d !== date);
      } else {
        currentYes.push(date);
        currentMaybe = currentMaybe.filter((d) => d !== date);
      }
    } else if (type === 'maybe') {
      if (currentMaybe.includes(date)) {
        currentMaybe = currentMaybe.filter((d) => d !== date);
      } else {
        currentMaybe.push(date);
        currentYes = currentYes.filter((d) => d !== date);
      }
    }

    const isNowYes = currentYes.includes(date);
    await this.saveMyVotes(currentYes, currentMaybe);
    await this.syncVoteWithActiveMatch(date, isNowYes);
  }

  /**
   * Sincronizza immediatamente il cambio voto dell'atleta con eventuali partite attive (non concluse) in quella data.
   * Se l'atleta toglie la disponibilità ('no' / unchecked), viene rimosso dai convocati e il suo RSVP impostato a 'declined'.
   * Se l'atleta dà disponibilità ('yes'), viene aggiunto ai convocati e il suo RSVP impostato a 'confirmed'.
   */
  async syncVoteWithActiveMatch(
    date: string,
    isVotedYes: boolean,
  ): Promise<void> {
    if (!this.firestore) return;
    const user = this.auth.firebaseUser();
    if (!user) return;
    const currentPid = this.auth.linkedPlayerId();
    const currentName =
      this.auth.displayName() || user.email?.split('@')[0] || 'Atleta';

    const partite = this.statsEngine.partiteRaw() || [];
    const activeMatchesOnDate = partite.filter(
      (m) =>
        (m.dataPartita === date ||
          (m.dataPartita && m.dataPartita.startsWith(date))) &&
        !m.matchConcluso,
    );

    for (const m of activeMatchesOnDate) {
      if (!m.id) continue;
      const matchDocRef = doc(this.firestore, `partite/${m.id}`);

      let convocati = Array.isArray(m.convocati) ? [...m.convocati] : [];
      const rsvpMap = { ...(m.rsvp || {}) };

      if (!isVotedYes) {
        // Rimuovi atleta dai convocati
        convocati = convocati.filter((c: any) => {
          const cId = typeof c === 'string' ? c : c?.id || c?.playerId;
          const cName = typeof c === 'object' ? c?.nome : null;
          if (currentPid && cId === currentPid) return false;
          if (
            cName &&
            currentName &&
            cName.toLowerCase() === currentName.toLowerCase()
          )
            return false;
          return true;
        });

        // Aggiorna RSVP dell'utente
        rsvpMap[user.uid] = {
          uid: user.uid,
          playerId: currentPid || '',
          playerName: currentName,
          status: 'declined',
          updatedAt: new Date().toISOString(),
          respondedVia: 'app',
        };
      } else {
        // Aggiungi atleta ai convocati se non già presente
        const alreadyIn = convocati.some((c: any) => {
          const cId = typeof c === 'string' ? c : c?.id || c?.playerId;
          const cName = typeof c === 'object' ? c?.nome : null;
          return (
            (currentPid && cId === currentPid) ||
            (cName &&
              currentName &&
              cName.toLowerCase() === currentName.toLowerCase())
          );
        });

        if (!alreadyIn) {
          const allPlayers = this.statsEngine.giocatoriRaw() || [];
          const playerObj = allPlayers.find(
            (p) =>
              (currentPid && p.id === currentPid) ||
              (p.linkedUid && p.linkedUid === user.uid),
          );
          if (playerObj) {
            convocati.push({
              id: playerObj.id,
              nome: playerObj.nome,
              fotoUrl: playerObj.fotoUrl || null,
              soprannome: playerObj.soprannome || null,
              ruoloPreferito: playerObj.ruoloPreferito || null,
              piedePreferito: playerObj.piedePreferito || null,
              selezionato: true,
              source: 'self',
            });
          }
        }

        rsvpMap[user.uid] = {
          uid: user.uid,
          playerId: currentPid || '',
          playerName: currentName,
          status: 'confirmed',
          updatedAt: new Date().toISOString(),
          respondedVia: 'app',
        };
      }

      try {
        await updateDoc(matchDocRef, {
          convocati,
          rsvp: rsvpMap,
        });
      } catch (err) {
        console.warn('Errore sincronizzazione disponibilità -> partita:', err);
      }
    }
  }

  /**
   * Salva l'array delle date 'Ci sono' e 'Forse' dell'atleta su Firestore.
   */
  async saveMyVotes(
    availableDates: string[],
    maybeDates: string[] = [],
    note?: string,
  ): Promise<void> {
    if (!this.firestore) return;
    const user = this.auth.firebaseUser();
    if (!user) return;

    const weekKey = this.activeWeekKey();
    const docRef = doc(this.firestore, `weekly_availability/${weekKey}`);
    const days = this.activeWeekDays();

    const athleteVote: any = {
      uid: user.uid,
      playerId: this.auth.linkedPlayerId() || null,
      displayName:
        this.auth.displayName() || user.email?.split('@')[0] || 'Atleta',
      photoURL: this.auth.photoURL() || null,
      availableDates: availableDates || [],
      maybeDates: maybeDates || [],
      updatedAt: new Date().toISOString(),
    };
    if (note && note.trim()) {
      athleteVote.note = note.trim();
    }

    const payload: Partial<WeeklyAvailabilityDoc> = {
      weekKey,
      startDate: days[0].date,
      endDate: days[6].date,
      seasonId: '2026-2027',
      updatedAt: new Date().toISOString(),
    };

    // Update atomico sulla mappa votes[uid]
    await setDoc(
      docRef,
      {
        ...payload,
        votes: {
          [user.uid]: athleteVote,
        },
      },
      { merge: true },
    );
  }

  /**
   * DEV ONLY: Simula voti realistici di altri compagni di squadra sui 7 giorni
   * con numeri diversi per ogni giorno e con pareggio al vertice per testare i bordi multipli.
   */
  async simulaVotiCompagniDev(): Promise<void> {
    if (environment.production || !this.firestore) return;

    const weekKey = this.activeWeekKey();
    const docRef = doc(this.firestore, `weekly_availability/${weekKey}`);
    const days = this.activeWeekDays();
    if (days.length < 7) return;

    const allPlayers = this.statsEngine.giocatoriRaw() || [];
    const currentUid = this.auth.firebaseUser()?.uid;
    const currentPid = this.auth.linkedPlayerId();

    // Escludiamo l'utente correntemente loggato
    const otherPlayers = allPlayers.filter(
      (p) =>
        (!currentPid || p.id !== currentPid) &&
        (!currentUid || p.linkedUid !== currentUid),
    );

    // Assicuriamo un pool sufficiente di almeno 13 atleti per testare numeri alti (11+)
    const playerPool = [...otherPlayers];
    const mockNames = [
      'Paolo C.',
      'Matteo R.',
      'Andrea M.',
      'Umberto B.',
      'Lollino',
      'Cristiano C.',
      'Daniele F.',
      'Ayrton D.',
      'Lorenzo T.',
      'Tommaso R.',
      'Gianluca M.',
      'Simone V.',
      'Federico G.',
    ];
    let mockIdx = 0;
    while (playerPool.length < 13 && mockIdx < mockNames.length) {
      playerPool.push({
        id: `mock_player_${mockIdx}`,
        nome: mockNames[mockIdx],
        linkedUid: `mock_uid_${mockIdx}`,
        fotoUrl: '',
      } as any);
      mockIdx++;
    }

    // Target numero di voti per giorno (Lun..Dom):
    // Lun: 8, Mar: 3, Mer: 11 (Quorum!), Gio: 6, Ven: 11 (Quorum! Pareggio al vertice), Sab: 4, Dom: 2
    const targetCounts = [8, 3, 11, 6, 11, 4, 2];

    const currentDoc = this.activeWeekDoc();
    const cleanVotes: Record<string, any> = {};

    // Mantieni il voto reale dell'utente attivo se presente
    if (currentUid && currentDoc?.votes?.[currentUid]) {
      cleanVotes[currentUid] = currentDoc.votes[currentUid];
    }

    playerPool.forEach((player, pIdx) => {
      const mockUid = player.linkedUid || `mock_dev_${player.id}`;
      const availableDates: string[] = [];

      days.forEach((day, dIdx) => {
        const target = targetCounts[dIdx] || 0;
        // Assegniamo i primi 'target' atleti per ciascun giorno (con rotazione per varietà di facce)
        const offset = (pIdx + dIdx * 2) % playerPool.length;
        if (offset < target) {
          availableDates.push(day.date);
        }
      });

      cleanVotes[mockUid] = {
        uid: mockUid,
        playerId: player.id,
        displayName: player.nome,
        photoURL: player.fotoUrl || null,
        availableDates,
        maybeDates: [],
        updatedAt: new Date().toISOString(),
      };
    });

    const payload: Partial<WeeklyAvailabilityDoc> = {
      weekKey,
      startDate: days[0].date,
      endDate: days[6].date,
      seasonId: '2026-2027',
      updatedAt: new Date().toISOString(),
      votes: cleanVotes,
    };

    await setDoc(docRef, payload, { merge: true });
  }

  /**
   * DEV ONLY: Cancella TUTTI i voti della settimana attiva su Firestore (reset completo a 0 voti).
   */
  async cancellaTuttiIVotiDev(): Promise<void> {
    if (environment.production || !this.firestore) return;

    const weekKey = this.activeWeekKey();
    const docRef = doc(this.firestore, `weekly_availability/${weekKey}`);

    await setDoc(
      docRef,
      {
        votes: {},
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  }

  /**
   * DEV ONLY: Azzera tutti i voti simulati tenendo solo il voto dell'utente reale se loggato.
   */
  async resetVotiCompagniDev(): Promise<void> {
    if (environment.production || !this.firestore) return;

    const weekKey = this.activeWeekKey();
    const docRef = doc(this.firestore, `weekly_availability/${weekKey}`);
    const currentUid = this.auth.firebaseUser()?.uid;
    const currentDoc = this.activeWeekDoc();

    const cleanVotes: Record<string, any> = {};
    if (currentUid && currentDoc?.votes?.[currentUid]) {
      cleanVotes[currentUid] = currentDoc.votes[currentUid];
    }

    await setDoc(
      docRef,
      {
        votes: cleanVotes,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  }

  /**
   * Azione esclusiva Mister / Presidente:
   * Converte un giorno con disponibilità in una vera Partita con convocati confermati.
   */
  async convertDayToMatch(
    day: DaySummary,
    campoNome: string,
    campoMapsUrl?: string,
    orario = '21:00',
  ): Promise<string | null> {
    if (!this.firestore || !this.auth.isSuperUser()) return null;

    const weekKey =
      this.getIsoWeekKey(new Date(day.date)) || this.activeWeekKey();
    const matchId = `match_${day.date.replace(/-/g, '')}_${Date.now().toString().slice(-4)}`;
    const matchDocRef = doc(this.firestore, `partite/${matchId}`);

    const allPlayers = this.statsEngine.giocatoriRaw() || [];
    const convocatiFull: any[] = [];
    const rsvpMap: Record<string, any> = {};

    for (const v of day.voters || []) {
      const p = allPlayers.find(
        (g) =>
          (v.playerId && g.id === v.playerId) ||
          (g.linkedUid && g.linkedUid === v.uid),
      );
      if (p) {
        convocatiFull.push({
          id: p.id,
          nome: p.nome,
          fotoUrl: p.fotoUrl || null,
          soprannome: p.soprannome || null,
          ruoloPreferito: p.ruoloPreferito || null,
          piedePreferito: p.piedePreferito || null,
          selezionato: true,
          source: 'mister',
        });
      }
      rsvpMap[v.uid] = {
        uid: v.uid,
        playerId: p?.id || null,
        playerName: p?.nome || 'Atleta',
        status: 'confirmed',
        updatedAt: new Date().toISOString(),
      };
    }

    for (const v of day.maybeVoters || []) {
      const p = allPlayers.find(
        (g) =>
          (v.playerId && g.id === v.playerId) ||
          (g.linkedUid && g.linkedUid === v.uid),
      );
      rsvpMap[v.uid] = {
        uid: v.uid,
        playerId: p?.id || null,
        playerName: p?.nome || 'Atleta',
        status: 'maybe',
        updatedAt: new Date().toISOString(),
      };
    }

    const orarioPartita = orario || '21:00';
    let dataOraTimestamp: any = null;
    try {
      const dt = new Date(`${day.date}T${orarioPartita}:00`);
      if (!isNaN(dt.getTime())) {
        dataOraTimestamp = Timestamp.fromDate(dt);
      }
    } catch {
      // ignore
    }

    const nuovaPartita: Partial<Partita> = {
      dataPartita: day.date,
      orario: orarioPartita,
      dataOra: dataOraTimestamp || serverTimestamp(),
      luogo: campoNome || 'Roma 6',
      campoGoogleMapsUrl: campoMapsUrl || null,
      formato: day.formatInfo?.format || 'calcetto',
      convocati: convocatiFull,
      teamA: [],
      teamB: [],
      scoreA: 0,
      scoreB: 0,
      matchConcluso: false,
      pagelleInserite: false,
      status: 'pronta',
      step: 'dettagli',
      rsvp: rsvpMap,
      stagione: '2026/2027',
    };

    // Salva partita in Firestore
    await setDoc(matchDocRef, nuovaPartita);

    // Blocca e finalizza la settimana in weekly_availability
    const weekDocRef = doc(this.firestore, `weekly_availability/${weekKey}`);
    await setDoc(
      weekDocRef,
      {
        isLocked: true,
        confirmedMatchId: matchId,
        confirmedDate: day.date,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );

    return matchId;
  }

  /**
   * Configurazione Pausa Estiva (Mister / Presidente)
   */
  async toggleSummerBreak(enabled: boolean): Promise<void> {
    if (!this.firestore || !this.auth.isSuperUser()) return;
    const cfgRef = doc(
      this.firestore,
      'config_stagioni/season_calendar_config',
    );
    const nextCfg: SeasonCalendarConfig = {
      ...this.calendarConfig(),
      summerBreakEnabled: enabled,
    };
    this.calendarConfig.set(nextCfg);
    await setDoc(cfgRef, nextCfg, { merge: true });
  }

  private async loadSeasonConfig(): Promise<void> {
    if (!this.firestore) return;
    try {
      const cfgRef = doc(
        this.firestore,
        'config_stagioni/season_calendar_config',
      );
      docData(cfgRef).subscribe({
        next: (data) => {
          if (data) {
            this.calendarConfig.set(data as SeasonCalendarConfig);
          }
        },
      });
    } catch {
      // ignore
    }
  }

  private getIsoWeekKey(date: Date): string {
    const d = new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
    );
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(
      ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
    );
    return `${d.getUTCFullYear()}-W${weekNo.toString().padStart(2, '0')}`;
  }

  private generateWeekDays(
    weekKey: string,
  ): { date: string; dayName: any; dayNumber: number }[] {
    const [yearStr, weekStr] = weekKey.split('-W');
    const year = parseInt(yearStr, 10);
    const week = parseInt(weekStr, 10);

    // Calcolo esatto del lunedì ISO 8601 (il 4 gennaio cade sempre nella settimana 1)
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const dayOfWeek = jan4.getUTCDay() || 7;
    const isoMonday = new Date(
      Date.UTC(year, 0, 4 - (dayOfWeek - 1) + (week - 1) * 7),
    );

    const dayNames = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'] as const;
    const days: { date: string; dayName: any; dayNumber: number }[] = [];

    for (let i = 0; i < 7; i++) {
      const current = new Date(isoMonday);
      current.setUTCDate(isoMonday.getUTCDate() + i);

      const y = current.getUTCFullYear();
      const m = String(current.getUTCMonth() + 1).padStart(2, '0');
      const d = String(current.getUTCDate()).padStart(2, '0');

      days.push({
        date: `${y}-${m}-${d}`,
        dayName: dayNames[i],
        dayNumber: current.getUTCDate(),
      });
    }

    return days;
  }
}
