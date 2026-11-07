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
  /** Data di nascita in formato italiano GG/MM/AAAA o GG/MM per compleanni sul Calendario */
  dataNascita?: string;
  /** Se true, nasconde l'anno/età sul profilo mostrando solo giorno e mese */
  nascondiAnnoNascita?: boolean;
  annoNascita?: string;
  piedePreferito?: PiedePreferito;
  ruoloPreferito?: RuoloPreferito;
  numeroMaglia?: number | string | null;
  bio?: string;
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

  // Ownership RBAC v2.0 (Associazione Utente -> Giocatore, per Atleta o Mister-Giocatore)
  linkedUid?: string | null;
  linkedEmail?: string | null;
  claimedAt?: string | null;
  updatedAt?: string;

  // Dato privato (letto/scritto esclusivamente in `giocatori/{playerId}/private/contact`)
  phoneNumber?: string | null;
}

export interface PlayerPrivateContact {
  phoneNumber: string;
  updatedAt: string;
  updatedBy?: string | null;
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
  minutiInPortaDisplay?: string;
  turniInPorta: number;
  golSubiti: number;
  cleanSheetTurni: number;
  cleanSheetPartite: number;
  mediaGolSubiti50m: number;
  isClassificabile: boolean;
  parateIncredibili?: number;
}
