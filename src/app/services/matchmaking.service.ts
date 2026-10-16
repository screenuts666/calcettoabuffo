import { Injectable, inject } from '@angular/core';
import { StatsEngineService, BASE_INITIAL_MMR } from './stats-engine.service';
import {
  MmrTier,
  PlayerChemistryProfile,
  PlayerFormStreak,
  getMmrTier,
} from '../models/mmr.model';
import { RuoloPreferito } from '../models/ruolo-preferito.enum';
import { Giocatore } from '../models/giocatore.model';
import { Partita } from '../models/partita.model';
import { getAvatarUrl } from '../utils/avatar-utils';
import { CURRENT_SEASON } from '../utils/season-utils';

export interface SynergyHighlight {
  player1Name: string;
  player2Name: string;
  player1Foto?: string;
  player2Foto?: string;
  team: 'A' | 'B';
  teamName: 'Bianchi' | 'Neri';
  matchesTogether: number;
  winRateTogether: number;
  winsTogether: number;
  description: string;
}

export interface MatchmakingProposal {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  icon: string;
  teamA: any[]; // Bianchi
  teamB: any[]; // Neri
  avgMmrA: number;
  avgMmrB: number;
  diffMmr: number;
  probA: number; // 0..100
  probB: number; // 0..100
  balancePercentageText: string;
  balanceScore: number; // 0..100 rating
  synergies: SynergyHighlight[];
  synergiesA: SynergyHighlight[];
  synergiesB: SynergyHighlight[];
  rolesA: { portieri: number; difensori: number; fasce: number; attaccanti: number };
  rolesB: { portieri: number; difensori: number; fasce: number; attaccanti: number };
  streakA: { onFire: number; inCrisis: number };
  streakB: { onFire: number; inCrisis: number };
  legacyAvgA: number;
  legacyAvgB: number;
}

interface EnrichedPlayer {
  id: string;
  nome: string;
  soprannome?: string;
  annoNascita?: string;
  peso?: string;
  altezza?: string;
  fotoUrl?: string;
  raw: any;
  mmr: number;
  tier: MmrTier;
  streak: number;
  formStatus: 'on_fire' | 'in_crisis' | 'neutral';
  effectiveMmr: number;
  legacyPunti: number;
  legacyAvg: number;
  ruolo: RuoloPreferito | string;
  isUnranked?: boolean;
  professione?: string;
  origini?: string;
  statoCivile?: string;
  vizi?: string;
}

interface PartitionEvaluation {
  teamA: EnrichedPlayer[];
  teamB: EnrichedPlayer[];
  avgMmrA: number;
  avgMmrB: number;
  diffMmr: number;
  probA: number;
  probB: number;
  probDiff: number;
  effectiveDiff: number;
  avgLegacyA: number;
  avgLegacyB: number;
  legacyDiff: number;
  gkA: number;
  gkB: number;
  defA: number;
  defB: number;
  attA: number;
  attB: number;
  fasceA: number;
  fasceB: number;
  rolePenalty: number;
  onFireA: number;
  onFireB: number;
  onFireDiff: number;
  synergiesA: SynergyHighlight[];
  synergiesB: SynergyHighlight[];
  synergyScoreA: number;
  synergyScoreB: number;
  synergyDiff: number;
  penaltyOverall: number;
  balanceScore: number;
}

@Injectable({
  providedIn: 'root',
})
export class MatchmakingService {
  private statsEngine = inject(StatsEngineService);

