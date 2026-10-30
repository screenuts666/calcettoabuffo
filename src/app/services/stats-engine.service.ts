import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { Firestore, collectionData } from '@angular/fire/firestore';
import { collection, doc, setDoc } from 'firebase/firestore';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Giocatore, GiocatoreConPunti, PortiereStats } from '../models/giocatore.model';
import { Partita } from '../models/partita.model';
import {
  MmrCalculationResult,
  MatchPrediction,
  PlayerMmrStats,
  PlayerChemistryProfile,
  PlayerSynergy,
  PlayerNemesis,
  PlayerFormStreak,
  MatchMmrDelta,
  getMmrTier,
  getDiamanteTier,
  getFenomenoTier,
  applyFenomenoGatekeeper,
  MatchReportData,
  MatchReportPlayer,
  MatchReportChemistryItem,
  UNRANKED_TIER,
  PastSeasonBanner,
} from '../models/mmr.model';
import {
  ALL_SEASONS,
  CURRENT_SEASON,
  getStagionePartita,
  parseDate,
  formatShortSeason,
} from '../utils/season-utils';
import { getAvatarUrl } from '../utils/avatar-utils';
import {
  SeasonEngineConfig,
  getDefaultSeasonConfig,
  seasonToDocId,
  docIdToSeason,
} from '../models/season-config.model';

export const BASE_INITIAL_MMR = 1000;
export const K_FACTOR = 28;
export const SEED_CLAMP_MIN = 920;
export const SEED_CLAMP_MAX = 1130;
export const SOFT_RESET_FACTOR = 0.35;
export const PLACEMENT_MULTIPLIER = 1.35;
export const PLACEMENT_CLAMP_MIN = -35;
export const PLACEMENT_CLAMP_MAX = 42;
export const HARD_CLAMP_MIN = -30;
export const HARD_CLAMP_MAX = 36;
export const MIN_MATCHES_CHEMISTRY = 2;

@Injectable({
  providedIn: 'root',
})
export class StatsEngineService {
  private firestore: Firestore | null = null;

  // Dati reattivi da Firestore (attivi nel contesto Angular con injection)
  readonly giocatoriRaw: Signal<Giocatore[]>;
  readonly partiteRaw: Signal<Partita[]>;
  readonly seasonConfigsRaw: Signal<SeasonEngineConfig[]>;
  readonly seasonConfigsMap: Signal<Map<string, SeasonEngineConfig>>;
  readonly statsResult: Signal<MmrCalculationResult>;
  readonly allTimeLeaderboard: Signal<PlayerMmrStats[]>;

  constructor() {
    let fs: Firestore | null = null;
    try {
      fs = inject(Firestore, { optional: true });
    } catch {
      fs = null;
    }
    this.firestore = fs;

    this.giocatoriRaw = this.firestore
      ? toSignal<Giocatore[], Giocatore[]>(
        (collectionData(collection(this.firestore, 'giocatori'), {
          idField: 'id',
        }) as Observable<Giocatore[]>).pipe(catchError(() => of([] as Giocatore[]))),
        { initialValue: [] },
      )
      : signal<Giocatore[]>([]);

    this.partiteRaw = this.firestore
      ? toSignal<Partita[], Partita[]>(
        (collectionData(collection(this.firestore, 'partite'), {
          idField: 'id',
        }) as Observable<Partita[]>).pipe(catchError(() => of([] as Partita[]))),
        { initialValue: [] },
      )
      : signal<Partita[]>([]);

    this.seasonConfigsRaw = this.firestore
      ? toSignal<SeasonEngineConfig[], SeasonEngineConfig[]>(
        (
          collectionData(collection(this.firestore, 'stagioni'), {
            idField: 'docId',
          }) as Observable<SeasonEngineConfig[]>
        ).pipe(
          catchError((err) => {
            console.warn('Fallback default season config (stagioni):', err);
            return of([] as SeasonEngineConfig[]);
          }),
        ),
        { initialValue: [] },
      )
      : signal<SeasonEngineConfig[]>([]);

    this.seasonConfigsMap = computed<Map<string, SeasonEngineConfig>>(() => {
      const map = new Map<string, SeasonEngineConfig>();
      try {
        for (const raw of this.seasonConfigsRaw() || []) {
          const sId = raw.seasonId || docIdToSeason(raw.docId);
          if (sId) {
            map.set(sId, { ...getDefaultSeasonConfig(sId), ...raw, seasonId: sId });
          }
        }
      } catch {
        // Fallback ai valori di default se la collection non è raggiungibile
      }
      return map;
    });

    this.statsResult = computed<MmrCalculationResult>(() => {
      const giocatori = (this.giocatoriRaw() || []).map((g) => ({
        ...g,
        fotoUrl: getAvatarUrl(g.fotoUrl),
      }));
      const partite = this.partiteRaw() || [];
      return StatsEngineService.calculateAllStats(
        giocatori,
        partite,
        this.seasonConfigsMap(),
      );
    });

    this.allTimeLeaderboard = computed<PlayerMmrStats[]>(() => {
      const res = this.statsResult();
      return Array.from(res.allTime.values())
        .filter((s) => s.partiteGiocate > 0)
        .sort(
          (a, b) => b.currentMmr - a.currentMmr || b.winRate - a.winRate,
        );
    });
  }


  /**
   * Restituisce la classifica MMR per una stagione specifica (o ALL_SEASONS)
   */
  getLeaderboardBySeason(season: string = CURRENT_SEASON): PlayerMmrStats[] {
    const res = this.statsResult();
    if (season === ALL_SEASONS) {
      return this.allTimeLeaderboard();
    }
    const seasonMap = res.bySeason.get(season);
    if (!seasonMap) return [];
    return Array.from(seasonMap.values())
      .filter((s) => s.partiteGiocate > 0)
      .sort((a, b) => b.currentMmr - a.currentMmr || b.winRate - a.winRate);
  }

  /**
   * Restituisce le statistiche MMR del giocatore (All-Time o per stagione)
   */
  getPlayerStats(
    playerId: string,
    season: string = ALL_SEASONS,
  ): PlayerMmrStats | undefined {
    const res = this.statsResult();
    if (season === ALL_SEASONS) {
      return res.allTime.get(playerId);
    }
    return res.bySeason.get(season)?.get(playerId);
  }

  /**
   * Restituisce il profilo di chimica (Gemelli del Gol e Nemesi) di un giocatore
   */
  getPlayerChemistry(playerId: string): PlayerChemistryProfile | undefined {
    return this.statsResult().chemistry.get(playerId);
  }

  getSeasonConfig(seasonId: string = CURRENT_SEASON): SeasonEngineConfig {
    return StatsEngineService.resolveSeasonConfig(
      seasonId,
      this.seasonConfigsMap(),
    );
  }

  static resolveSeasonConfig(
    seasonId: string,
    configsMap?: Map<string, SeasonEngineConfig>,
  ): SeasonEngineConfig {
    const cleanSeason =
      !seasonId || seasonId === ALL_SEASONS ? CURRENT_SEASON : seasonId;
    if (configsMap?.has(cleanSeason)) {
      return configsMap.get(cleanSeason)!;
    }
    // Ereditarietà multi-stagione infinita: se una nuova stagione non è ancora stata
    // salvata su Firebase, eredita i parametri dall'ultima stagione precedente configurata
    // (mentre le stagioni <= 2025/2026 mantengono il regolamento storico originale).
    if (configsMap && configsMap.size > 0 && cleanSeason > '2025/2026') {
      const prevKeys = Array.from(configsMap.keys())
        .filter((k) => k < cleanSeason)
        .sort();
      if (prevKeys.length > 0) {
        const latestPrev = configsMap.get(prevKeys[prevKeys.length - 1])!;
        return {
          ...latestPrev,
          seasonId: cleanSeason,
          docId: seasonToDocId(cleanSeason),
          isSeasonLocked: cleanSeason < CURRENT_SEASON,
        };
      }
    }
    return getDefaultSeasonConfig(cleanSeason);
  }

  isSeasonInFirestore(seasonId: string): boolean {
    return this.seasonConfigsMap().has(seasonId);
  }

  async saveSeasonConfig(config: SeasonEngineConfig): Promise<void> {
    if (!this.firestore) return;
    const docId = seasonToDocId(config.seasonId);
    const payload: SeasonEngineConfig = {
      ...config,
      docId,
      updatedAt: new Date().toISOString(),
    };
    await setDoc(doc(this.firestore, `stagioni/${docId}`), payload, {
      merge: true,
    });
  
  }

