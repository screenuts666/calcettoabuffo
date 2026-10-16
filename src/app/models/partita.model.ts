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
}
