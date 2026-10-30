import {
  Component,
  inject,
  ChangeDetectionStrategy,
  computed,
  signal,
} from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonIcon,
  IonFab,
  IonFabButton,
  ModalController,
  AlertController,
  ToastController,
  IonList,
  IonItem,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  IonSpinner,
  IonButtons,
} from '@ionic/angular/standalone';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';
import {
  collection,
  doc,
  query,
  orderBy,
  deleteDoc,
} from 'firebase/firestore';
import { Firestore, collectionData } from '@angular/fire/firestore';
import { Storage } from '@angular/fire/storage';
import { ref, deleteObject } from 'firebase/storage';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { addIcons } from 'ionicons';
import {
  add,
  calendarOutline,
  checkmarkDoneCircle,
  starHalf,
  playCircle,
  timeOutline,
  locationOutline,
  peopleOutline,
  footballOutline,
  calendarClearOutline,
  trash,
  close,
  arrowBack,
  radioOutline,
  image,
  imageOutline,
  expandOutline,
  sparkles,
  globeOutline,
  logoWhatsapp,
  shareSocialOutline,
  chatboxEllipsesOutline,
  chevronDown,
  chevronUp,
  chevronForward,
  mic,
  filter,
  closeCircle,
  star,
  flash,
  flame,
  trophy,
  searchOutline,
  swapVerticalOutline,
  shieldCheckmark,
} from 'ionicons/icons';
import { FotoViewerModalComponent } from './foto-viewer-modal/foto-viewer-modal.component';
import { MatchShareModalComponent } from './match-share-modal/match-share-modal.component';
import { TacticalPitchComponent } from './tactical-pitch/tactical-pitch.component';
import { AiStoryModalComponent } from './ai-story-modal/ai-story-modal.component';
import { AuthService } from 'src/app/services/auth.service';
import {
  CURRENT_SEASON,
  PREVIOUS_SEASON,
  ALL_SEASONS,
  getStagionePartita,
  getStagioniDisponibili,
  formatShortSeason,
} from 'src/app/utils/season-utils';
import { formatTempoTotale, formatMinuti } from '../../utils/time-format.util';

export type CriterioOrdinamentoPartite =
  | 'data'
  | 'gol'
  | 'assist'
  | 'tempo'
  | 'mediaVoto'
  | 'giocatori'
  | 'campetto';

export interface CriterioPartitaOption {
  id: CriterioOrdinamentoPartite;
  label: string;
  icon: string;
  unit: string;
}

export interface MatchHeroStat {
  valore: string;
  etichetta: string;
  subText?: string;
  subType?: 'up' | 'down' | 'neutral';
}

export const CRITERI_ORDINAMENTO_PARTITE: CriterioPartitaOption[] = [
  { id: 'data', label: 'Data', icon: 'calendar-outline', unit: 'DATA' },
  { id: 'gol', label: 'Gol Totali', icon: 'football-outline', unit: 'GOL' },
  { id: 'assist', label: 'Assist', icon: 'flash', unit: 'ASSIST' },
  { id: 'tempo', label: 'Minuti ⏱️', icon: 'time-outline', unit: 'TEMPO' },
  { id: 'mediaVoto', label: 'Media Voto', icon: 'star', unit: 'MEDIA' },
  { id: 'giocatori', label: 'Giocatori', icon: 'people-outline', unit: 'GIOCATORI' },
  { id: 'campetto', label: 'Campetto', icon: 'location-outline', unit: 'CAMPO' },
];

@Component({
  selector: 'app-partite',
  templateUrl: 'partite.page.html',
  styleUrls: ['partite.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonIcon,
    IonFab,
    IonFabButton,
    IonList,
    IonItem,
    IonItemSliding,
    IonItemOptions,
    IonItemOption,
    IonSpinner,
    IonButtons,
    ThemeToggleComponent,
    TacticalPitchComponent,
  ],
})
export class PartitePage {
  private firestore = inject(Firestore);
  private storage = inject(Storage);
  private modalCtrl = inject(ModalController);
  private alertController = inject(AlertController);
  private toastController = inject(ToastController);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private location = inject(Location);