  /**
   * Genera le 2 o 3 migliori combinazioni equilibrate partendo dall'elenco dei giocatori convocati.
   */
  generateProposals(
    players: any[],
    targetSeason: string = CURRENT_SEASON,
  ): MatchmakingProposal[] {
    if (!players || players.length < 2) return [];

    const statsRes = this.statsEngine.statsResult();
    const giocatoriRaw = this.statsEngine.giocatoriRaw();
    const partiteRaw = this.statsEngine.partiteRaw();

    const legacyMap = this.computeLegacyStats(partiteRaw);
    const metaMap = new Map<string, Giocatore>();
    for (const g of giocatoriRaw) {
      if (g.id) metaMap.set(g.id, g);
    }

    const activeSeasonId = targetSeason || CURRENT_SEASON;
    const seasonMap =
      activeSeasonId && activeSeasonId !== 'Tutte'
        ? statsRes.bySeason.get(activeSeasonId)
        : null;

    // 1. Arricchimento dati giocatore (MMR, Forma, Legacy, Ruolo, Chimica)
    const enrichedPlayers: EnrichedPlayer[] = players.map((p) => {
      const meta = metaMap.get(p.id);
      const seasonStats = seasonMap?.get(p.id);
      const allTimeStats = statsRes.allTime.get(p.id);

      // Determinazione MMR:
      // Se il giocatore ha giocato almeno 1 partita nella stagione attiva, usa seasonStats.currentMmr.
      // Se ha 0 presenze nella stagione attiva, usa seasonStats.seasonStartMmr (seed calcolato col soft reset 35% o 1000).
      // Altrimenti fallback all-time o BASE_INITIAL_MMR (1000).
      let mmr = BASE_INITIAL_MMR;
      let isUnranked = false;

      if (seasonStats) {
        if (seasonStats.partiteGiocate > 0) {
          mmr = Math.round(seasonStats.currentMmr);
          isUnranked = false;
        } else {
          mmr = Math.round(seasonStats.seasonStartMmr ?? BASE_INITIAL_MMR);
          isUnranked = true;
        }
      } else if (allTimeStats) {
        if (allTimeStats.partiteGiocate > 0) {
          mmr = Math.round(allTimeStats.currentMmr);
          isUnranked = false;
        } else {
          mmr = Math.round(allTimeStats.seasonStartMmr ?? BASE_INITIAL_MMR);
          isUnranked = true;
        }
      } else {
        mmr = BASE_INITIAL_MMR;
        isUnranked = true;
      }

      const activeStats = seasonStats || allTimeStats;
      const tier = !isUnranked && activeStats ? activeStats.tier : getMmrTier(mmr);

      const legInfo = legacyMap.get(p.id);
      const legacyPunti = legInfo?.punti ?? (p.punti ?? meta?.punti ?? 0);
      const legacyAvg = legInfo?.mediaPunti ?? 0;

      const streak = activeStats?.form.currentStreak ?? 0;
      const formStatus = activeStats?.form.status ?? 'neutral';

      // Calcolo moltiplicatore di forma attiva
      let effectiveMmr = mmr;
      if (formStatus === 'on_fire') {
        const bonus = Math.min(streak, 4) * 0.02; // +2% a +8%
        effectiveMmr = Math.round(mmr * (1 + bonus));
      } else if (formStatus === 'in_crisis') {
        const malus = Math.min(Math.abs(streak), 4) * 0.02; // -2% a -8%
        effectiveMmr = Math.round(mmr * (1 - malus));
      }

      const ruolo =
        p.ruoloPreferito || meta?.ruoloPreferito || RuoloPreferito.Fascia;

      return {
        id: p.id,
        nome: p.nome || meta?.nome || 'Giocatore',
        soprannome: p.soprannome || meta?.soprannome,
        annoNascita: p.annoNascita || meta?.annoNascita,
        peso: p.peso || meta?.peso,
        altezza: p.altezza || meta?.altezza,
        fotoUrl: getAvatarUrl(p.fotoUrl || meta?.fotoUrl),
        professione: p.professione || meta?.professione,
        origini: p.origini || meta?.origini,
        statoCivile: p.statoCivile || meta?.statoCivile,
        vizi: p.vizi || meta?.vizi,
        raw: p,
        mmr,
        tier,
        streak,
        formStatus,
        effectiveMmr,
        legacyPunti,
        legacyAvg,
        ruolo,
        isUnranked,
      };
    });

    // 2. Generazione partizioni combinatorie (Team A e Team B)
    const partitions = this.getAllPartitions(enrichedPlayers);
    if (partitions.length === 0) return [];

    // 3. Valutazione e scoring di ogni partizione
    const evaluations: PartitionEvaluation[] = partitions.map(([teamA, teamB]) =>
      this.evaluatePartition(teamA, teamB, statsRes.chemistry),
    );

    // 4. Selezione di 2 o 3 proposte distinte e mirate
    return this.selectDiverseProposals(evaluations);
  }

