export interface AthleteWeeklyVote {
  uid: string;
  playerId?: string | null;
  displayName: string;
  photoURL?: string | null;
  /** Date ISO selezionate dall'atleta per presenza certa (es. ["2026-11-10", "2026-11-12"]) */
  availableDates: string[];
  /** Date ISO selezionate dall'atleta in forse (es. ["2026-11-11"]) */
  maybeDates?: string[];
  updatedAt: string;
  note?: string;
}

export interface DaySummary {
  date: string; // ISO "YYYY-MM-DD"
  dayName: 'Lun' | 'Mar' | 'Mer' | 'Gio' | 'Ven' | 'Sab' | 'Dom';
  dayNumber: number;
  voters: AthleteWeeklyVote[];
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