  highlightMatchId = signal<string | null>(null);
  openedPitches = signal<Record<string, boolean>>({});
  openedMatches = signal<Record<string, boolean>>({});
  areAllExpanded = signal<boolean>(false);

  toggleMatchAccordion(matchId?: string) {
    if (!matchId) return;
    this.openedMatches.update((prev) => ({
      ...prev,
      [matchId]: !prev[matchId],
    }));
  }

  isMatchAccordionOpen(matchId?: string, isLive?: boolean): boolean {
    if (!matchId) return false;
    // Se la partita è LIVE, mostriamola espansa di default a meno che non sia stata chiusa esplicitamente
    if (isLive && this.openedMatches()[matchId] === undefined) {
      return true;
    }
    return !!this.openedMatches()[matchId];
  }

  toggleAllMatches() {
    const nextState = !this.areAllExpanded();
    this.areAllExpanded.set(nextState);
    const updated: Record<string, boolean> = {};
    for (const m of this.partite() || []) {
      if (m.id) updated[m.id] = nextState;
    }
    this.openedMatches.set(updated);
  }

  // Criteri di ordinamento e filtri
  readonly CRITERI_ORDINAMENTO = CRITERI_ORDINAMENTO_PARTITE;
  criterioOrdinamento = signal<CriterioOrdinamentoPartite>('data');
  ordineCrescente = signal<boolean>(false);
  searchQuery = signal<string>('');
  filtroCampetto = signal<string>('all');
  isFiltriCampettoOpen = signal<boolean>(false);

  togglePiantina(matchId?: string) {
    if (!matchId) return;
    this.openedPitches.update((prev) => ({
      ...prev,
      [matchId]: !prev[matchId],
    }));
  }

  isPiantinaAperta(matchId?: string): boolean {
    if (!matchId) return false;
    return !!this.openedPitches()[matchId];
  }

  getFormazioneLabel(m: any): string {
    const lenA = Array.isArray(m?.teamA) ? m.teamA.length : 0;
    const lenB = Array.isArray(m?.teamB) ? m.teamB.length : 0;
    if (lenA > 0 && lenB > 0) {
      return `${lenA} vs ${lenB}`;
    }
    const tot =
      lenA || lenB || (Array.isArray(m?.convocati) ? m.convocati.length : 0);
    if (tot >= 2) {
      const half = Math.ceil(tot / 2);
      return `${half} vs ${tot - half}`;
    }
    return 'Schieramento';
  }

  partite = toSignal<any[]>(
    collectionData(
      query(collection(this.firestore, 'partite'), orderBy('dataOra', 'desc')),
      { idField: 'id' },
    ).pipe(
      map((list: any[]) => {
        const priority = (m: any) =>
          m.matchConcluso ? (m.pagelleInserite ? 2 : 1) : 0;

        return [...list].sort((a: any, b: any) => {
          const pa = priority(a);
          const pb = priority(b);
          if (pa !== pb) return pa - pb;

          const at = a.dataOra?.seconds ?? 0;
          const bt = b.dataOra?.seconds ?? 0;
          return bt - at;
        });
      }),
      catchError(() => of([] as any[])),
    ),
  );

  readonly CURRENT_SEASON = CURRENT_SEASON;
  readonly PREVIOUS_SEASON = PREVIOUS_SEASON;
  readonly ALL_SEASONS = ALL_SEASONS;
  getStagionePartita = getStagionePartita;

  stagioneSelezionata = signal<string>(CURRENT_SEASON);

  stagioniList = computed(() => {
    return getStagioniDisponibili(this.partite());
  });

  partiteFiltrate = computed(() => {
    const list = this.partite() || [];
    const s = this.stagioneSelezionata();
    if (s === ALL_SEASONS) return list;
    return list.filter((m) => getStagionePartita(m) === s);
  });