  /**
   * Valuta l'equilibrio della combinazione considerando MMR, Forma, Ruoli, Legacy e Chimica.
   */
  private evaluatePartition(
    teamA: EnrichedPlayer[],
    teamB: EnrichedPlayer[],
    chemistryMap: Map<string, PlayerChemistryProfile>,
  ): PartitionEvaluation {
    const avgMmrA = Math.round(
      teamA.reduce((sum, p) => sum + p.mmr, 0) / (teamA.length || 1),
    );
    const avgMmrB = Math.round(
      teamB.reduce((sum, p) => sum + p.mmr, 0) / (teamB.length || 1),
    );
    const diffMmr = Math.abs(avgMmrA - avgMmrB);

    const odds = StatsEngineService.calculateOdds(avgMmrA, avgMmrB);
    const probA = odds.probAPercent;
    const probB = odds.probBPercent;
    const probDiff = Math.abs(probA - probB);

    const avgEffA =
      teamA.reduce((sum, p) => sum + p.effectiveMmr, 0) / (teamA.length || 1);
    const avgEffB =
      teamB.reduce((sum, p) => sum + p.effectiveMmr, 0) / (teamB.length || 1);
    const effectiveDiff = Math.abs(avgEffA - avgEffB);

    const avgLegacyA =
      Math.round(
        (teamA.reduce((sum, p) => sum + p.legacyAvg, 0) / (teamA.length || 1)) *
          10,
      ) / 10;
    const avgLegacyB =
      Math.round(
        (teamB.reduce((sum, p) => sum + p.legacyAvg, 0) / (teamB.length || 1)) *
          10,
      ) / 10;
    const legacyDiff = Math.abs(avgLegacyA - avgLegacyB);

    // Ruoli
    const gkA = teamA.filter((p) => p.ruolo === RuoloPreferito.Portiere).length;
    const gkB = teamB.filter((p) => p.ruolo === RuoloPreferito.Portiere).length;
    const totalGk = gkA + gkB;
    let gkPenalty = 0;
    if (totalGk >= 2 && (gkA === 0 || gkB === 0)) {
      gkPenalty = 600; // Entrambi i portieri nella stessa squadra = grave squilibrio
    } else if (Math.abs(gkA - gkB) > 1) {
      gkPenalty = 300;
    }

    const defA = teamA.filter((p) => p.ruolo === RuoloPreferito.Difensore).length;
    const defB = teamB.filter((p) => p.ruolo === RuoloPreferito.Difensore).length;
    const defDiff = Math.abs(defA - defB);

    const attA = teamA.filter((p) => p.ruolo === RuoloPreferito.Attaccante).length;
    const attB = teamB.filter((p) => p.ruolo === RuoloPreferito.Attaccante).length;
    const attDiff = Math.abs(attA - attB);

    const fasceA = teamA.filter((p) => p.ruolo === RuoloPreferito.Fascia).length;
    const fasceB = teamB.filter((p) => p.ruolo === RuoloPreferito.Fascia).length;
    const fasceDiff = Math.abs(fasceA - fasceB);

    const rolePenalty =
      gkPenalty + defDiff * 18 + attDiff * 18 + fasceDiff * 10;

    // Forma (Streak On Fire)
    const onFireA = teamA.filter((p) => p.formStatus === 'on_fire').length;
    const onFireB = teamB.filter((p) => p.formStatus === 'on_fire').length;
    const onFireDiff = Math.abs(onFireA - onFireB);

    // Chimica di Coppia (Sinergie nei rispettivi team)
    const {
      synergies: synergiesA,
      score: synergyScoreA,
      superPairsCount: superPairsA,
    } = this.extractTeamSynergies(teamA, 'A', 'Bianchi', chemistryMap);
    const {
      synergies: synergiesB,
      score: synergyScoreB,
      superPairsCount: superPairsB,
    } = this.extractTeamSynergies(teamB, 'B', 'Neri', chemistryMap);
    const synergyDiff = Math.abs(synergyScoreA - synergyScoreB);
    const superPairsSkew = Math.abs(superPairsA - superPairsB);

    // Peso 75% (Equilibrio MMR) + Peso 25% (Fattore Chimica)
    const mmrPenalty = diffMmr * 1.8 + probDiff * 2.2;
    const chemPenalty = synergyDiff * 0.45 + superPairsSkew * 35;

    // Punteggio di penalità combinato (più basso è, più la partita è bilanciata)
    const penaltyOverall =
      mmrPenalty * 0.75 +
      chemPenalty * 0.25 +
      rolePenalty +
      effectiveDiff * 0.35 +
      legacyDiff * 3 +
      onFireDiff * 8;

    // Percentuale di equilibrio (0..100%)
    let balanceScore = Math.round(
      100 -
        diffMmr * 1.2 * 0.75 -
        probDiff * 1.5 * 0.75 -
        chemPenalty * 0.25 * 0.15 -
        (gkPenalty > 0 ? 25 : 0) -
        defDiff * 2 -
        attDiff * 2,
    );
    balanceScore = Math.max(1, Math.min(100, balanceScore));

    return {
      teamA,
      teamB,
      avgMmrA,
      avgMmrB,
      diffMmr,
      probA,
      probB,
      probDiff,
      effectiveDiff,
      avgLegacyA,
      avgLegacyB,
      legacyDiff,
      gkA,
      gkB,
      defA,
      defB,
      attA,
      attB,
      fasceA,
      fasceB,
      rolePenalty,
      onFireA,
      onFireB,
      onFireDiff,
      synergiesA,
      synergiesB,
      synergyScoreA,
      synergyScoreB,
      synergyDiff,
      penaltyOverall,
      balanceScore,
    };
  }

