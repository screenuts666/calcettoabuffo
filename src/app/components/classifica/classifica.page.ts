import {
  Component,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonList,
  IonItem,
  IonAvatar,
  IonLabel,
  ToastController,
  AlertController,
  IonIcon,
  IonButtons,
  IonButton,
} from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Firestore, collectionData } from '@angular/fire/firestore';
import { collection } from 'firebase/firestore';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';
import { PlayerAvatarComponent } from '../player-avatar/player-avatar.component';
import { addIcons } from 'ionicons';
import {
  flame,
  logoWhatsapp,
  trophy,
  football,
  people,
  star,
  sparkles,
  timeOutline,
  globeOutline,
  shareSocialOutline,
  shield,
  shieldOutline,
  medal,
  ribbon,
  diamond,
  arrowUp,
  arrowDown,
  remove,
  snow,
  heart,
  skull,
  flash,
  trendingUp,
  trendingDown,
  swapHorizontal,
  chevronForward,
  chevronDown,
  chevronUp,
  helpCircleOutline,
  informationCircleOutline,
  filter,
  closeCircle,
  shieldCheckmark,
} from 'ionicons/icons';
import { Giocatore, GiocatoreConPunti } from 'src/app/models/giocatore.model';
import { AuthService } from 'src/app/services/auth.service';
import { StatsEngineService, BASE_INITIAL_MMR } from 'src/app/services/stats-engine.service';
import {
  MmrTier,
  PlayerChemistryProfile,
  PlayerFormStreak,
  getMmrTier,
  MMR_TIERS,
  UNRANKED_TIER,
  PastSeasonBanner,
} from 'src/app/models/mmr.model';
import {
  CURRENT_SEASON,
  PREVIOUS_SEASON,
  ALL_SEASONS,
  getStagionePartita,
  getStagioniDisponibili,
} from 'src/app/utils/season-utils';
import {
  getAvatarUrl,
  handleAvatarError,
} from 'src/app/utils/avatar-utils';

export type CriterioOrdinamento =
  | 'punti'
  | 'mmr'
  | 'gol'
  | 'mediaVoto'
  | 'assist'
  | 'portieri'
  | 'wins'
  | 'presenze';

export interface CriterioOption {
  id: CriterioOrdinamento;
  label: string;
  icon: string;
  unit: string;
}

export const CRITERI_ORDINAMENTO: CriterioOption[] = [
  { id: 'punti', label: 'Punti', icon: 'trophy', unit: 'PUNTI' },
  { id: 'mmr', label: 'Rango MMR', icon: 'shield-outline', unit: 'MMR' },
  { id: 'gol', label: 'Gol', icon: 'football', unit: 'GOL' },
  { id: 'mediaVoto', label: 'Media Voto', icon: 'star', unit: 'MEDIA' },
  { id: 'assist', label: 'Assist', icon: 'flash', unit: 'ASSIST' },
  { id: 'portieri', label: 'Portieri 🧤', icon: 'shield-outline', unit: 'GOL/50m' },
  { id: 'wins', label: 'Vittorie', icon: 'flame', unit: 'VITTORIE' },
  { id: 'presenze', label: 'Presenze', icon: 'people', unit: 'PRESENZE' },
];
export { GiocatoreConPunti };

@Component({
  selector: 'app-classifica',
  templateUrl: 'classifica.page.html',
  styleUrls: ['classifica.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonAvatar,
    IonLabel,
    IonButtons,
    IonButton,
    IonIcon,
    ThemeToggleComponent,
    PlayerAvatarComponent,
  ],
})
export class ClassificaPage {
  private firestore: Firestore = inject(Firestore);
  private authService = inject(AuthService);
  private statsEngine = inject(StatsEngineService);
  private alertController = inject(AlertController);
  private toastController = inject(ToastController);
  private router = inject(Router);

  readonly CURRENT_SEASON = CURRENT_SEASON;
  readonly PREVIOUS_SEASON = PREVIOUS_SEASON;
  readonly ALL_SEASONS = ALL_SEASONS;
  readonly CRITERI_ORDINAMENTO = CRITERI_ORDINAMENTO;
  readonly MMR_TIERS = MMR_TIERS;

  // Vista attiva: classifica principale o sezione dedicata chimica & rivalità
  vistaSelezionata = signal<'classifica' | 'chimica'>('classifica');

