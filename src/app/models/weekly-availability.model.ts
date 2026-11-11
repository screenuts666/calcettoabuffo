export const DEFAULT_DAY_MAX_CAP = 14; // 7vs7 standard (7 per squadra)
export const EXTENDED_DAY_MAX_CAP = 16; // 8vs8 sbloccato da Mister / Presidente
export const DAY_QUORUM_TARGET = 10; // 5vs5 quorum minimo

export interface PlayerDayVoteState {
  /** Stato attuale dell'atleta sul singolo giorno ('in' = presente, 'out' = disiscritto) */
  status: 'in' | 'out';
  /**
   * Timestamp epoch (ms) IMMUTABILE del PRIMO voto 'in' in assoluto per questo giorno.
   * Non viene MAI sovrascritto se il giocatore si disiscrive ('out') e poi si ri-iscrive ('in').
   */
  firstVotedAt: number;
  /** Timestamp epoch (ms) dell'ultima modifica ('in' o 'out') effettuata su questo giorno */
  lastActionAt: number;
  /** Conteggio totale di iscrizioni ('in') effettuate dall'atleta su questo giorno (> 1 indica ri-iscrizione) */
  inCount?: number;
}

export interface VoteHistoryEntry {
  userId: string;
  playerId?: string | null;
  userName: string;
  action: 'in' | 'out';
  timestamp: number;
  /** Timestamp del 1° voto originale (utile per mostrare la priorità mantenuta nelle ri-iscrizioni) */
  firstVotedAt?: number;
  /** True se questa azione 'in' è una ri-iscrizione dopo essersi tolto */
  isRejoin?: boolean;
}

export interface DayVotingConfig {
  /** Se true, il limite massimo del giorno passa da 14 (7vs7) a 16 giocatori (8vs8) */
  allowEightVsEight: boolean;
  /** CAP massimo per il giorno: 14 (default) oppure 16 (quando allowEightVsEight è true) */
  maxCap: number;
  updatedAt?: number;
  updatedBy?: string;
}

export interface AthleteWeeklyVote {
  uid: string;
  playerId?: string | null;
  displayName: string;
  photoURL?: string | null;
  /** Date ISO selezionate dall'atleta per presenza certa (es. ["2026-11-10", "2026-11-12"]) */
  availableDates: string[];
  /** Date ISO selezionate dall'atleta in forse (es. ["2026-11-11"]) */
  maybeDates?: string[];
  /**
   * Stato e priorità immutabile (`firstVotedAt`) per singolo giorno ("YYYY-MM-DD").
   * Resta salvato anche quando l'atleta si disiscrive (`status: 'out'`), così se si ri-iscrive
   * conserva la priorità temporale del suo primo voto assoluto.
   */
  dayVotes?: Record<string, PlayerDayVoteState>;
  /**
   * Log cronologico append-only delle azioni dell'atleta indicizzato per giorno ("YYYY-MM-DD").
   */
  voteHistoryByDate?: Record<string, VoteHistoryEntry[]>;
  updatedAt: string;
  note?: string;
}

export interface PrioritizedVoter extends AthleteWeeklyVote {
  /** Posizione ufficiale nella coda di priorità del giorno (1-based: #1, #2, ...) */
  priorityRank: number;
  /** Timestamp immutabile del primo voto assoluto su questo giorno */
  firstVotedAt: number;
  /** Timestamp dell'ultima modifica effettuata su questo giorno */
  lastActionAt: number;
  /** True se l'utente si è tolto e poi ri-iscritto (riconfermato mantenendo il 1° voto) */
  isReconfirmed: boolean;
  /** True se rientra nel CAP attivo del giorno (<= 14 o <= 16) */
  isWithinCap: boolean;
}

export interface DaySummary {
  date: string; // ISO "YYYY-MM-DD"
  dayName: 'Lun' | 'Mar' | 'Mer' | 'Gio' | 'Ven' | 'Sab' | 'Dom';
  dayNumber: number;
  /** Giocatori presenti ordinati rigorosamente per `firstVotedAt` crescente (dal più vecchio al più recente) */
  voters: PrioritizedVoter[];
  voterCount: number;
  maybeVoters: AthleteWeeklyVote[];
  maybeCount: number;
  formatInfo: {
    format: 'calcetto' | 'calcio_a_6' | 'calcio_a_7' | 'calcio_a_8' | 'calcio_a_11';
    label: string;
    perTeam: number;
  };
  hasQuorum: boolean;
  missingForQuorum: number; // 0 se quorum raggiunto
  /** Flag sblocco 8vs8 (16 posti) su questo singolo giorno (solo Mister e Presidente) */
  allowEightVsEight: boolean;
  /** CAP massimo giocatori del giorno: 14 (default 7vs7) o 16 (8vs8 esteso) */
  maxCap: number;
  /** True quando il giorno raggiunge il limite massimo (`voterCount >= maxCap`) */
  isCapReached: boolean;
  /** Posti ancora disponibili prima di raggiungere `maxCap` */
  remainingSlots: number;
  /** Log cronologico completo (append-only) di tutte le iscrizioni/cancellazioni su questo giorno */
  voteHistory: VoteHistoryEntry[];
}

export interface WeeklyAvailabilityDoc {
  /** Chiave settimana nel formato "YYYY-Www" (es. "2026-W46") */
  weekKey: string;
  startDate: string; // ISO "YYYY-MM-DD"
  endDate: string; // ISO "YYYY-MM-DD"
  seasonId?: string;
  isLocked?: boolean;
  confirmedMatchId?: string;
  confirmedDate?: string;
  /** Mappa dei voti indicizzata per UID utente */
  votes: Record<string, AthleteWeeklyVote>;
  /** Configurazione amministrativa CAP per singolo giorno (es. allowEightVsEight -> maxCap 16) */
  dayConfigs?: Record<string, DayVotingConfig>;
  /** Audit log append-only per singolo giorno ("YYYY-MM-DD") */
  dayVoteHistory?: Record<string, VoteHistoryEntry[]>;
  createdAt?: string;
  updatedAt?: string;
}

export interface SeasonCalendarConfig {
  summerBreakEnabled: boolean;
  summerBreakStart?: string; // Formato "GG/MM" o "YYYY-MM-DD"
  summerBreakEnd?: string; // Formato "GG/MM" o "YYYY-MM-DD"
  defaultFieldId?: string;
  defaultFieldNome?: string;
  preferredMatchTime?: string;
}
