import { MmrTier, PlayerFormStreak } from './mmr.model';

export interface PlayerComparisonProfile {
  id: string;
  nome: string;
  soprannome?: string;
  annoNascita?: string;
  peso?: string;
  altezza?: string;
  fotoUrl?: string;
  piedePreferito?: string;
  ruoloPreferito?: string;
  professione?: string;
  origini?: string;
  statoCivile?: string;
  vizi?: string;

  // MMR
  currentMmr: number;
  peakMmr: number;
  tier: MmrTier;
  isRanked?: boolean;

  // Forma
  form: PlayerFormStreak;

  // Punteggio & Statistiche Generali
  puntiLegacy: number;
  partiteGiocate: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number; // 0..100

  // Gol, Assist, Voti e MVP
  golTotali: number;
  mediaGol: number;
  assistTotali: number;
  mediaAssist: number;
  mediaVoto: number;
  partiteConVoto: number;
  mvpCount: number;
}

export interface DirectMatchItem {
  id: string;
  data: string;
  scoreA: number;
  scoreB: number;
  teamOfPlayerA: 'A' | 'B';
  teamOfPlayerB: 'A' | 'B';
  winner: 'A' | 'B' | 'D'; // Winner from player perspective: A won, B won, or Draw
  golA: number;
  golB: number;
}

export interface TeammateMatchItem {
  id: string;
  data: string;
  scoreTeam: number;
  scoreOpponents: number;
  result: 'W' | 'D' | 'L';
  golA: number;
  golB: number;
}

export interface ComparisonMetric {
  id: string;
  label: string;
  icon: string;
  valA: number;
  valB: number;
  displayA: string;
  displayB: string;
  barPercentA: number; // 0..100
  barPercentB: number; // 0..100
  leader: 'A' | 'B' | 'TIE';
}

export interface HeadToHeadComparison {
  playerA: PlayerComparisonProfile;
  playerB: PlayerComparisonProfile;

  // Scontri Diretti (Contro)
  scontriContro: {
    totalePartite: number;
    vittorieA: number;
    pareggi: number;
    vittorieB: number;
    winRateA: number; // 0..100
    winRateB: number; // 0..100
    bestiaNeraText: string;
    bestiaNeraWinner: 'A' | 'B' | 'PARITA' | 'NESSUNO';
    matches: DirectMatchItem[];
  };

  // Intesa di Coppia (Insieme)
  intesaInsieme: {
    totalePartite: number;
    vittorie: number;
    pareggi: number;
    sconfitte: number;
    winRate: number; // 0..100
    affinitaLabel: string;
    affinitaEmoji: string;
    matches: TeammateMatchItem[];
  };

  // Metriche per le barre visive
  metrics: ComparisonMetric[];
}
