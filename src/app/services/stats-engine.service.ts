import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { Firestore, collection, collectionData } from '@angular/fire/firestore';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { Giocatore } from '../models/giocatore.model';
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
  MatchReportData,
  MatchReportPlayer,
  MatchReportChemistryItem,
} from '../models/mmr.model';
import {
  ALL_SEASONS,
  CURRENT_SEASON,
  getStagionePartita,
  parseDate,
} from '../utils/season-utils';

export const BASE_INITIAL_MMR = 1000;
export const K_FACTOR = 32;
export const MIN_MATCHES_CHEMISTRY = 2;

@Injectable({
  providedIn: 'root',
})
export class StatsEngineService {
  private firestore: Firestore | null = null;

  // Dati reattivi da Firestore (attivi nel contesto Angular con injection)
  readonly giocatoriRaw: Signal<Giocatore[]>;
  readonly partiteRaw: Signal<Partita[]>;
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
          collectionData(collection(this.firestore, 'giocatori'), {
            idField: 'id',
          }) as Observable<Giocatore[]>,
          { initialValue: [] },
        )
      : signal<Giocatore[]>([]);

    this.partiteRaw = this.firestore
      ? toSignal<Partita[], Partita[]>(
          collectionData(collection(this.firestore, 'partite'), {
            idField: 'id',
          }) as Observable<Partita[]>,
          { initialValue: [] },
        )
      : signal<Partita[]>([]);

    this.statsResult = computed<MmrCalculationResult>(() => {
      const giocatori = this.giocatoriRaw() || [];
      const partite = this.partiteRaw() || [];
      return StatsEngineService.calculateAllStats(giocatori, partite);
    });

    this.allTimeLeaderboard = computed<PlayerMmrStats[]>(() => {
      const res = this.statsResult();
      return Array.from(res.allTime.values()).sort(
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
      const deltaObj = pStats?.history.find((h) => h.partitaId === matchId);

      const mmrBefore = deltaObj
        ? deltaObj.mmrBefore
        : (pStats?.currentMmr ?? BASE_INITIAL_MMR);

      // Se il match non è ancora nello storico simulato, stimiamo il delta con la formula base
      let mmrDelta = 0;
      if (deltaObj) {
        mmrDelta = deltaObj.delta;
      } else {
        const goalDiff = Math.abs(scoreA - scoreB);
        let goalDiffMultiplier = 1.0;
        if (goalDiff === 2) goalDiffMultiplier = 1.1;
        else if (goalDiff === 3) goalDiffMultiplier = 1.25;
        else if (goalDiff >= 4) goalDiffMultiplier = Math.min(1.75, 1.35 + (goalDiff - 4) * 0.05);

        const myProb = team === 'A' ? odds.probA : odds.probB;
        const actual = won ? 1.0 : draw ? 0.5 : 0.0;
        const baseDelta = K_FACTOR * (actual - myProb) * goalDiffMultiplier;
        mmrDelta = Math.round(baseDelta);
      }

      const mmrAfter = deltaObj ? deltaObj.mmrAfter : Math.max(100, mmrBefore + mmrDelta);

      // Punti Legacy: +2 presenza, +2 vittoria / +1 pareggio, +1 per gol, -1 per autogol, +voto
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

      const votoNum = Number(p.voto) || 0;
      const resultPoints = won ? 2 : draw ? 1 : 0;
      const legacyDelta =
        Math.round((2 + resultPoints + golCount - autogolCount + votoNum) * 10) /
        10;

      const onFireTransition =
        deltaObj?.onFireTransition ??
        (pStats?.form?.status === 'on_fire' ? 'maintained' : 'none');
      const streakAfter = deltaObj?.streakAfter ?? (pStats?.form?.currentStreak ?? 0);

      return {
        id: p.id,
        nome: p.nome || 'Sconosciuto',
        soprannome: p.soprannome || pStats?.soprannome,
        fotoUrl: p.fotoUrl || pStats?.fotoUrl,
        team,
        voto:
          p.voto !== undefined && p.voto !== null && !isNaN(Number(p.voto)) && Number(p.voto) > 0
            ? Number(p.voto)
            : undefined,
        note: (p.note || '').trim(),
        gol: golCount,
        autogol: autogolCount,
        mmrDelta,
        mmrBefore,
        mmrAfter,
        legacyDelta,
        onFireTransition,
        streakAfter,
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
  ): MmrCalculationResult {
    return StatsEngineService.calculateAllStats(giocatori, partite);
  }

  static calculateAllStats(
    giocatori: Giocatore[],
    partite: Partita[],
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

    // 4. Simulazione All-Time
    const allTimeResult = StatsEngineService.simulateMmrHistory(
      sortedMatches,
      playerMetadata,
    );

    // 5. Simulazione per singola Stagione
    const matchesBySeason = new Map<string, Partita[]>();
    for (const match of sortedMatches) {
      const season = getStagionePartita(match);
      if (!matchesBySeason.has(season)) {
        matchesBySeason.set(season, []);
      }
      matchesBySeason.get(season)!.push(match);
    }

    const bySeasonResult = new Map<string, Map<string, PlayerMmrStats>>();
    for (const [season, seasonMatches] of matchesBySeason.entries()) {
      const sim = StatsEngineService.simulateMmrHistory(
        seasonMatches,
        playerMetadata,
      );
      bySeasonResult.set(season, sim.playerStats);
    }

    // 6. Calcolo Chimica di Coppia (Sinergie e Nemesi)
    const chemistry = StatsEngineService.calculatePairChemistry(
      sortedMatches,
      playerMetadata,
      MIN_MATCHES_CHEMISTRY,
    );

    return {
      allTime: allTimeResult.playerStats,
      bySeason: bySeasonResult,
      chemistry,
      matchPredictions: allTimeResult.predictions,
    };
  }

  /**
   * Simulatore cronologico step-by-step
   */
  private static simulateMmrHistory(

    matches: Partita[],
    playerMetadata: Map<string, Giocatore>,
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
        statsMap.set(id, {
          giocatoreId: id,
          nome: meta?.nome || 'Sconosciuto',
          soprannome: meta?.soprannome,
          fotoUrl: meta?.fotoUrl,
          currentMmr: BASE_INITIAL_MMR,
          peakMmr: BASE_INITIAL_MMR,
          lowestMmr: BASE_INITIAL_MMR,
          tier: getMmrTier(BASE_INITIAL_MMR),
          partiteGiocate: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          winRate: 0,
          form,
          history: [],
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
      const dataStr =
        match.dataPartita ||
        parseDate(match.dataOra)?.toISOString().split('T')[0] ||
        '';

      const teamAPlayers = match.teamA.filter((p) => p && p.id);
      const teamBPlayers = match.teamB.filter((p) => p && p.id);

      if (teamAPlayers.length === 0 || teamBPlayers.length === 0) continue;

      // 1. MMR medio delle due squadre PRIMA del match
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

      // 2. Probabilità di vittoria (Odds ELO)
      const prediction = StatsEngineService.calculateOdds(avgMmrA, avgMmrB);
      predictions.set(matchId, prediction);

      const probA = prediction.probA;
      const probB = prediction.probB;

      // 3. Risultato effettivo
      const scoreA = Number(match.scoreA);
      const scoreB = Number(match.scoreB);
      const aWon = scoreA > scoreB;
      const bWon = scoreB > scoreA;
      const isDraw = scoreA === scoreB;

      const actualA = aWon ? 1.0 : isDraw ? 0.5 : 0.0;
      const actualB = bWon ? 1.0 : isDraw ? 0.5 : 0.0;

      // 4. Moltiplicatore scarto gol ampio (World Chess / FIFA goal diff scale)
      const goalDiff = Math.abs(scoreA - scoreB);
      let goalDiffMultiplier = 1.0;
      if (goalDiff === 2) goalDiffMultiplier = 1.1;
      else if (goalDiff === 3) goalDiffMultiplier = 1.25;
      else if (goalDiff >= 4) {
        goalDiffMultiplier = Math.min(1.75, 1.35 + (goalDiff - 4) * 0.05);
      }

      // Delta base di squadra
      const baseTeamDeltaA = K_FACTOR * (actualA - probA);
      const baseTeamDeltaB = K_FACTOR * (actualB - probB);

      const teamDeltaA = baseTeamDeltaA * goalDiffMultiplier;
      const teamDeltaB = baseTeamDeltaB * goalDiffMultiplier;

      // 5. Trova l'MVP del match (voto più alto >= 7.0)
      const allPlayersInMatch = [...teamAPlayers, ...teamBPlayers];
      const validVotes = allPlayersInMatch
        .map((p) => Number(p.voto) || 0)
        .filter((v) => v >= 7.0);
      const maxVote = validVotes.length > 0 ? Math.max(...validVotes) : 0;

      // 6. Aggiorna ciascun giocatore di Team A e Team B
      const processPlayer = (
        pPerf: any,
        team: 'A' | 'B',
        teamDelta: number,
        baseTeamDelta: number,
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

        // Bonus / Malus individuale:
        // a) Voto
        const voto = Number(pPerf.voto) || 0;
        let voteBonus = 0;
        if (voto >= 8.0) voteBonus = 3.0;
        else if (voto >= 7.5) voteBonus = 2.0;
        else if (voto >= 7.0) voteBonus = 1.0;
        else if (voto > 0 && voto <= 5.0) voteBonus = -1.5;
        else if (voto > 0 && voto < 4.5) voteBonus = -3.0;

        // b) Gol & Autogol
        const eventi = match.eventiGol || [];
        const golCount = eventi.filter(
          (eg: any) => eg.idAssegnato === pPerf.id && !eg.isAutogoal,
        ).length;
        const autogolCount = eventi.filter(
          (eg: any) => eg.idAssegnato === pPerf.id && eg.isAutogoal,
        ).length;

        const goalsBonus = Math.min(3.0, golCount * 1.0) - autogolCount * 1.5;

        // c) MVP bonus
        const isMvp = voto > 0 && voto === maxVote && maxVote >= 7.0;
        const mvpBonus = isMvp ? 2.5 : 0;

        // d) Streak bonus / malus
        let streakBonus = 0;
        const wasOnFire = stats.form.status === 'on_fire';
        const wasInCrisis = stats.form.status === 'in_crisis';

        if (won && wasOnFire) {
          // Moltiplicatore 1.15 sul guadagno positivo di squadra per serie di vittorie
          if (teamDelta > 0) {
            streakBonus = teamDelta * 0.15;
          }
        } else if (won && wasInCrisis) {
          // Bonus riscatto per aver interrotto la serie negativa
          streakBonus = 2.0;
        }

        const individualBonusTotal =
          voteBonus + goalsBonus + mvpBonus + streakBonus;

        // Calcolo finale del delta MMR (arrotondato a intero)
        const totalDelta = Math.round(teamDelta + individualBonusTotal);
        const mmrAfter = Math.max(100, mmrBefore + totalDelta);

        // Aggiorna statistiche generali
        stats.currentMmr = mmrAfter;
        stats.peakMmr = Math.max(stats.peakMmr, mmrAfter);
        stats.lowestMmr = Math.min(stats.lowestMmr, mmrAfter);
        stats.tier = getMmrTier(mmrAfter);
        stats.partiteGiocate++;

        const matchResultChar: 'W' | 'D' | 'L' = won ? 'W' : draw ? 'D' : 'L';
        if (won) stats.wins++;
        else if (draw) stats.draws++;
        else stats.losses++;

        stats.winRate =
          stats.partiteGiocate > 0
            ? Math.round((stats.wins / stats.partiteGiocate) * 1000) / 10
            : 0;

        // Aggiorna Stato di Forma (Streak)
        const streakBefore = stats.form.currentStreak;
        StatsEngineService.updatePlayerStreak(stats.form, matchResultChar);
        const isOnFireAfter = stats.form.status === 'on_fire';
        const streakAfter = stats.form.currentStreak;

        let onFireTransition: 'entered' | 'exited' | 'maintained' | 'none' = 'none';
        if (!wasOnFire && isOnFireAfter) onFireTransition = 'entered';
        else if (wasOnFire && !isOnFireAfter) onFireTransition = 'exited';
        else if (wasOnFire && isOnFireAfter) onFireTransition = 'maintained';

        // Registra storico
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
          goalDiffMultiplier,
          individualBonus: {
            goalsBonus,
            voteBonus,
            mvpBonus,
            streakBonus: Math.round(streakBonus * 10) / 10,
            total: Math.round(individualBonusTotal * 10) / 10,
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
          baseTeamDeltaA,
          probA,
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
          baseTeamDeltaB,
          probB,
          avgMmrB,
          avgMmrA,
          scoreB,
          scoreA,
          bWon,
          isDraw,
        );
      }
    }

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
  ): Map<string, PlayerChemistryProfile> {
    // Mappa: `p1_id` -> { together: Map<p2_id, stats>, against: Map<p2_id, stats> }
    const rawPairs = new Map<
      string,
      {
        together: Map<
          string,
          { matches: number; wins: number; draws: number; losses: number }
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
            });
          }
          const t = entry.together.get(p2)!;
          t.matches++;
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
            });
          }
          const t = entry.together.get(p2)!;
          t.matches++;
          if (bWon) t.wins++;
          else if (isDraw) t.draws++;
          else t.losses++;
        }
      }

      // 3. Giocatori che hanno giocato CONTRO (A contro B)
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
        allSynergies.push({
          playerId,
          partnerId,
          partnerNome: pMeta?.nome || 'Sconosciuto',
          partnerSoprannome: pMeta?.soprannome,
          partnerFotoUrl: pMeta?.fotoUrl,
          matchesTogether: t.matches,
          winsTogether: t.wins,
          drawsTogether: t.draws,
          lossesTogether: t.losses,
          winRateTogether: winRate,
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
          opponentSoprannome: oMeta?.soprannome,
          opponentFotoUrl: oMeta?.fotoUrl,
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

      // Gemello del Gol 🤝 (Miglior sinergia: massimo winRateTogether, poi più partite giocate)
      const sortedSynergiesDesc = [...(qualifiedSynergies.length > 0 ? qualifiedSynergies : allSynergies)].sort(
        (a, b) =>
          b.winRateTogether - a.winRateTogether ||
          b.matchesTogether - a.matchesTogether,
      );
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