  /**
   * Rileva le sinergie di coppia attive all'interno di una squadra.
   */
  private extractTeamSynergies(
    team: EnrichedPlayer[],
    teamKey: 'A' | 'B',
    teamName: 'Bianchi' | 'Neri',
    chemistryMap: Map<string, PlayerChemistryProfile>,
  ): { synergies: SynergyHighlight[]; score: number; superPairsCount: number } {
    const synergies: SynergyHighlight[] = [];
    let score = 0;
    let superPairsCount = 0;
    const handledPairs = new Set<string>();

    for (let i = 0; i < team.length; i++) {
      for (let j = i + 1; j < team.length; j++) {
        const p1 = team[i];
        const p2 = team[j];
        const pairKey = [p1.id, p2.id].sort().join('_');
        if (handledPairs.has(pairKey)) continue;
        handledPairs.add(pairKey);

        const profile1 = chemistryMap.get(p1.id);
        const syn = profile1?.allSynergies?.find((s) => s.partnerId === p2.id);

        if (syn && syn.matchesTogether >= 2) {
          if (syn.winRateTogether >= 75) {
            superPairsCount++;
          }
          if (syn.winRateTogether >= 60) {
            score +=
              (syn.winRateTogether - 50) * Math.min(syn.matchesTogether, 5);
            synergies.push({
              player1Name: p1.nome.split(' ')[0],
              player2Name: p2.nome.split(' ')[0],
              player1Foto: getAvatarUrl(p1.fotoUrl),
              player2Foto: getAvatarUrl(p2.fotoUrl),
              team: teamKey,
              teamName,
              matchesTogether: syn.matchesTogether,
              winRateTogether: syn.winRateTogether,
              winsTogether: syn.winsTogether,
              description: `${syn.winRateTogether}% vittorie insieme (${syn.winsTogether}V su ${syn.matchesTogether} partite)`,
            });
          } else if (syn.winRateTogether <= 35) {
            score -=
              (50 - syn.winRateTogether) * Math.min(syn.matchesTogether, 5);
          }
        }
      }
    }

    return { synergies, score, superPairsCount };
  }