  // Stagione e Criterio di ordinamento (Default: Punti Classici del campionato)
  stagioneSelezionata = signal<string>(CURRENT_SEASON);
  criterioOrdinamento = signal<CriterioOrdinamento>('punti');

  // Filtro rapido per Tier o Stato di Forma (cassetto collassabile mobile)
  filtroTierOForma = signal<string>('all');
  isFiltriOpen = signal<boolean>(false);

  toggleFiltri() {
    this.isFiltriOpen.update((v) => !v);
  }

  resetFiltro() {
    this.filtroTierOForma.set('all');
  }

  activeFilterLabel = computed<string | null>(() => {
    const f = this.filtroTierOForma();
    if (f === 'all') return null;
    if (f === 'on_fire') return '🔥 On Fire';
    if (f === 'in_crisis') return '❄️ In Crisi';
    const tier = this.MMR_TIERS.find((t) => t.id === f);
    return tier ? tier.badge : null;
  });

  // Toggle sezione Non Classificati (0 partite)
  mostraNonClassificati = signal<boolean>(false);

  toggleMostraNonClassificati() {
    this.mostraNonClassificati.update((v) => !v);
  }

  // Toggle Modal / Box Guida Ranghi & Regolamento MMR
  isGuidaRanghiOpen = signal<boolean>(false);

  toggleGuidaRanghi() {
    this.isGuidaRanghiOpen.update((v) => !v);
  }

  stagioniList = computed(() => {
    return getStagioniDisponibili(this.partiteRaw());
  });

  isAdmin = this.authService.isAdmin;

  getAvatar(fotoUrl?: string | null): string {
    return getAvatarUrl(fotoUrl);
  }

  onImgError(event: Event) {
    handleAvatarError(event);
  }

  giocatoriRaw = toSignal<Giocatore[], Giocatore[]>(
    (
      collectionData(collection(this.firestore, 'giocatori'), {
        idField: 'id',
      }) as Observable<Giocatore[]>
    ).pipe(catchError(() => of([] as Giocatore[]))),
    { initialValue: [] },
  );

  partiteRaw = toSignal<any[], any[]>(
    (
      collectionData(collection(this.firestore, 'partite'), {
        idField: 'id',
      }) as Observable<any[]>
    ).pipe(catchError(() => of([] as any[]))),
    { initialValue: [] },
  );

