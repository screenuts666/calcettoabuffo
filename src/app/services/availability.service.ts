import { Injectable, inject, signal, computed } from '@angular/core';
import { Firestore, collection, doc, docData, setDoc, updateDoc } from '@angular/fire/firestore';
import { Observable, of } from 'rxjs';
import { AuthService } from './auth.service';
import { StatsEngineService } from './stats-engine.service';
import {
  WeeklyAvailabilityDoc,
  AthleteWeeklyVote,
  DaySummary,
  SeasonCalendarConfig,
} from '../models/weekly-availability.model';
import { getMatchFormatByPlayerCount, Partita } from '../models/partita.model';

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

  /** Chiave settimana attiva calcolata automaticamente (es. "2026-W46") */
  readonly activeWeekKey = signal<string>(this.calculateActiveWeekKey());

  /** Documento real-time da Firestore per la settimana attiva */
  readonly activeWeekDoc = signal<WeeklyAvailabilityDoc | null>(null);

  /** I giorni (Lun-Dom) della settimana attiva */
  readonly activeWeekDays = computed(() => {
    return this.generateWeekDays(this.activeWeekKey());
  });

  /** Date che l'utente loggato ha votato per la settimana corrente */
  readonly myVotedDates = computed<string[]>(() => {
    const doc = this.activeWeekDoc();
    const uid = this.auth.firebaseUser()?.uid;
    if (!doc || !uid || !doc.votes?.[uid]) return [];
    return doc.votes[uid].availableDates || [];
  });

  /** Riepilogo dei 7 giorni della settimana con contatori e atleti disponibili */
  readonly daySummaries = computed<DaySummary[]>(() => {
    const doc = this.activeWeekDoc();
    const days = this.activeWeekDays();
    const allVotes = Object.values(doc?.votes || {});

    return days.map((d) => {
      const voters = allVotes.filter((v) => v.availableDates.includes(d.date));
      const count = voters.length;
      const formatInfo = getMatchFormatByPlayerCount(count);
      const hasQuorum = count >= 10;
      const missingForQuorum = count >= 10 ? 0 : 10 - count;

      return {
        date: d.date,
        dayName: d.dayName,
        dayNumber: d.dayNumber,
        voters,
        voterCount: count,
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

  constructor() {
    this.subscribeToActiveWeek();
    this.loadSeasonConfig();
  }

  /**
   * Calcola la settimana di riferimento:
   * Se c'è già una partita disputata questa settimana (o oggi è Domenica),
   * passa automaticamente alla settimana successiva.
   */
  calculateActiveWeekKey(): string {
    const now = new Date();
    const currentWeekKey = this.getIsoWeekKey(now);

    // Controlla se è già stata giocata una partita questa settimana
    const partite = this.statsEngine.partiteRaw?.() || [];
    const hasMatchThisWeek = partite.some((m) => {
      if (!m.dataPartita) return false;
      const mDate = new Date(m.dataPartita);
      return !isNaN(mDate.getTime()) && this.getIsoWeekKey(mDate) === currentWeekKey;
    });

    // Se si è già giocato in settimana, passa alla prossima
    if (hasMatchThisWeek) {
      const nextWeekDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      return this.getIsoWeekKey(nextWeekDate);
    }

    return currentWeekKey;
  }

  /**
   * Toggle rapido di un giorno per l'atleta loggato (Multi-Giorno).
   */
  async toggleDayVote(date: string): Promise<void> {
    const user = this.auth.firebaseUser();
    if (!user) return;

    const currentDates = this.myVotedDates();
    let nextDates: string[];

    if (currentDates.includes(date)) {
      nextDates = currentDates.filter((d) => d !== date);
    } else {
      nextDates = [...currentDates, date];
    }

    await this.saveMyVotes(nextDates);
  }

  /**
   * Salva l'array delle date selezionate dall'atleta loggato su Firestore.
   */
  async saveMyVotes(availableDates: string[], note?: string): Promise<void> {
    if (!this.firestore) return;
    const user = this.auth.firebaseUser();
    if (!user) return;

    const weekKey = this.activeWeekKey();
    const docRef = doc(this.firestore, `weekly_availability/${weekKey}`);
    const days = this.activeWeekDays();

    const athleteVote: AthleteWeeklyVote = {
      uid: user.uid,
      playerId: this.auth.linkedPlayerId(),
      displayName: this.auth.displayName() || user.email?.split('@')[0] || 'Atleta',
      photoURL: this.auth.photoURL(),
      availableDates,
      updatedAt: new Date().toISOString(),
      note: note || undefined,
    };

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
      { merge: true }
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
    orario = '21:00'
  ): Promise<string | null> {
    if (!this.firestore || !this.auth.isSuperUser()) return null;

    const weekKey = this.activeWeekKey();
    const matchId = `match_${day.date.replace(/-/g, '')}_${Date.now().toString().slice(-4)}`;
    const matchDocRef = doc(this.firestore, `partite/${matchId}`);

    const allPlayers = this.statsEngine.giocatoriRaw() || [];
    const convocatiIds: string[] = [];
    const rsvpMap: Record<string, any> = {};

    for (const v of day.voters) {
      const p = allPlayers.find((g) => (v.playerId && g.id === v.playerId) || (g.linkedUid && g.linkedUid === v.uid));
      if (p) {
        convocatiIds.push(p.id);
      }
      rsvpMap[v.uid] = {
        uid: v.uid,
        playerId: p?.id || null,
        status: 'confirmed',
        updatedAt: new Date().toISOString(),
      };
    }

    const nuovaPartita: Partial<Partita> = {
      dataPartita: day.date,
      orario,
      luogo: campoNome,
      campoGoogleMapsUrl: campoMapsUrl,
      formato: day.formatInfo.format,
      convocati: convocatiIds,
      teamA: [],
      teamB: [],
      scoreA: 0,
      scoreB: 0,
      matchConcluso: false,
      pagelleInserite: false,
      status: 'pronta',
      step: 'convocati',
      rsvp: rsvpMap,
      stagione: '2026-2027',
    };

    // Salva partita in Firestore
    await setDoc(matchDocRef, nuovaPartita);

    // Blocca e finalizza la settimana in weekly_availability
    const weekDocRef = doc(this.firestore, `weekly_availability/${weekKey}`);
    await updateDoc(weekDocRef, {
      isLocked: true,
      confirmedMatchId: matchId,
      confirmedDate: day.date,
      updatedAt: new Date().toISOString(),
    });

    return matchId;
  }

  /**
   * Configurazione Pausa Estiva (Mister / Presidente)
   */
  async toggleSummerBreak(enabled: boolean): Promise<void> {
    if (!this.firestore || !this.auth.isSuperUser()) return;
    const cfgRef = doc(this.firestore, 'config_stagioni/season_calendar_config');
    const nextCfg: SeasonCalendarConfig = {
      ...this.calendarConfig(),
      summerBreakEnabled: enabled,
    };
    this.calendarConfig.set(nextCfg);
    await setDoc(cfgRef, nextCfg, { merge: true });
  }

  private subscribeToActiveWeek(): void {
    if (!this.firestore) return;
    const weekKey = this.activeWeekKey();
    const docRef = doc(this.firestore, `weekly_availability/${weekKey}`);

    docData(docRef).subscribe({
      next: (data) => {
        if (data) {
          this.activeWeekDoc.set(data as WeeklyAvailabilityDoc);
        } else {
          this.activeWeekDoc.set(null);
        }
      },
      error: () => {
        this.activeWeekDoc.set(null);
      },
    });
  }

  private async loadSeasonConfig(): Promise<void> {
    if (!this.firestore) return;
    try {
      const cfgRef = doc(this.firestore, 'config_stagioni/season_calendar_config');
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
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${weekNo.toString().padStart(2, '0')}`;
  }

  private generateWeekDays(weekKey: string): { date: string; dayName: any; dayNumber: number }[] {
    const [yearStr, weekStr] = weekKey.split('-W');
    const year = parseInt(yearStr, 10);
    const week = parseInt(weekStr, 10);

    // Trova il lunedì della settimana ISO
    const simple = new Date(year, 0, 1 + (week - 1) * 7);
    const dow = simple.getDay();
    const isoMonday = simple;
    if (dow <= 4) {
      isoMonday.setDate(simple.getDate() - simple.getDay() + 1);
    } else {
      isoMonday.setDate(simple.getDate() + 8 - simple.getDay());
    }

    const dayNames = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'] as const;
    const days: { date: string; dayName: any; dayNumber: number }[] = [];

    for (let i = 0; i < 7; i++) {
      const current = new Date(isoMonday);
      current.setDate(isoMonday.getDate() + i);

      const y = current.getFullYear();
      const m = (current.getMonth() + 1).toString().padStart(2, '0');
      const d = current.getDate().toString().padStart(2, '0');

      days.push({
        date: `${y}-${m}-${d}`,
        dayName: dayNames[i],
        dayNumber: current.getDate(),
      });
    }

    return days;
  }
}

