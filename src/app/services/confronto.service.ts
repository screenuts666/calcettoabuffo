import { Injectable, computed, inject } from '@angular/core';
import { StatsEngineService, BASE_INITIAL_MMR } from './stats-engine.service';
import { Giocatore } from '../models/giocatore.model';
import { Partita } from '../models/partita.model';
import { getMmrTier, UNRANKED_TIER } from '../models/mmr.model';
import { ALL_SEASONS, getStagionePartita } from '../utils/season-utils';
import { getAvatarUrl } from '../utils/avatar-utils';
import {
  ComparisonMetric,
  DirectMatchItem,
  HeadToHeadComparison,
  PlayerComparisonProfile,
  TeammateMatchItem,
} from '../models/confronto.model';

@Injectable({
  providedIn: 'root',
})
export class ConfrontoService {
  private statsEngine = inject(StatsEngineService);

  readonly giocatori = this.statsEngine.giocatoriRaw;
  readonly partite = this.statsEngine.partiteRaw;
  readonly statsResult = this.statsEngine.statsResult;

  /**
   * Elenco rapido di tutti i giocatori ordinati per MMR discendente (per i selettori)
   */
  readonly giocatoriOrdinati = computed(() => {
    const list = this.giocatori() || [];
    const statsRes = this.statsResult();

    return [...list].sort((a, b) => {
      const mmrA = statsRes.allTime.get(a.id)?.currentMmr ?? BASE_INITIAL_MMR;
      const mmrB = statsRes.allTime.get(b.id)?.currentMmr ?? BASE_INITIAL_MMR;
      return mmrB - mmrA || (a.nome || '').localeCompare(b.nome || '');
    });
  });

