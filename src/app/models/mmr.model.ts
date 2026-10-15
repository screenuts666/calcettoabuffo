/**
 * Modello e definizioni per l'MMR (Match Making Rating / ELO) e le statistiche avanzate
 * di Calcetto Abbuffo.
 *
 * NOTA: Questo sistema opera IN AGGIUNTA al punteggio classico legacy dell'applicazione,
 * senza sostituirlo o alterarlo.
 */

export type MmrTierId =
  | 'bronzo'
  | 'argento'
  | 'oro'
  | 'platino'
  | 'diamante'
  | 'fenomeno';

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
    id: 'bronzo',
    label: 'Bronzo',
    minMmr: 0,
    maxMmr: 949,
    color: '#CD7F32',
    badge: '🥉 Bronzo',
    icon: 'shield-outline',
  },
  {
    id: 'argento',
    label: 'Argento',
    minMmr: 950,
    maxMmr: 1049,
    color: '#C0C0C0',
    badge: '🥈 Argento',
    icon: 'shield',
  },
  {
    id: 'oro',
    label: 'Oro',
    minMmr: 1050,
    maxMmr: 1199,
    color: '#FFD700',
    badge: '🥇 Oro',
    icon: 'medal',
  },
  {
    id: 'platino',
    label: 'Platino',
    minMmr: 1200,
    maxMmr: 1349,
    color: '#00E5FF',
    badge: '💠 Platino',
    icon: 'ribbon',
  },
  {
    id: 'diamante',
    label: 'Diamante',
    minMmr: 1350,
    maxMmr: 1499,
    color: '#B9F2FF',
    badge: '💎 Diamante',
    icon: 'diamond',
  },
  {
    id: 'fenomeno',
    label: 'Fenomeno',
    minMmr: 1500,
    maxMmr: 99999,
    color: '#FF4500',
    badge: '👑 Fenomeno',
    icon: 'trophy',
  },
] as const;

export function getMmrTier(mmr: number): MmrTier {
  const rounded = Math.round(mmr);
  for (const tier of MMR_TIERS) {
    if (rounded >= tier.minMmr && rounded <= tier.maxMmr) {
      return tier;
    }
  }
  return rounded < 0 ? MMR_TIERS[0] : MMR_TIERS[MMR_TIERS.length - 1];
}

export type FormStatus = 'on_fire' | 'in_crisis' | 'neutral';

export interface PlayerFormStreak {
  currentStreak: number; // >0 vittorie consecutive, <0 sconfitte consecutive, 0 pareggio/neutrale
  status: FormStatus;
  statusLabel: string;
  emoji: string;
  multiplier: number; // bonus moltiplicatore applicato alle vittorie On Fire
  bestWinStreak: number;
  worstLossStreak: number;
  recentForm: ('W' | 'D' | 'L')[]; // ultime 5 partite (dalla più recente)
}

export interface IndividualBonusBreakdown {
  goalsBonus: number;
  voteBonus: number;
  mvpBonus: number;
  streakBonus: number;
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
  mmrDelta: number;
  mmrBefore: number;
  mmrAfter: number;
  legacyDelta: number;
  onFireTransition: 'entered' | 'exited' | 'maintained' | 'none';
  streakAfter: number;
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
}


export interface PlayerMmrStats {
  giocatoreId: string;
  nome: string;
  soprannome?: string;
  fotoUrl?: string;
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