  /**
   * Costruisce il profilo completo di un giocatore con punteggio legacy, MMR,
   * trend, forma e chimica per la scheda del giocatore.
   */
  getGiocatoreProfile(
    playerId: string,
    stagione: string = ALL_SEASONS,
  ): GiocatoreConPunti | null {
    const rawList = this.giocatoriRaw() || [];
    const g = rawList.find((p) => p.id === playerId);
    if (!g) return null;

    const partite = this.partiteRaw() || [];
    const statsRes = this.statsResult();
    const partiteValide = partite.filter(
      (p: any) => p['pagelleInserite'] === true,
    );

    const partiteStagione =
      stagione === ALL_SEASONS
        ? partiteValide
        : partiteValide.filter((p: any) => getStagionePartita(p) === stagione);

    let punti = 0;
    let golTotali = 0;
    let assistTotali = 0;
    let sommaVoti = 0;
    let partiteGiocate = 0;
    let secondiGiocatiTotali = 0;
    let wins = 0;
    let draws = 0;
    let losses = 0;

    partiteStagione.forEach((p: any) => {
      const inTeamA = p.teamA?.find((pl: any) => pl.id === g.id);
      const inTeamB = p.teamB?.find((pl: any) => pl.id === g.id);

      if (inTeamA || inTeamB) {
        partiteGiocate++;
        const matchSec = p.cronometro || (p.accumulatedTime ?? 0) || 3000;
        secondiGiocatiTotali += matchSec;
        const scoreA = Number(p.scoreA);
        const scoreB = Number(p.scoreB);
        const won =
          (inTeamA && scoreA > scoreB) || (inTeamB && scoreB > scoreA);
        const draw = scoreA === scoreB;
        const lost = !won && !draw;

        const sCfg = this.getSeasonConfig(getStagionePartita(p));
        punti += sCfg.legacyPresenza; // Presenza
        if (won) {
          punti += sCfg.legacyVittoria;
          wins++;
        } else if (draw) {
          punti += sCfg.legacyPareggio;
          draws++;
        } else if (lost) {
          punti += sCfg.legacySconfitta;
          losses++;
        }

        const eventi = p.eventiGol || [];
        const golFatti = eventi.filter(
          (eg: any) =>
            (eg.idAssegnato === g.id || eg.nome === g.nome) && !eg.isAutogoal,
        ).length;
        const autogolFatti = eventi.filter(
          (eg: any) =>
            (eg.idAssegnato === g.id || eg.nome === g.nome) && eg.isAutogoal,
        ).length;

        const playerObj = inTeamA || inTeamB;
        const assistFatti =
          eventi.filter(
            (eg: any) =>
              eg.assistId === g.id ||
              (!eg.assistId && eg.assistNome && eg.assistNome === g.nome),
          ).length || (playerObj.assist || 0);

        golTotali += golFatti;
        assistTotali += assistFatti;
        punti += golFatti * sCfg.legacyGol;
        punti += autogolFatti * sCfg.legacyAutogol;
        punti += assistFatti * sCfg.legacyAssist;

        const voto = Number(playerObj.voto) || 0;
        sommaVoti += voto;
        punti += voto * sCfg.legacyPesoVoto;
      }
    });

    punti = Math.round(punti * 10) / 10;
    const minutiTotali = Math.floor(secondiGiocatiTotali / 60);
    const secondiRimanenti = secondiGiocatiTotali % 60;
    const minutiGiocatiDisplay = `${minutiTotali}' ${secondiRimanenti.toString().padStart(2, '0')}"`;
    const mediaVoto = partiteGiocate > 0 ? sommaVoti / partiteGiocate : 0;

    const playerMmr =
      stagione === ALL_SEASONS
        ? statsRes.allTime.get(g.id)
        : statsRes.bySeason.get(stagione)?.get(g.id);

    const allTimeMmr = statsRes.allTime.get(g.id);
    const isRanked = partiteGiocate > 0;
    const seasonStartMmr = playerMmr?.seasonStartMmr ?? BASE_INITIAL_MMR;
    const mmrVal =
      isRanked && playerMmr
        ? Math.round(playerMmr.currentMmr)
        : seasonStartMmr;
    const mmrDisplay = isRanked ? mmrVal.toString() : '—';
    const tier = isRanked && playerMmr ? playerMmr.tier : UNRANKED_TIER;
    const peakMmr = isRanked
      ? (allTimeMmr?.peakMmr ?? (playerMmr?.currentMmr ?? mmrVal))
      : 0;
    const pastSeasonsBanners =
      playerMmr?.pastSeasonsBanners ||
      allTimeMmr?.pastSeasonsBanners ||
      [];
    const form =
      isRanked && playerMmr?.form
        ? playerMmr.form
        : {
          currentStreak: 0,
          status: 'neutral' as const,
          statusLabel: 'Costante',
          emoji: '➖',
          multiplier: 1.0,
          bestWinStreak: 0,
          worstLossStreak: 0,
          recentForm: [],
        };

    const history = isRanked ? playerMmr?.history || [] : [];
    const lastMatch = history.length > 0 ? history[history.length - 1] : null;
    const lastDelta = lastMatch ? lastMatch.delta : null;
    const lastDeltaDisplay =
      lastDelta !== null
        ? lastDelta > 0
          ? `+${lastDelta}`
          : `${lastDelta}`
        : null;
    const trendDirection: 'up' | 'down' | 'neutral' | 'none' =
      lastDelta === null
        ? 'none'
        : lastDelta > 0
          ? 'up'
          : lastDelta < 0
            ? 'down'
            : 'neutral';

    const chemistry = statsRes.chemistry.get(g.id);
    const winRate =
      partiteGiocate > 0
        ? Math.round((wins / partiteGiocate) * 1000) / 10
        : 0;

    const portiereStats = StatsEngineService.calculateGoalkeeperStatsForPlayer(
      g.id,
      partiteStagione,
    );

    return {
      ...g,
      fotoUrl: getAvatarUrl(g.fotoUrl),
      puntiVal: punti,
      puntiDisplay: Number.isInteger(punti)
        ? punti.toString()
        : punti.toFixed(1),
      golTotali,
      assistTotali,
      mediaVotoVal: mediaVoto,
      mediaVotoDisplay: mediaVoto.toFixed(2),
      partiteGiocate,
      secondiGiocatiTotali,
      minutiGiocatiDisplay,
      wins,
      draws,
      losses,
      isRanked,
      mmrVal,
      mmrDisplay,
      tier,
      peakMmr,
      lastDelta,
      lastDeltaDisplay,
      trendDirection,
      form,
      winRate,
      rankAssoluto: 0,
      chemistry,
      seasonStartMmr,
      pastSeasonsBanners,
      portiereStats,
    };
  }


  /**
   * Prevede l'esito di un match ipotetico dati gli ID dei giocatori delle due squadre
   */
  predictMatch(
    teamAPlayerIds: string[],
    teamBPlayerIds: string[],
    season: string = ALL_SEASONS,
  ): MatchPrediction {
    const res = this.statsResult();
    const statsMap =
      season === ALL_SEASONS
        ? res.allTime
        : res.bySeason.get(season) || res.allTime;

    const mmrsA = teamAPlayerIds.map(
      (id) => statsMap.get(id)?.currentMmr ?? BASE_INITIAL_MMR,
    );
    const mmrsB = teamBPlayerIds.map(
      (id) => statsMap.get(id)?.currentMmr ?? BASE_INITIAL_MMR,
    );

    const avgA =
      mmrsA.length > 0
        ? mmrsA.reduce((sum, v) => sum + v, 0) / mmrsA.length
        : BASE_INITIAL_MMR;
    const avgB =
      mmrsB.length > 0
        ? mmrsB.reduce((sum, v) => sum + v, 0) / mmrsB.length
        : BASE_INITIAL_MMR;

    return this.calculateOdds(avgA, avgB);
  }

  /**
   * Calcolo della probabilità di vittoria ELO data la media MMR delle due squadre
   */
  calculateOdds(mmrA: number, mmrB: number): MatchPrediction {
    return StatsEngineService.calculateOdds(mmrA, mmrB);
  }

  static calculateOdds(mmrA: number, mmrB: number): MatchPrediction {
    const probA = 1 / (1 + Math.pow(10, (mmrB - mmrA) / 400));
    const probB = 1 / (1 + Math.pow(10, (mmrA - mmrB) / 400));

    const probAPercent = Math.round(probA * 1000) / 10;
    const probBPercent = Math.round(probB * 1000) / 10;

    let favoriteTeam: 'A' | 'B' | 'EQUILIBRATA' = 'EQUILIBRATA';
    const margin = Math.abs(probAPercent - probBPercent);

    if (margin > 4) {
      favoriteTeam = probA > probB ? 'A' : 'B';
    }

    return {
      mmrA: Math.round(mmrA),
      mmrB: Math.round(mmrB),
      probA,
      probB,
      probAPercent,
      probBPercent,
      favoriteTeam,
      favoriteMargin: Math.round(margin * 10) / 10,
    };
  }

