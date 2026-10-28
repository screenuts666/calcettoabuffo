import { CURRENT_SEASON } from '../utils/season-utils';

/**
 * Configurazione storicizzata per singola stagione (collezione Firestore `config_stagioni`).
 * Ogni stagione (es. "2025/2026", "2026/2027") conserva i propri parametri di calcolo
 * così che le stagioni concluse rimangano immutabili nel tempo.
 */
export interface SeasonEngineConfig {
  seasonId: string; // es. "2025/2026"
  docId: string; // es. "2025_2026"
  isSeasonLocked: boolean; // true se la stagione è conclusa/sigillata
  updatedAt?: string;

  // 1. Parametri Punti Classici (Legacy Campionato)
  legacyPresenza: number;
  legacyVittoria: number;
  legacyPareggio: number;
  legacySconfitta: number;
  legacyGol: number;
  legacyAutogol: number;
  legacyAssist: number;
  legacyPesoVoto: number;

  // 2. Parametri Motore MMR / ELO
  baseInitialMmr: number;
  kFactor: number;
  softResetFactor: number;
  seedClampMin: number;
  seedClampMax: number;
  placementMultiplier: number;
  placementClampMin: number;
  placementClampMax: number;
  hardClampMin: number;
  hardClampMax: number;
  votoNeutro: number;
  votoMoltiplicatore: number;
  pesoGolMmr: number;
  pesoAssistMmr: number;
}

export function seasonToDocId(seasonId: string): string {
  return (seasonId || '').replace(/\//g, '_');
}

export function docIdToSeason(docId: string): string {
  return (docId || '').replace(/_/g, '/');
}

export function getDefaultSeasonConfig(seasonId: string): SeasonEngineConfig {
  const isPastSeason = seasonId !== CURRENT_SEASON;
  return {
    seasonId,
    docId: seasonToDocId(seasonId),
    isSeasonLocked: isPastSeason, // Le stagioni passate (es. 2025/2026) nascono già sigillate
    legacyPresenza: 2.0,
    legacyVittoria: 2.0,
    legacyPareggio: 1.0,
    legacySconfitta: 0.0,
    legacyGol: 1.0,
    legacyAutogol: -1.0,
    legacyAssist: 0.5,
    legacyPesoVoto: 1.0,
    baseInitialMmr: 1000,
    kFactor: 28,
    softResetFactor: 0.35,
    seedClampMin: 920,
    seedClampMax: 1130,
    placementMultiplier: 1.35,
    placementClampMin: -35,
    placementClampMax: 42,
    hardClampMin: -30,
    hardClampMax: 36,
    votoNeutro: 6.5,
    votoMoltiplicatore: 6,
    pesoGolMmr: 0.8,
    pesoAssistMmr: 0.6,
  };
}