  conteggioStagioni = computed<Record<string, number>>(() => {
    const list = this.partite() || [];
    const counts: Record<string, number> = {
      [this.ALL_SEASONS]: list.length,
      [this.CURRENT_SEASON]: 0,
      [this.PREVIOUS_SEASON]: 0,
    };
    for (const m of list) {
      const s = getStagionePartita(m);
      counts[s] = (counts[s] || 0) + 1;
    }
    return counts;
  });

  // KPI Dashboard della stagione selezionata
  kpiStagione = computed(() => {
    const matches = this.partiteFiltrate() || [];
    const concluse = matches.filter(
      (m: any) => m.status === 'conclusa' || m.matchConcluso,
    );
    const totalePartite = matches.length;
    let totaleGol = 0;
    let totaleAssist = 0;
    let totaleSecondi = 0;
    let votiSomma = 0;
    let votiConteggio = 0;

    for (const m of matches) {
      totaleGol += (m.scoreA || 0) + (m.scoreB || 0);
      totaleAssist += this.calcolaAssistPartita(m);
      totaleSecondi += this.calcolaDurataSecondiPartita(m);
      const v = this.calcolaVotiPartita(m);
      if (v.media > 0) {
        votiSomma += v.media;
        votiConteggio++;
      }
    }

    const mediaGolPartita =
      concluse.length > 0 ? (totaleGol / concluse.length).toFixed(1) : '0';
    const mediaVotiStagione =
      votiConteggio > 0 ? (votiSomma / votiConteggio).toFixed(1) : '-';

    return {
      totalePartite,
      partiteConcluse: concluse.length,
      totaleGol,
      mediaGolPartita,
      totaleAssist,
      totaleSecondi,
      tempoTotaleDisplay: formatTempoTotale(totaleSecondi),
      mediaVotiStagione,
    };
  });

  // Campetti unici presenti nella stagione selezionata
  campettiDisponibili = computed(() => {
    const list = this.partiteFiltrate() || [];
    const set = new Set<string>();
    for (const m of list) {
      if (m.luogo && typeof m.luogo === 'string' && m.luogo.trim() !== '') {
        set.add(m.luogo.trim());
      }
    }
    return Array.from(set).sort();
  });

  activeFilterCampettoLabel = computed(() => {
    const c = this.filtroCampetto();
    return c === 'all' ? null : `📍 ${c}`;
  });

  // Helper per filtrare un singolo match per testo e campetto
  private matchSoddisfaFiltri(m: any, q: string, campetto: string): boolean {
    if (campetto !== 'all') {
      if ((m.luogo || '').trim().toLowerCase() !== campetto.toLowerCase()) {
        return false;
      }
    }
    if (!q) return true;

    const matchLuogo = (m.luogo || '').toLowerCase().includes(q);
    const matchData = (m.dataPartita || '').toLowerCase().includes(q);
    const matchCommento = (m.commentoPartita || '').toLowerCase().includes(q);
    const matchNotePortieri = (m.notePortieri || '').toLowerCase().includes(q);
    const matchScorer = (m.eventiGol || []).some(
      (e: any) =>
        (e.nome || '').toLowerCase().includes(q) ||
        (e.assistNome || '').toLowerCase().includes(q),
    );
    const matchPlayer = [
      ...(m.teamA || []),
      ...(m.teamB || []),
      ...(m.convocati || []),
    ].some((p: any) => (p.nome || '').toLowerCase().includes(q));

    return (
      matchLuogo ||
      matchData ||
      matchCommento ||
      matchNotePortieri ||
      matchScorer ||
      matchPlayer
    );
  }

  // --- SEZIONI IN EVIDENZA (PINNED) ---
  partiteInCorso = computed(() => {
    const list = this.partiteFiltrate();
    if (!list) return [];
    const q = this.searchQuery().toLowerCase().trim();
    const c = this.filtroCampetto();
    return list
      .filter((m: any) => m.status === 'in_corso')
      .filter((m: any) => this.matchSoddisfaFiltri(m, q, c))
      .sort(
        (a: any, b: any) =>
          (b.dataOra?.seconds ?? 0) - (a.dataOra?.seconds ?? 0),
      );
  });