  /**
   * Calcola le statistiche da portiere (minuti, turni, gol subiti, clean sheet, media gol/50min)
   * per un singolo giocatore analizzando l'elenco delle partite fornite.
   */
  static calculateGoalkeeperStatsForPlayer(
    playerId: string,
    matches: Partita[],
  ): PortiereStats {
    let minutiInPorta = 0;
    let turniInPorta = 0;
    let golSubiti = 0;
    let cleanSheetTurni = 0;
    let cleanSheetPartite = 0;
    let parateIncredibili = 0;

    for (const p of matches) {
      const rot = p.rotazionePortieri;
      const hasRotation =
        !!rot && (Array.isArray(rot.teamA) || Array.isArray(rot.teamB));
      const durataTurno = rot?.durataTurnoMinuti || 5;
      const durataTurnoSec = durataTurno * 60;
      const cronometroTotale =
        p.cronometro || (p.accumulatedTime ?? 0) || 3000;

      let playerTeam: 'A' | 'B' | null = null;
      let orderList: string[] = [];

      if (hasRotation) {
        if (rot.teamA?.includes(playerId)) {
          playerTeam = 'A';
          orderList = rot.teamA;
        } else if (rot.teamB?.includes(playerId)) {
          playerTeam = 'B';
          orderList = rot.teamB;
        }
      } else {
        if (p.teamA?.some((pl) => pl.id === playerId)) playerTeam = 'A';
        else if (p.teamB?.some((pl) => pl.id === playerId)) playerTeam = 'B';
      }

      if (!playerTeam) continue;
      const parateMatch = p.parateIncredibili?.[playerId] || (playerTeam === 'A' ? p.teamA : p.teamB)?.find((x: any) => x.id === playerId)?.parateIncredibili || 0;
      parateIncredibili += parateMatch;

      const modalita =
        playerTeam === 'A'
          ? rot?.modalitaA || 'rotazione'
          : rot?.modalitaB || 'rotazione';
      const fixedId =
        playerTeam === 'A'
          ? rot?.portiereFissoAId || rot?.teamA?.[0]
          : rot?.portiereFissoBId || rot?.teamB?.[0];

      if (modalita === 'fisso') {
        if (playerId !== fixedId) {
          continue;
        }
        const totalTurni = Math.max(
          1,
          Math.ceil(cronometroTotale / durataTurnoSec),
        );
        const secondiEffettivi = cronometroTotale;
        minutiInPorta += secondiEffettivi > 0 ? Math.max(1, Math.round(secondiEffettivi / 60)) : 0;
        turniInPorta += totalTurni;

        const teamAvversario = playerTeam === 'A' ? 'B' : 'A';
        const eventi = p.eventiGol || [];
        const matchGolSubiti = eventi.filter((eg: any) => {
          if (eg.portiereSubitoId) {
            return (
              eg.portiereSubitoId === playerId &&
              eg.teamVantaggio === teamAvversario
            );
          }
          return eg.teamVantaggio === teamAvversario;
        }).length;

        golSubiti += matchGolSubiti;
        if (matchGolSubiti === 0 && secondiEffettivi > 0) {
          cleanSheetPartite++;
          cleanSheetTurni += totalTurni;
        }
        continue;
      }

      if (hasRotation && orderList.length > 0) {
        const playerIndices: number[] = [];
        orderList.forEach((id, idx) => {
          if (id === playerId) playerIndices.push(idx);
        });

        if (playerIndices.length === 0) continue;

        const totalTurni = Math.max(
          1,
          Math.ceil(cronometroTotale / durataTurnoSec),
        );
        let matchTurniGiocati = 0;
        let matchGolSubiti = 0;
        let matchCleanSheetTurni = 0;

        for (let turno = 0; turno < totalTurni; turno++) {
          const idxInOrder = turno % orderList.length;
          if (playerIndices.includes(idxInOrder)) {
            matchTurniGiocati++;
            const inizioSec = turno * durataTurnoSec;
            const fineSec = Math.min(
              cronometroTotale,
              (turno + 1) * durataTurnoSec,
            );
            const secondiEffettivi = Math.max(0, fineSec - inizioSec);
            minutiInPorta += secondiEffettivi > 0 ? Math.max(1, Math.round(secondiEffettivi / 60)) : 0;

            const teamAvversario = playerTeam === 'A' ? 'B' : 'A';
            const eventi = p.eventiGol || [];

            const golNelTurno = eventi.filter((eg: any) => {
              if (eg.teamVantaggio !== teamAvversario) return false;

              let isInThisTurn = false;
              if (eg.tempo) {
                const [mStr, sStr] = eg.tempo.split(':');
                const golSec =
                  (parseInt(mStr, 10) || 0) * 60 + (parseInt(sStr, 10) || 0);
                isInThisTurn =
                  turno === totalTurni - 1
                    ? golSec >= inizioSec
                    : golSec >= inizioSec && golSec < fineSec;
              }

              if (eg.portiereSubitoId) {
                if (eg.portiereSubitoId !== playerId) return false;
                return eg.tempo ? isInThisTurn : true;
              }

              return isInThisTurn;
            }).length;

            matchGolSubiti += golNelTurno;
            if (golNelTurno === 0 && secondiEffettivi > 0) {
              matchCleanSheetTurni++;
            }
          }
        }

        if (matchTurniGiocati > 0) {
          turniInPorta += matchTurniGiocati;
          golSubiti += matchGolSubiti;
          cleanSheetTurni += matchCleanSheetTurni;
          if (matchGolSubiti === 0) {
            cleanSheetPartite++;
          }
        }
      } else {
        const eventi = p.eventiGol || [];
        const golSubitiDiretti = eventi.filter(
          (eg: any) => eg.portiereSubitoId === playerId,
        ).length;
        if (golSubitiDiretti > 0) {
          turniInPorta += 1;
          minutiInPorta += 5;
          golSubiti += golSubitiDiretti;
        }
      }
    }

    const isClassificabile = turniInPorta >= 1 && minutiInPorta > 0;
    const mediaGolSubiti50m =
      minutiInPorta > 0
        ? Math.round((golSubiti / (minutiInPorta / 50)) * 100) / 100
        : 0;

    return {
      minutiInPorta,
      turniInPorta,
      golSubiti,
      cleanSheetTurni,
      cleanSheetPartite,
      mediaGolSubiti50m,
      isClassificabile,
      parateIncredibili,
    };
  }

  /**
   * Calcola le statistiche da portiere relative a una singola partita
   */
  static calculateGoalkeeperStatsForMatch(
    playerId: string,
    match: Partita,
    playerTeam: 'A' | 'B',
  ): { turniGiocati: number; golSubiti: number; cleanSheetTurni: number; parateIncredibili: number } {
    const rot = match.rotazionePortieri;
    if (!rot) return { turniGiocati: 0, golSubiti: 0, cleanSheetTurni: 0, parateIncredibili: 0 };

    const modalita =
      playerTeam === 'A'
        ? rot.modalitaA || 'rotazione'
        : rot.modalitaB || 'rotazione';
    const fixedId =
      playerTeam === 'A'
        ? rot.portiereFissoAId || rot.teamA?.[0]
        : rot.portiereFissoBId || rot.teamB?.[0];
    const cronometroTotale =
      match.cronometro || (match.accumulatedTime ?? 0) || 3000;
    const durataTurno = rot.durataTurnoMinuti || 5;
    const durataTurnoSec = durataTurno * 60;
    const totalTurni = Math.max(
      1,
      Math.ceil(cronometroTotale / durataTurnoSec),
    );
    const teamAvversario = playerTeam === 'A' ? 'B' : 'A';
    const eventi = match.eventiGol || [];

    if (modalita === 'fisso') {
      if (playerId !== fixedId) {
        return { turniGiocati: 0, golSubiti: 0, cleanSheetTurni: 0, parateIncredibili: 0 };
      }
      const golSubiti = eventi.filter((eg: any) => {
        if (eg.portiereSubitoId) {
          return (
            eg.portiereSubitoId === playerId &&
            eg.teamVantaggio === teamAvversario
          );
        }
        return eg.teamVantaggio === teamAvversario;
      }).length;

      const cleanSheetTurni = golSubiti === 0 ? totalTurni : 0;
      const parateIncredibili = match.parateIncredibili?.[playerId] || (playerTeam === 'A' ? match.teamA : match.teamB)?.find((x: any) => x.id === playerId)?.parateIncredibili || 0;
      return { turniGiocati: totalTurni, golSubiti, cleanSheetTurni, parateIncredibili };
    }

    const orderList = playerTeam === 'A' ? rot.teamA : rot.teamB;
    if (!orderList || orderList.length === 0) {
      return { turniGiocati: 0, golSubiti: 0, cleanSheetTurni: 0, parateIncredibili: 0 };
    }

    const playerIndices: number[] = [];
    orderList.forEach((id, idx) => {
      if (id === playerId) playerIndices.push(idx);
    });
    if (playerIndices.length === 0) {
      return { turniGiocati: 0, golSubiti: 0, cleanSheetTurni: 0, parateIncredibili: 0 };
    }

    let turniGiocati = 0;
    let golSubiti = 0;
    let cleanSheetTurni = 0;

    for (let turno = 0; turno < totalTurni; turno++) {
      const idxInOrder = turno % orderList.length;
      if (playerIndices.includes(idxInOrder)) {
        turniGiocati++;
        const inizioSec = turno * durataTurnoSec;
        const fineSec = Math.min(cronometroTotale, (turno + 1) * durataTurnoSec);

        const golNelTurno = eventi.filter((eg: any) => {
          if (eg.teamVantaggio !== teamAvversario) return false;

          let isInThisTurn = false;
          if (eg.tempo) {
            const [mStr, sStr] = eg.tempo.split(':');
            const golSec =
              (parseInt(mStr, 10) || 0) * 60 + (parseInt(sStr, 10) || 0);
            isInThisTurn =
              turno === totalTurni - 1
                ? golSec >= inizioSec
                : golSec >= inizioSec && golSec < fineSec;
          }

          if (eg.portiereSubitoId) {
            if (eg.portiereSubitoId !== playerId) return false;
            return eg.tempo ? isInThisTurn : true;
          }

          return isInThisTurn;
        }).length;

        golSubiti += golNelTurno;
        if (golNelTurno === 0 && fineSec - inizioSec > 0) {
          cleanSheetTurni++;
        }
      }
    }

    const parateIncredibili = match.parateIncredibili?.[playerId] || (playerTeam === 'A' ? match.teamA : match.teamB)?.find((x: any) => x.id === playerId)?.parateIncredibili || 0;
    return { turniGiocati, golSubiti, cleanSheetTurni, parateIncredibili };
  }

  /**
   * Genera un resoconto testuale approfondito delle prestazioni dei portieri di un match,
   * ideale per note post-partita e per l'arricchimento del prompt telecronaca.
   */
  static generateGoalkeeperMatchSummary(match: Partita): {
    summaryA: string;
    summaryB: string;
    notesPrompt: string;
  } {
    const rot = match.rotazionePortieri;
    const teamA = match.teamA || [];
    const teamB = match.teamB || [];
    const eventi = match.eventiGol || [];

    const getTeamSummary = (team: 'A' | 'B', players: any[]) => {
      const teamNome = team === 'A' ? 'BIANCHI' : 'NERI';
      const modalita =
        team === 'A'
          ? rot?.modalitaA || 'rotazione'
          : rot?.modalitaB || 'rotazione';
      const fixedId =
        team === 'A'
          ? rot?.portiereFissoAId || rot?.teamA?.[0]
          : rot?.portiereFissoBId || rot?.teamB?.[0];

      if (modalita === 'fisso') {
        const fixedP = players.find((p) => p.id === fixedId) || players[0];
        const nome = fixedP?.nome || 'Portiere';
        const isDiRuolo =
          ((fixedP as any)?.ruoloPreferito as string)?.toLowerCase() ===
          'portiere';
        const stats = fixedP
          ? StatsEngineService.calculateGoalkeeperStatsForMatch(
            fixedP.id,
            match,
            team,
          )
          : { golSubiti: 0, turniGiocati: 1, cleanSheetTurni: 0 };

        const tag = isDiRuolo ? '👑 Portiere di Ruolo' : '🧤 Portiere Fisso';
        const comment =
          stats.golSubiti === 0
            ? '🛡️ Saracinesca impenetrabile! Clean Sheet completo (0 gol subiti).'
            : stats.golSubiti <= 2
              ? `Ottima prestazione: solo ${stats.golSubiti} gol subiti.`
              : `Serata difficile: ${stats.golSubiti} gol incassati.`;

        return `${teamNome} (${tag}: ${nome}): ${stats.golSubiti} gol subiti su tutta la partita. ${comment}`;
      } else {
        // Rotazione
        const portieriList = players
          .map((p) => {
            const s = StatsEngineService.calculateGoalkeeperStatsForMatch(
              p.id,
              match,
              team,
            );
            return { nome: p.nome, ...s };
          })
          .filter((p) => p.turniGiocati > 0);

        if (portieriList.length === 0) {
          return `${teamNome}: Portieri a rotazione (nessun turno registrato)`;
        }

        const details = portieriList
          .map(
            (p) =>
              `${p.nome} (${p.turniGiocati * 5} min, ${p.golSubiti} gol subiti${p.cleanSheetTurni > 0 ? ', ' + p.cleanSheetTurni + ' turni imbattuto' : ''})`,
          )
          .join(', ');

        return `${teamNome} (🔄 A Rotazione ogni 5 min): ${details}`;
      }
    };

    const summaryA = getTeamSummary('A', teamA);
    const summaryB = getTeamSummary('B', teamB);
    const notesPrompt = `NOTE RENDIMENTO PORTIERI:\n• ${summaryA}\n• ${summaryB}`;

    return { summaryA, summaryB, notesPrompt };
  }