  /**
   * Seleziona 2 o 3 proposte complementari e diversificate.
   */
  private selectDiverseProposals(
    evaluations: PartitionEvaluation[],
  ): MatchmakingProposal[] {
    // Ordina per miglior bilanciamento globale
    const sorted = [...evaluations].sort(
      (a, b) => a.penaltyOverall - b.penaltyOverall,
    );

    if (sorted.length === 0) return [];

    const proposals: MatchmakingProposal[] = [];

    // PROPOSTA 1: Miglior equilibrio matematico assoluto (Consigliata)
    const bestGlobal = sorted[0];
    proposals.push(
      this.buildProposal(
        'prop-1',
        '⭐ Bilanciamento Perfetto',
        'Massimo equilibrio probabilistico e di rating MMR',
        'Più Equilibrata',
        'sparkles',
        bestGlobal,
      ),
    );

    // PROPOSTA 2: Ricerca della combinazione che valorizza le migliori sinergie di coppia
    // (deve differire da Proposta 1 di almeno 2 giocatori)
    const candidateSynergies = sorted.find((e) => {
      const isDifferent = this.arePartitionsDistinct(
        bestGlobal.teamA,
        e.teamA,
        2,
      );
      const hasGoodSynergies = e.synergiesA.length + e.synergiesB.length > 0;
      const isStillCompetitive = e.probDiff <= 8;
      return isDifferent && hasGoodSynergies && isStillCompetitive;
    });

    if (candidateSynergies) {
      proposals.push(
        this.buildProposal(
          'prop-2',
          '🤝 Massima Chimica & Sinergie',
          'Valorizza le coppie affiatate mantenendo un ottimo equilibrio',
          'Gemelli del Gol',
          'people',
          candidateSynergies,
        ),
      );
    } else {
      // Alternativa se non ci sono sinergie sufficienti: 2° miglior opzione distinta
      const secondBest = sorted.find((e) =>
        this.arePartitionsDistinct(bestGlobal.teamA, e.teamA, 2),
      );
      if (secondBest) {
        proposals.push(
          this.buildProposal(
            'prop-2',
            '🔥 Forma & Competitività',
            'Ottima suddivisione dinamica dello stato di forma',
            'Alta Tensione',
            'flame',
            secondBest,
          ),
        );
      }
    }

    // PROPOSTA 3: Ricerca di una combinazione con simmetria tattica perfetta dei ruoli
    // (differente da Proposta 1 e 2 di almeno 2 giocatori)
    const existingTeamAs = proposals.map((p) => p.teamA);
    const candidateRoles = sorted.find((e) => {
      const isDistinctFromAll = existingTeamAs.every((prevA) =>
        this.arePartitionsDistinct(prevA, e.teamA, 2),
      );
      const hasStrictRoles =
        e.rolePenalty <= 20 && e.onFireDiff <= 1 && e.probDiff <= 10;
      return isDistinctFromAll && hasStrictRoles;
    });

    if (candidateRoles && proposals.length < 3) {
      proposals.push(
        this.buildProposal(
          'prop-3',
          '🛡️ Simmetria Ruoli & Tattica',
          'Assetto simmetrico tra portieri, difensori e attaccanti',
          'Equilibrio Tattico',
          'shield',
          candidateRoles,
        ),
      );
    } else if (proposals.length < 3) {
      // Terza opzione alternativa se ancora disponibile
      const thirdDistinct = sorted.find((e) =>
        existingTeamAs.every((prevA) =>
          this.arePartitionsDistinct(prevA, e.teamA, 2),
        ),
      );
      if (thirdDistinct) {
        proposals.push(
          this.buildProposal(
            'prop-3',
            '⚽ Sfida Dinamica',
            'Combinazione alternativa ad alto tasso di spettacolo',
            'Alternativa',
            'football',
            thirdDistinct,
          ),
        );
      }
    }

    return proposals;
  }

  /**
   * Converte un'Evaluation in un oggetto MatchmakingProposal per la UI.
   */
  private buildProposal(
    id: string,
    title: string,
    subtitle: string,
    badge: string,
    icon: string,
    evaluation: PartitionEvaluation,
  ): MatchmakingProposal {
    const rawTeamA = evaluation.teamA.map((p) => ({
      ...p.raw,
      mmr: p.mmr,
      tier: p.tier,
      streak: p.streak,
      formStatus: p.formStatus,
      effectiveMmr: p.effectiveMmr,
      ruoloPreferito: p.ruolo || p.raw?.ruoloPreferito,
      fotoUrl: p.fotoUrl || p.raw?.fotoUrl,
    }));
    const rawTeamB = evaluation.teamB.map((p) => ({
      ...p.raw,
      mmr: p.mmr,
      tier: p.tier,
      streak: p.streak,
      formStatus: p.formStatus,
      effectiveMmr: p.effectiveMmr,
      ruoloPreferito: p.ruolo || p.raw?.ruoloPreferito,
      fotoUrl: p.fotoUrl || p.raw?.fotoUrl,
    }));

    const synergies = [
      ...evaluation.synergiesA,
      ...evaluation.synergiesB,
    ];

    const balancePercentageText = `Bianchi ${evaluation.probA}% - ${evaluation.probB}% Neri`;

    return {
      id,
      title,
      subtitle,
      badge,
      icon,
      teamA: rawTeamA,
      teamB: rawTeamB,
      avgMmrA: evaluation.avgMmrA,
      avgMmrB: evaluation.avgMmrB,
      diffMmr: evaluation.diffMmr,
      probA: evaluation.probA,
      probB: evaluation.probB,
      balancePercentageText,
      balanceScore: evaluation.balanceScore,
      synergies,
      synergiesA: evaluation.synergiesA,
      synergiesB: evaluation.synergiesB,
      rolesA: {
        portieri: evaluation.gkA,
        difensori: evaluation.defA,
        fasce: evaluation.fasceA,
        attaccanti: evaluation.attA,
      },
      rolesB: {
        portieri: evaluation.gkB,
        difensori: evaluation.defB,
        fasce: evaluation.fasceB,
        attaccanti: evaluation.attB,
      },
      streakA: {
        onFire: evaluation.onFireA,
        inCrisis: evaluation.teamA.filter((p) => p.formStatus === 'in_crisis')
          .length,
      },
      streakB: {
        onFire: evaluation.onFireB,
        inCrisis: evaluation.teamB.filter((p) => p.formStatus === 'in_crisis')
          .length,
      },
      legacyAvgA: evaluation.avgLegacyA,
      legacyAvgB: evaluation.avgLegacyB,
    };
  }