  partitePronte = computed(() => {
    const list = this.partiteFiltrate();
    if (!list) return [];
    const q = this.searchQuery().toLowerCase().trim();
    const c = this.filtroCampetto();
    return list
      .filter(
        (m: any) =>
          m.status === 'pronta' || (!m.status && !m.matchConcluso),
      )
      .filter((m: any) => this.matchSoddisfaFiltri(m, q, c))
      .sort(
        (a: any, b: any) =>
          (b.dataOra?.seconds ?? 0) - (a.dataOra?.seconds ?? 0),
      );
  });

  partiteDaVotare = computed(() => {
    const list = this.partiteFiltrate();
    if (!list) return [];
    const q = this.searchQuery().toLowerCase().trim();
    const c = this.filtroCampetto();
    return list
      .filter(
        (m: any) =>
          (m.status === 'conclusa' || m.matchConcluso) && !m.pagelleInserite,
      )
      .filter((m: any) => this.matchSoddisfaFiltri(m, q, c))
      .sort(
        (a: any, b: any) =>
          (b.dataOra?.seconds ?? 0) - (a.dataOra?.seconds ?? 0),
      );
  });

  totalePartiteInEvidenza = computed(() => {
    return (
      this.partiteInCorso().length +
      this.partitePronte().length +
      this.partiteDaVotare().length
    );
  });

  // Base concluse con pagelle
  private partiteArchiviateBase = computed(() => {
    const list = this.partiteFiltrate();
    if (!list) return [];
    return list.filter(
      (m: any) =>
        (m.status === 'conclusa' || m.matchConcluso) && m.pagelleInserite,
    );
  });

  // --- SEZIONE ORDINABILE & FILTRABILE (STORICO GARE) ---
  partiteArchiviateOrdinate = computed(() => {
    const base = this.partiteArchiviateBase();
    const q = this.searchQuery().toLowerCase().trim();
    const c = this.filtroCampetto();

    // Filtra per testo e campetto
    let list = base.filter((m: any) => this.matchSoddisfaFiltri(m, q, c));

    // Ordinamento in base al criterio selezionato
    const criterio = this.criterioOrdinamento();
    const asc = this.ordineCrescente();

    return [...list].sort((a: any, b: any) => {
      let diff = 0;
      switch (criterio) {
        case 'gol': {
          const ga = (a.scoreA || 0) + (a.scoreB || 0);
          const gb = (b.scoreA || 0) + (b.scoreB || 0);
          diff = gb - ga;
          break;
        }
        case 'assist': {
          const aa = this.calcolaAssistPartita(a);
          const ab = this.calcolaAssistPartita(b);
          diff = ab - aa;
          break;
        }
        case 'tempo': {
          const ta = this.calcolaDurataSecondiPartita(a);
          const tb = this.calcolaDurataSecondiPartita(b);
          diff = tb - ta;
          break;
        }
        case 'mediaVoto': {
          const va = this.calcolaVotiPartita(a).media;
          const vb = this.calcolaVotiPartita(b).media;
          diff = vb - va;
          break;
        }
        case 'giocatori': {
          const ja = this.calcolaNumeroGiocatori(a);
          const jb = this.calcolaNumeroGiocatori(b);
          diff = jb - ja;
          break;
        }
        case 'campetto': {
          const la = (a.luogo || '').trim().toLowerCase();
          const lb = (b.luogo || '').trim().toLowerCase();
          diff = la.localeCompare(lb);
          return asc ? -diff : diff;
        }
        case 'data':
        default: {
          const da =
            a.dataOra?.seconds ??
            (a.dataPartita ? new Date(a.dataPartita).getTime() / 1000 : 0);
          const db =
            b.dataOra?.seconds ??
            (b.dataPartita ? new Date(b.dataPartita).getTime() / 1000 : 0);
          diff = db - da;
          break;
        }
      }

      if (diff !== 0) {
        return diff * (asc ? -1 : 1);
      }

      // Ordinamento secondario di stabilizzazione: Data più recente
      const da =
        a.dataOra?.seconds ??
        (a.dataPartita ? new Date(a.dataPartita).getTime() / 1000 : 0);
      const db =
        b.dataOra?.seconds ??
        (b.dataPartita ? new Date(b.dataPartita).getTime() / 1000 : 0);
      return db - da;
    });
  });