  /**
   * Genera un report iperdettagliato per il fine partita (odds, upset, spostamenti MMR, punti legacy, MVP, peggiore, on fire, chimica)
   */
  getMatchReport(match: any): MatchReportData {
    if (!match) {
      return this.getEmptyMatchReport();
    }

    const matchId = match.id || '';
    const scoreA = Number(match.scoreA) || 0;
    const scoreB = Number(match.scoreB) || 0;
    const teamA = match.teamA || [];
    const teamB = match.teamB || [];
    const eventiGol = match.eventiGol || [];

    const res = this.statsResult();
    const allTime = res.allTime;
    const chemistry = res.chemistry;

    // 1. Odds Pre-Match (dallo storico calcolato o calcolato al volo con MMR attuali)
    let odds = res.matchPredictions.get(matchId);
    if (!odds) {
      const avgA =
        teamA.length > 0
          ? teamA.reduce(
            (sum: number, p: any) =>
              sum + (allTime.get(p.id)?.currentMmr ?? BASE_INITIAL_MMR),
            0,
          ) / teamA.length
          : BASE_INITIAL_MMR;
      const avgB =
        teamB.length > 0
          ? teamB.reduce(
            (sum: number, p: any) =>
              sum + (allTime.get(p.id)?.currentMmr ?? BASE_INITIAL_MMR),
            0,
          ) / teamB.length
          : BASE_INITIAL_MMR;
      odds = StatsEngineService.calculateOdds(avgA, avgB);
    }

    // 2. Controllo UPSET (la sfavorita ha vinto contro i pronostici)
    let isUpset = false;
    let upsetTeam: 'A' | 'B' | null = null;
    let upsetDescription = '';

    if (scoreA > scoreB && odds.probBPercent > 50) {
      isUpset = true;
      upsetTeam = 'A';
      upsetDescription = `I Bianchi (${odds.probAPercent}%) ribaltano i pronostici e battono i favoriti Neri (${odds.probBPercent}%)!`;
    } else if (scoreB > scoreA && odds.probAPercent > 50) {
      isUpset = true;
      upsetTeam = 'B';
      upsetDescription = `I Neri (${odds.probBPercent}%) ribaltano i pronostici e battono i favoriti Bianchi (${odds.probAPercent}%)!`;
    }

    // 3. Elaborazione Giocatori: MMR Delta, Punti Legacy, On Fire
    const aWon = scoreA > scoreB;
    const bWon = scoreB > scoreA;
    const isDraw = scoreA === scoreB;

    const mapPlayer = (
      p: any,
      team: 'A' | 'B',
      won: boolean,
      draw: boolean,
    ): MatchReportPlayer => {
      const pStats = allTime.get(p.id);
      const mCfg = this.getSeasonConfig(getStagionePartita(match));
      const deltaObj = pStats?.history.find((h) => h.partitaId === matchId);

      const mmrBefore = deltaObj
        ? deltaObj.mmrBefore
        : (pStats?.currentMmr ?? BASE_INITIAL_MMR);

      const golCount =
        eventiGol.filter(
          (eg: any) =>
            (eg.idAssegnato === p.id || eg.nome === p.nome) && !eg.isAutogoal,
        ).length ||
        p.gol ||
        0;

      const autogolCount =
        eventiGol.filter(
          (eg: any) =>
            (eg.idAssegnato === p.id || eg.nome === p.nome) && eg.isAutogoal,
        ).length ||
        p.autogol ||
        0;

      const assistCount =
        eventiGol.filter(
          (eg: any) =>
            eg.assistId === p.id ||
            (!eg.assistId && eg.assistNome && eg.assistNome === p.nome),
        ).length ||
        p.assist ||
        0;

      const votoNum = Number(p.voto) || 0;
      const isLoss = !won && !draw;
      const hasSvp = isLoss && (votoNum >= 7.0 || golCount >= 2);

      // Se il match non è ancora nello storico simulato, stimiamo il delta con la nuova formula bilanciata
      let mmrDelta = 0;
      if (deltaObj) {
        mmrDelta = deltaObj.delta;
      } else {
        const myProb = team === 'A' ? odds.probA : odds.probB;
        const actualScore = won ? 1 : draw ? 0.5 : 0;
        const baseTeamDelta = K_FACTOR * (actualScore - myProb);

        const goalDiffSigned = team === 'A' ? scoreA - scoreB : scoreB - scoreA;
        const sign = goalDiffSigned > 0 ? 1 : goalDiffSigned < 0 ? -1 : 0;
        const movBonus =
          sign * Math.min(5, Math.round(Math.log2(Math.abs(goalDiffSigned) + 1) * 2));

        const voteBonus =
          votoNum > 0
            ? Math.max(-8, Math.min(10, Math.round((votoNum - 6.5) * 6)))
            : 0;
        const netGoals = Math.max(0, golCount - autogolCount);
        const contributionBonus = Math.min(
          4,
          Math.floor(netGoals * mCfg.pesoGolMmr + assistCount * mCfg.pesoAssistMmr),
        );

        let gkBonus = 0;
        if (match.rotazionePortieri) {
          const gkMatch = StatsEngineService.calculateGoalkeeperStatsForMatch(
            p.id,
            match,
            team,
          );
          if (gkMatch.turniGiocati > 0) {
            if (gkMatch.golSubiti === 0) {
              gkBonus = Math.min(5, 2 + gkMatch.cleanSheetTurni);
            } else if (gkMatch.golSubiti === 1) {
              gkBonus = 0;
            } else if (gkMatch.golSubiti === 2) {
              gkBonus = -1;
            } else if (gkMatch.golSubiti >= 3) {
              gkBonus = Math.max(-5, -2 - (gkMatch.golSubiti - 2));
            }
            if (gkMatch.parateIncredibili > 0) {
              gkBonus += gkMatch.parateIncredibili * (mCfg.bonusParataIncredibile ?? 1.0);
            }
          }
        }

        let rawDelta =
          baseTeamDelta + movBonus + voteBonus + contributionBonus + gkBonus;
        if (mmrBefore >= 1200 && rawDelta > 0) rawDelta = Math.round(rawDelta * 0.75);
        if (mmrBefore >= 1250 && rawDelta < 0) rawDelta = Math.round(rawDelta * 1.15);

        const isPlacement = (pStats?.partiteGiocate ?? 0) === 0;
        if (isPlacement) {
          mmrDelta = Math.max(
            PLACEMENT_CLAMP_MIN,
            Math.min(PLACEMENT_CLAMP_MAX, Math.round(rawDelta * PLACEMENT_MULTIPLIER)),
          );
        } else {
          mmrDelta = Math.max(HARD_CLAMP_MIN, Math.min(HARD_CLAMP_MAX, Math.round(rawDelta)));
        }
      }

      const mmrAfter = deltaObj ? deltaObj.mmrAfter : Math.max(100, mmrBefore + mmrDelta);

      const resultPoints = won ? 2 : draw ? 1 : 0;
      const legacyDelta =
        Math.round((2 + resultPoints + golCount - autogolCount + assistCount * 0.5 + votoNum) * 10) /
        10;

      const onFireTransition =
        deltaObj?.onFireTransition ??
        (pStats?.form?.status === 'on_fire' ? 'maintained' : 'none');
      const streakAfter = deltaObj?.streakAfter ?? (pStats?.form?.currentStreak ?? 0);

      return {
        id: p.id,
        nome: p.nome || 'Sconosciuto',
        soprannome: p.soprannome || pStats?.soprannome,
        fotoUrl: getAvatarUrl(p.fotoUrl || pStats?.fotoUrl),
        team,
        voto:
          p.voto !== undefined && p.voto !== null && !isNaN(Number(p.voto)) && Number(p.voto) > 0
            ? Number(p.voto)
            : undefined,
        note: (p.note || '').trim(),
        gol: golCount,
        autogol: autogolCount,
        assist: assistCount,
        mmrDelta,
        mmrBefore,
        mmrAfter,
        legacyDelta,
        onFireTransition,
        streakAfter,
        isRanked: pStats ? pStats.isRanked : true,
        svpShield: deltaObj?.individualBonus?.svpShield ?? hasSvp,
      };
    };

    const playersA: MatchReportPlayer[] = teamA.map((p: any) => mapPlayer(p, 'A', aWon, isDraw));
    const playersB: MatchReportPlayer[] = teamB.map((p: any) => mapPlayer(p, 'B', bWon, isDraw));
    const allReportPlayers: MatchReportPlayer[] = [...playersA, ...playersB];

    // Spostamenti Medi di Squadra
    const teamAvgMmrDeltaA =
      playersA.length > 0
        ? Math.round(
          playersA.reduce((sum: number, p: MatchReportPlayer) => sum + p.mmrDelta, 0) / playersA.length,
        )
        : 0;
    const teamAvgMmrDeltaB =
      playersB.length > 0
        ? Math.round(
          playersB.reduce((sum: number, p: MatchReportPlayer) => sum + p.mmrDelta, 0) / playersB.length,
        )
        : 0;

    const teamLegacyDeltaA =
      playersA.length > 0
        ? Math.round(
          (playersA.reduce((sum: number, p: MatchReportPlayer) => sum + p.legacyDelta, 0) /
            playersA.length) *
          10,
        ) / 10
        : 0;
    const teamLegacyDeltaB =
      playersB.length > 0
        ? Math.round(
          (playersB.reduce((sum: number, p: MatchReportPlayer) => sum + p.legacyDelta, 0) /
            playersB.length) *
          10,
        ) / 10
        : 0;

    // Voti Medi Squadra
    const votiA: number[] = playersA.filter((p: MatchReportPlayer) => (p.voto ?? 0) > 0).map((p: MatchReportPlayer) => p.voto!);
    const votoMedioA =
      votiA.length > 0
        ? Math.round((votiA.reduce((sum: number, v: number) => sum + v, 0) / votiA.length) * 10) /
        10
        : 0;

    const votiB: number[] = playersB.filter((p: MatchReportPlayer) => (p.voto ?? 0) > 0).map((p: MatchReportPlayer) => p.voto!);
    const votoMedioB =
      votiB.length > 0
        ? Math.round((votiB.reduce((sum: number, v: number) => sum + v, 0) / votiB.length) * 10) /
        10
        : 0;

    // 4. MVP del Match e Peggiore (goliardico)
    const ratedPlayers = allReportPlayers.filter((p) => (p.voto ?? 0) > 0);
    let mvp: MatchReportPlayer | null = null;
    let worst: MatchReportPlayer | null = null;

    if (ratedPlayers.length > 0) {
      const sortedByVote = [...ratedPlayers].sort((a, b) => {
        const diff = (b.voto ?? 0) - (a.voto ?? 0);
        if (diff !== 0) return diff;
        return (b.gol || 0) - (a.gol || 0);
      });
      mvp = sortedByVote[0];

      if (sortedByVote.length > 1 && mvp) {
        const lowestCandidate = sortedByVote[sortedByVote.length - 1];
        if (lowestCandidate.id !== mvp.id && (lowestCandidate.voto ?? 0) <= 6.0) {
          worst = lowestCandidate;
        }
      }
    }

    // 5. Movimenti On Fire
    const onFireEntered = allReportPlayers.filter(
      (p) => p.onFireTransition === 'entered',
    );
    const onFireExited = allReportPlayers.filter(
      (p) => p.onFireTransition === 'exited',
    );
    const onFireMaintained = allReportPlayers.filter(
      (p) => p.onFireTransition === 'maintained',
    );

    // 6. Note di Chimica delle Coppie in campo
    const chemistryNotes: MatchReportChemistryItem[] = [];

    const checkTeammatesSynergy = (
      teamPlayers: MatchReportPlayer[],
      teamName: string,
    ) => {
      for (let i = 0; i < teamPlayers.length; i++) {
        for (let j = i + 1; j < teamPlayers.length; j++) {
          const p1 = teamPlayers[i];
          const p2 = teamPlayers[j];
          const chem1 = chemistry.get(p1.id);
          const syn = chem1?.allSynergies.find((s) => s.partnerId === p2.id);
          if (syn && syn.matchesTogether >= 2 && syn.winRateTogether >= 60) {
            chemistryNotes.push({
              type: 'synergy',
              badge: '🤝 Gemelli del Gol',
              title: `${p1.nome} & ${p2.nome} (${teamName})`,
              description: `Intesa vincente: ${syn.winRateTogether}% di vittorie insieme (${syn.winsTogether}V su ${syn.matchesTogether} partite).`,
              players: [p1.nome, p2.nome],
            });
          }
        }
      }
    };

    checkTeammatesSynergy(playersA, 'Bianchi');
    checkTeammatesSynergy(playersB, 'Neri');

    // Rivalità/Nemesi tra avversari
    for (const pA of playersA) {
      for (const pB of playersB) {
        const chemA = chemistry.get(pA.id);
        const nem = chemA?.allNemesis.find((n) => n.opponentId === pB.id);
        if (nem && nem.matchesAgainst >= 2) {
          if (nem.winRateAgainst >= 65) {
            chemistryNotes.push({
              type: 'nemesis',
              badge: '😈 Bestia Nera',
              title: `${pA.nome} vs ${pB.nome}`,
              description: `${pA.nome} è la bestia nera di ${pB.nome} (${nem.winsAgainst}V negli scontri diretti).`,
              players: [pA.nome, pB.nome],
            });
          } else if (nem.opponentWinRate >= 65) {
            chemistryNotes.push({
              type: 'nemesis',
              badge: '😈 Bestia Nera',
              title: `${pB.nome} vs ${pA.nome}`,
              description: `${pB.nome} domina il duello con ${pA.nome} (${nem.lossesAgainst} vittorie subite da ${pA.nome}).`,
              players: [pB.nome, pA.nome],
            });
          }
        }
      }
    }

    return {
      matchId,
      dataPartita: match.dataPartita,
      luogo: match.luogo,
      orario: match.orario,
      scoreA,
      scoreB,
      status: match.status || (match.matchConcluso ? 'conclusa' : 'in_corso'),
      fotoUrl: match.fotoUrl || null,
      fotoPath: match.fotoPath || null,
      odds,
      isUpset,
      upsetTeam,
      upsetDescription,
      teamAvgMmrDeltaA,
      teamAvgMmrDeltaB,
      teamLegacyDeltaA,
      teamLegacyDeltaB,
      votoMedioA,
      votoMedioB,
      mvp,
      worst,
      onFireEntered,
      onFireExited,
      onFireMaintained,
      playersA,
      playersB,
      chemistryNotes: chemistryNotes.slice(0, 4),
      cronacaAi: match.cronacaAi,
      pronosticoAi: match.pronosticoAi,
      commentoPartita: match.commentoPartita || null,
    };
  }

