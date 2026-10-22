/**
 * Modello e definizioni per l'MMR (Match Making Rating / ELO) e le statistiche avanzate
 * di Calcetto Abbuffo.
 *
 * NOTA: Questo sistema opera IN AGGIUNTA al punteggio classico legacy dell'applicazione,
 * senza sostituirlo o alterarlo.
 */

export type MmrTierId =
  | 'ferro'
  | 'bronzo'
  | 'argento'
  | 'oro'
  | 'platino'
  | 'diamante'
  | 'fenomeno'
  | 'in_piazzamento';

export interface MmrTier {
  id: MmrTierId;
  label: string;
  minMmr: number;
  maxMmr: number;
  color: string;
  badge: string;
  icon: string;
}

export const MMR_TIERS: readonly MmrTier[] = [
  {
    id: 'ferro',
    label: 'Ferro',
    minMmr: 0,
    maxMmr: 929,
    color: '#71717a',
    badge: '🔩 Ferro',
    icon: 'shield-outline',
  },
  {
    id: 'bronzo',
    label: 'Bronzo',
    minMmr: 930,
    maxMmr: 999,
    color: '#CD7F32',
    badge: '🥉 Bronzo',
    icon: 'shield-outline',
  },
  {
    id: 'argento',
    label: 'Argento',
    minMmr: 1000,
    maxMmr: 1069,
    color: '#A8A29E',
    badge: '🥈 Argento',
    icon: 'shield',
  },
  {
    id: 'oro',
    label: 'Oro',
    minMmr: 1070,
    maxMmr: 1139,
    color: '#EAB308',
    badge: '🥇 Oro',
    icon: 'medal',
  },
  {
    id: 'platino',
    label: 'Platino',
    minMmr: 1140,
    maxMmr: 1209,
    color: '#06B6D4',
    badge: '🩵 Platino',
    icon: 'ribbon',
  },
  {
    id: 'diamante',
    label: 'Diamante',
    minMmr: 1210,
    maxMmr: 99999,
    color: '#3B82F6',
    badge: '💎 Diamante',
    icon: 'diamond',
  },
  {
    id: 'fenomeno',
    label: 'Fenomeno',
    minMmr: 1275,
    maxMmr: 99999,
    color: '#EF4444',
    badge: '🏆 Fenomeno',
    icon: 'trophy',
  },
] as const;

export const UNRANKED_TIER: MmrTier = {
  id: 'in_piazzamento',
  label: 'In Piazzamento',
  minMmr: 0,
  maxMmr: 0,
  color: '#71717a',
  badge: '⏳ In Piazzamento',
  icon: 'help-circle-outline',
};

export const DIAMANTE_TIER: MmrTier = MMR_TIERS.find((t) => t.id === 'diamante')!;
export const FENOMENO_TIER: MmrTier = MMR_TIERS.find((t) => t.id === 'fenomeno')!;

export function getDiamanteTier(): MmrTier {
  return DIAMANTE_TIER;
}

export function getFenomenoTier(): MmrTier {
  return FENOMENO_TIER;
}

/**
 * Restituisce il tier base in funzione del valore MMR puro (fino a Diamante per MMR >= 1210).
 * NOTA: Il rango FENOMENO non viene mai assegnato direttamente dal punteggio grezzo,
 * ma richiede la validazione del Gatekeeper (Top 1 / Top 2 con soglia e presenze minime).
 */
export function getMmrTier(mmr: number): MmrTier {
  const rounded = Math.round(mmr);
  for (const tier of MMR_TIERS) {
    if (tier.id === 'fenomeno') continue;
    if (rounded >= tier.minMmr && rounded <= tier.maxMmr) {
      return tier;
    }
  }
  return rounded < 0 ? MMR_TIERS[0] : DIAMANTE_TIER;
}

/**
 * Gatekeeper "Fenomeno" (Challenger LoL):
 * Applica le 3 condizioni simultanee per assegnare il titolo esclusivo "Fenomeno":
 * 1. Soglia MMR: >= 1275 (stagione) o >= 1300 (all-time)
 * 2. Gatekeeper presenze minime:
 *    - Stagione: min(5, max(3, ceil(totalMatches * 0.55)))
 *    - All-time: >= 8 partite
 * 3. Cap popolazione: Top 1 assoluto (o Top 2 se >= 10 match e 2° classificato con MMR >= 1300).
 * Chi supera 1210 e non rispetta tutte e 3 le condizioni resta Diamante!
 */