  /**
   * Calcola la scheda comparativa 1v1 tra Giocatore A e Giocatore B
   */
  getComparison(
    playerAId: string,
    playerBId: string,
    season: string = ALL_SEASONS,
  ): HeadToHeadComparison | null {
    if (!playerAId || !playerBId) return null;

    const allGiocatori = this.giocatori() || [];
    const gA = allGiocatori.find((g) => g.id === playerAId);
    const gB = allGiocatori.find((g) => g.id === playerBId);

    if (!gA || !gB) return null;

    const allPartite = this.partite() || [];
    const validPartite = allPartite.filter(
      (p) =>
        p.pagelleInserite === true ||
        p.matchConcluso === true ||
        p.status === 'conclusa',
    );

    const partiteStagione =
      season === ALL_SEASONS
        ? validPartite
        : validPartite.filter((p) => getStagionePartita(p) === season);

    // 1. Profilo Giocatore A e B
    const profA = this.buildPlayerProfile(gA, partiteStagione, season);
    const profB = this.buildPlayerProfile(gB, partiteStagione, season);

    // 2. Scontri Diretti (Contro)
    const directMatches: DirectMatchItem[] = [];
    let vittorieA = 0;
    let pareggiContro = 0;
    let vittorieB = 0;

    // 3. Intesa di Coppia (Insieme)
    const teammateMatches: TeammateMatchItem[] = [];
    let vittorieInsieme = 0;
    let pareggiInsieme = 0;
    let sconfitteInsieme = 0;

    for (const p of partiteStagione) {
      const inTeamA1 = (p.teamA || []).find((pl: any) => pl.id === playerAId);
      const inTeamB1 = (p.teamB || []).find((pl: any) => pl.id === playerAId);

      const inTeamA2 = (p.teamA || []).find((pl: any) => pl.id === playerBId);
      const inTeamB2 = (p.teamB || []).find((pl: any) => pl.id === playerBId);

      const scoreA = Number(p.scoreA) || 0;
      const scoreB = Number(p.scoreB) || 0;

      // Conteggio gol del singolo giocatore nel match
      const eventi = p.eventiGol || [];
      const golA = eventi.filter(
        (eg: any) => eg.idAssegnato === playerAId && !eg.isAutogoal,
      ).length;
      const golB = eventi.filter(
        (eg: any) => eg.idAssegnato === playerBId && !eg.isAutogoal,
      ).length;

      // SCONTRI DIRETTI: Squadre opposte
      if ((inTeamA1 && inTeamB2) || (inTeamB1 && inTeamA2)) {
        let winner: 'A' | 'B' | 'D' = 'D';

        if (inTeamA1 && inTeamB2) {
          if (scoreA > scoreB) {
            winner = 'A';
            vittorieA++;
          } else if (scoreB > scoreA) {
            winner = 'B';
            vittorieB++;
          } else {
            winner = 'D';
            pareggiContro++;
          }
          directMatches.push({
            id: p.id || '',
            data: p.dataPartita || p.orario || '',
            scoreA,
            scoreB,
            teamOfPlayerA: 'A',
            teamOfPlayerB: 'B',
            winner,
            golA,
            golB,
          });
        } else {
          // Player A in Team B, Player B in Team A
          if (scoreB > scoreA) {
            winner = 'A';
            vittorieA++;
          } else if (scoreA > scoreB) {
            winner = 'B';
            vittorieB++;
          } else {
            winner = 'D';
            pareggiContro++;
          }
          directMatches.push({
            id: p.id || '',
            data: p.dataPartita || p.orario || '',
            scoreA,
            scoreB,
            teamOfPlayerA: 'B',
            teamOfPlayerB: 'A',
            winner,
            golA,
            golB,
          });
        }
      }

      // INTESA DI COPPIA: Stessa squadra
      if ((inTeamA1 && inTeamA2) || (inTeamB1 && inTeamB2)) {
        const teamScore = inTeamA1 ? scoreA : scoreB;
        const opponentScore = inTeamA1 ? scoreB : scoreA;
        let result: 'W' | 'D' | 'L' = 'D';

        if (teamScore > opponentScore) {
          result = 'W';
          vittorieInsieme++;
        } else if (teamScore === opponentScore) {
          result = 'D';
          pareggiInsieme++;
        } else {
          result = 'L';
          sconfitteInsieme++;
        }

        teammateMatches.push({
          id: p.id || '',
          data: p.dataPartita || p.orario || '',
          scoreTeam: teamScore,
          scoreOpponents: opponentScore,
          result,
          golA,
          golB,
        });
      }
    }

    // Calcolo bilancio Scontri Diretti
    const totContro = directMatches.length;
    const winRateControA =
      totContro > 0 ? Math.round((vittorieA / totContro) * 1000) / 10 : 0;
    const winRateControB =
      totContro > 0 ? Math.round((vittorieB / totContro) * 1000) / 10 : 0;

    let bestiaNeraWinner: 'A' | 'B' | 'PARITA' | 'NESSUNO' = 'NESSUNO';
    let bestiaNeraText = 'Nessuno scontro diretto disputato finora';

    if (totContro > 0) {
      if (vittorieA > vittorieB) {
        bestiaNeraWinner = 'A';
        const diff = vittorieA - vittorieB;
        bestiaNeraText = `${profA.nome} è la Bestia Nera di ${profB.nome} (+${diff} ${diff === 1 ? 'vittoria' : 'vittorie'})`;
      } else if (vittorieB > vittorieA) {
        bestiaNeraWinner = 'B';
        const diff = vittorieB - vittorieA;
        bestiaNeraText = `${profB.nome} è la Bestia Nera di ${profA.nome} (+${diff} ${diff === 1 ? 'vittoria' : 'vittorie'})`;
      } else {
        bestiaNeraWinner = 'PARITA';
        bestiaNeraText = `Perfetta parità negli scontri diretti (${vittorieA} vittorie a testa e ${pareggiContro} ${pareggiContro === 1 ? 'pareggio' : 'pareggi'})`;
      }
    }

    // Calcolo Intesa di Coppia
    const totInsieme = teammateMatches.length;
    const winRateInsieme =
      totInsieme > 0
        ? Math.round((vittorieInsieme / totInsieme) * 1000) / 10
        : 0;

    let affinitaLabel = 'Mai giocato insieme';
    let affinitaEmoji = '🤷‍♂️';

    if (totInsieme > 0) {
      if (winRateInsieme >= 70 && totInsieme >= 2) {
        affinitaLabel = 'Gemelli del Gol 🔥';
        affinitaEmoji = '🔥';
      } else if (winRateInsieme >= 50) {
        affinitaLabel = 'Coppia Affiatata 🤝';
        affinitaEmoji = '🤝';
      } else if (winRateInsieme >= 35) {
        affinitaLabel = 'Rendimento Altalenante ⚖️';
        affinitaEmoji = '⚖️';
      } else {
        affinitaLabel = 'Incubo di Coppia 💔';
        affinitaEmoji = '💔';
      }
    }

    // 4. Costruzione Metriche Comparative per Barre Visive
    const metrics: ComparisonMetric[] = [
      this.createMetric(
        'mmr',
        'MMR Rating Attuale',
        'shield',
        profA.isRanked ? profA.currentMmr : 0,
        profB.isRanked ? profB.currentMmr : 0,
        profA.isRanked ? `${profA.currentMmr}` : '—',
        profB.isRanked ? `${profB.currentMmr}` : '—',
      ),
      this.createMetric(
        'peakMmr',
        'Peak MMR Storico',
        'trophy',
        profA.isRanked ? profA.peakMmr : 0,
        profB.isRanked ? profB.peakMmr : 0,
        profA.isRanked ? `${profA.peakMmr}` : '—',
        profB.isRanked ? `${profB.peakMmr}` : '—',
      ),
      this.createMetric(
        'puntiLegacy',
        'Punteggio Classico Legacy',
        'medal',
        profA.puntiLegacy,
        profB.puntiLegacy,
        `${profA.puntiLegacy} pt`,
        `${profB.puntiLegacy} pt`,
      ),
      this.createMetric(
        'mediaVoto',
        'Media Voto Pagelle',
        'star',
        profA.mediaVoto,
        profB.mediaVoto,
        profA.mediaVoto > 0 ? profA.mediaVoto.toFixed(2) : '--',
        profB.mediaVoto > 0 ? profB.mediaVoto.toFixed(2) : '--',
      ),
      this.createMetric(
        'golTotali',
        'Gol Totali Segnati',
        'football',
        profA.golTotali,
        profB.golTotali,
        `${profA.golTotali}`,
        `${profB.golTotali}`,
      ),
      this.createMetric(
        'mediaGol',
        'Media Gol a Partita',
        'flame',
        profA.mediaGol,
        profB.mediaGol,
        profA.mediaGol.toFixed(2),
        profB.mediaGol.toFixed(2),
      ),
      this.createMetric(
        'assistTotali',
        'Assist Vincenti',
        'flash',
        profA.assistTotali,
        profB.assistTotali,
        `${profA.assistTotali} 👟`,
        `${profB.assistTotali} 👟`,
      ),
      this.createMetric(
        'mvp',
        'Premi MVP Conquistati',
        'ribbon',
        profA.mvpCount,
        profB.mvpCount,
        `${profA.mvpCount} 🏆`,
        `${profB.mvpCount} 🏆`,
      ),
      this.createMetric(
        'winRate',
        'Percentuale Vittorie',
        'trending-up',
        profA.winRate,
        profB.winRate,
        `${profA.winRate}%`,
        `${profB.winRate}%`,
      ),
      this.createMetric(
        'partite',
        'Partite Disputate',
        'people',
        profA.partiteGiocate,
        profB.partiteGiocate,
        `${profA.partiteGiocate}`,
        `${profB.partiteGiocate}`,
      ),
    ];

    return {
      playerA: profA,
      playerB: profB,
      scontriContro: {
        totalePartite: totContro,
        vittorieA,
        pareggi: pareggiContro,
        vittorieB,
        winRateA: winRateControA,
        winRateB: winRateControB,
        bestiaNeraText,
        bestiaNeraWinner,
        matches: directMatches.reverse(), // most recent first
      },
      intesaInsieme: {
        totalePartite: totInsieme,
        vittorie: vittorieInsieme,
        pareggi: pareggiInsieme,
        sconfitte: sconfitteInsieme,
        winRate: winRateInsieme,
        affinitaLabel,
        affinitaEmoji,
        matches: teammateMatches.reverse(),
      },
      metrics,
    };
  }