  getEmptyMatchReport(): MatchReportData {
    const emptyOdds = StatsEngineService.calculateOdds(BASE_INITIAL_MMR, BASE_INITIAL_MMR);
    return {
      scoreA: 0,
      scoreB: 0,
      status: 'pronta',
      odds: emptyOdds,
      isUpset: false,
      upsetTeam: null,
      teamAvgMmrDeltaA: 0,
      teamAvgMmrDeltaB: 0,
      teamLegacyDeltaA: 0,
      teamLegacyDeltaB: 0,
      votoMedioA: 0,
      votoMedioB: 0,
      mvp: null,
      worst: null,
      onFireEntered: [],
      onFireExited: [],
      onFireMaintained: [],
      playersA: [],
      playersB: [],
      chemistryNotes: [],
      cronacaAi: undefined,
      pronosticoAi: undefined,
      commentoPartita: null,
    };
  }

  // =========================================================================
  // CORE ENGINE RETROATTIVO (Algoritmo puro deterministico)
  // =========================================================================

  /**
   * Esegue la simulazione cronologica completa su tutto lo storico delle partite
   */
  calculateAllStats(
    giocatori: Giocatore[],
    partite: Partita[],
    configsMap?: Map<string, SeasonEngineConfig>,
  ): MmrCalculationResult {
    return StatsEngineService.calculateAllStats(
      giocatori,
      partite,
      this.seasonConfigsMap(),
    );
  }