export function applyFenomenoGatekeeper<T extends { currentMmr: number; partiteGiocate: number; tier: MmrTier; isRanked?: boolean }>(
  players: T[],
  totalMatchesInView: number,
  isAllTime: boolean,
): void {
  const minMatches = isAllTime
    ? 8
    : Math.min(5, Math.max(3, Math.ceil(totalMatchesInView * 0.55)));
  const mmrThreshold = isAllTime ? 1300 : 1275;

  // Ordina i giocatori per MMR decrescente
  const sorted = [...players]
    .filter((p) => p.partiteGiocate > 0)
    .sort((a, b) => b.currentMmr - a.currentMmr);

  let slotAssigned = 0;
  const maxSlots = totalMatchesInView >= 10 ? 2 : 1;

  for (const player of sorted) {
    const isMmrQualified = player.currentMmr >= mmrThreshold;
    const isMatchesQualified = player.partiteGiocate >= minMatches;

    if (player.currentMmr >= 1210) {
      if (slotAssigned === 0 && isMmrQualified && isMatchesQualified) {
        player.tier = FENOMENO_TIER;
        slotAssigned++;
      } else if (
        slotAssigned === 1 &&
        maxSlots >= 2 &&
        player.currentMmr >= 1300 &&
        isMatchesQualified
      ) {
        player.tier = FENOMENO_TIER;
        slotAssigned++;
      } else {
        player.tier = DIAMANTE_TIER;
      }
    } else {
      player.tier = getMmrTier(player.currentMmr);
    }
  }
}

export type FormStatus = 'on_fire' | 'in_crisis' | 'neutral';

export interface PlayerFormStreak {
  currentStreak: number; // >0 vittorie consecutive, <0 sconfitte consecutive, 0 pareggio/neutrale
  status: FormStatus;
  statusLabel: string;
  emoji: string;
  multiplier: number;
  bestWinStreak: number;
  worstLossStreak: number;
  recentForm: ('W' | 'D' | 'L')[];
}

export interface IndividualBonusBreakdown {
  presenceBonus?: number;
  goalsBonus?: number;
  assistsBonus?: number;
  voteBonus?: number;
  ratingBonus?: number;
  contributionBonus?: number;
  movBonus?: number;
  mvpBonus?: number;
  streakBonus: number;
  eliteBrakeApplied?: number;
  placementMultiplierApplied?: boolean;
  svpShield?: boolean;
  decayApplied?: number;
  total: number;
}

export interface MatchMmrDelta {
  partitaId: string;
  data: string;
  stagione: string;
  team: 'A' | 'B';
  result: 'W' | 'D' | 'L';
  teamScore: number;
  opponentScore: number;
  teamAvgMmrBefore: number;
  opponentAvgMmrBefore: number;
  winProbability: number; // 0..1 (es. 0.62 = 62%)
  mmrBefore: number;
  mmrAfter: number;
  delta: number;
  baseTeamDelta: number;
  goalDiffMultiplier: number;
  individualBonus: IndividualBonusBreakdown;
  streakBefore?: number;
  streakAfter?: number;
  onFireTransition?: 'entered' | 'exited' | 'maintained' | 'none';
}

export interface MatchReportPlayer {
  id: string;
  nome: string;
  soprannome?: string;
  fotoUrl?: string;
  team: 'A' | 'B';
  voto?: number;
  note?: string;
  gol: number;
  autogol: number;
  assist: number;
  mmrDelta: number;
  mmrBefore: number;
  mmrAfter: number;
  legacyDelta: number;
  onFireTransition: 'entered' | 'exited' | 'maintained' | 'none';
  streakAfter: number;
  isRanked?: boolean;
  svpShield?: boolean;
}

export interface MatchReportChemistryItem {
  type: 'synergy' | 'nemesis' | 'crisis';
  title: string;
  description: string;
  badge: string;
  players: string[];
}

export interface MatchReportData {
  matchId?: string;
  dataPartita?: string;
  luogo?: string;
  orario?: string;
  scoreA: number;
  scoreB: number;
  status: string;
  fotoUrl?: string | null;
  fotoPath?: string | null;

