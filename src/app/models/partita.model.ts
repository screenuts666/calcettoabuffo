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

export type RsvpStatus =
  | 'yes'
  | 'maybe'
  | 'no'
  | 'invited'
  | 'confirmed'
  | 'declined'
  | 'waitlist';
export type InviteSource = 'self' | 'mister' | 'app' | 'whatsapp_link';

export interface MatchRsvpEntry {
  uid: string;
  playerId: string;
  playerName: string;
  status: RsvpStatus;
  selfRegistered?: boolean;
  source?: InviteSource;
  updatedAt: string;
  respondedVia?: InviteSource;
  note?: string | null;
}

export function normalizeRsvpStatus(
  status?: RsvpStatus | string | null
): 'yes' | 'maybe' | 'no' | null {
  if (!status) return null;
  if (status === 'yes' || status === 'confirmed') return 'yes';
  if (status === 'maybe') return 'maybe';
  if (status === 'no' || status === 'declined') return 'no';
  return null;
}

export interface MatchInvitiConfig {
  isOpen: boolean;
  maxPlayers?: number;
  deadlineAt?: string | null;
  inviteToken?: string | null;
  whatsappGroupNotifiedAt?: string | null;
}

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
  startedAt?: number | null; // Timestamp ms effettivo fischio d'inizio (avvio continuo)
  endedAt?: number | null;   // Timestamp ms effettivo fischio finale definitivo
  inizioPartita?: any;       // Firestore Timestamp inizio effettivo gara (fischio d'inizio)
  finePartita?: any;         // Firestore Timestamp fine effettiva gara (fischio finale)
  orarioInizioReale?: string | null; // Stringa HH:mm inizio effettivo (es. "19:05")
  orarioFineReale?: string | null;   // Stringa HH:mm fine effettiva (es. "20:03")
  isTimerRunning?: boolean;
  status: TMatchStatus;
  step?: 'dettagli' | 'convocati' | 'squadre' | 'match' | 'prestazioni';
  cambioAttivo?: boolean;
  classificaAggiornata?: boolean;
  fotoUrl?: string | null;
  fotoPath?: string | null;
  stagione?: string;
  pronosticoAi?: string | null;
  cronacaAi?: string | null;
  commentoPartita?: string | null;
  notePortieri?: string | null;
  parateIncredibili?: Record<string, number>;
  /** Mappa RSVP indicizzata per `uid` dell'utente (Atleta o Mister-Giocatore) */
  rsvp?: Record<string, MatchRsvpEntry>;
  /** Configurazione inviti partita (predisposizione Fase 2 WhatsApp) */
  inviti?: MatchInvitiConfig | null;
}
