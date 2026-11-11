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
  ActionSheetController,
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
import { PlayerAvatarComponent } from '../player-avatar/player-avatar.component';
import { collection, doc, query, orderBy, deleteDoc } from 'firebase/firestore';
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
  time,
  timeOutline,
  locationOutline,
  people,
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
  flashOutline,
  flameOutline,
  micOutline,
  sparklesOutline,
  shieldOutline,
  play,
  trophy,
  searchOutline,
  swapVerticalOutline,
  shieldCheckmark,
  constructOutline,
  navigateOutline,
  openOutline,
  sunnyOutline,
  statsChartOutline,
  checkmarkOutline,
} from 'ionicons/icons';
import { getMatchFormatByPlayerCount } from 'src/app/models/partita.model';
import { FotoViewerModalComponent } from './foto-viewer-modal/foto-viewer-modal.component';
import { ShareService } from 'src/app/services/share.service';
import { AiStoryModalComponent } from './ai-story-modal/ai-story-modal.component';
import { AuthService } from 'src/app/services/auth.service';
import { TrashService } from 'src/app/services/trash.service';
import { CampiService } from 'src/app/services/campi.service';
import { WeatherService } from 'src/app/services/weather.service';
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
  | 'giocatori';

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
  {
    id: 'giocatori',
    label: 'Giocatori',
    icon: 'people-outline',
    unit: 'GIOCATORI',
  },
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
    PlayerAvatarComponent,
  ],
})
export class PartitePage {
  private firestore = inject(Firestore);
  private storage = inject(Storage);
  private modalCtrl = inject(ModalController);
  private alertController = inject(AlertController);
  private toastController = inject(ToastController);
  private actionSheetCtrl = inject(ActionSheetController);
  private auth = inject(AuthService);
  readonly trashService = inject(TrashService);
  readonly campiService = inject(CampiService);
  readonly weatherService = inject(WeatherService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private location = inject(Location);
  private shareService = inject(ShareService);

  highlightMatchId = signal<string | null>(null);
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
  filtroMeteo = signal<string>('all'); // 'all' | 'sereno' | 'nuvoloso' | 'pioggia'
  filtroFormato = signal<string>('all'); // 'all' | 'calcetto' | 'calcio_a_6' | 'calcio_a_7'
  isFiltriCampettoOpen = signal<boolean>(false);
  isKpiDrawerOpen = signal<boolean>(false);

  toggleKpiDrawer() {
    this.isKpiDrawerOpen.update((v) => !v);
  }

  readonly sortButtonLabel = computed<string>(() => {
    const crit = this.criterioOrdinamento();
    if (crit === 'gol') return 'Più Gol';
    return this.ordineCrescente() ? 'Meno recenti' : 'Più recenti';
  });

  async apriMenuOrdinamento() {
    const crit = this.criterioOrdinamento();
    const asc = this.ordineCrescente();
    const actionSheet = await this.actionSheetCtrl.create({
      header: 'Ordina Partite',
      mode: 'ios',
      buttons: [
        {
          text:
            crit === 'data' && !asc ? '✓ Più recenti' : 'Più recenti',
          icon: 'calendar-outline',
          handler: () => {
            this.criterioOrdinamento.set('data');
            this.ordineCrescente.set(false);
          },
        },
        {
          text:
            crit === 'data' && asc ? '✓ Meno recenti' : 'Meno recenti',
          icon: 'time-outline',
          handler: () => {
            this.criterioOrdinamento.set('data');
            this.ordineCrescente.set(true);
          },
        },
        {
          text:
            crit === 'gol' ? '✓ Più gol segnati' : 'Più gol segnati',
          icon: 'football-outline',
          handler: () => {
            this.criterioOrdinamento.set('gol');
            this.ordineCrescente.set(false);
          },
        },
        {
          text: 'Annulla',
          role: 'cancel',
          icon: 'close',
        },
      ],
    });
    await actionSheet.present();
  }

  readonly isAnyFilterActive = computed(() => {
    return (
      this.filtroCampetto() !== 'all' ||
      this.filtroMeteo() !== 'all' ||
      this.filtroFormato() !== 'all'
    );
  });

  getMeteoPartita(
    m: any,
  ): { emoji: string; temp: string; label: string; tooltip: string } | null {
    if (!m?.dataPartita) return null;
    const w = this.weatherService.getWeatherForDate(m.dataPartita, m.meteo);
    if (!w) return null;
    const emoji =
      w.iconEmoji && !w.iconEmoji.includes('🌫') ? w.iconEmoji : '🌁';
    return {
      emoji,
      temp: `${w.tempMax}°`,
      label: w.conditionDescription,
      tooltip: `Meteo: ${w.conditionDescription} • ${w.tempMax}° / ${w.tempMin}° • 💧 Rischio Pioggia: ${w.rainProbability}%`,
    };
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

  getFormatoLabel(m: any): string {
    const raw = (m?.formato || '').trim().toLowerCase();
    if (raw === 'calcetto' || raw === 'calcio a 5' || raw === 'calcio_a_5') {
      return 'Calcio a 5';
    }
    if (raw === 'calcio a 6' || raw === 'calcio_a_6') {
      return 'Calcio a 6';
    }
    if (raw === 'calcio a 7' || raw === 'calcio_a_7') {
      return 'Calcio a 7';
    }
    if (raw === 'calcio a 8' || raw === 'calcio_a_8') {
      return 'Calcio a 8';
    }
    if (raw === 'calcio a 11' || raw === 'calcio_a_11') {
      return 'Calcio a 11';
    }

    const count = this.calcolaNumeroGiocatori(m);
    return getMatchFormatByPlayerCount(count).label;
  }

  isMatchToday(m: any): boolean {
    if (!m?.dataPartita) return false;
    let d = (m.dataPartita || '').split('T')[0].trim();
    if (d.includes('/')) {
      const parts = d.split('/');
      if (parts.length === 3)
        d = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    const today = new Date().toISOString().split('T')[0];
    return d === today;
  }

  isMatchTomorrow(m: any): boolean {
    if (!m?.dataPartita) return false;
    let d = (m.dataPartita || '').split('T')[0].trim();
    if (d.includes('/')) {
      const parts = d.split('/');
      if (parts.length === 3)
        d = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    return d === tomorrowStr;
  }

  getLuogoDisplay(m: any): string {
    return this.campiService.normalizzaNomeCampo(m?.luogo);
  }

  getGoogleMapsUrl(m: any): string {
    if (m?.campoGoogleMapsUrl) return m.campoGoogleMapsUrl;
    return this.campiService.getGoogleMapsUrl(m?.luogo || 'Roma 6');
  }

  partite = toSignal<any[]>(
    collectionData(collection(this.firestore, 'partite'), {
      idField: 'id',
    }).pipe(
      map((list: any[]) => {
        const priority = (m: any) =>
          m.matchConcluso ? (m.pagelleInserite ? 2 : 1) : 0;

        const getTime = (m: any): number => {
          if (m?.dataOra?.seconds) return m.dataOra.seconds * 1000;
          if (m?.dataOra?.toMillis) return m.dataOra.toMillis();
          if (m?.dataPartita) {
            const iso = `${m.dataPartita}T${m.orario || '21:00'}:00`;
            const t = new Date(iso).getTime();
            if (!isNaN(t)) return t;
          }
          return 0;
        };

        return [...list].sort((a: any, b: any) => {
          const pa = priority(a);
          const pb = priority(b);
          if (pa !== pb) return pa - pb;

          return getTime(b) - getTime(a);
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

    const totaleMinuti = Math.round(totaleSecondi / 60);
    const ritmoGolAlMinuto =
      totaleSecondi > 0
        ? (totaleGol / (totaleSecondi / 60)).toFixed(2)
        : '0.00';
    const minutiPerGol =
      totaleGol > 0 && totaleSecondi > 0
        ? (totaleSecondi / 60 / totaleGol).toFixed(1)
        : '-';

    const golTooltip =
      `${totaleGol} Gol Totali (${concluse.length} gare concluse, ${totaleMinuti} minuti giocati)\n` +
      `• Media: ${mediaGolPartita} gol a gara\n` +
      `• Ritmo: ${ritmoGolAlMinuto} gol/min (1 gol ogni ${minutiPerGol} minuti)`;

    const mediaSecondiGara =
      concluse.length > 0 ? Math.round(totaleSecondi / concluse.length) : 0;

    return {
      totalePartite,
      partiteConcluse: concluse.length,
      totaleGol,
      mediaGolPartita,
      ritmoGolAlMinuto,
      minutiPerGol,
      golTooltip,
      totaleAssist,
      totaleSecondi,
      tempoTotaleDisplay: formatTempoTotale(totaleSecondi),
      durataMediaDisplay:
        mediaSecondiGara > 0 ? formatTempoTotale(mediaSecondiGara) : '-',
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

  activeFilterMeteoLabel = computed(() => {
    const m = this.filtroMeteo();
    if (m === 'all') return null;
    if (m === 'sereno') return '☀️ Sereno';
    if (m === 'nuvoloso') return '☁️ Nuvoloso';
    if (m === 'pioggia') return '🌧️ Pioggia';
    return m;
  });

  activeFilterFormatoLabel = computed(() => {
    const f = this.filtroFormato();
    if (f === 'all') return null;
    if (f === 'calcetto') return '⚽ Calcio a 5';
    if (f === 'calcio_a_6') return '⚽ Calcio a 6';
    if (f === 'calcio_a_7') return '⚽ Calcio a 7';
    return f;
  });

  // Helper per filtrare un singolo match con ricerca semantica avanzata (Mesi, Meteo, Formato, Campetto, Atleti)
  private matchSoddisfaFiltri(
    m: any,
    q: string,
    campetto: string,
    filtroMeteo: string,
    filtroFormato: string,
  ): boolean {
    // 1. Filtro esplicito Campetto
    if (campetto !== 'all') {
      if ((m.luogo || '').trim().toLowerCase() !== campetto.toLowerCase()) {
        return false;
      }
    }

    // 2. Filtro esplicito Formato
    if (filtroFormato !== 'all') {
      const fLabel = this.getFormatoLabel(m).toLowerCase();
      if (
        filtroFormato === 'calcetto' &&
        !fLabel.includes('5') &&
        !fLabel.includes('calcetto')
      ) {
        return false;
      }
      if (filtroFormato === 'calcio_a_6' && !fLabel.includes('6')) {
        return false;
      }
      if (filtroFormato === 'calcio_a_7' && !fLabel.includes('7')) {
        return false;
      }
    }

    // 3. Condizione meteo per il match
    const meteo = this.weatherService.getWeatherForDate(m.dataPartita, m.meteo);
    const condLower = (meteo?.conditionDescription || '').toLowerCase();

    // 4. Filtro esplicito Meteo
    if (filtroMeteo !== 'all') {
      if (filtroMeteo === 'pioggia') {
        const isRainy =
          condLower.includes('piogg') ||
          condLower.includes('rovesc') ||
          condLower.includes('temporale');
        if (!isRainy) return false;
      } else if (filtroMeteo === 'nuvoloso') {
        const isCloudy =
          condLower.includes('nuvol') ||
          condLower.includes('copert') ||
          condLower.includes('variabile');
        if (!isCloudy) return false;
      } else if (filtroMeteo === 'sereno') {
        const isSunny =
          condLower.includes('seren') || condLower.includes('sole');
        if (!isSunny) return false;
      }
    }

    // 5. Ricerca testuale naturale (Search Bar)
    if (!q) return true;

    // A. Mesi e Date in Italiano
    const dateStr = (m.dataPartita || '').split('T')[0];
    let matchMeseData = false;
    if (dateStr && dateStr.length >= 10) {
      const parts = dateStr.split('-');
      const year = parts[0];
      const monthNum = parseInt(parts[1], 10);
      const day = parts[2];

      const mesiItaliani = [
        '',
        'gennaio',
        'febbraio',
        'marzo',
        'aprile',
        'maggio',
        'giugno',
        'luglio',
        'agosto',
        'settembre',
        'ottobre',
        'novembre',
        'dicembre',
      ];
      const mesiShort = [
        '',
        'gen',
        'feb',
        'mar',
        'apr',
        'mag',
        'giu',
        'lug',
        'ago',
        'set',
        'ott',
        'nov',
        'dic',
      ];

      const nomeMese = mesiItaliani[monthNum] || '';
      const nomeMeseShort = mesiShort[monthNum] || '';

      if (
        nomeMese.includes(q) ||
        (q.length >= 3 && nomeMeseShort.startsWith(q)) ||
        year.includes(q) ||
        dateStr.includes(q) ||
        `${day}/${parts[1]}`.includes(q) ||
        `${parseInt(day, 10)} ${nomeMese}`.includes(q)
      ) {
        matchMeseData = true;
      }
    }

    // B. Match Condizioni Meteo
    const matchMeteoSearch =
      condLower.includes(q) ||
      (q.includes('piogg') &&
        (condLower.includes('piogg') ||
          condLower.includes('rovesc') ||
          condLower.includes('temporale'))) ||
      (q.includes('seren') &&
        (condLower.includes('seren') || condLower.includes('sole'))) ||
      (q.includes('nuvol') &&
        (condLower.includes('nuvol') ||
          condLower.includes('copert') ||
          condLower.includes('variabile'))) ||
      (q.includes('tempor') && condLower.includes('tempor')) ||
      (q.includes('vento') && condLower.includes('vento')) ||
      (q.includes('fredd') &&
        (meteo.tempMax <= 13 || condLower.includes('fredd'))) ||
      (q.includes('cald') &&
        (meteo.tempMax >= 26 || condLower.includes('cald')));

    // C. Match Formato
    const fLabel = this.getFormatoLabel(m).toLowerCase();
    const matchFormatoSearch =
      fLabel.includes(q) ||
      (q === 'calcetto' &&
        (fLabel.includes('5') || fLabel.includes('calcetto'))) ||
      (q.includes('calcio a 5') && fLabel.includes('5')) ||
      (q.includes('calcio a 6') && fLabel.includes('6')) ||
      (q.includes('calcio a 7') && fLabel.includes('7')) ||
      (q === '5v5' && fLabel.includes('5')) ||
      (q === '6v6' && fLabel.includes('6')) ||
      (q === '7v7' && fLabel.includes('7'));

    // D. Match Luogo / Campetto
    const matchLuogo = (m.luogo || '').toLowerCase().includes(q);

    // E. Match Giocatori, Convocati, Marcatori, Assist
    const matchPlayer = [
      ...(m.teamA || []),
      ...(m.teamB || []),
      ...(m.convocati || []),
    ].some((p: any) =>
      (p.nome || p.soprannome || '').toLowerCase().includes(q),
    );

    const matchScorer = (m.eventiGol || []).some(
      (e: any) =>
        (e.nome || '').toLowerCase().includes(q) ||
        (e.assistNome || '').toLowerCase().includes(q),
    );

    const matchNote =
      (m.commentoPartita || '').toLowerCase().includes(q) ||
      (m.notePortieri || '').toLowerCase().includes(q);

    return (
      matchMeseData ||
      matchMeteoSearch ||
      matchFormatoSearch ||
      matchLuogo ||
      matchPlayer ||
      matchScorer ||
      matchNote
    );
  }

  // --- SEZIONI IN EVIDENZA (PINNED) ---
  partiteInCorso = computed(() => {
    const list = this.partiteFiltrate();
    if (!list) return [];
    const q = this.searchQuery().toLowerCase().trim();
    const c = this.filtroCampetto();
    const fm = this.filtroMeteo();
    const ff = this.filtroFormato();
    return list
      .filter((m: any) => m.status === 'in_corso')
      .filter((m: any) => this.matchSoddisfaFiltri(m, q, c, fm, ff))
      .sort(
        (a: any, b: any) =>
          (b.dataOra?.seconds ?? 0) - (a.dataOra?.seconds ?? 0),
      );
  });

  partiteInPreparazione = computed(() => {
    const list = this.partiteFiltrate();
    if (!list) return [];
    const q = this.searchQuery().toLowerCase().trim();
    const c = this.filtroCampetto();
    const fm = this.filtroMeteo();
    const ff = this.filtroFormato();
    return list
      .filter((m: any) => m.status === 'da_definire')
      .filter((m: any) => this.matchSoddisfaFiltri(m, q, c, fm, ff))
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
    const fm = this.filtroMeteo();
    const ff = this.filtroFormato();
    return list
      .filter(
        (m: any) => m.status === 'pronta' || (!m.status && !m.matchConcluso),
      )
      .filter((m: any) => this.matchSoddisfaFiltri(m, q, c, fm, ff))
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
    const fm = this.filtroMeteo();
    const ff = this.filtroFormato();
    return list
      .filter(
        (m: any) =>
          (m.status === 'conclusa' || m.matchConcluso) && !m.pagelleInserite,
      )
      .filter((m: any) => this.matchSoddisfaFiltri(m, q, c, fm, ff))
      .sort(
        (a: any, b: any) =>
          (b.dataOra?.seconds ?? 0) - (a.dataOra?.seconds ?? 0),
      );
  });

  totalePartiteInEvidenza = computed(() => {
    return (
      this.partiteInCorso().length +
      this.partiteInPreparazione().length +
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
    const fm = this.filtroMeteo();
    const ff = this.filtroFormato();

    // Filtra per testo, campetto, meteo e formato
    let list = base.filter((m: any) =>
      this.matchSoddisfaFiltri(m, q, c, fm, ff),
    );

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
      footballOutline,
      flame,
      flash,
      flameOutline,
      flashOutline,
      micOutline,
      sparklesOutline,
      shieldOutline,
      play,
      timeOutline,
      star,
      searchOutline,
      closeCircle,
      filter,
      locationOutline,
      calendarClearOutline,
      constructOutline,
      playCircle,
      starHalf,
      trophy,
      calendarOutline,
      navigateOutline,
      chevronForward,
      peopleOutline,
      image,
      expandOutline,
      people,
      chatboxEllipsesOutline,
      mic,
      sparkles,
      logoWhatsapp,
      trash,
      add,
      checkmarkDoneCircle,
      time,
      close,
      arrowBack,
      radioOutline,
      imageOutline,
      globeOutline,
      shareSocialOutline,
      chevronDown,
      chevronUp,
      swapVerticalOutline,
      shieldCheckmark,
      openOutline,
      sunnyOutline,
      statsChartOutline,
      checkmarkOutline,
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

  impostaOrdinamentoRapido(criterio: CriterioOrdinamentoPartite, asc: boolean) {
    this.criterioOrdinamento.set(criterio);
    this.ordineCrescente.set(asc);
  }

  selezionaFiltroCampetto(campetto: string) {
    this.filtroCampetto.set(campetto);
  }

  resetFiltroCampetto() {
    this.filtroCampetto.set('all');
  }

  selezionaFiltroMeteo(meteo: string) {
    this.filtroMeteo.set(meteo);
  }

  resetFiltroMeteo() {
    this.filtroMeteo.set('all');
  }

  selezionaFiltroFormato(formato: string) {
    this.filtroFormato.set(formato);
  }

  resetFiltroFormato() {
    this.filtroFormato.set('all');
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
    this.filtroMeteo.set('all');
    this.filtroFormato.set('all');
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
    const fromPlayers = [...(m.teamA || []), ...(m.teamB || [])].reduce(
      (acc, p) => acc + (p.assist || 0),
      0,
    );
    return fromPlayers;
  }

  calcolaDurataSecondiPartita(m: any): number {
    let sec = 0;
    if (typeof m.cronometro === 'number' && m.cronometro > 0) {
      sec = m.cronometro;
    } else {
      const startMs =
        m.startedAt ??
        (m.inizioPartita?.toMillis
          ? m.inizioPartita.toMillis()
          : m.inizioPartita?.seconds
            ? m.inizioPartita.seconds * 1000
            : null);
      const endMs =
        m.endedAt ??
        (m.finePartita?.toMillis
          ? m.finePartita.toMillis()
          : m.finePartita?.seconds
            ? m.finePartita.seconds * 1000
            : null) ??
        m.finishedAt;

      if (startMs && endMs && endMs > startMs) {
        sec = Math.round((endMs - startMs) / 1000);
      } else if (
        typeof m.accumulatedTime === 'number' &&
        m.accumulatedTime > 0
      ) {
        sec =
          m.accumulatedTime > 10000
            ? Math.round(m.accumulatedTime / 1000)
            : m.accumulatedTime;
      } else if (m.status === 'conclusa' || m.matchConcluso) {
        sec = 3000; // 50 minuti standard
      }
    }
    if (sec > 21600) {
      sec = 3600; // Capping di sicurezza se timer dimenticato acceso (> 6 ore)
    }
    return sec;
  }

  getOrariGaraDisplay(m: any): {
    startStr: string;
    endStr: string | null;
    fullRangeStr: string;
    isReal: boolean;
  } {
    if (!m) {
      return { startStr: '', endStr: null, fullRangeStr: '', isReal: false };
    }

    // Se la partita ha un orario ufficiale fissato (es. "19:00", "20:00", "21:00"),
    // mostriamo quello per coerenza ed eleganza visiva con tutte le altre partite
    const orarioUfficiale = (m.orario || m.ora || '').trim();
    if (orarioUfficiale) {
      return {
        startStr: orarioUfficiale,
        endStr: null,
        fullRangeStr: orarioUfficiale,
        isReal: false,
      };
    }

    // 1. Orario Inizio (fallback se non c'è orario ufficiale)
    let startStr: string | null = m.orarioInizioReale || null;
    let isReal = false;

    if (!startStr) {
      const startMs =
        m.startedAt ??
        (m.inizioPartita?.toMillis
          ? m.inizioPartita.toMillis()
          : m.inizioPartita?.seconds
            ? m.inizioPartita.seconds * 1000
            : null) ??
        (m.timerStartAt && m.isTimerRunning ? m.timerStartAt : null);
      if (typeof startMs === 'number' && startMs > 0) {
        startStr = new Intl.DateTimeFormat('it-IT', {
          timeZone: 'Europe/Rome',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(startMs));
        isReal = true;
      }
    } else {
      isReal = true;
    }

    // Fallback orario programmato se non reale
    if (!startStr) {
      startStr = m.orario || m.ora || '';
      isReal = false;
    }

    // 2. Orario Fine
    let endStr: string | null = m.orarioFineReale || null;
    if (!endStr) {
      const endMs =
        m.endedAt ??
        (m.finePartita?.toMillis
          ? m.finePartita.toMillis()
          : m.finePartita?.seconds
            ? m.finePartita.seconds * 1000
            : null) ??
        m.finishedAt;
      if (typeof endMs === 'number' && endMs > 0) {
        endStr = new Intl.DateTimeFormat('it-IT', {
          timeZone: 'Europe/Rome',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(endMs));
      } else if (isReal && (m.status === 'conclusa' || m.matchConcluso)) {
        const startMs =
          m.startedAt ??
          (m.inizioPartita?.toMillis
            ? m.inizioPartita.toMillis()
            : m.inizioPartita?.seconds
              ? m.inizioPartita.seconds * 1000
              : null);
        const durSec = this.calcolaDurataSecondiPartita(m);
        if (startMs && durSec > 0) {
          endStr = new Intl.DateTimeFormat('it-IT', {
            timeZone: 'Europe/Rome',
            hour: '2-digit',
            minute: '2-digit',
          }).format(new Date(startMs + durSec * 1000));
        }
      }
    }

    const finalStartStr = startStr || '';
    let fullRangeStr = finalStartStr;
    if (endStr && endStr !== finalStartStr) {
      fullRangeStr = finalStartStr ? `${finalStartStr} - ${endStr}` : endStr;
    }

    return {
      startStr: finalStartStr,
      endStr,
      fullRangeStr,
      isReal,
    };
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
    const fromTeams = (m?.teamA?.length || 0) + (m?.teamB?.length || 0);
    if (fromTeams > 0) {
      return fromTeams;
    }
    if (Array.isArray(m?.convocati) && m.convocati.length > 0) {
      return m.convocati.filter((c: any) => c?.selezionato !== false).length;
    }
    return 0;
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
          subText:
            teamA > 0 && teamB > 0 ? `${teamA} vs ${teamB}` : 'Convocati',
          subType: 'neutral',
        };
      }
      case 'data':
      default: {
        const golTot = (m.scoreA || 0) + (m.scoreB || 0);
        return {
          valore: `${golTot}`,
          etichetta: 'GOL TOTALI',
          subText: `${m.scoreA || 0} - ${m.scoreB || 0}`,
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
    await this.shareService.shareMatch(partita);
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
      case 'da_definire':
        return 'badge-warning';
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
      case 'da_definire':
        return 'construct-outline';
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
      case 'da_definire':
        return 'IN PREPARAZIONE';
      case 'pronta':
      default:
        return "Fischio d'inizio";
    }
  }

  async apriPartita(partita?: any) {
    if (!partita && !this.isAdmin) return;

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
    if (!this.isAdmin) return;
    const alert = await this.alertController.create({
      header: 'Elimina Partita',
      message: `Vuoi spostare il match a ${match.luogo || 'Campo'} nel Cestino? Potrai annullare subito o ripristinarlo (inclusa la foto) entro 24 ore.`,
      buttons: [
        {
          text: 'Annulla',
          role: 'cancel',
          handler: () => slidingItem.close(),
        },
        {
          text: 'Sposta nel Cestino (24h)',
          role: 'destructive',
          handler: async () => {
            slidingItem.close();
            await this.trashService.softDeleteMatch(match);
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