  odds: MatchPrediction;
  isUpset: boolean;
  upsetTeam: 'A' | 'B' | null;
  upsetDescription?: string;

  teamAvgMmrDeltaA: number;
  teamAvgMmrDeltaB: number;
  teamLegacyDeltaA: number;
  teamLegacyDeltaB: number;

  votoMedioA: number;
  votoMedioB: number;

  mvp: MatchReportPlayer | null;
  worst: MatchReportPlayer | null;

  onFireEntered: MatchReportPlayer[];
  onFireExited: MatchReportPlayer[];
  onFireMaintained: MatchReportPlayer[];

  playersA: MatchReportPlayer[];
  playersB: MatchReportPlayer[];

  chemistryNotes: MatchReportChemistryItem[];
  cronacaAi?: string;
  pronosticoAi?: string;
  commentoPartita?: string | null;
}


export interface PastSeasonBanner {
  season: string;
  shortLabel: string;
  finalMmr: number;
  tier: MmrTier;
  partiteGiocate: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  rank?: number;
  puntiClassici?: number;
}

export interface PlayerMmrStats {
  giocatoreId: string;
  nome: string;
  soprannome?: string;
  fotoUrl?: string;
  isRanked: boolean; // false se 0 partite giocate nella stagione/vista, true appena gioca 1 partita
  seasonStartMmr?: number; // seed di partenza prima del primo match stagionale
  currentMmr: number;
  peakMmr: number;
  lowestMmr: number;
  tier: MmrTier;
  partiteGiocate: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number; // percentuale 0..100
  form: PlayerFormStreak;
  history: MatchMmrDelta[];
  consecutiveMissedMatches?: number;
  totalDecayLost?: number;
  pastSeasonsBanners?: PastSeasonBanner[]; // Medaglieri/Banner delle stagioni passate
}

export interface MatchPrediction {
  mmrA: number;
  mmrB: number;
  probA: number; // 0..1
  probB: number; // 0..1
  probAPercent: number; // 0..100
  probBPercent: number; // 0..100
  favoriteTeam: 'A' | 'B' | 'EQUILIBRATA';
  favoriteMargin: number; // percentuale di scarto sulla favorita
}

export interface PlayerSynergy {
  playerId: string;
  partnerId: string;
  partnerNome: string;
  partnerSoprannome?: string;
  partnerFotoUrl?: string;
  matchesTogether: number;
  winsTogether: number;
  drawsTogether: number;
  lossesTogether: number;
  winRateTogether: number; // percentuale 0..100
  assistedGoals?: number; // gol con assist tra la coppia (Gemelli del Gol)
  avgMmrDeltaTogether?: number; // delta medio MMR conquistato insieme
}

export interface PlayerNemesis {
  playerId: string;
  opponentId: string;
  opponentNome: string;
  opponentSoprannome?: string;
  opponentFotoUrl?: string;
  matchesAgainst: number;
  winsAgainst: number; // vittorie del giocatore contro questo avversario
  drawsAgainst: number;
  lossesAgainst: number; // sconfitte subite da questo avversario
  winRateAgainst: number; // % di vittorie del giocatore contro l'avversario
  opponentWinRate: number; // % di vittorie dell'avversario contro il giocatore
}

export interface PlayerChemistryProfile {
  playerId: string;
  nome: string;
  bestPartner: PlayerSynergy | null; // Gemello del gol 🤝
  worstPartner: PlayerSynergy | null; // Incubo di coppia 💔
  biggestNemesis: PlayerNemesis | null; // Bestia nera 😈
  favoriteVictim: PlayerNemesis | null; // Vittima preferita 🎯
  allSynergies: PlayerSynergy[];
  allNemesis: PlayerNemesis[];
}

export interface MmrCalculationResult {
  allTime: Map<string, PlayerMmrStats>;
  bySeason: Map<string, Map<string, PlayerMmrStats>>; // stagione -> (giocatoreId -> stats)
  chemistry: Map<string, PlayerChemistryProfile>; // giocatoreId -> chimica di coppia
  matchPredictions: Map<string, MatchPrediction>; // partitaId -> previsione al momento del match
}