  giocatori = toSignal<any[], any[]>(
    (
      collectionData(
        query(collection(this.firestore, 'giocatori'), orderBy('nome')),
        { idField: 'id' },
      ) as Observable<any[]>
    ).pipe(catchError(() => of([] as any[]))),
    { initialValue: [] },
  );

  constructor() {
    addIcons({
      add,
      calendarOutline,
      checkmarkDoneCircle,
      starHalf,
      playCircle,
      timeOutline,
      locationOutline,
      peopleOutline,
      footballOutline,
      calendarClearOutline,
      trash,
      close,
      arrowBack,
      radioOutline,
      image,
      imageOutline,
      expandOutline,
      sparkles,
      globeOutline,
      logoWhatsapp,
      shareSocialOutline,
      chatboxEllipsesOutline,
      chevronDown,
      chevronUp,
      chevronForward,
      mic,
      filter,
      closeCircle,
      star,
      flash,
      flame,
      trophy,
      searchOutline,
      swapVerticalOutline,
      shieldCheckmark,
    });

    this.route.queryParams.subscribe((params) => {
      if (params['highlight']) {
        this.highlightMatchId.set(params['highlight']);
      }
    });
  }

  // --- GESTIONE INTERAZIONI ORDINAMENTO E FILTRI ---
  selezionaCriterio(c: CriterioOrdinamentoPartite) {
    if (this.criterioOrdinamento() === c) {
      this.ordineCrescente.update((v) => !v);
    } else {
      this.criterioOrdinamento.set(c);
      this.ordineCrescente.set(false);
    }
  }

  toggleFiltriCampetto() {
    this.isFiltriCampettoOpen.update((v) => !v);
  }

  selezionaFiltroCampetto(campetto: string) {
    this.filtroCampetto.set(campetto);
  }

  resetFiltroCampetto() {
    this.filtroCampetto.set('all');
  }

  onSearchInput(ev: any) {
    this.searchQuery.set(ev?.target?.value || '');
  }

  clearSearch() {
    this.searchQuery.set('');
  }

  resetTuttiIFiltri() {
    this.searchQuery.set('');
    this.filtroCampetto.set('all');
    this.criterioOrdinamento.set('data');
    this.ordineCrescente.set(false);
  }

  // --- CALCOLI METRICHE PARTITA ---
  calcolaAssistPartita(m: any): number {
    if (Array.isArray(m.eventiGol) && m.eventiGol.length > 0) {
      const fromEvents = m.eventiGol.filter(
        (e: any) =>
          Boolean(e.assistId) ||
          (Boolean(e.assistNome) && e.assistNome.trim() !== ''),
      ).length;
      if (fromEvents > 0) return fromEvents;
    }
    const fromPlayers = [
      ...(m.teamA || []),
      ...(m.teamB || []),
    ].reduce((acc, p) => acc + (p.assist || 0), 0);
    return fromPlayers;
  }

  calcolaDurataSecondiPartita(m: any): number {
    let sec = 0;
    if (typeof m.cronometro === 'number' && m.cronometro > 0) {
      sec = m.cronometro;
    } else if (typeof m.accumulatedTime === 'number' && m.accumulatedTime > 0) {
      sec = m.accumulatedTime > 10000
        ? Math.round(m.accumulatedTime / 1000)
        : m.accumulatedTime;
    } else if (m.status === 'conclusa' || m.matchConcluso) {
      sec = 3000; // 50 minuti standard
    }
    if (sec > 7200) {
      sec = 3600; // Capping di sicurezza se timer dimenticato acceso
    }
    return sec;
  }