  /**
   * Classifica completa con Punti Legacy, Rango Tier, MMR, Trend e Forma
   */
  classificaCalcolata = computed<GiocatoreConPunti[]>(() => {
    const giocatori = this.giocatoriRaw() || [];
    const partite = this.partiteRaw() || [];
    const statsRes = this.statsEngine.statsResult();
    const stagione = this.stagioneSelezionata();

    const partiteValide = partite.filter((p) => p['pagelleInserite'] === true);

    const partiteStagione =
      stagione === ALL_SEASONS
        ? partiteValide
        : partiteValide.filter((p) => getStagionePartita(p) === stagione);

    // Mappa calcolo per ciascun giocatore
    const calcolata = giocatori.map((g) => {
      let punti = 0;
      let golTotali = 0;
      let assistTotali = 0;
      let sommaVoti = 0;
      let partiteGiocate = 0;
      let wins = 0;
      let draws = 0;
      let losses = 0;

      // 1. Calcolo Punteggio Legacy (+0.5 per assist)
      partiteStagione.forEach((p: any) => {
        const inTeamA = p.teamA?.find((pl: any) => pl.id === g.id);
        const inTeamB = p.teamB?.find((pl: any) => pl.id === g.id);

        if (inTeamA || inTeamB) {
          partiteGiocate++;

          const scoreA = Number(p.scoreA);
          const scoreB = Number(p.scoreB);
          const won =
            (inTeamA && scoreA > scoreB) || (inTeamB && scoreB > scoreA);
          const draw = scoreA === scoreB;
          const lost = !won && !draw;

          const sCfg = this.statsEngine.getSeasonConfig(getStagionePartita(p));
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
      const mediaVoto = partiteGiocate > 0 ? sommaVoti / partiteGiocate : 0;

      // 2. Dati del Nuovo Motore MMR & Statistiche
      const playerMmr =
        stagione === ALL_SEASONS
          ? statsRes.allTime.get(g.id)
          : statsRes.bySeason.get(stagione)?.get(g.id);

      const allTimeMmr = statsRes.allTime.get(g.id);
      const isRanked = partiteGiocate > 0;
      const seasonStartMmr = playerMmr?.seasonStartMmr ?? BASE_INITIAL_MMR;
      const mmrVal = isRanked && playerMmr ? Math.round(playerMmr.currentMmr) : seasonStartMmr;
      const mmrDisplay = isRanked ? mmrVal.toString() : '—';
      const tier = isRanked && playerMmr ? playerMmr.tier : UNRANKED_TIER;
      const peakMmr = isRanked ? (allTimeMmr?.peakMmr ?? (playerMmr?.currentMmr ?? mmrVal)) : 0;
      const pastSeasonsBanners = playerMmr?.pastSeasonsBanners || allTimeMmr?.pastSeasonsBanners || [];
      const form = isRanked && playerMmr?.form ? playerMmr.form : {
        currentStreak: 0,
        status: 'neutral' as const,
        statusLabel: 'Costante',
        emoji: '➖',
        multiplier: 1.0,
        bestWinStreak: 0,
        worstLossStreak: 0,
        recentForm: [],
      };

      // Trend dall'ultima partita giocata (delta punti con segno)
      const history = isRanked ? (playerMmr?.history || []) : [];
      const lastMatch =
        history.length > 0 ? history[history.length - 1] : null;
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
    });

    // 3. Ordinamento dinamico in base al criterio selezionato
    const crit = this.criterioOrdinamento();

    const ordinata = calcolata.sort((a, b) => {
      switch (crit) {
        case 'mmr':
          if (b.isRanked !== a.isRanked) {
            return b.isRanked ? 1 : -1;
          }
          if (b.mmrVal !== a.mmrVal) {
            return b.mmrVal - a.mmrVal;
          }
          if (b.puntiVal !== a.puntiVal) {
            return b.puntiVal - a.puntiVal;
          }
          return b.mediaVotoVal - a.mediaVotoVal;

        case 'punti':
          if (b.puntiVal !== a.puntiVal) {
            return b.puntiVal - a.puntiVal;
          }
          if (b.mmrVal !== a.mmrVal) {
            return b.mmrVal - a.mmrVal;
          }
          if (b.mediaVotoVal !== a.mediaVotoVal) {
            return b.mediaVotoVal - a.mediaVotoVal;
          }
          return b.golTotali - a.golTotali;

        case 'presenze':
          if (b.partiteGiocate !== a.partiteGiocate) {
            return b.partiteGiocate - a.partiteGiocate;
          }
          if (b.mmrVal !== a.mmrVal) {
            return b.mmrVal - a.mmrVal;
          }
          return b.puntiVal - a.puntiVal;

        case 'gol':
          if (b.golTotali !== a.golTotali) {
            return b.golTotali - a.golTotali;
          }
          if (b.mmrVal !== a.mmrVal) {
            return b.mmrVal - a.mmrVal;
          }
          return b.puntiVal - a.puntiVal;

        case 'assist':
          if (b.assistTotali !== a.assistTotali) {
            return b.assistTotali - a.assistTotali;
          }
          if (b.puntiVal !== a.puntiVal) {
            return b.puntiVal - a.puntiVal;
          }
          return b.mmrVal - a.mmrVal;

        case 'mediaVoto':
          if (b.isRanked !== a.isRanked) {
            return b.isRanked ? 1 : -1;
          }
          if (b.mediaVotoVal !== a.mediaVotoVal) {
            return b.mediaVotoVal - a.mediaVotoVal;
          }
          if (b.mmrVal !== a.mmrVal) {
            return b.mmrVal - a.mmrVal;
          }
          return b.partiteGiocate - a.partiteGiocate;

        case 'wins':
          if (b.wins !== a.wins) {
            return b.wins - a.wins;
          }
          if (b.mmrVal !== a.mmrVal) {
            return b.mmrVal - a.mmrVal;
          }
          return b.puntiVal - a.puntiVal;

        case 'portieri':
          const gkA = a.portiereStats;
          const gkB = b.portiereStats;
          const eligA = !!gkA?.isClassificabile;
          const eligB = !!gkB?.isClassificabile;
          if (eligA !== eligB) {
            return eligA ? -1 : 1;
          }
          if (gkA && gkB) {
            if (gkA.mediaGolSubiti50m !== gkB.mediaGolSubiti50m) {
              return gkA.mediaGolSubiti50m - gkB.mediaGolSubiti50m;
            }
            if (gkB.cleanSheetTurni !== gkA.cleanSheetTurni) {
              return gkB.cleanSheetTurni - gkA.cleanSheetTurni;
            }
            if (gkA.golSubiti !== gkB.golSubiti) {
              return gkA.golSubiti - gkB.golSubiti;
            }
            return gkB.minutiInPorta - gkA.minutiInPorta;
          }
          return 0;

        default:
          return b.puntiVal - a.puntiVal;
      }
    });

    // Assegna la posizione reale in classifica solo ai giocatori eleggibili
    let rankCounter = 1;
    ordinata.forEach((item) => {
      const isEligible =
        crit === 'portieri'
          ? !!item.portiereStats?.isClassificabile
          : item.isRanked;
      if (isEligible) {
        item.rankAssoluto = rankCounter++;
      } else {
        item.rankAssoluto = 0;
      }
    });

    // 4. Filtro opzionale per Tier o Stato di Forma (non applicato sulla vista Portieri)
    if (crit === 'portieri') {
      return ordinata;
    }

    const filtro = this.filtroTierOForma();
    if (filtro === 'on_fire') {
      return ordinata.filter((p) => p.isRanked && p.form.status === 'on_fire');
    }
    if (filtro === 'in_crisis') {
      return ordinata.filter((p) => p.isRanked && p.form.status === 'in_crisis');
    }
    if (filtro !== 'all') {
      return ordinata.filter((p) => p.isRanked && p.tier.id === filtro);
    }

    return ordinata;
  });

  /**
   * Giocatori ufficialmente classificati (>= 1 partita giocata o >= 1 turno in porta per classifica portieri)
   */
  giocatoriClassificati = computed<GiocatoreConPunti[]>(() => {
    if (this.criterioOrdinamento() === 'portieri') {
      return this.classificaCalcolata().filter(
        (g) => g.portiereStats && g.portiereStats.isClassificabile,
      );
    }
    return this.classificaCalcolata().filter((g) => g.isRanked);
  });

  /**
   * Giocatori Non Classificati (0 partite giocate o non ancora impiegati in porta)
   */
  giocatoriNonClassificati = computed<GiocatoreConPunti[]>(() => {
    if (this.criterioOrdinamento() === 'portieri') {
      return this.classificaCalcolata().filter(
        (g) => !g.portiereStats || !g.portiereStats.isClassificabile,
      );
    }
    if (this.filtroTierOForma() !== 'all') {
      return [];
    }
    return this.classificaCalcolata().filter((g) => !g.isRanked);
  });

  /**
   * Top Duo Sinergici della lega (I Gemelli del Gol)
   */
  topDuos = computed(() => {
    const chemMap = this.statsEngine.statsResult().chemistry;
    const seenPairs = new Set<string>();
    const duos: {
      p1Id: string;
      p1Nome: string;
      p1Foto?: string;
      p2Id: string;
      p2Nome: string;
      p2Foto?: string;
      matches: number;
      wins: number;
      draws: number;
      losses: number;
      winRate: number;
      avgDeltaTogether?: number;
    }[] = [];

    for (const [p1Id, prof] of chemMap.entries()) {
      for (const s of prof.allSynergies) {
        if (s.matchesTogether < 2) continue;
        const pairKey = [p1Id, s.partnerId].sort().join('___');
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);

        const p1 = this.giocatoriRaw().find((g) => g.id === p1Id);
        duos.push({
          p1Id,
          p1Nome: p1?.nome || prof.nome,
          p1Foto: p1?.fotoUrl,
          p2Id: s.partnerId,
          p2Nome: s.partnerNome,
          p2Foto: s.partnerFotoUrl,
          matches: s.matchesTogether,
          wins: s.winsTogether,
          draws: s.drawsTogether,
          losses: s.lossesTogether,
          winRate: s.winRateTogether,
          avgDeltaTogether: s.avgMmrDeltaTogether,
        });
      }
    }

    return duos
      .sort((a, b) => b.winRate - a.winRate || b.matches - a.matches)
      .slice(0, 10);
  });

  /**
   * Top Rivalità della lega (Bestie Nere & Derby)
   */
  topRivalries = computed(() => {
    const chemMap = this.statsEngine.statsResult().chemistry;
    const seenRivals = new Set<string>();
    const rivalries: {
      p1Id: string;
      p1Nome: string;
      p1Foto?: string;
      p2Id: string;
      p2Nome: string;
      p2Foto?: string;
      matches: number;
      p1Wins: number;
      draws: number;
      p2Wins: number;
      dominancePercent: number;
      dominatorNome: string;
    }[] = [];

    for (const [p1Id, prof] of chemMap.entries()) {
      for (const n of prof.allNemesis) {
        if (n.matchesAgainst < 2) continue;
        const pairKey = [p1Id, n.opponentId].sort().join('___');
        if (seenRivals.has(pairKey)) continue;
        seenRivals.add(pairKey);

        const p1 = this.giocatoriRaw().find((g) => g.id === p1Id);
        const p1Wins = n.winsAgainst;
        const p2Wins = n.lossesAgainst;
        const domPercent = Math.max(n.winRateAgainst, n.opponentWinRate);
        const dominatorNome =
          p1Wins >= p2Wins ? (p1?.nome || prof.nome) : n.opponentNome;

        rivalries.push({
          p1Id,
          p1Nome: p1?.nome || prof.nome,
          p1Foto: p1?.fotoUrl,
          p2Id: n.opponentId,
          p2Nome: n.opponentNome,
          p2Foto: n.opponentFotoUrl,
          matches: n.matchesAgainst,
          p1Wins,
          draws: n.drawsAgainst,
          p2Wins,
          dominancePercent: domPercent,
          dominatorNome,
        });
      }
    }

    return rivalries
      .sort(
        (a, b) =>
          b.matches - a.matches || b.dominancePercent - a.dominancePercent,
      )
      .slice(0, 10);
  });

  constructor() {
    addIcons({
      flame,
      logoWhatsapp,
      trophy,
      football,
      people,
      star,
      sparkles,
      timeOutline,
      globeOutline,
      shareSocialOutline,
      shield,
      shieldOutline,
      medal,
      ribbon,
      diamond,
      arrowUp,
      arrowDown,
      remove,
      snow,
      heart,
      skull,
      flash,
      trendingUp,
      trendingDown,
      swapHorizontal,
      chevronForward,
      chevronDown,
      chevronUp,
      helpCircleOutline,
      informationCircleOutline,
      filter,
      closeCircle,
      shieldCheckmark,
    });
  }

  selezionaVista(v: 'classifica' | 'chimica') {
    this.vistaSelezionata.set(v);
  }

  selezionaStagione(id: string) {
    this.stagioneSelezionata.set(id);
  }

  selezionaCriterio(crit: CriterioOrdinamento) {
    this.criterioOrdinamento.set(crit);
  }

  selezionaFiltro(f: string) {
    this.filtroTierOForma.set(f);
  }

  getValorePrincipale(g: GiocatoreConPunti): {
    valore: string | number;
    etichetta: string;
    subText?: string;
    subType?: 'up' | 'down' | 'neutral' | 'muted';
  } {
    switch (this.criterioOrdinamento()) {
      case 'mmr': {
        const subText = g.lastDeltaDisplay
          ? g.trendDirection === 'up'
            ? `▲ ${g.lastDeltaDisplay}`
            : g.trendDirection === 'down'
              ? `▼ ${g.lastDeltaDisplay}`
              : g.lastDeltaDisplay
          : g.isRanked
            ? `${g.winRate}% WR`
            : '';
        const subType =
          g.trendDirection === 'up'
            ? 'up'
            : g.trendDirection === 'down'
              ? 'down'
              : 'muted';
        return {
          valore: g.isRanked ? g.mmrVal : '—',
          etichetta: 'MMR',
          subText,
          subType,
        };
      }
      case 'presenze':
        return {
          valore: g.partiteGiocate,
          etichetta: 'PRESENZE',
          subText:
            g.partiteGiocate > 0 ? `${g.wins}V·${g.draws}P·${g.losses}S` : '',
          subType: 'muted',
        };
      case 'gol':
        return {
          valore: g.golTotali,
          etichetta: 'GOL',
          subText:
            g.partiteGiocate > 0
              ? `${(g.golTotali / g.partiteGiocate).toFixed(1)}/gara`
              : '',
          subType: 'muted',
        };
      case 'assist':
        return {
          valore: g.assistTotali,
          etichetta: 'ASSIST',
          subText:
            g.partiteGiocate > 0
              ? `${(g.assistTotali / g.partiteGiocate).toFixed(1)}/gara`
              : '',
          subType: 'muted',
        };
      case 'mediaVoto':
        return {
          valore: g.isRanked ? g.mediaVotoDisplay : '—',
          etichetta: 'MEDIA',
          subText: g.partiteGiocate > 0 ? `${g.partiteGiocate} gare` : '',
          subType: 'muted',
        };
      case 'wins':
        return {
          valore: g.wins,
          etichetta: 'VITTORIE',
          subText: g.partiteGiocate > 0 ? `${g.winRate}% WR` : '',
          subType: 'muted',
        };
      case 'portieri':
        return {
          valore: g.portiereStats?.isClassificabile
            ? g.portiereStats.mediaGolSubiti50m.toFixed(2)
            : '—',
          etichetta: 'GOL/50m',
          subText: g.portiereStats?.isClassificabile
            ? `🛡️ ${g.portiereStats.cleanSheetTurni} CS`
            : '',
          subType: 'muted',
        };
      case 'punti':
      default:
        return {
          valore: g.puntiDisplay,
          etichetta: 'PUNTI',
          subText:
            g.partiteGiocate > 0 ? `${g.wins}V·${g.draws}P·${g.losses}S` : '',
          subType: 'muted',
        };
    }
  }

  apriDettagliGiocatore(giocatore: GiocatoreConPunti) {
    if (giocatore?.id) {
      this.router.navigate(['/giocatori', giocatore.id]);
    }
  }

  apriDettagliPerId(giocatoreId: string) {
    if (giocatoreId) {
      this.router.navigate(['/giocatori', giocatoreId]);
    }
  }

  apriConfronto(playerAId?: string, playerBId?: string) {
    const queryParams: any = {};
    if (playerAId) queryParams.playerA = playerAId;
    if (playerBId) queryParams.playerB = playerBId;
    this.router.navigate(['/confronto'], { queryParams });
  }

  async condividiSuWhatsApp() {
    const lista = this.giocatoriClassificati();
    if (!lista || lista.length === 0) {
      const toast = await this.toastController.create({
        message: 'Nessun dato da condividere.',
        duration: 2000,
        color: 'warning',
      });
      await toast.present();
      return;
    }

    const stg = this.stagioniList().find(
      (s) => s.id === this.stagioneSelezionata(),
    );
    const stagioneNome = stg ? stg.label : 'Classifica Generale';

    const crit = this.CRITERI_ORDINAMENTO.find(
      (c) => c.id === this.criterioOrdinamento(),
    );
    const criterioNome = crit ? crit.label : 'Punti';

    let msg = `⚽ *CALCETTO ABBUFFO* ⚽\n`;
    msg += `🏆 *${stagioneNome.toUpperCase()}*\n`;
    msg += `📊 *Classifica per:* ${criterioNome}\n\n`;

    lista.forEach((g) => {
      const idx = g.rankAssoluto - 1;
      const medaglia =
        idx === 0
          ? '🥇'
          : idx === 1
            ? '🥈'
            : idx === 2
              ? '🥉'
              : `${idx + 1}°`;

      const soprannome = g.soprannome
        ? ` ("${g.soprannome}")`
        : g.soprannomeAi
          ? ` ("${g.soprannomeAi}")`
          : '';
      const formIcon =
        g.form.status === 'on_fire'
          ? ' 🔥'
          : g.form.status === 'in_crisis'
            ? ' ❄️'
            : '';
      const trendStr = g.lastDeltaDisplay ? ` [${g.lastDeltaDisplay}]` : '';

      msg += `${medaglia} *${g.nome}*${soprannome} - ${g.tier.badge}${formIcon}\n`;

      if (this.criterioOrdinamento() === 'mmr') {
        msg += `   └ 🛡️ *${g.mmrVal} MMR*${trendStr} | 🏆 ${g.puntiDisplay} pt | 👥 ${g.partiteGiocate} gare | ⭐ ${g.mediaVotoDisplay}\n`;
      } else if (this.criterioOrdinamento() === 'gol') {
        msg += `   └ ⚽ *${g.golTotali} Gol* | 👟 ${g.assistTotali} assist | 🏆 ${g.puntiDisplay} pt | 👥 ${g.partiteGiocate} gare\n`;
      } else if (this.criterioOrdinamento() === 'assist') {
        msg += `   └ 👟 *${g.assistTotali} Assist* | ⚽ ${g.golTotali} gol | 🏆 ${g.puntiDisplay} pt | 👥 ${g.partiteGiocate} gare\n`;
      } else if (this.criterioOrdinamento() === 'presenze') {
        msg += `   └ 👥 *${g.partiteGiocate} Presenze* (${g.wins}V-${g.draws}P-${g.losses}S) | 🏆 ${g.puntiDisplay} pt | ⚽ ${g.golTotali} gol\n`;
      } else if (this.criterioOrdinamento() === 'mediaVoto') {
        msg += `   └ ⭐ *Media ${g.mediaVotoDisplay}* | 👥 ${g.partiteGiocate} gare | 🏆 ${g.puntiDisplay} pt | ⚽ ${g.golTotali} gol\n`;
      } else if (this.criterioOrdinamento() === 'wins') {
        msg += `   └ 🔥 *${g.wins} Vittorie* (${g.winRate}% WR) | 🏆 ${g.puntiDisplay} pt | 👥 ${g.partiteGiocate} gare\n`;
      } else if (this.criterioOrdinamento() === 'portieri') {
        const ps = g.portiereStats;
        msg += `   └ 🧤 *${ps?.mediaGolSubiti50m.toFixed(2)} gol/50m* | Subiti: ${ps?.golSubiti} | Minuti: ${ps?.minutiInPorta}' (${ps?.turniInPorta} turni) | 🛡️ Clean Sheet: ${ps?.cleanSheetTurni}\n`;
      } else {
        msg += `   └ 🏆 *${g.puntiDisplay} Punti* | 👥 ${g.partiteGiocate} gare | ⭐ ${g.mediaVotoDisplay} | ⚽ ${g.golTotali} gol | 👟 ${g.assistTotali} assist\n`;
      }
    });

    const oggi = new Date().toLocaleDateString('it-IT');
    msg += `\n📅 _Aggiornato al ${oggi}_\n`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Classifica Calcetto Abbuffo',
          text: msg,
        });
        return;
      } catch {
        // Fallback se annullato o non supportato
      }
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(msg);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = msg;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      const toast = await this.toastController.create({
        message: '📋 Classifica copiata per WhatsApp!',
        duration: 2500,
        color: 'success',
      });
      await toast.present();

