import { Injectable, inject } from '@angular/core';
import { Firestore, doc, updateDoc } from '@angular/fire/firestore';
import { Giocatore, CurrentInjury, InjuryHistoryEntry } from '../models/giocatore.model';
import { Partita } from '../models/partita.model';
import { AuthService } from './auth.service';
import { StatsEngineService } from './stats-engine.service';

@Injectable({
  providedIn: 'root',
})
export class InjuriesService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);
  private statsEngine = inject(StatsEngineService);

  /**
   * Restituisce la data odierna in formato ISO 'YYYY-MM-DD' (fuso orario Europe/Rome).
   */
  getTodayString(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Rome',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  /**
   * Formatta una data 'YYYY-MM-DD' o timestamp nel formato leggibile italiano 'DD/MM/YYYY'.
   */
  formatDateDisplay(dateStr?: string | null): string {
    if (!dateStr) return '—';
    try {
      const parts = dateStr.substring(0, 10).split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  }

  /**
   * Calcola i giorni di calendario trascorsi dall'inizio dell'infortunio.
   */
  calculateDaysElapsed(startDateStr: string): number {
    if (!startDateStr) return 0;
    try {
      const start = new Date(startDateStr.substring(0, 10)).getTime();
      const today = new Date(this.getTodayString()).getTime();
      const diffMs = today - start;
      return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    } catch {
      return 0;
    }
  }

  /**
   * Verifica se un giocatore era presente nella distinta/formazione di una partita.
   */
  isPlayerInMatch(match: Partita, playerId: string): boolean {
    if (!match || !playerId) return false;
    const inTeamA = Array.isArray(match.teamA) && match.teamA.some((p: any) => p?.id === playerId);
    if (inTeamA) return true;
    const inTeamB = Array.isArray(match.teamB) && match.teamB.some((p: any) => p?.id === playerId);
    if (inTeamB) return true;
    const inConvocati =
      Array.isArray(match.convocati) &&
      match.convocati.some((c: any) => (typeof c === 'string' ? c === playerId : c?.id === playerId));
    return inConvocati;
  }

  /**
   * Determina se una partita è considerata disputata/ufficiale.
   */
  isMatchPlayed(match: Partita): boolean {
    if (!match) return false;
    if (match.matchConcluso === true || match.status === 'conclusa' || match.pagelleInserite === true) {
      return true;
    }
    if (match.status === 'in_corso') {
      return true;
    }
    // Partite con data passata rispetto a oggi che non siano 'da_definire' o senza data
    if (match.dataPartita) {
      const matchDay = match.dataPartita.substring(0, 10);
      const today = this.getTodayString();
      if (matchDay < today && match.status !== 'da_definire') {
        return true;
      }
    }
    return false;
  }

  /**
   * Calcola dinamicamente il numero di partite ufficiali saltate nel range [startDate, endDate].
   * Se endDate è omesso, considera fino alla data odierna.
   */
  countMissedMatches(
    playerId: string,
    startDate?: string | null,
    endDate?: string | null,
    matches?: Partita[],
  ): number {
    if (!playerId || !startDate) return 0;
    const allMatches = matches || this.statsEngine.partiteRaw() || [];
    const start = startDate.substring(0, 10);
    const end = (endDate || this.getTodayString()).substring(0, 10);

    return allMatches.filter((m) => {
      if (!m.dataPartita) return false;
      const matchDay = m.dataPartita.substring(0, 10);
      if (matchDay < start || matchDay > end) return false;
      if (!this.isMatchPlayed(m)) return false;
      // Il giocatore non era presente in distinta
      return !this.isPlayerInMatch(m, playerId);
    }).length;
  }

  /**
   * Restituisce la lista effettiva di partite saltate per consultazione dettagliata.
   */
  getMissedMatchesList(
    playerId: string,
    startDate?: string | null,
    endDate?: string | null,
    matches?: Partita[],
  ): Partita[] {
    if (!playerId || !startDate) return [];
    const allMatches = matches || this.statsEngine.partiteRaw() || [];
    const start = startDate.substring(0, 10);
    const end = (endDate || this.getTodayString()).substring(0, 10);

    return allMatches.filter((m) => {
      if (!m.dataPartita) return false;
      const matchDay = m.dataPartita.substring(0, 10);
      if (matchDay < start || matchDay > end) return false;
      if (!this.isMatchPlayed(m)) return false;
      return !this.isPlayerInMatch(m, playerId);
    });
  }

  /**
   * Calcola il totale storico di partite saltate per infortunio dal giocatore.
   * Somma le partite consolidate in injuryHistory + le partite dell'infortunio in corso.
   */
  getTotalMissedMatches(player: Giocatore, matches?: Partita[]): number {
    if (!player) return 0;
    let total = 0;
    if (Array.isArray(player.injuryHistory)) {
      for (const entry of player.injuryHistory) {
        total += entry.missedMatchesCount || 0;
      }
    }
    if (player.isInjured && player.currentInjury?.startDate) {
      total += this.countMissedMatches(player.id, player.currentInjury.startDate, null, matches);
    }
    return total;
  }

  /**
   * Genera il testo per il badge e il tooltip dell'infortunio.
   */
  getInjuryBadgeText(player: Giocatore, matches?: Partita[]): string {
    if (!player?.isInjured || !player?.currentInjury?.startDate) return '';
    const missed = this.countMissedMatches(player.id, player.currentInjury.startDate, null, matches);
    const dateFormatted = this.formatDateDisplay(player.currentInjury.startDate);
    const matchLabel = missed === 1 ? 'partita persa' : 'partite perse';
    return `Dal ${dateFormatted} • ${missed} ${matchLabel}`;
  }

  /**
   * Segna un giocatore come infortunato su Firestore (Riservato a Mister e Presidente).
   */
  async segnaInfortunato(
    player: Giocatore,
    startDate: string,
    expectedReturnDate?: string | null,
    note?: string,
  ): Promise<void> {
    if (!this.auth.isSuperUser()) {
      throw new Error('Solo Mister e Presidente possono registrare infortuni.');
    }
    if (!player?.id) {
      throw new Error('ID giocatore non valido.');
    }

    const currentInjury: CurrentInjury = {
      id: `inj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      startDate: (startDate || this.getTodayString()).substring(0, 10),
      expectedReturnDate: expectedReturnDate ? expectedReturnDate.substring(0, 10) : null,
      note: note ? note.trim() : '',
      recordedBy: this.auth.firebaseUser()?.uid || '',
      recordedAt: new Date().toISOString(),
    };

    await updateDoc(doc(this.firestore, `giocatori/${player.id}`), {
      isInjured: true,
      currentInjury,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Modifica l'infortunio in corso (data inizio, data prevista rientro, diagnosi/note).
   */
  async modificaInfortunio(
    player: Giocatore,
    startDate: string,
    expectedReturnDate?: string | null,
    note?: string,
  ): Promise<void> {
    if (!this.auth.isSuperUser()) {
      throw new Error('Solo Mister e Presidente possono modificare infortuni.');
    }
    if (!player?.id) {
      throw new Error('ID giocatore non valido.');
    }

    const current = player.currentInjury;
    const updatedInjury: CurrentInjury = {
      id: current?.id || `inj_${Date.now()}`,
      startDate: (startDate || current?.startDate || this.getTodayString()).substring(0, 10),
      expectedReturnDate: expectedReturnDate ? expectedReturnDate.substring(0, 10) : null,
      note: note !== undefined ? note.trim() : (current?.note || ''),
      recordedBy: current?.recordedBy || this.auth.firebaseUser()?.uid || '',
      recordedAt: current?.recordedAt || new Date().toISOString(),
    };

    await updateDoc(doc(this.firestore, `giocatori/${player.id}`), {
      isInjured: true,
      currentInjury: updatedInjury,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Segna il giocatore come recuperato/disponibile, consolida lo storico infortuni e resetta isInjured.
   */
  async segnaRecuperato(
    player: Giocatore,
    endDate?: string | null,
    matches?: Partita[],
  ): Promise<number> {
    if (!this.auth.isSuperUser()) {
      throw new Error('Solo Mister e Presidente possono dichiarare un giocatore recuperato.');
    }
    if (!player?.id) {
      throw new Error('ID giocatore non valido.');
    }

    const finalEndDate = (endDate || this.getTodayString()).substring(0, 10);
    const startDate = player.currentInjury?.startDate || finalEndDate;
    const missedMatchesCount = this.countMissedMatches(player.id, startDate, finalEndDate, matches);

    const historyEntry: InjuryHistoryEntry = {
      id: player.currentInjury?.id || `inj_hist_${Date.now()}`,
      startDate: startDate,
      endDate: finalEndDate,
      note: player.currentInjury?.note || '',
      missedMatchesCount,
      recordedBy: player.currentInjury?.recordedBy || '',
      closedBy: this.auth.firebaseUser()?.uid || '',
      closedAt: new Date().toISOString(),
    };

    const updatedHistory = [...(player.injuryHistory || []), historyEntry];

    await updateDoc(doc(this.firestore, `giocatori/${player.id}`), {
      isInjured: false,
      currentInjury: null,
      injuryHistory: updatedHistory,
      updatedAt: new Date().toISOString(),
    });

    return missedMatchesCount;
  }
}
