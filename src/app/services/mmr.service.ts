import { Injectable } from '@angular/core';
import { StatsEngineService } from './stats-engine.service';

/**
 * Alias per StatsEngineService per favorire l'ergonomia di importazione
 * nei componenti dedicati al sistema MMR ed ELO.
 */
@Injectable({
  providedIn: 'root',
})
export class MmrService extends StatsEngineService {}

export * from './stats-engine.service';
export * from '../models/mmr.model';
