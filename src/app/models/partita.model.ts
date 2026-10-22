import { TMatchStatus } from './match-status.type';
import { PlayerPerformance } from './player-performance.model';

export interface EventoGol {
  idAssegnato: string;
  nome: string;
  teamVantaggio: 'A' | 'B';
  isAutogoal: boolean;
  tempo?: string;
  assistId?: string | null;
  assistNome?: string | null;
  portiereSubitoId?: string | null;
  portiereSubitoNome?: string | null;
}

export type ModalitaPortiere = 'rotazione' | 'fisso';

export interface RotazionePortieri {
  modalitaA?: ModalitaPortiere; // default: 'rotazione'
  modalitaB?: ModalitaPortiere; // default: 'rotazione'
  portiereFissoAId?: string | null;
  portiereFissoBId?: string | null;
  teamA: string[]; // array di playerId ordinati (1°, 2°, 3°, ...)
  teamB: string[]; // array di playerId ordinati (1°, 2°, 3°, ...)
  durataTurnoMinuti?: number; // default 5 minuti
}

export interface Partita {
  id?: string;
  dataPartita: string;
  orario: string;
  luogo: string;
  dataOra?: any;
  convocati: any[];
  teamA: PlayerPerformance[];
  teamB: PlayerPerformance[];
  scoreA: number;
  scoreB: number;
  eventiGol?: EventoGol[];
  rotazionePortieri?: RotazionePortieri | null;
  matchConcluso: boolean;
  pagelleInserite: boolean;
  cronometro?: number;
  accumulatedTime?: number;
  timerStartAt?: number | null;
  isTimerRunning?: boolean;
  status: TMatchStatus;
  cambioAttivo?: boolean;
  classificaAggiornata?: boolean;
  fotoUrl?: string | null;
  fotoPath?: string | null;
  stagione?: string;
  pronosticoAi?: string | null;
  cronacaAi?: string | null;
  commentoPartita?: string | null;
}