  static calculateAllStats(
    giocatori: Giocatore[],
    partite: Partita[],
    configsMap?: Map<string, SeasonEngineConfig>,
  ): MmrCalculationResult {
    // 1. Mappa dei metadati giocatori per arricchire i risultati
    const playerMetadata = new Map<string, Giocatore>();
    for (const g of giocatori) {
      if (g.id) playerMetadata.set(g.id, g);
    }

    // 2. Filtra le partite concluse con dati validi
    const validMatches = partite.filter((p) => {
      const hasScores =
        typeof p.scoreA === 'number' && typeof p.scoreB === 'number';
      const isConcluded =
        p.matchConcluso === true ||
        p.pagelleInserite === true ||
        p.status === 'conclusa';
      return (
        hasScores &&
        isConcluded &&
        Array.isArray(p.teamA) &&
        Array.isArray(p.teamB)
      );
    });

    // 3. Ordina cronologicamente dalla più vecchia alla più recente
    const sortedMatches = [...validMatches].sort((a, b) => {
      const dateA =
        parseDate(a.dataPartita || a.dataOra)?.getTime() ??
        new Date(0).getTime();
      const dateB =
        parseDate(b.dataPartita || b.dataOra)?.getTime() ??
        new Date(0).getTime();
      return dateA - dateB;
    });

    // 4. Simulazione All-Time (percorre tutti i match dello storico partendo da BASE_INITIAL_MMR = 1000)
    const allTimeResult = StatsEngineService.simulateMmrHistory(
      sortedMatches,
      playerMetadata,
      undefined,
      true, // isAllTime = true
      configsMap,
    );

    // 5. Simulazione per singola Stagione con Soft-Reset compresso del 35% verso 1000 (Stile League of Legends)
    const matchesBySeason = new Map<string, Partita[]>();
    for (const match of sortedMatches) {
      const season = getStagionePartita(match);
      const mCfg = StatsEngineService.resolveSeasonConfig(season, configsMap);
      if (!matchesBySeason.has(season)) {
        matchesBySeason.set(season, []);
      }
      matchesBySeason.get(season)!.push(match);
    }

    // Ordina le stagioni cronologicamente (es. "2024/2025" prima di "2025/2026" e "2026/2027")
    const sortedSeasonKeys = Array.from(matchesBySeason.keys()).sort();
    const bySeasonResult = new Map<string, Map<string, PlayerMmrStats>>();
    let previousSeasonStats: Map<string, PlayerMmrStats> | null = null;
    const cumulativeLastKnownMmr = new Map<string, number>();

    for (const season of sortedSeasonKeys) {
      const seasonMatches = matchesBySeason.get(season)!;
      const sCfg = StatsEngineService.resolveSeasonConfig(season, configsMap);

      // Soft-Reset stagionale (Regola A):
      // - Nuovo giocatore (0 partite nelle stagioni precedenti): startingMMR = 1000
      // - Giocatore Veterano (almeno 1 partita nella stagione precedente):
      //   seasonStartMMR = Math.round(1000 + (previousSeasonFinalMMR - 1000) * 0.35)
      //   con Clamp [920, 1130].
      const initialMmrMap = new Map<string, number>();
      for (const [playerId] of playerMetadata.entries()) {
        const prevP = previousSeasonStats?.get(playerId);
        if (prevP && prevP.partiteGiocate > 0) {
          const softReset = Math.round(
            1000 + (prevP.currentMmr - 1000) * sCfg.softResetFactor,
          );
          const clamped = Math.max(
            SEED_CLAMP_MIN,
            Math.min(SEED_CLAMP_MAX, softReset),
          );
          initialMmrMap.set(playerId, clamped);
        } else {
          const lastKnown = cumulativeLastKnownMmr.get(playerId);
          if (lastKnown !== undefined && lastKnown !== BASE_INITIAL_MMR) {
            const softReset = Math.round(
              1000 + (lastKnown - 1000) * sCfg.softResetFactor,
            );
            const clamped = Math.max(
              SEED_CLAMP_MIN,
              Math.min(SEED_CLAMP_MAX, softReset),
            );
            initialMmrMap.set(playerId, clamped);
          } else {
            initialMmrMap.set(playerId, BASE_INITIAL_MMR);
          }
        }
      }

      const sim = StatsEngineService.simulateMmrHistory(
        seasonMatches,
        playerMetadata,
        initialMmrMap,
        false, // isAllTime = false
        configsMap,
      );
      bySeasonResult.set(season, sim.playerStats);
      previousSeasonStats = sim.playerStats;

      for (const [pId, pStat] of sim.playerStats.entries()) {
        if (pStat.partiteGiocate > 0) {
          cumulativeLastKnownMmr.set(pId, pStat.currentMmr);
        }
      }
    }

    // Regola 4 Multi-Stagione: Genera i Season Banners (Albo d'Oro / badge stagionali passati stile LoL)
    for (const [playerId] of playerMetadata.entries()) {
      const banners: PastSeasonBanner[] = [];
      for (const sKey of sortedSeasonKeys) {
        const sMap = bySeasonResult.get(sKey);
        const pStats = sMap?.get(playerId);
        if (pStats && pStats.partiteGiocate > 0) {
          const seasonPlayersSorted = Array.from(sMap!.values())
            .filter((p) => p.partiteGiocate > 0)
            .sort((a, b) => b.currentMmr - a.currentMmr || b.winRate - a.winRate);
          const rankIndex = seasonPlayersSorted.findIndex(
            (p) => p.giocatoreId === playerId,
          );
          const rank = rankIndex >= 0 ? rankIndex + 1 : undefined;

          banners.push({
            season: sKey,
            shortLabel: formatShortSeason(sKey),
            finalMmr: Math.round(pStats.currentMmr),
            tier: pStats.tier,
            partiteGiocate: pStats.partiteGiocate,
            wins: pStats.wins,
            draws: pStats.draws,
            losses: pStats.losses,
            winRate: pStats.winRate,
            rank,
          });
        }
      }

      const allTimeP = allTimeResult.playerStats.get(playerId);
      if (allTimeP) {
        allTimeP.pastSeasonsBanners = banners;
      }
      for (const sKey of sortedSeasonKeys) {
        const pStats = bySeasonResult.get(sKey)?.get(playerId);
        if (pStats) {
          pStats.pastSeasonsBanners = banners;
        }
      }
    }

    // 6. Calcolo Chimica di Coppia (Sinergie e Nemesi) arricchito con delta MMR medio
    const playerDeltasByMatch = new Map<string, number>();
    for (const stats of allTimeResult.playerStats.values()) {
      for (const h of stats.history) {
        playerDeltasByMatch.set(`${h.partitaId}_${stats.giocatoreId}`, h.delta);
      }
    }

    const chemistry = StatsEngineService.calculatePairChemistry(
      sortedMatches,
      playerMetadata,
      MIN_MATCHES_CHEMISTRY,
      playerDeltasByMatch,
    );

    return {
      allTime: allTimeResult.playerStats,
      bySeason: bySeasonResult,
      chemistry,
      matchPredictions: allTimeResult.predictions,
    };
  }