  /**
   * Costruisce il profilo statistico per un singolo giocatore
   */
  private buildPlayerProfile(
    g: Giocatore,
    partite: Partita[],
    season: string,
  ): PlayerComparisonProfile {
    const statsRes = this.statsEngine.statsResult();
    const mmrStats =
      season === ALL_SEASONS
        ? statsRes.allTime.get(g.id)
        : statsRes.bySeason.get(season)?.get(g.id) ||
          statsRes.allTime.get(g.id);

    const allTimeMmrStats = statsRes.allTime.get(g.id);
    const currentMmr = mmrStats ? Math.round(mmrStats.currentMmr) : BASE_INITIAL_MMR;
    const peakMmr = allTimeMmrStats
      ? Math.round(allTimeMmrStats.peakMmr)
      : currentMmr;
    const form = mmrStats?.form || {
      currentStreak: 0,
      status: 'neutral',
      statusLabel: 'Costante',
      emoji: '➖',
      multiplier: 1.0,
      bestWinStreak: 0,
      worstLossStreak: 0,
      recentForm: [],
    };

    let puntiLegacy = 0;
    let partiteGiocate = 0;
    let wins = 0;
    let draws = 0;
    let losses = 0;
    let golTotali = 0;
    let assistTotali = 0;
    let sommaVoti = 0;
    let partiteConVoto = 0;
    let mvpCount = 0;

    for (const p of partite) {
      const inTeamA = (p.teamA || []).find((pl: any) => pl.id === g.id);
      const inTeamB = (p.teamB || []).find((pl: any) => pl.id === g.id);
      const playerObj = inTeamA || inTeamB;

      if (playerObj) {
        partiteGiocate++;
        const scoreA = Number(p.scoreA) || 0;
        const scoreB = Number(p.scoreB) || 0;
        const won =
          (inTeamA && scoreA > scoreB) || (inTeamB && scoreB > scoreA);
        const draw = scoreA === scoreB;
        const lost = !won && !draw;

        puntiLegacy += 2; // Presenza
        if (won) {
          puntiLegacy += 2;
          wins++;
        } else if (draw) {
          puntiLegacy += 1;
          draws++;
        } else if (lost) {
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
        const assistFatti =
          eventi.filter(
            (eg: any) =>
              eg.assistId === g.id ||
              (!eg.assistId && eg.assistNome && eg.assistNome === g.nome),
          ).length || (playerObj.assist || 0);

        golTotali += golFatti;
        assistTotali += assistFatti;
        puntiLegacy += golFatti * 1;
        puntiLegacy -= autogolFatti * 1;
        puntiLegacy += assistFatti * 0.5;

        const voto = Number(playerObj.voto) || 0;
        if (voto > 0) {
          sommaVoti += voto;
          partiteConVoto++;
          puntiLegacy += voto;
        }

        // Calcolo MVP: voto più alto del match >= 7.0 (o maxVoto assoluto se > 0)
        const allVotes = [...(p.teamA || []), ...(p.teamB || [])]
          .map((pl: any) => Number(pl.voto) || 0)
          .filter((v) => v > 0);
        const maxVoteInMatch = allVotes.length > 0 ? Math.max(...allVotes) : 0;
        if (voto > 0 && voto === maxVoteInMatch && maxVoteInMatch >= 7.0) {
          mvpCount++;
        }
      }
    }

    puntiLegacy = Math.round(puntiLegacy * 10) / 10;
    const mediaVoto = partiteConVoto > 0 ? sommaVoti / partiteConVoto : 0;
    const mediaGol = partiteGiocate > 0 ? golTotali / partiteGiocate : 0;
    const mediaAssist = partiteGiocate > 0 ? assistTotali / partiteGiocate : 0;
    const winRate =
      partiteGiocate > 0
        ? Math.round((wins / partiteGiocate) * 1000) / 10
        : 0;

    const isRanked = partiteGiocate > 0;
    const tier = isRanked
      ? (mmrStats ? mmrStats.tier : getMmrTier(currentMmr))
      : UNRANKED_TIER;

    return {
      id: g.id,
      nome: g.nome,
      soprannome: g.soprannome,
      soprannomeAi: g.soprannomeAi,
      annoNascita: g.annoNascita,
      peso: g.peso,
      altezza: g.altezza,
      fotoUrl: getAvatarUrl(g.fotoUrl),
      piedePreferito: g.piedePreferito,
      ruoloPreferito: g.ruoloPreferito,
      professione: g.professione,
      origini: g.origini,
      statoCivile: g.statoCivile,
      vizi: g.vizi,
      currentMmr,
      peakMmr,
      tier,
      isRanked,
      form,
      puntiLegacy,
      partiteGiocate,
      wins,
      draws,
      losses,
      winRate,
      golTotali,
      mediaGol,
      assistTotali,
      mediaAssist,
      mediaVoto,
      partiteConVoto,
      mvpCount,
    };
  }

  /**
   * Genera la metrica comparativa con percentuali normalizzate per barre visive
   */
  private createMetric(
    id: string,
    label: string,
    icon: string,
    valA: number,
    valB: number,
    displayA: string,
    displayB: string,
  ): ComparisonMetric {
    let leader: 'A' | 'B' | 'TIE' = 'TIE';
    if (valA > valB) leader = 'A';
    else if (valB > valA) leader = 'B';

    let barPercentA = 50;
    let barPercentB = 50;

    const total = valA + valB;
    if (total > 0) {
      barPercentA = Math.round((valA / total) * 100);
      barPercentB = 100 - barPercentA;
    }

    return {
      id,
      label,
      icon,
      valA,
      valB,
      displayA,
      displayB,
      barPercentA,
      barPercentB,
      leader,
    };
  }
}