  getTempoPartitaDisplay(m: any): string {
    const sec = this.calcolaDurataSecondiPartita(m);
    return formatTempoTotale(sec);
  }

  calcolaVotiPartita(m: any): {
    media: number;
    mvp: { nome: string; voto: number } | null;
  } {
    const players = [...(m.teamA || []), ...(m.teamB || [])];
    const rated = players.filter(
      (p: any) => p && typeof p.voto === 'number' && p.voto > 0,
    );
    if (rated.length === 0) return { media: 0, mvp: null };
    const sum = rated.reduce((acc, p) => acc + p.voto, 0);
    const media = Math.round((sum / rated.length) * 10) / 10;
    const sorted = [...rated].sort((a, b) => b.voto - a.voto);
    return {
      media,
      mvp: { nome: sorted[0].nome || 'Giocatore', voto: sorted[0].voto },
    };
  }

  calcolaNumeroGiocatori(m: any): number {
    if (Array.isArray(m.convocati) && m.convocati.length > 0) {
      return m.convocati.length;
    }
    return (m.teamA?.length || 0) + (m.teamB?.length || 0);
  }

  getMarcatoriSquadra(
    m: any,
    team: 'A' | 'B',
  ): { nome: string; gol: number; isAutogoal?: boolean }[] {
    if (Array.isArray(m.eventiGol) && m.eventiGol.length > 0) {
      const goalsOfTeam = m.eventiGol.filter(
        (e: any) => e.teamVantaggio === team,
      );
      if (goalsOfTeam.length > 0) {
        const counts: Record<
          string,
          { nome: string; gol: number; isAutogoal?: boolean }
        > = {};
        for (const e of goalsOfTeam) {
          const displayName = e.isAutogoal
            ? e.nome
              ? `${e.nome} (Aut.)`
              : 'Autogol'
            : (e.nome || 'Marcatore').trim();
          if (!counts[displayName]) {
            counts[displayName] = {
              nome: displayName,
              gol: 0,
              isAutogoal: Boolean(e.isAutogoal),
            };
          }
          counts[displayName].gol += 1;
        }
        return Object.values(counts).sort((a, b) => b.gol - a.gol);
      }
    }
    // Fallback su teamA / teamB performance
    const players = team === 'A' ? m.teamA : m.teamB;
    if (Array.isArray(players)) {
      return players
        .filter((p: any) => (p.gol || 0) > 0)
        .map((p: any) => ({
          nome: (p.nome || 'Giocatore').trim(),
          gol: p.gol,
        }))
        .sort((a, b) => b.gol - a.gol);
    }
    return [];
  }