  /**
   * Simulatore cronologico step-by-step con motore MMR calibrazione 11-15 match/anno:
   * K=28, Scarto Gol smorzato, Performance individuale, Streak piatto, Freno d'elite, Clamp
   */
  private static simulateMmrHistory(
    matches: Partita[],
    playerMetadata: Map<string, Giocatore>,
    initialMmrMap?: Map<string, number>,
    isAllTime: boolean = false,
    configsMap?: Map<string, SeasonEngineConfig>,
  ): {
    playerStats: Map<string, PlayerMmrStats>;
    predictions: Map<string, MatchPrediction>;
  } {
    const statsMap = new Map<string, PlayerMmrStats>();

    // Helper per inizializzare un giocatore
    const getOrCreatePlayer = (id: string): PlayerMmrStats => {
      if (!statsMap.has(id)) {
        const meta = playerMetadata.get(id);
        const form: PlayerFormStreak = {
          currentStreak: 0,
          status: 'neutral',
          statusLabel: 'Costante',
          emoji: '➖',
          multiplier: 1.0,
          bestWinStreak: 0,
          worstLossStreak: 0,
          recentForm: [],
        };
        const startMmr = initialMmrMap?.get(id) ?? BASE_INITIAL_MMR;
        statsMap.set(id, {
          giocatoreId: id,
          nome: meta?.nome || 'Sconosciuto',
          soprannome: meta?.soprannome,
          fotoUrl: getAvatarUrl(meta?.fotoUrl),
          isRanked: false, // Diventa true appena gioca la 1ª partita nella vista
          seasonStartMmr: startMmr,
          currentMmr: startMmr,
          peakMmr: startMmr,
          lowestMmr: startMmr,
          tier: UNRANKED_TIER,
          partiteGiocate: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          winRate: 0,
          form,
          history: [],
          consecutiveMissedMatches: 0,
          totalDecayLost: 0,
        });
      }
      return statsMap.get(id)!;
    };

    // Assicura che tutti i giocatori noti siano nel map
    for (const [id] of playerMetadata.entries()) {
      getOrCreatePlayer(id);
    }

    const predictions = new Map<string, MatchPrediction>();

    // Itera partita per partita in ordine cronologico
    for (const match of matches) {
      const matchId = match.id || `match_${Math.random()}`;
      const season = getStagionePartita(match);
      const mCfg = StatsEngineService.resolveSeasonConfig(season, configsMap);
      const dataStr =
        match.dataPartita ||
        parseDate(match.dataOra)?.toISOString().split('T')[0] ||
        '';

      const teamAPlayers = match.teamA.filter((p) => p && p.id);
      const teamBPlayers = match.teamB.filter((p) => p && p.id);

      if (teamAPlayers.length === 0 || teamBPlayers.length === 0) continue;

      // 1. Probabilità Attesa (Elo di Squadra):
      const mmrsBeforeA = teamAPlayers.map(
        (p) => getOrCreatePlayer(p.id!).currentMmr,
      );
      const mmrsBeforeB = teamBPlayers.map(
        (p) => getOrCreatePlayer(p.id!).currentMmr,
      );

      const avgMmrA =
        mmrsBeforeA.reduce((sum, v) => sum + v, 0) / mmrsBeforeA.length;
      const avgMmrB =
        mmrsBeforeB.reduce((sum, v) => sum + v, 0) / mmrsBeforeB.length;

      const prediction = StatsEngineService.calculateOdds(avgMmrA, avgMmrB);
      predictions.set(matchId, prediction);

      const expectedA = prediction.probA;
      const expectedB = prediction.probB;

      // 2. Risultato Base (K = 28):
      const scoreA = Number(match.scoreA);
      const scoreB = Number(match.scoreB);
      const aWon = scoreA > scoreB;
      const bWon = scoreB > scoreA;
      const isDraw = scoreA === scoreB;

      const actualScoreA = aWon ? 1 : isDraw ? 0.5 : 0;
      const actualScoreB = bWon ? 1 : isDraw ? 0.5 : 0;

      const teamDeltaA = mCfg.kFactor * (actualScoreA - expectedA);
      const teamDeltaB = mCfg.kFactor * (actualScoreB - expectedB);


      // 3. Fattore Scarto Gol (Margin of Victory Smorzato, tra -5 e +5):
      const goalDiffA = scoreA - scoreB;
      const signA = goalDiffA > 0 ? 1 : goalDiffA < 0 ? -1 : 0;
      const movBonusA =
        signA * Math.min(5, Math.round(Math.log2(Math.abs(goalDiffA) + 1) * 2));
      const movBonusB = -movBonusA;

      // Trova l'MVP del match per evidenziazione nel report
      const allPlayersInMatch = [...teamAPlayers, ...teamBPlayers];
      const ratedPlayers = allPlayersInMatch.filter(
        (p) => (Number(p.voto) || 0) >= 7.0,
      );
      let mvpPlayerId: string | null = null;
      if (ratedPlayers.length > 0) {
        const sorted = [...ratedPlayers].sort((a, b) => {
          const diff = (Number(b.voto) || 0) - (Number(a.voto) || 0);
          if (diff !== 0) return diff;
          return (Number(b.gol) || 0) - (Number(a.gol) || 0);
        });
        mvpPlayerId = sorted[0].id;
      }

      // Elaborazione singolo giocatore
      const processPlayer = (
        pPerf: any,
        team: 'A' | 'B',
        baseTeamDelta: number,
        movBonus: number,
        winProb: number,
        teamAvgBefore: number,
        opponentAvgBefore: number,
        teamScore: number,
        opponentScore: number,
        won: boolean,
        draw: boolean,
      ) => {
        const stats = getOrCreatePlayer(pPerf.id);
        const mmrBefore = stats.currentMmr;
        const matchesPlayedBefore = stats.partiteGiocate;

        // 4. Performance Individuale: Pagella (rispetto a 6.5) + Gol/Assist netti
        const voto = Number(pPerf.voto) || 0;
        let ratingBonus = 0;
        if (voto > 0) {
          ratingBonus = Math.max(-8, Math.min(10, Math.round((voto - mCfg.votoNeutro) * mCfg.votoMoltiplicatore)));
        }

        const eventi = match.eventiGol || [];
        const golCount =
          eventi.filter(
            (eg: any) =>
              (eg.idAssegnato === pPerf.id || eg.nome === pPerf.nome) &&
              !eg.isAutogoal,
          ).length || (pPerf.gol || 0);

        const autogolCount =
          eventi.filter(
            (eg: any) =>
              (eg.idAssegnato === pPerf.id || eg.nome === pPerf.nome) &&
              eg.isAutogoal,
          ).length || (pPerf.autogol || 0);

        const assistCount =
          eventi.filter(
            (eg: any) =>
              eg.assistId === pPerf.id ||
              (!eg.assistId && eg.assistNome && eg.assistNome === pPerf.nome),
          ).length || (pPerf.assist || 0);

        const netGoals = Math.max(0, golCount - autogolCount);
        const contributionBonus = Math.min(
          4,
          Math.floor(netGoals * mCfg.pesoGolMmr + assistCount * mCfg.pesoAssistMmr),
        );

        // 5. Streak Bonus Moderato (On Fire >= 3V / In Crisi >= 3L):
        let streakBonus = 0;
        const streakBefore = stats.form.currentStreak;
        let prospectiveStreak = 0;
        if (won) {
          prospectiveStreak = streakBefore >= 0 ? streakBefore + 1 : 1;
          if (prospectiveStreak === 3) streakBonus = 4;
          else if (prospectiveStreak === 4) streakBonus = 6;
          else if (prospectiveStreak >= 5) streakBonus = 8;
        } else if (!won && !draw) {
          prospectiveStreak = streakBefore <= 0 ? streakBefore - 1 : -1;
          if (prospectiveStreak === -3) streakBonus = -4;
          else if (prospectiveStreak === -4) streakBonus = -6;
          else if (prospectiveStreak <= -5) streakBonus = -8;
        }

        // 5b. Bonus / Malus Portiere (solo per match con rotazione portieri tracciata)
        let gkBonus = 0;
        if (match.rotazionePortieri) {
          const gkMatch = StatsEngineService.calculateGoalkeeperStatsForMatch(
            pPerf.id,
            match,
            team,
          );
          if (gkMatch.turniGiocati > 0) {
            if (gkMatch.golSubiti === 0) {
              gkBonus = Math.min(5, 2 + gkMatch.cleanSheetTurni);
            } else if (gkMatch.golSubiti === 1) {
              gkBonus = 0;
            } else if (gkMatch.golSubiti === 2) {
              gkBonus = -1;
            } else if (gkMatch.golSubiti >= 3) {
              gkBonus = Math.max(-5, -2 - (gkMatch.golSubiti - 2));
            }
            if (gkMatch.parateIncredibili > 0) {
              gkBonus += gkMatch.parateIncredibili * (mCfg.bonusParataIncredibile ?? 1.0);
            }
          }
        }

        // Delta Grezzo prima del freno d'élite e del clamp
        let rawDelta =
          baseTeamDelta +
          movBonus +
          ratingBonus +
          contributionBonus +
          streakBonus +
          gkBonus;

        // 6. Freno d'Élite / Diminishing Returns ad Alto MMR:
        let eliteBrakeApplied = 0;
        if (mmrBefore >= 1200 && rawDelta > 0) {
          const before = rawDelta;
          rawDelta = Math.round(rawDelta * 0.75);
          eliteBrakeApplied = rawDelta - before;
        } else if (mmrBefore >= 1250 && rawDelta < 0) {
          const before = rawDelta;
          rawDelta = Math.round(rawDelta * 1.15);
          eliteBrakeApplied = rawDelta - before;
        }

        // 7. Hard Clamp Finale sul Singolo Match & Regola B (Piazzamento a 1 match):
        let totalDelta: number;
        let isPlacement = false;
        if (matchesPlayedBefore === 0) {
          isPlacement = true;
          const amplified = Math.round(rawDelta * mCfg.placementMultiplier);
          totalDelta = Math.max(
            PLACEMENT_CLAMP_MIN,
            Math.min(PLACEMENT_CLAMP_MAX, amplified),
          );
        } else {
          totalDelta = Math.max(
            HARD_CLAMP_MIN,
            Math.min(mCfg.hardClampMax, Math.round(rawDelta)),
          );
        }

        const mmrAfter = Math.max(100, mmrBefore + totalDelta);

        // Aggiorna metriche del giocatore
        stats.isRanked = true;
        stats.currentMmr = mmrAfter;
        if (matchesPlayedBefore === 0) {
          stats.peakMmr = mmrAfter;
          stats.lowestMmr = mmrAfter;
        } else {
          stats.peakMmr = Math.max(stats.peakMmr, mmrAfter);
          stats.lowestMmr = Math.min(stats.lowestMmr, mmrAfter);
        }
        stats.tier = getMmrTier(mmrAfter);
        stats.partiteGiocate++;
        stats.consecutiveMissedMatches = 0;

        const matchResultChar: 'W' | 'D' | 'L' = won ? 'W' : draw ? 'D' : 'L';
        if (won) stats.wins++;
        else if (draw) stats.draws++;
        else stats.losses++;

        stats.winRate =
          stats.partiteGiocate > 0
            ? Math.round((stats.wins / stats.partiteGiocate) * 1000) / 10
            : 0;

        // Aggiorna stato di forma
        const wasOnFire = stats.form.status === 'on_fire';
        StatsEngineService.updatePlayerStreak(stats.form, matchResultChar);
        const isOnFireAfter = stats.form.status === 'on_fire';
        const streakAfter = stats.form.currentStreak;

        let onFireTransition: 'entered' | 'exited' | 'maintained' | 'none' = 'none';
        if (!wasOnFire && isOnFireAfter) onFireTransition = 'entered';
        else if (wasOnFire && !isOnFireAfter) onFireTransition = 'exited';
        else if (wasOnFire && isOnFireAfter) onFireTransition = 'maintained';

        // Registra storico match
        const deltaRecord: MatchMmrDelta = {
          partitaId: matchId,
          data: dataStr,
          stagione: season,
          team,
          result: matchResultChar,
          teamScore,
          opponentScore,
          teamAvgMmrBefore: Math.round(teamAvgBefore),
          opponentAvgMmrBefore: Math.round(opponentAvgBefore),
          winProbability: winProb,
          mmrBefore,
          mmrAfter,
          delta: totalDelta,
          baseTeamDelta: Math.round(baseTeamDelta),
          goalDiffMultiplier: 1.0,
          individualBonus: {
            presenceBonus: 0,
            goalsBonus: golCount,
            assistsBonus: assistCount,
            voteBonus: ratingBonus,
            ratingBonus,
            contributionBonus,
            movBonus,
            mvpBonus: pPerf.id === mvpPlayerId ? 1 : 0,
            streakBonus,
            eliteBrakeApplied,
            placementMultiplierApplied: isPlacement,
            total: Math.round(
              (ratingBonus +
                contributionBonus +
                streakBonus +
                movBonus +
                eliteBrakeApplied) *
              10,
            ) / 10,
          },
          streakBefore,
          streakAfter,
          onFireTransition,
        };
        stats.history.push(deltaRecord);
      };

      for (const p of teamAPlayers) {
        processPlayer(
          p,
          'A',
          teamDeltaA,
          movBonusA,
          expectedA,
          avgMmrA,
          avgMmrB,
          scoreA,
          scoreB,
          aWon,
          isDraw,
        );
      }

      for (const p of teamBPlayers) {
        processPlayer(
          p,
          'B',
          teamDeltaB,
          movBonusB,
          expectedB,
          avgMmrB,
          avgMmrA,
          scoreB,
          scoreA,
          bWon,
          isDraw,
        );
      }
    }

    // Gatekeeper Fenomeno (Challenger LoL): applicato a fine simulazione
    applyFenomenoGatekeeper(
      Array.from(statsMap.values()),
      matches.length,
      isAllTime,
    );

    return { playerStats: statsMap, predictions };
  }

  /**
   * Aggiorna la striscia di risultati e lo stato di forma (On Fire / In Crisi)
   */
  private static updatePlayerStreak(
    form: PlayerFormStreak,
    result: 'W' | 'D' | 'L',
  ): void {
    if (result === 'W') {
      if (form.currentStreak >= 0) form.currentStreak++;
      else form.currentStreak = 1;
    } else if (result === 'L') {
      if (form.currentStreak <= 0) form.currentStreak--;
      else form.currentStreak = -1;
    } else {
      // Pareggio: azzera la serie attiva
      form.currentStreak = 0;
    }

    // Aggiorna record massimi
    if (form.currentStreak > form.bestWinStreak) {
      form.bestWinStreak = form.currentStreak;
    }
    if (form.currentStreak < form.worstLossStreak) {
      form.worstLossStreak = form.currentStreak;
    }

    // Calcola status On Fire 🔥 o In Crisi ❄️
    if (form.currentStreak >= 3) {
      form.status = 'on_fire';
      form.statusLabel = 'On Fire 🔥';
      form.emoji = '🔥';
      form.multiplier = 1.15;
    } else if (form.currentStreak <= -3) {
      form.status = 'in_crisis';
      form.statusLabel = 'In Crisi ❄️';
      form.emoji = '❄️';
      form.multiplier = 1.0;
    } else {
      form.status = 'neutral';
      form.statusLabel = 'Costante';
      form.emoji = '➖';
      form.multiplier = 1.0;
    }

    // Ultime 5 partite (con la più recente in prima posizione)
    form.recentForm.unshift(result);
    if (form.recentForm.length > 5) {
      form.recentForm.pop();
    }
  }

