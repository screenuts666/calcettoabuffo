import { Giocatore } from './giocatore.model';

export interface PlayerPerformance extends Giocatore {
  voto?: number;
  note?: string;
}

export type RatingClass = '' | 'voto-alto' | 'voto-medio' | 'voto-basso';

export const RatingThresholds = {
  HIGH: 7,
  MEDIUM: 6,
} as const;