  getHeroStat(m: any): MatchHeroStat {
    const criterio = this.criterioOrdinamento();
    switch (criterio) {
      case 'gol': {
        const golTot = (m.scoreA || 0) + (m.scoreB || 0);
        return {
          valore: `${golTot}`,
          etichetta: 'GOL TOTALI',
          subText: `⚪ ${m.scoreA || 0} - ${m.scoreB || 0} ⚫`,
          subType: 'neutral',
        };
      }
      case 'assist': {
        const assists = this.calcolaAssistPartita(m);
        return {
          valore: `${assists}`,
          etichetta: 'ASSIST',
          subText: assists > 0 ? 'Totali gara' : 'Nessun assist',
          subType: assists > 0 ? 'up' : 'neutral',
        };
      }
      case 'tempo': {
        const sec = this.calcolaDurataSecondiPartita(m);
        return {
          valore: formatTempoTotale(sec),
          etichetta: 'TEMPO EFF.',
          subText: sec > 0 ? `${Math.round(sec / 60)}' giocati` : 'Tempo base',
          subType: 'neutral',
        };
      }
      case 'mediaVoto': {
        const stats = this.calcolaVotiPartita(m);
        return {
          valore: stats.media > 0 ? `⭐ ${stats.media.toFixed(1)}` : '-',
          etichetta: 'MEDIA VOTI',
          subText: stats.mvp
            ? `Top: ${stats.mvp.nome} (${stats.mvp.voto})`
            : m.pagelleInserite
              ? 'Pagelle OK'
              : 'Da votare',
          subType: stats.media >= 6.5 ? 'up' : 'neutral',
        };
      }
      case 'giocatori': {
        const tot = this.calcolaNumeroGiocatori(m);
        const teamA = m.teamA?.length || 0;
        const teamB = m.teamB?.length || 0;
        return {
          valore: `${tot}`,
          etichetta: 'GIOCATORI',
          subText: teamA > 0 && teamB > 0 ? `${teamA} vs ${teamB}` : 'Convocati',
          subType: 'neutral',
        };
      }
      case 'campetto': {
        return {
          valore: '📍',
          etichetta: 'CAMPETTO',
          subText: m.luogo || 'Non spec.',
          subType: 'neutral',
        };
      }
      case 'data':
      default: {
        const d = m.dataPartita ? new Date(m.dataPartita) : null;
        const day =
          d && !isNaN(d.getTime())
            ? d
                .toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
                .toUpperCase()
            : '-';
        const weekday =
          d && !isNaN(d.getTime())
            ? d.toLocaleDateString('it-IT', { weekday: 'short' }).toUpperCase()
            : 'DATA';
        return {
          valore: day,
          etichetta: weekday,
          subText: m.orario
            ? `Ore ${m.orario}`
            : m.dataPartita
              ? new Date(m.dataPartita).toLocaleDateString('it-IT', {
                  year: 'numeric',
                })
              : undefined,
          subType: 'neutral',
        };
      }
    }
  }

  haNote(m: any): boolean {
    return Boolean(
      (m.commentoPartita && m.commentoPartita.trim() !== '') ||
        (m.notePortieri && m.notePortieri.trim() !== ''),
    );
  }

  async mostraNote(m: any) {
    const list: string[] = [];
    if (m.commentoPartita) {
      list.push(`📝 Bordocampo: ${m.commentoPartita}`);
    }
    if (m.notePortieri) {
      list.push(`🧤 Portieri: ${m.notePortieri}`);
    }
    const msg = list.join('\n\n') || 'Nessuna nota registrata.';
    const alert = await this.alertController.create({
      header: 'Note Partita',
      subHeader: `${m.luogo || 'Calcetto'} · ${m.dataPartita || ''}`,
      message: msg,
      buttons: ['Chiudi'],
    });
    await alert.present();
  }

  async apriCondivisione(partita: any) {
    const modal = await this.modalCtrl.create({
      component: MatchShareModalComponent,
      componentProps: { partita },
      breakpoints: [0, 0.95, 1],
      initialBreakpoint: 0.95,
      handle: true,
    });
    await modal.present();
  }

  async mostraToastPartitaNonTrovata() {
    const toast = await this.toastController.create({
      message: 'Partita non trovata',
      duration: 3000,
      position: 'bottom',
      color: 'warning',
      mode: 'ios',
      buttons: [{ text: 'OK', role: 'cancel' }],
    });
    await toast.present();
  }

  stagioneBadgeClass(m: any): string {
    return getStagionePartita(m) === this.CURRENT_SEASON
      ? 'badge-season-current'
      : 'badge-season-old';
  }

  stagioneBadgeLabel(m: any): string {
    const s = getStagionePartita(m);
    const short = formatShortSeason(s);
    return s === this.CURRENT_SEASON ? `⚡ ${short}` : `🏛️ ${short}`;
  }

  stagioneCardClass(m: any): string {
    return getStagionePartita(m) === this.CURRENT_SEASON
      ? 'card-season-current'
      : 'card-season-old';
  }

  selezionaStagione(s: string) {
    this.stagioneSelezionata.set(s);
  }

  badgeClass(m: any): string {
    switch (m.status) {
      case 'in_corso':
        return 'badge-danger blink';
      case 'conclusa':
        return m.pagelleInserite ? 'badge-success' : 'badge-warning';
      case 'pronta':
      default:
        return 'badge-primary';
    }
  }