  /**
   * Calcolo della Chimica di Coppia (Sinergie e Nemesi) per tutti i giocatori
   */
  private static calculatePairChemistry(
    matches: Partita[],
    playerMetadata: Map<string, Giocatore>,
    minMatches: number = MIN_MATCHES_CHEMISTRY,
    playerDeltasByMatch?: Map<string, number>,
  ): Map<string, PlayerChemistryProfile> {
    // Mappa: `p1_id` -> { together: Map<p2_id, stats>, against: Map<p2_id, stats> }
    const rawPairs = new Map<
      string,
      {
        together: Map<
          string,
          {
            matches: number;
            wins: number;
            draws: number;
            losses: number;
            assistedGoals: number;
            totalMmrDelta?: number;
          }
        >;
        against: Map<
          string,
          { matches: number; wins: number; draws: number; losses: number }
        >;
      }
    >();

    const getPairEntry = (playerId: string) => {
      if (!rawPairs.has(playerId)) {
        rawPairs.set(playerId, {
          together: new Map(),
          against: new Map(),
        });
      }
      return rawPairs.get(playerId)!;
    };

    for (const match of matches) {
      const matchId = match.id || '';
      const teamAPlayerIds = (match.teamA || [])
        .map((p) => p.id)
        .filter((id): id is string => !!id);
      const teamBPlayerIds = (match.teamB || [])
        .map((p) => p.id)
        .filter((id): id is string => !!id);

      const scoreA = Number(match.scoreA);
      const scoreB = Number(match.scoreB);
      const aWon = scoreA > scoreB;
      const bWon = scoreB > scoreA;
      const isDraw = scoreA === scoreB;

      // 1. Coppie che hanno giocato INSIEME in Squadra A
      for (let i = 0; i < teamAPlayerIds.length; i++) {
        for (let j = 0; j < teamAPlayerIds.length; j++) {
          if (i === j) continue;
          const p1 = teamAPlayerIds[i];
          const p2 = teamAPlayerIds[j];
          const entry = getPairEntry(p1);
          if (!entry.together.has(p2)) {
            entry.together.set(p2, {
              matches: 0,
              wins: 0,
              draws: 0,
              losses: 0,
              assistedGoals: 0,
              totalMmrDelta: 0,
            });
          }
          const t = entry.together.get(p2)!;
          t.matches++;
          if (playerDeltasByMatch && matchId) {
            const d1 = playerDeltasByMatch.get(`${matchId}_${p1}`) ?? 0;
            t.totalMmrDelta = (t.totalMmrDelta || 0) + d1;
          }
          if (aWon) t.wins++;
          else if (isDraw) t.draws++;
          else t.losses++;
        }
      }

      // 2. Coppie che hanno giocato INSIEME in Squadra B
      for (let i = 0; i < teamBPlayerIds.length; i++) {
        for (let j = 0; j < teamBPlayerIds.length; j++) {
          if (i === j) continue;
          const p1 = teamBPlayerIds[i];
          const p2 = teamBPlayerIds[j];
          const entry = getPairEntry(p1);
          if (!entry.together.has(p2)) {
            entry.together.set(p2, {
              matches: 0,
              wins: 0,
              draws: 0,
              losses: 0,
              assistedGoals: 0,
              totalMmrDelta: 0,
            });
          }
          const t = entry.together.get(p2)!;
          t.matches++;
          if (playerDeltasByMatch && matchId) {
            const d1 = playerDeltasByMatch.get(`${matchId}_${p1}`) ?? 0;
            t.totalMmrDelta = (t.totalMmrDelta || 0) + d1;
          }
          if (bWon) t.wins++;
          else if (isDraw) t.draws++;
          else t.losses++;
        }
      }

      // 3. Conteggio gol con assist tra compagni di squadra (Gemelli del Gol)
      const eventi = match.eventiGol || [];
      for (const eg of eventi) {
        if (!eg.isAutogoal && eg.idAssegnato && eg.assistId && eg.idAssegnato !== eg.assistId) {
          const entry1 = getPairEntry(eg.idAssegnato);
          if (entry1.together.has(eg.assistId)) {
            const t1 = entry1.together.get(eg.assistId)!;
            t1.assistedGoals = (t1.assistedGoals || 0) + 1;
          }
          const entry2 = getPairEntry(eg.assistId);
          if (entry2.together.has(eg.idAssegnato)) {
            const t2 = entry2.together.get(eg.idAssegnato)!;
            t2.assistedGoals = (t2.assistedGoals || 0) + 1;
          }
        }
      }

      // 4. Giocatori che hanno giocato CONTRO (A contro B)
      for (const p1 of teamAPlayerIds) {
        for (const p2 of teamBPlayerIds) {
          const entry1 = getPairEntry(p1);
          if (!entry1.against.has(p2)) {
            entry1.against.set(p2, {
              matches: 0,
              wins: 0,
              draws: 0,
              losses: 0,
            });
          }
          const ag1 = entry1.against.get(p2)!;
          ag1.matches++;
          if (aWon) ag1.wins++;
          else if (isDraw) ag1.draws++;
          else ag1.losses++;

          const entry2 = getPairEntry(p2);
          if (!entry2.against.has(p1)) {
            entry2.against.set(p1, {
              matches: 0,
              wins: 0,
              draws: 0,
              losses: 0,
            });
          }
          const ag2 = entry2.against.get(p1)!;
          ag2.matches++;
          if (bWon) ag2.wins++;
          else if (isDraw) ag2.draws++;
          else ag2.losses++;
        }
      }
    }

    // Costruzione profili chimica arricchiti con nomi e foto
    const chemistryProfiles = new Map<string, PlayerChemistryProfile>();

    for (const [playerId, pairData] of rawPairs.entries()) {
      const meta = playerMetadata.get(playerId);
      const nome = meta?.nome || 'Sconosciuto';

      // Sinergie
      const allSynergies: PlayerSynergy[] = [];
      for (const [partnerId, t] of pairData.together.entries()) {
        const pMeta = playerMetadata.get(partnerId);
        const winRate =
          t.matches > 0 ? Math.round((t.wins / t.matches) * 1000) / 10 : 0;
        const avgMmrDeltaTogether =
          t.matches > 0
            ? Math.round(((t.totalMmrDelta || 0) / t.matches) * 10) / 10
            : 0;

        allSynergies.push({
          playerId,
          partnerId,
          partnerNome: pMeta?.nome || 'Sconosciuto',
          partnerSoprannome: pMeta?.soprannome || pMeta?.soprannomeAi,
          partnerFotoUrl: getAvatarUrl(pMeta?.fotoUrl),
          matchesTogether: t.matches,
          winsTogether: t.wins,
          drawsTogether: t.draws,
          lossesTogether: t.losses,
          winRateTogether: winRate,
          assistedGoals: t.assistedGoals || 0,
          avgMmrDeltaTogether,
        });
      }

      // Nemesi
      const allNemesis: PlayerNemesis[] = [];
      for (const [oppId, ag] of pairData.against.entries()) {
        const oMeta = playerMetadata.get(oppId);
        const winRateAgainst =
          ag.matches > 0 ? Math.round((ag.wins / ag.matches) * 1000) / 10 : 0;
        const oppWinRate =
          ag.matches > 0
            ? Math.round((ag.losses / ag.matches) * 1000) / 10
            : 0;
        allNemesis.push({
          playerId,
          opponentId: oppId,
          opponentNome: oMeta?.nome || 'Sconosciuto',
          opponentSoprannome: oMeta?.soprannome || oMeta?.soprannomeAi,
          opponentFotoUrl: getAvatarUrl(oMeta?.fotoUrl),
          matchesAgainst: ag.matches,
          winsAgainst: ag.wins,
          drawsAgainst: ag.draws,
          lossesAgainst: ag.losses,
          winRateAgainst,
          opponentWinRate: oppWinRate,
        });
      }

      // Filtra per minimo partite per trovare i titoli più affidabili
      const qualifiedSynergies = allSynergies.filter(
        (s) => s.matchesTogether >= minMatches,
      );
      const qualifiedNemesis = allNemesis.filter(
        (n) => n.matchesAgainst >= minMatches,
      );

      // Gemello del Gol 🤝 (Miglior sinergia: pondera winRateTogether e intesa gol/assist combinati)
      const sortedSynergiesDesc = [
        ...(qualifiedSynergies.length > 0 ? qualifiedSynergies : allSynergies),
      ].sort((a, b) => {
        const scoreA = a.winRateTogether + (a.assistedGoals || 0) * 5;
        const scoreB = b.winRateTogether + (b.assistedGoals || 0) * 5;
        if (scoreB !== scoreA) return scoreB - scoreA;
        if (b.winRateTogether !== a.winRateTogether)
          return b.winRateTogether - a.winRateTogether;
        return b.matchesTogether - a.matchesTogether;
      });
      const bestPartner = sortedSynergiesDesc[0] || null;

      // Incubo di Coppia 💔 (Peggior sinergia: minor winRateTogether)
      const sortedSynergiesAsc = [...(qualifiedSynergies.length > 0 ? qualifiedSynergies : allSynergies)].sort(
        (a, b) =>
          a.winRateTogether - b.winRateTogether ||
          b.matchesTogether - a.matchesTogether,
      );
      const worstPartner =
        sortedSynergiesAsc.length > 1 ? sortedSynergiesAsc[0] : null;

      // Bestia Nera 😈 (Nemesi peggiore: massimo opponentWinRate, poi partite giocate)
      const sortedNemesisDesc = [...(qualifiedNemesis.length > 0 ? qualifiedNemesis : allNemesis)].sort(
        (a, b) =>
          b.opponentWinRate - a.opponentWinRate ||
          b.matchesAgainst - a.matchesAgainst,
      );
      const biggestNemesis = sortedNemesisDesc[0] || null;

      // Vittima Preferita 🎯 (Avversario più battuto: massimo winRateAgainst)
      const sortedVictimsDesc = [...(qualifiedNemesis.length > 0 ? qualifiedNemesis : allNemesis)].sort(
        (a, b) =>
          b.winRateAgainst - a.winRateAgainst ||
          b.matchesAgainst - a.matchesAgainst,
      );
      const favoriteVictim = sortedVictimsDesc[0] || null;

      chemistryProfiles.set(playerId, {
        playerId,
        nome,
        bestPartner,
        worstPartner,
        biggestNemesis,
        favoriteVictim,
        allSynergies: sortedSynergiesDesc,
        allNemesis: sortedNemesisDesc,
      });
    }

    return chemistryProfiles;
  }
}