      const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
      window.open(url, '_blank');
    } catch (err) {
      console.error('Errore durante la copia negli appunti:', err);
    }
  }

  private clickCount = 0;

  async secretTitleClick() {
    this.clickCount++;
    if (this.clickCount >= 5) {
      this.clickCount = 0;
      if (this.isAdmin()) {
        await this.logoutAdmin();
      } else {
        await this.loginAdmin();
      }
    }
  }

  async loginAdmin() {
    const alert = await this.alertController.create({
      header: 'Admin Access',
      inputs: [
        { name: 'email', type: 'email', placeholder: 'Email' },
        { name: 'password', type: 'password', placeholder: 'Password' },
      ],
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        {
          text: 'Entra',
          handler: async (res) => {
            try {
              await this.authService.loginAdmin(res.email, res.password);
              (
                await this.toastController.create({
                  message: 'Benvenuto Boss! 🕶️',
                  duration: 2000,
                  color: 'success',
                })
              ).present();
            } catch {
              (
                await this.toastController.create({
                  message: 'Credenziali errate',
                  duration: 2000,
                  color: 'danger',
                })
              ).present();
            }
          },
        },
      ],
    });
    await alert.present();
  }

  apriAreaSegreta() {
    if (this.isAdmin()) {
      this.router.navigate(['/area-segreta']);
    }
  }

  async logoutAdmin() {
    const alert = await this.alertController.create({
      header: '👑 Menu Super User',
      message: 'Vuoi ispezionare i calcoli del motore o uscire dalla modalità Admin?',
      buttons: [
        {
          text: '🔬 Apri Area Segreta (Calcoli & MMR)',
          handler: () => {
            this.apriAreaSegreta();
          },
        },
        {
          text: '🚪 Esci (Logout)',
          role: 'destructive',
          handler: async () => {
            await this.authService.logoutAdmin();
            (
              await this.toastController.create({
                message: 'Logout effettuato',
                duration: 2000,
              })
            ).present();
          },
        },
        { text: 'Chiudi', role: 'cancel' },
      ],
    });
    await alert.present();
  }
}