  /**
   * Verifica se due formazioni differiscono per almeno minDiff giocatori.
   */
  private arePartitionsDistinct(
    teamA1: any[],
    teamA2: any[],
    minDiff: number = 2,
  ): boolean {
    const ids1 = new Set(teamA1.map((p) => p.id));
    const ids2 = new Set(teamA2.map((p) => p.id));
    let common = 0;
    for (const id of ids1) {
      if (ids2.has(id)) common++;
    }
    const diff = teamA1.length - common;
    return diff >= minDiff;
  }

  /**
   * Generatore esaustivo di combinazioni senza ripetizioni speculari.
   */
  private getAllPartitions<T extends { id: string }>(
    players: T[],
  ): [T[], T[]][] {
    const n = players.length;
    const sizeA = Math.ceil(n / 2);
    const partitions: [T[], T[]][] = [];

    // Fissiamo il primo giocatore sempre in Squadra A per evitare combinazioni speculari (A vs B = B vs A)
    const fixedFirst = players[0];
    const rest = players.slice(1);
    const neededFromRest = sizeA - 1;

    const backtrack = (startIndex: number, currentCombo: T[]) => {
      if (currentCombo.length === neededFromRest) {
        const teamA = [fixedFirst, ...currentCombo];
        const teamAIds = new Set(teamA.map((p) => p.id));
        const teamB = players.filter((p) => !teamAIds.has(p.id));
        partitions.push([teamA, teamB]);
        return;
      }

      const remainingSlots = neededFromRest - currentCombo.length;
      for (let i = startIndex; i <= rest.length - remainingSlots; i++) {
        currentCombo.push(rest[i]);
        backtrack(i + 1, currentCombo);
        currentCombo.pop();
      }
    };

    backtrack(0, []);
    return partitions;
  }

  /**
   * Calcolo storico dei punti legacy per partita (voti, gol, vittorie, presenze).
   */
  private computeLegacyStats(
    partite: Partita[],
  ): Map<string, { punti: number; partiteGiocate: number; mediaPunti: number }> {
    const map = new Map<
      string,
      { punti: number; partiteGiocate: number; mediaPunti: number }
    >();
    const partiteValide = (partite || []).filter(
      (p) =>
        p.pagelleInserite === true ||
        p.matchConcluso === true ||
        p.status === 'conclusa',
    );

    for (const p of partiteValide) {
      const scoreA = Number(p.scoreA) || 0;
      const scoreB = Number(p.scoreB) || 0;
      const eventi = p.eventiGol || [];

      const processPlayer = (
        pl: any,
        teamScore: number,
        oppScore: number,
      ) => {
        if (!pl?.id) return;
        if (!map.has(pl.id)) {
          map.set(pl.id, { punti: 0, partiteGiocate: 0, mediaPunti: 0 });
        }
        const stat = map.get(pl.id)!;
        stat.partiteGiocate++;
        stat.punti += 2; // Presenza
        if (teamScore > oppScore) stat.punti += 2; // Vittoria
        else if (teamScore === oppScore) stat.punti += 1; // Pareggio

        const gol = eventi.filter(
          (eg: any) => eg.idAssegnato === pl.id && !eg.isAutogoal,
        ).length;
        const autogol = eventi.filter(
          (eg: any) => eg.idAssegnato === pl.id && eg.isAutogoal,
        ).length;
        const assist =
          eventi.filter(
            (eg: any) =>
              eg.assistId === pl.id ||
              (!eg.assistId && eg.assistNome && eg.assistNome === pl.nome),
          ).length || (pl.assist || 0);

        stat.punti += gol * 1 - autogol * 1;
        stat.punti += assist * 0.5;
        stat.punti += Number(pl.voto) || 0;
      };

      (p.teamA || []).forEach((pl: any) => processPlayer(pl, scoreA, scoreB));
      (p.teamB || []).forEach((pl: any) => processPlayer(pl, scoreB, scoreA));
    }

    for (const stat of map.values()) {
      stat.mediaPunti =
        stat.partiteGiocate > 0
          ? Math.round((stat.punti / stat.partiteGiocate) * 10) / 10
          : 0;
    }

    return map;
  }
}
