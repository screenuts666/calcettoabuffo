import { PiedePreferito } from './piede-preferito.enum';
import { RuoloPreferito } from './ruolo-preferito.enum';
import {
  MmrTier,
  PlayerChemistryProfile,
  PlayerFormStreak,
  PastSeasonBanner,
} from './mmr.model';

export interface Giocatore {
  id: string;
  nome: string;
  soprannome?: string; // Soprannome ufficiale/manuale (MAI sovrascritto dall'AI)
  annoNascita?: string;
  piedePreferito?: PiedePreferito;
  ruoloPreferito?: RuoloPreferito;
  altezza?: string;
  peso?: string;
  fotoUrl?: string;
  gol: number;
  autogol?: number;
  assist?: number;
  punti: number;
  mediaVoto: number;
  partiteGiocate: number;
  soprannomeAi?: string; // Ultimo soprannome coniato dall'AI (aggiuntivo)
  soprannomiAi?: string[]; // Storico/elenco di tutti i soprannomi coniati dall'AI
  scoutingReportAi?: string;
  aiUpdatedAt?: string;

  // Dettagli personali & goliardici
  professione?: string;
  origini?: string;
  statoCivile?: string;
  vizi?: string;
}

export interface GiocatoreConPunti extends Giocatore {
  // Punteggio Legacy
  puntiVal: number;
  puntiDisplay: string;
  golTotali: number;
  assistTotali: number;
  mediaVotoVal: number;
  mediaVotoDisplay: string;
  partiteGiocate: number;
  wins: number;
  draws: number;
  losses: number;

  // Minuti e secondi giocati sul campo
  secondiGiocatiTotali: number;
  minutiGiocatiDisplay: string;

  // Nuovo Motore MMR & Statistiche
  isRanked: boolean;
  seasonStartMmr?: number;
  mmrVal: number;
  mmrDisplay: string;
  tier: MmrTier;
  peakMmr: number;
  lastDelta: number | null;
  lastDeltaDisplay: string | null;
  trendDirection: 'up' | 'down' | 'neutral' | 'none';
  form: PlayerFormStreak;
  winRate: number;
  rankAssoluto: number;

  // Profilo Chimica di Coppia
  chemistry?: PlayerChemistryProfile;

  // Albo d'Oro / Medaglieri stagioni passate
  pastSeasonsBanners?: PastSeasonBanner[];

  // Statistiche Portiere (a rotazione)
  portiereStats?: PortiereStats;
}

export interface PortiereStats {
  minutiInPorta: number;
  turniInPorta: number;
  golSubiti: number;
  cleanSheetTurni: number;
  cleanSheetPartite: number;
  mediaGolSubiti50m: number;
  isClassificabile: boolean;
  parateIncredibili?: number;
}
