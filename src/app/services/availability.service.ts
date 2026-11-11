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
  DEFAULT_DAY_MAX_CAP,
  EXTENDED_DAY_MAX_CAP,
  DAY_QUORUM_TARGET,
  PlayerDayVoteState,
  VoteHistoryEntry,
  PrioritizedVoter,
  DayVotingConfig,
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
    const docData = this.activeWeekDoc();
    const uid = this.auth.firebaseUser()?.uid;
    if (!docData || !uid || !docData.votes?.[uid]) return [];
    return docData.votes[uid].availableDates || [];
  });

  /** Date che l'utente loggato ha votato in dubbio ("Forse") per la settimana corrente */
  readonly myMaybeDates = computed<string[]>(() => {
    const docData = this.activeWeekDoc();
    const uid = this.auth.firebaseUser()?.uid;
    if (!docData || !uid || !docData.votes?.[uid]) return [];
    return docData.votes[uid].maybeDates || [];
  });

  /**
   * Riepilogo dei 7 giorni della settimana con:
   * - CAP dinamico (14 default = 7vs7, 16 sbloccato = 8vs8)
   * - Presenti ordinati rigorosamente per `firstVotedAt` crescente (dal più vecchio al più recente)
   * - Storico completo (`voteHistory`) di tutte le iscrizioni, cancellazioni e ri-iscrizioni
   */
  readonly daySummaries = computed<DaySummary[]>(() => {
    const docData = this.activeWeekDoc();
    const days = this.activeWeekDays();
    const allVotes = Object.values(docData?.votes || {});
    const allPlayers = this.statsEngine.giocatoriRaw() || [];

    return days.map((d) => {
      const dayCfg = docData?.dayConfigs?.[d.date];
      const allowEightVsEight = !!dayCfg?.allowEightVsEight;
      const maxCap = allowEightVsEight
        ? EXTENDED_DAY_MAX_CAP
        : DEFAULT_DAY_MAX_CAP;

      // 1. Ricostruzione e deduplicazione dell'Audit Log completo (voteHistory) per il giorno
      const mergedHistoryMap = new Map<string, VoteHistoryEntry>();
      const docLevelHistory = docData?.dayVoteHistory?.[d.date] || [];
      for (const h of docLevelHistory) {
        if (!h || !h.userId || !h.timestamp) continue;
        const key = `${h.userId}_${h.action}_${h.timestamp}`;
        mergedHistoryMap.set(key, { ...h });
      }
      for (const v of allVotes) {
        const userDayHistory = v.voteHistoryByDate?.[d.date] || [];
        for (const h of userDayHistory) {
          if (!h || !h.userId || !h.timestamp) continue;
          const key = `${h.userId}_${h.action}_${h.timestamp}`;
          if (!mergedHistoryMap.has(key)) {
            mergedHistoryMap.set(key, { ...h });
          }
        }
      }

      const chronologicalHistory = Array.from(mergedHistoryMap.values()).sort(
        (a, b) => a.timestamp - b.timestamp,
      );

      // Calcolo deterministico del primo voto 'in' per ogni utente nella timeline del giorno
      const firstInByUser = new Map<string, number>();
      const inCountByUser = new Map<string, number>();
      const lastActionByUser = new Map<string, number>();

      // Pre-popoliamo con eventuale `dayVotes[d.date].firstVotedAt` salvato sullo stato utente
      for (const v of allVotes) {
        const meta = v.dayVotes?.[d.date];
        if (meta?.firstVotedAt && meta.firstVotedAt > 0) {
          firstInByUser.set(v.uid, meta.firstVotedAt);
        }
      }

      const normalizedHistory: VoteHistoryEntry[] = chronologicalHistory.map(
        (entry) => {
          const prevLast = lastActionByUser.get(entry.userId) || 0;
          if (entry.timestamp > prevLast) {
            lastActionByUser.set(entry.userId, entry.timestamp);
          }

          // Risolve il nome aggiornato se possibile
          const matchedPlayer = allPlayers.find(
            (p) =>
              (entry.playerId && p.id === entry.playerId) ||
              (p.linkedUid && p.linkedUid === entry.userId),
          );
          const resolvedName =
            matchedPlayer?.soprannome ||
            matchedPlayer?.nome ||
            entry.userName ||
            'Atleta';

          if (entry.action === 'in') {
            const prevCount = inCountByUser.get(entry.userId) || 0;
            const nextCount = prevCount + 1;
            inCountByUser.set(entry.userId, nextCount);

            let firstTs = firstInByUser.get(entry.userId);
            if (!firstTs || entry.timestamp < firstTs) {
              firstTs = entry.firstVotedAt || entry.timestamp;
              firstInByUser.set(entry.userId, firstTs);
            }
            const isRejoin = entry.isRejoin ?? nextCount > 1;
            return {
              ...entry,
              userName: resolvedName,
              firstVotedAt: firstTs,
              isRejoin,
            };
          } else {
            const firstTs =
              firstInByUser.get(entry.userId) ||
              entry.firstVotedAt ||
              entry.timestamp;
            return {
              ...entry,
              userName: resolvedName,
              firstVotedAt: firstTs,
              isRejoin: false,
            };
          }
        },
      );

      // 2. Costruzione lista presenti e ordinamento RIGOROSO per `firstVotedAt` crescente
      const rawPresentVoters = allVotes.filter((v) =>
        (v.availableDates || []).includes(d.date),
      );

      const enrichedVoters = rawPresentVoters.map((v) => {
        const meta = v.dayVotes?.[d.date];
        const historyFirst = firstInByUser.get(v.uid);
        const legacyFallback = v.updatedAt
          ? Date.parse(v.updatedAt) || Number.MAX_SAFE_INTEGER
          : Number.MAX_SAFE_INTEGER;

        const firstVotedAt =
          meta?.firstVotedAt && meta.firstVotedAt > 0
            ? meta.firstVotedAt
            : historyFirst && historyFirst > 0
              ? historyFirst
              : legacyFallback;

        const lastActionAt =
          meta?.lastActionAt && meta.lastActionAt > 0
            ? meta.lastActionAt
            : lastActionByUser.get(v.uid) || firstVotedAt;

        const totalIns =
          meta?.inCount ?? inCountByUser.get(v.uid) ?? 1;

        const isReconfirmed =
          totalIns > 1 ||
          (firstVotedAt < Number.MAX_SAFE_INTEGER &&
            lastActionAt > firstVotedAt + 1000);

        return {
          vote: v,
          firstVotedAt,
          lastActionAt,
          isReconfirmed,
        };
      });

      // REGOLA D'ORO DELLA PRIORITÀ: Ordinamento rigorosamente crescente per `firstVotedAt`
      enrichedVoters.sort((a, b) => {
        if (a.firstVotedAt !== b.firstVotedAt) {
          return a.firstVotedAt - b.firstVotedAt;
        }
        return (
          (a.vote.displayName || '').localeCompare(b.vote.displayName || '') ||
          (a.vote.uid || '').localeCompare(b.vote.uid || '')
        );
      });

      const voters: PrioritizedVoter[] = enrichedVoters.map((item, idx) => {
        const priorityRank = idx + 1;
        return {
          ...item.vote,
          priorityRank,
          firstVotedAt: item.firstVotedAt,
          lastActionAt: item.lastActionAt,
          isReconfirmed: item.isReconfirmed,
          isWithinCap: priorityRank <= maxCap,
        };
      });

      // Fallback per voti legacy: se un presente non aveva ancora un record esplicito in `voteHistory`,
      // sintetizziamo la sua iscrizione iniziale al timestamp `firstVotedAt` così l'Audit Log è sempre completo.
      for (const v of voters) {
        const hasHistoryForVoter = normalizedHistory.some(
          (h) => h.userId === v.uid,
        );
        if (!hasHistoryForVoter) {
          const matchedPlayer = allPlayers.find(
            (p) =>
              (v.playerId && p.id === v.playerId) ||
              (p.linkedUid && p.linkedUid === v.uid),
          );
          const resolvedName =
            matchedPlayer?.soprannome ||
            matchedPlayer?.nome ||
            v.displayName ||
            'Atleta';
          const effectiveTs =
            v.firstVotedAt < Number.MAX_SAFE_INTEGER
              ? v.firstVotedAt
              : Date.now();
          normalizedHistory.push({
            userId: v.uid,
            playerId: v.playerId || null,
            userName: resolvedName,
            action: 'in',
            timestamp: effectiveTs,
            firstVotedAt: effectiveTs,
            isRejoin: false,
          });
        }
      }
      normalizedHistory.sort((a, b) => a.timestamp - b.timestamp);

      const maybeVoters = allVotes.filter((v) =>
        (v.maybeDates || []).includes(d.date),
      );
      const count = voters.length;
      const maybeCount = maybeVoters.length;
      const formatInfo = getMatchFormatByPlayerCount(count);
      const hasQuorum = count >= DAY_QUORUM_TARGET;
      const missingForQuorum =
        count >= DAY_QUORUM_TARGET ? 0 : DAY_QUORUM_TARGET - count;
      const isCapReached = count >= maxCap;
      const remainingSlots = Math.max(0, maxCap - count);

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
        allowEightVsEight,
        maxCap,
        isCapReached,
        remainingSlots,
        voteHistory: normalizedHistory,
      };
    });
  });

  /** Atleti in rosa registrati che non hanno ancora espresso disponibilità */
  readonly missingAthletes = computed<string[]>(() => {
    const docData = this.activeWeekDoc();
    const votedUids = new Set(Object.keys(docData?.votes || {}));
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

  private resolveCurrentUserName(): string {
    const user = this.auth.firebaseUser();
    const pid = this.auth.linkedPlayerId();
    const allPlayers = this.statsEngine.giocatoriRaw() || [];
    const linkedPlayer = allPlayers.find(
      (p) =>
        (pid && p.id === pid) ||
        (user?.uid && p.linkedUid === user.uid),
    );
    if (linkedPlayer?.soprannome?.trim()) return linkedPlayer.soprannome.trim();
    if (linkedPlayer?.nome?.trim()) return linkedPlayer.nome.trim();
    return (
      this.auth.displayName() || user?.email?.split('@')[0] || 'Atleta'
    );
  }

  /**
   * Toggle scelta giorno atleta: 'yes' (Ci sono) oppure 'maybe' (Forse).
   * Applica il controllo rigoroso del CAP (14 standard / 16 se 8vs8 sbloccato)
   * e mantiene immutabile `firstVotedAt` anche in caso di disiscrizione e ri-iscrizione.
   */
  async toggleDayVote(
    date: string,
    type: 'yes' | 'maybe' = 'yes',
  ): Promise<void> {
    const user = this.auth.firebaseUser();
    if (!user) return;

    let currentYes = [...this.myVotedDates()];
    let currentMaybe = [...this.myMaybeDates()];
    const wasYes = currentYes.includes(date);

    if (type === 'yes') {
      if (wasYes) {
        // Disiscrizione: sempre permessa per liberare il posto
        currentYes = currentYes.filter((d) => d !== date);
      } else {
        // Nuova iscrizione o ri-iscrizione: verifica il CAP del giorno (14 o 16)
        const daySummary = this.daySummaries().find((s) => s.date === date);
        const maxCap = daySummary ? daySummary.maxCap : DEFAULT_DAY_MAX_CAP;
        const currentCount = daySummary ? daySummary.voterCount : 0;

        if (currentCount >= maxCap) {
          if (maxCap === DEFAULT_DAY_MAX_CAP) {
            throw new Error(
              `Giorno COMPLETO (${DEFAULT_DAY_MAX_CAP}/${DEFAULT_DAY_MAX_CAP} • 7vs7). Solo Mister o Presidente possono sbloccare i 16 posti (8vs8).`,
            );
          } else {
            throw new Error(
              `Giorno COMPLETO (${EXTENDED_DAY_MAX_CAP}/${EXTENDED_DAY_MAX_CAP} • 8vs8). Tutti i posti sono esauriti.`,
            );
          }
        }

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
    const voteTransition =
      wasYes !== isNowYes
        ? { date, action: (isNowYes ? 'in' : 'out') as 'in' | 'out' }
        : undefined;

    await this.saveMyVotes(currentYes, currentMaybe, undefined, voteTransition);
    await this.syncVoteWithActiveMatch(date, isNowYes);
  }

  /**
   * Abilita o disabilita l'estensione del CAP da 14 (7vs7) a 16 giocatori (8vs8) per un giorno specifico.
   * Azione riservata esclusivamente a Mister e Presidente (`auth.isSuperUser()`).
   */
  async toggleDayEightVsEight(date: string): Promise<boolean> {
    if (!this.firestore || !this.auth.isSuperUser()) {
      throw new Error(
        'Solo Mister e Presidente possono sbloccare o limitare i 16 posti (8vs8).',
      );
    }

    const user = this.auth.firebaseUser();
    const weekKey = this.activeWeekKey();
    const docRef = doc(this.firestore, `weekly_availability/${weekKey}`);
    const days = this.activeWeekDays();
    const currentDoc = this.activeWeekDoc();

    const prevAllow = !!currentDoc?.dayConfigs?.[date]?.allowEightVsEight;
    const nextAllow = !prevAllow;
    const nextMaxCap = nextAllow ? EXTENDED_DAY_MAX_CAP : DEFAULT_DAY_MAX_CAP;

    const nextDayConfig: DayVotingConfig = {
      allowEightVsEight: nextAllow,
      maxCap: nextMaxCap,
      updatedAt: Date.now(),
      updatedBy: user?.uid || 'admin',
    };

    const updatedDayConfigs: Record<string, DayVotingConfig> = {
      ...(currentDoc?.dayConfigs || {}),
      [date]: nextDayConfig,
    };

    if (currentDoc) {
      this.activeWeekDoc.set({
        ...currentDoc,
        dayConfigs: updatedDayConfigs,
        updatedAt: new Date().toISOString(),
      });
    }

    await setDoc(
      docRef,
      {
        weekKey,
        startDate: days[0].date,
        endDate: days[6].date,
        dayConfigs: {
          [date]: nextDayConfig,
        },
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );

    return nextAllow;
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
   * Salva l'array delle date 'Ci sono' e 'Forse' dell'atleta su Firestore,
   * garantendo l'immutabilità di `firstVotedAt` per giorno e registrando ogni
   * evento nell'append-only log `voteHistory`.
   */
  async saveMyVotes(
    availableDates: string[],
    maybeDates: string[] = [],
    note?: string,
    voteTransition?: { date: string; action: 'in' | 'out' },
  ): Promise<void> {
    if (!this.firestore) return;
    const user = this.auth.firebaseUser();
    if (!user) return;

    const weekKey = this.activeWeekKey();
    const docRef = doc(this.firestore, `weekly_availability/${weekKey}`);
    const days = this.activeWeekDays();
    const currentDoc = this.activeWeekDoc();
    const existingVote = currentDoc?.votes?.[user.uid];

    const now = Date.now();
    const resolvedUserName = this.resolveCurrentUserName();
    const linkedPid = this.auth.linkedPlayerId() || null;

    const dayVotes: Record<string, PlayerDayVoteState> = {
      ...(existingVote?.dayVotes || {}),
    };
    const voteHistoryByDate: Record<string, VoteHistoryEntry[]> = {
      ...(existingVote?.voteHistoryByDate || {}),
    };
    const nextDayVoteHistoryPatch: Record<string, VoteHistoryEntry[]> = {};

    if (voteTransition) {
      const { date, action } = voteTransition;
      const prevMeta = dayVotes[date];
      const existingUserDayHist = [...(voteHistoryByDate[date] || [])];
      const existingDocDayHist = [
        ...(currentDoc?.dayVoteHistory?.[date] || []),
      ];

      // Cerca eventuale primo voto precedente nello storico o nel documento legacy
      const earliestHistIn = [...existingUserDayHist, ...existingDocDayHist]
        .filter((h) => h.userId === user.uid && h.action === 'in')
        .reduce<number | null>(
          (min, h) =>
            min === null || h.timestamp < min
              ? h.firstVotedAt || h.timestamp
              : min,
          null,
        );

      const legacyInitialTs =
        action === 'out' && existingVote?.updatedAt
          ? Date.parse(existingVote.updatedAt) || now
          : null;

      // REGOLA D'ORO: `firstVotedAt` è IMMUTABILE!
      // Se il giocatore aveva già votato in precedenza su questo giorno (anche se poi si era tolto),
      // mantiene SEMPRE il timestamp del suo primo voto assoluto.
      const immutableFirstVotedAt =
        prevMeta?.firstVotedAt && prevMeta.firstVotedAt > 0
          ? prevMeta.firstVotedAt
          : earliestHistIn && earliestHistIn > 0
            ? earliestHistIn
            : legacyInitialTs || now;

      const prevInCount =
        prevMeta?.inCount ??
        (prevMeta?.firstVotedAt || earliestHistIn || legacyInitialTs ? 1 : 0);
      const nextInCount =
        action === 'in' ? prevInCount + 1 : Math.max(1, prevInCount);
      const isRejoin = action === 'in' && nextInCount > 1;

      dayVotes[date] = {
        status: action,
        firstVotedAt: immutableFirstVotedAt,
        lastActionAt: now,
        inCount: nextInCount,
      };

      const historyEntry: VoteHistoryEntry = {
        userId: user.uid,
        playerId: linkedPid,
        userName: resolvedUserName,
        action,
        timestamp: now,
        firstVotedAt: immutableFirstVotedAt,
        isRejoin,
      };

      existingUserDayHist.push(historyEntry);
      voteHistoryByDate[date] = existingUserDayHist;

      existingDocDayHist.push(historyEntry);
      nextDayVoteHistoryPatch[date] = existingDocDayHist;
    }

    // Assicura che ogni data attiva in `availableDates` abbia il suo stato `dayVotes` inizializzato
    for (const d of availableDates || []) {
      if (!dayVotes[d]) {
        dayVotes[d] = {
          status: 'in',
          firstVotedAt: now,
          lastActionAt: now,
          inCount: 1,
        };
      }
    }

    const athleteVote: any = {
      uid: user.uid,
      playerId: linkedPid,
      displayName: resolvedUserName,
      photoURL: this.auth.photoURL() || null,
      availableDates: availableDates || [],
      maybeDates: maybeDates || [],
      dayVotes,
      voteHistoryByDate,
      updatedAt: new Date(now).toISOString(),
    };
    if (note && note.trim()) {
      athleteVote.note = note.trim();
    }

    const payload: Partial<WeeklyAvailabilityDoc> = {
      weekKey,
      startDate: days[0].date,
      endDate: days[6].date,
      seasonId: '2026-2027',
      updatedAt: new Date(now).toISOString(),
    };

    const firestorePatch: Record<string, any> = {
      ...payload,
      votes: {
        [user.uid]: athleteVote,
      },
    };

    if (Object.keys(nextDayVoteHistoryPatch).length > 0) {
      firestorePatch['dayVoteHistory'] = nextDayVoteHistoryPatch;
    }

    // Update ottimistico immediato per reattività istantanea della UI
    if (currentDoc) {
      this.activeWeekDoc.set({
        ...currentDoc,
        ...payload,
        votes: {
          ...(currentDoc.votes || {}),
          [user.uid]: athleteVote,
        },
        dayVoteHistory: {
          ...(currentDoc.dayVoteHistory || {}),
          ...nextDayVoteHistoryPatch,
        },
      });
    }

    await setDoc(docRef, firestorePatch, { merge: true });
  }

  /**
   * DEV ONLY: Simula voti realistici di altri compagni di squadra sui 7 giorni
   * inclusi `firstVotedAt` scaglionati, un giorno COMPLETO (14/14) e cicli di disiscrizione/ri-iscrizione
   * per testare la conservazione della priorità e il modal Storico Voti.
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

    // Assicuriamo un pool sufficiente di almeno 15 atleti per testare il CAP 14/14 e l'8vs8 (16 posti)
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
      'Marco S.',
      'Valerio P.',
    ];
    let mockIdx = 0;
    while (playerPool.length < 15 && mockIdx < mockNames.length) {
      playerPool.push({
        id: `mock_player_${mockIdx}`,
        nome: mockNames[mockIdx],
        linkedUid: `mock_uid_${mockIdx}`,
        fotoUrl: '',
      } as any);
      mockIdx++;
    }

    // Target numero di voti per giorno (Lun..Dom):
    // Lun: 8, Mar: 5, Mer: 14 (COMPLETO 14/14!), Gio: 7, Ven: 12 (Quorum 12/14!), Sab: 4, Dom: 2
    const targetCounts = [8, 5, 14, 7, 12, 4, 2];

    const currentDoc = this.activeWeekDoc();
    const cleanVotes: Record<string, any> = {};
    const simulatedDayHistory: Record<string, VoteHistoryEntry[]> = {};
    days.forEach((d) => {
      simulatedDayHistory[d.date] = [];
    });

    // Mantieni il voto reale dell'utente attivo se presente
    if (currentUid && currentDoc?.votes?.[currentUid]) {
      cleanVotes[currentUid] = currentDoc.votes[currentUid];
      const myHistMap = currentDoc.votes[currentUid].voteHistoryByDate || {};
      for (const [dKey, entries] of Object.entries(myHistMap)) {
        if (simulatedDayHistory[dKey]) {
          simulatedDayHistory[dKey].push(...entries);
        }
      }
    }

    // Timestamp base simulato: stamattina alle 09:00
    const baseMorning = new Date();
    baseMorning.setHours(9, 0, 0, 0);
    const baseTs = baseMorning.getTime();

    playerPool.forEach((player, pIdx) => {
      const mockUid = player.linkedUid || `mock_dev_${player.id}`;
      const pName = player.soprannome || player.nome || `Atleta ${pIdx + 1}`;
      const availableDates: string[] = [];
      const dayVotes: Record<string, PlayerDayVoteState> = {};
      const voteHistoryByDate: Record<string, VoteHistoryEntry[]> = {};

      days.forEach((day, dIdx) => {
        let target = targetCounts[dIdx] || 0;
        // Se sul Mercoledì (14/14) l'utente reale ha già votato, aggiungiamo 13 compagni per fare 14/14 esatti
        if (
          dIdx === 2 &&
          currentUid &&
          cleanVotes[currentUid]?.availableDates?.includes(day.date)
        ) {
          target = 13;
        }

        const offset = (pIdx + dIdx * 2) % playerPool.length;
        if (offset < target) {
          availableDates.push(day.date);

          // Orario del 1° voto scaglionato per ordine di priorità realistico
          const firstVotedAt =
            baseTs + offset * 9 * 60 * 1000 + dIdx * 60 * 1000;
          const entries: VoteHistoryEntry[] = [
            {
              userId: mockUid,
              playerId: player.id,
              userName: pName,
              action: 'in',
              timestamp: firstVotedAt,
              firstVotedAt,
              isRejoin: false,
            },
          ];

          let lastActionAt = firstVotedAt;
          let inCount = 1;

          // Simuliamo per il #1 e #3 votante un ciclo disiscrizione per sbaglio + ri-iscrizione 2 minuti dopo
          // così da dimostrare la regola d'oro della priorità immutabile (`firstVotedAt`)!
          if (offset === 0 || offset === 2) {
            const outTs = firstVotedAt + 125 * 60 * 1000;
            const rejoinTs = outTs + 2 * 60 * 1000;
            entries.push({
              userId: mockUid,
              playerId: player.id,
              userName: pName,
              action: 'out',
              timestamp: outTs,
              firstVotedAt,
              isRejoin: false,
            });
            entries.push({
              userId: mockUid,
              playerId: player.id,
              userName: pName,
              action: 'in',
              timestamp: rejoinTs,
              firstVotedAt,
              isRejoin: true,
            });
            lastActionAt = rejoinTs;
            inCount = 2;
          }

          dayVotes[day.date] = {
            status: 'in',
            firstVotedAt,
            lastActionAt,
            inCount,
          };
          voteHistoryByDate[day.date] = entries;
          simulatedDayHistory[day.date].push(...entries);
        }
      });

      cleanVotes[mockUid] = {
        uid: mockUid,
        playerId: player.id,
        displayName: player.nome,
        photoURL: player.fotoUrl || null,
        availableDates,
        maybeDates: [],
        dayVotes,
        voteHistoryByDate,
        updatedAt: new Date().toISOString(),
      };
    });

    // Ordiniamo cronologicamente gli eventi di ogni giorno
    for (const dKey of Object.keys(simulatedDayHistory)) {
      simulatedDayHistory[dKey].sort((a, b) => a.timestamp - b.timestamp);
    }

    const payload: Partial<WeeklyAvailabilityDoc> = {
      weekKey,
      startDate: days[0].date,
      endDate: days[6].date,
      seasonId: '2026-2027',
      updatedAt: new Date().toISOString(),
      votes: cleanVotes,
      dayVoteHistory: simulatedDayHistory,
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
        dayVoteHistory: {},
        dayConfigs: {},
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
    const cleanDayHistory: Record<string, VoteHistoryEntry[]> = {};
    if (currentUid && currentDoc?.votes?.[currentUid]) {
      cleanVotes[currentUid] = currentDoc.votes[currentUid];
      const userHist = currentDoc.votes[currentUid].voteHistoryByDate || {};
      for (const [dKey, list] of Object.entries(userHist)) {
        cleanDayHistory[dKey] = [...list];
      }
    }

    await setDoc(
      docRef,
      {
        votes: cleanVotes,
        dayVoteHistory: cleanDayHistory,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  }

  /**
   * Azione esclusiva Mister / Presidente:
   * Converte un giorno con disponibilità in una vera Partita con convocati confermati
   * (rispettando l'ordine ufficiale di priorità `firstVotedAt` e il CAP del giorno).
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

    const effectiveCap = day.maxCap || DEFAULT_DAY_MAX_CAP;
    const prioritizedVoters = (day.voters || []).slice(0, effectiveCap);

    for (const v of prioritizedVoters) {
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