  badgeIcon(m: any): string {
    switch (m.status) {
      case 'in_corso':
        return 'radio-outline';
      case 'conclusa':
        return m.pagelleInserite ? 'checkmark-done-circle' : 'star-half';
      case 'pronta':
      default:
        return 'play-circle';
    }
  }

  badgeLabel(m: any): string {
    switch (m.status) {
      case 'in_corso':
        return 'LIVE';
      case 'conclusa':
        return m.pagelleInserite ? 'ARCHIVIATA' : 'DA VOTARE';
      case 'pronta':
      default:
        return "Fischio d'inizio";
    }
  }

  async apriPartita(partita?: any) {
    if (!partita && this.stagioneSelezionata() === this.PREVIOUS_SEASON) {
      const alert = await this.alertController.create({
        header: 'Stagione Conclusa',
        message: `Non è possibile aggiungere nuove partite alla stagione ${this.PREVIOUS_SEASON}. Le nuove partite possono essere create esclusivamente per la stagione corrente (${this.CURRENT_SEASON}).`,
        buttons: ['OK'],
      });
      await alert.present();
      return;
    }

    if (partita?.id) {
      await this.router.navigate(['/partite', partita.id]);
    } else {
      await this.router.navigate(['/partite', 'nuova']);
    }
  }

  async confermaEliminazione(match: any, slidingItem: IonItemSliding) {
    const alert = await this.alertController.create({
      header: 'Elimina Partita',
      message: `Sei sicuro di voler eliminare definitivamente il match a ${match.luogo}?`,
      buttons: [
        {
          text: 'Annulla',
          role: 'cancel',
          handler: () => slidingItem.close(),
        },
        {
          text: 'Elimina',
          role: 'destructive',
          handler: async () => {
            if (match.fotoPath) {
              try {
                const storageRef = ref(this.storage, match.fotoPath);
                await deleteObject(storageRef);
              } catch (e) {
                console.warn('Errore eliminazione foto da storage:', e);
              }
            }
            await deleteDoc(doc(this.firestore, `partite/${match.id}`));
            slidingItem.close();
          },
        },
      ],
    });
    await alert.present();
  }

  async apriFotoViewer(m: any) {
    if (!m?.fotoUrl) return;

    const modal = await this.modalCtrl.create({
      component: FotoViewerModalComponent,
      componentProps: {
        fotoUrl: m.fotoUrl,
        luogo: m.luogo,
        dataPartita: m.dataPartita,
        risultato:
          m.status === 'conclusa'
            ? `Bianchi ${m.scoreA} - ${m.scoreB} Neri`
            : undefined,
      },
    });

    await modal.present();
  }

  async apriAiModal(tipo: 'cronaca' | 'pronostico', m: any) {
    if (!m) return;
    const isPronostico = tipo === 'pronostico';
    const testo = isPronostico ? m.pronosticoAi : m.cronacaAi;
    if (!testo) return;

    const dataFmt = m.dataPartita
      ? new Date(m.dataPartita).toLocaleDateString('it-IT')
      : '';
    const sottotitolo =
      m.status === 'conclusa'
        ? `Partita del ${dataFmt} · Risultato: Bianchi ${m.scoreA} - ${m.scoreB} Neri`
        : `Partita del ${dataFmt} · ${m.luogo || 'Bordocampo'}`;

    const modal = await this.modalCtrl.create({
      component: AiStoryModalComponent,
      componentProps: {
        tipo,
        titolo: isPronostico
          ? '🔮 Il Pronostico del Mister'
          : '🎙️ Telecronaca Ignorante',
        sottotitolo,
        testo,
        matchId: m.id || 'temp',
        audioLabel: isPronostico ? 'Ascolta Pronostico' : 'Ascolta Telecronaca',
      },
      breakpoints: [0, 0.9, 1],
      initialBreakpoint: 0.9,
      handle: true,
    });
    await modal.present();
  }

  get isAdmin(): boolean {
    return this.auth.isAdmin();
  }
}
