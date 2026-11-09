import {
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonIcon,
  ToastController,
  AlertController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  calendar,
  calendarOutline,
  chevronBack,
  chevronForward,
  todayOutline,
  sunnyOutline,
  rainyOutline,
  partlySunnyOutline,
  giftOutline,
  checkmarkCircle,
  checkmarkCircleOutline,
  closeCircle,
  logoWhatsapp,
  navigateOutline,
  locationOutline,
  peopleOutline,
  footballOutline,
  timeOutline,
  informationCircleOutline,
  shieldCheckmarkOutline,
  pauseCircleOutline,
  playCircleOutline,
  shareSocialOutline,
  sparklesOutline,
  refreshOutline,
  flame,
  helpCircle,
  helpCircleOutline,
  shieldCheckmark,
  radioButtonOff,
  people,
  flash,
  addCircleOutline,
  removeCircleOutline,
  layersOutline,
  checkboxOutline,
  chevronDownOutline,
  chevronUpOutline,
} from 'ionicons/icons';
import { environment } from 'src/environments/environment';

import { AuthService } from '../../services/auth.service';
import { StatsEngineService } from '../../services/stats-engine.service';
import { AvailabilityService, getLocalIsoDate } from '../../services/availability.service';
import { WeatherService, DailyWeatherForecast } from '../../services/weather.service';
import { CampiService } from '../../services/campi.service';
import { ShareService } from '../../services/share.service';
import { calcolaEta } from '../../utils/date-utils';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';
import { PlayerAvatarComponent } from '../player-avatar/player-avatar.component';
import { Giocatore } from '../../models/giocatore.model';
import { Partita, getMatchFormatByPlayerCount } from '../../models/partita.model';
import { DaySummary } from '../../models/weekly-availability.model';

export type CalendarViewMode = 'week' | 'month' | 'year';

export interface CalendarDayCell {
  date: Date;
  dateStr: string; // YYYY-MM-DD
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  isPast: boolean;
  matches: Partita[];
  birthdays: Giocatore[];
  weather?: DailyWeatherForecast;
  voteCount?: number;
  isQuorumReached?: boolean;
}

@Component({
  selector: 'app-calendario',
  templateUrl: './calendario.page.html',
  styleUrls: ['./calendario.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonButton,
    IonIcon,
    ThemeToggleComponent,
    PlayerAvatarComponent,
  ],
})
export class CalendarioPage implements OnInit {
  public auth = inject(AuthService);
  public statsEngine = inject(StatsEngineService);
  public availabilityService = inject(AvailabilityService);
  public weatherService = inject(WeatherService);
  public campiService = inject(CampiService);
  private router = inject(Router);
  private toastCtrl = inject(ToastController);
  private alertCtrl = inject(AlertController);
  private shareService = inject(ShareService);

  // Filtri calendario salvati in LocalStorage
  mostraPartitePassate = signal<boolean>(
    localStorage.getItem('cal_mostra_partite') !== 'false'
  );
  mostraMeteo = signal<boolean>(
    localStorage.getItem('cal_mostra_meteo') !== 'false'
  );
  mostraCompleanni = signal<boolean>(
    localStorage.getItem('cal_mostra_compleanni') !== 'false'
  );

  // Modalità di visualizzazione: default 'week' (focus disponibilità a tutta altezza)
  viewMode = signal<CalendarViewMode>('week');

  // Solo Mister e Presidente possono utilizzare lo zoom gerarchico
  readonly canUseZoom = computed(() => this.auth.isSuperUser());

  // Livello di zoom (0 = settimana, 1 = mese, 2 = anno)
  readonly zoomLevel = computed<number>(() => {
    switch (this.viewMode()) {
      case 'week': return 0;
      case 'month': return 1;
      case 'year': return 2;
    }
  });

  readonly canZoomIn = computed(() => this.canUseZoom() && this.zoomLevel() > 0);
  readonly canZoomOut = computed(() => this.canUseZoom() && this.zoomLevel() < 2);

  zoomIn() {
    if (!this.canZoomIn()) return;
    if (this.viewMode() === 'year') {
      this.viewMode.set('month');
    } else if (this.viewMode() === 'month') {
      this.viewMode.set('week');
    }
  }

  zoomOut() {
    if (!this.canZoomOut()) return;
    if (this.viewMode() === 'week') {
      this.viewMode.set('month');
    } else if (this.viewMode() === 'month') {
      this.viewMode.set('year');
    }
  }

  setViewMode(mode: CalendarViewMode) {
    if (!this.canUseZoom() && mode !== 'week') return;
    this.viewMode.set(mode);
  }

  /** Alterna ciclicamente le viste temporali (S -> M -> A -> S) con un singolo pulsante ultracompatto */
  cycleZoomView(): void {
    if (!this.canUseZoom()) return;
    const cur = this.viewMode();
    if (cur === 'week') {
      this.setViewMode('month');
    } else if (cur === 'month') {
      this.setViewMode('year');
    } else {
      this.setViewMode('week');
    }
  }

  readonly zoomCycleLabel = computed(() => {
    const mode = this.viewMode();
    if (mode === 'week') return 'S';
    if (mode === 'month') return 'M';
    return 'A';
  });

  readonly zoomCycleTitle = computed(() => {
    const mode = this.viewMode();
    if (mode === 'week') return 'Vista Settimana (S) • Clicca per Mese';
    if (mode === 'month') return 'Vista Mese (M) • Clicca per Anno';
    return 'Vista Anno (A) • Clicca per Settimana';
  });

  // Mese visualizzato attualmente (primo giorno del mese)
  selectedMonth = signal<Date>(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );

  // Giorno selezionato per il box di dettaglio (default: oggi)
  selectedDateStr = signal<string>(
    new Date().toISOString().split('T')[0]
  );

  // Meteo Roma (cache)
  weatherForecast = signal<DailyWeatherForecast[]>([]);
  isLoadingWeather = signal<boolean>(false);

  constructor() {
    addIcons({
      calendar,
      calendarOutline,
      chevronBack,
      chevronForward,
      todayOutline,
      sunnyOutline,
      rainyOutline,
      partlySunnyOutline,
      giftOutline,
      checkmarkCircle,
      checkmarkCircleOutline,
      closeCircle,
      logoWhatsapp,
      navigateOutline,
      locationOutline,
      peopleOutline,
      footballOutline,
      timeOutline,
      informationCircleOutline,
      shieldCheckmarkOutline,
      pauseCircleOutline,
      playCircleOutline,
      shareSocialOutline,
      sparklesOutline,
      refreshOutline,
      flame,
      helpCircle,
      helpCircleOutline,
      shieldCheckmark,
      radioButtonOff,
      people,
      flash,
      addCircleOutline,
      removeCircleOutline,
      layersOutline,
      checkboxOutline,
      chevronDownOutline,
      chevronUpOutline,
    });
  }

  ngOnInit() {
    this.caricaMeteo();
  }

  caricaMeteo() {
    this.isLoadingWeather.set(true);
    this.weatherService.getRomeForecast().subscribe({
      next: (forecast) => {
        this.weatherForecast.set(forecast);
        this.isLoadingWeather.set(false);
      },
      error: () => {
        this.isLoadingWeather.set(false);
      },
    });
  }

  // Toggle dei filtri con persistenza
  toggleFiltro(tipo: 'partite' | 'meteo' | 'compleanni') {
    if (tipo === 'partite') {
      const next = !this.mostraPartitePassate();
      this.mostraPartitePassate.set(next);
      localStorage.setItem('cal_mostra_partite', String(next));
    } else if (tipo === 'meteo') {
      const next = !this.mostraMeteo();
      this.mostraMeteo.set(next);
      localStorage.setItem('cal_mostra_meteo', String(next));
    } else if (tipo === 'compleanni') {
      const next = !this.mostraCompleanni();
      this.mostraCompleanni.set(next);
      localStorage.setItem('cal_mostra_compleanni', String(next));
    }
  }

  // Navigazione Mese
  mesePrecedente() {
    const cur = this.selectedMonth();
    this.selectedMonth.set(new Date(cur.getFullYear(), cur.getMonth() - 1, 1));
  }

  meseSuccessivo() {
    const cur = this.selectedMonth();
    this.selectedMonth.set(new Date(cur.getFullYear(), cur.getMonth() + 1, 1));
  }

  vaiAOggi() {
    const today = new Date();
    this.selectedMonth.set(new Date(today.getFullYear(), today.getMonth(), 1));
    this.selectedDateStr.set(today.toISOString().split('T')[0]);
  }

  annoPrecedente() {
    const d = this.selectedMonth();
    this.selectedMonth.set(new Date(d.getFullYear() - 1, d.getMonth(), 1));
  }

  annoSuccessivo() {
    const d = this.selectedMonth();
    this.selectedMonth.set(new Date(d.getFullYear() + 1, d.getMonth(), 1));
  }

  navigaPrecedente() {
    if (!this.canNavigaPrecedente()) return;
    if (this.viewMode() === 'week') {
      this.availabilityService.settimanaPrecedente();
    } else if (this.viewMode() === 'month') {
      this.mesePrecedente();
    } else {
      this.annoPrecedente();
    }
  }

  navigaSuccessivo() {
    if (this.viewMode() === 'week') {
      this.availabilityService.settimanaSuccessiva();
    } else if (this.viewMode() === 'month') {
      this.meseSuccessivo();
    } else {
      this.annoSuccessivo();
    }
  }

  navigaOggi() {
    const today = new Date();
    this.selectedMonth.set(new Date(today.getFullYear(), today.getMonth(), 1));
    this.selectedDateStr.set(getLocalIsoDate(today));
    this.availabilityService.vaiASettimanaDefault();
  }

  readonly canNavigaPrecedente = computed(() => {
    const earliest = this.availabilityService.earliestMatchDate();
    if (this.viewMode() === 'week') {
      return this.availabilityService.canGoToPreviousWeek();
    }
    if (this.viewMode() === 'month') {
      if (!earliest) return true;
      const curYear = this.selectedMonth().getFullYear();
      const curMonth = String(this.selectedMonth().getMonth() + 1).padStart(2, '0');
      const curMonthKey = `${curYear}-${curMonth}`;
      const earliestMonthKey = earliest.slice(0, 7);
      return curMonthKey > earliestMonthKey;
    }
    if (this.viewMode() === 'year') {
      if (!earliest) return true;
      const curYear = this.selectedMonth().getFullYear();
      const earliestYear = Number(earliest.slice(0, 4));
      return curYear > earliestYear;
    }
    return true;
  });

  readonly navigazioneHeaderLabel = computed(() => {
    if (this.viewMode() === 'week') {
      return this.availabilityService.activeWeekRangeLabel();
    }
    if (this.viewMode() === 'month') {
      return this.meseAnnoLabel();
    }
    return `${this.selectedMonth().getFullYear()}`;
  });

  // Panoramica dei 12 mesi per la vista Anno (riservata a Mister/Presidente)
  readonly yearMonthsOverview = computed(() => {
    const currentYear = this.selectedMonth().getFullYear();
    const allMatches = this.statsEngine.partiteRaw() || [];
    const today = new Date();
    const currentMonthIdx =
      today.getFullYear() === currentYear ? today.getMonth() : -1;

    const months = [];
    for (let m = 0; m < 12; m++) {
      const d = new Date(currentYear, m, 1);
      const mStr = String(m + 1).padStart(2, '0');
      const monthPrefix = `${currentYear}-${mStr}`;

      const monthMatches = allMatches.filter((p) =>
        (p.dataPartita || '').startsWith(monthPrefix)
      );
      const conclusi = monthMatches.filter((p) => p.matchConcluso).length;
      const inProgramma = monthMatches.length - conclusi;

      const monthName = d.toLocaleDateString('it-IT', { month: 'long' });
      months.push({
        monthIndex: m,
        monthName: monthName.charAt(0).toUpperCase() + monthName.slice(1),
        monthDate: d,
        matchesCount: monthMatches.length,
        conclusi,
        inProgramma,
        isCurrentMonth: m === currentMonthIdx,
      });
    }
    return months;
  });

  selezionaMeseEZoom(monthIndex: number) {
    const year = this.selectedMonth().getFullYear();
    this.selectedMonth.set(new Date(year, monthIndex, 1));
    this.viewMode.set('month');
  }

  selezionaGiornoEZoom(cell: CalendarDayCell) {
    this.selezionaGiorno(cell);
    this.viewMode.set('week');
  }

  // Label Mese / Anno
  readonly meseAnnoLabel = computed(() => {
    const d = this.selectedMonth();
    const mese = d.toLocaleDateString('it-IT', { month: 'long' });
    const anno = d.getFullYear();
    return `${mese.charAt(0).toUpperCase() + mese.slice(1)} ${anno}`;
  });

  // Mappa partite per data 'YYYY-MM-DD'
  readonly partiteByDate = computed(() => {
    const map = new Map<string, Partita[]>();
    const all = this.statsEngine.partiteRaw() || [];
    for (const p of all) {
      if (!p.dataPartita) continue;
      const key = p.dataPartita.split('T')[0];
      const list = map.get(key) || [];
      list.push(p);
      map.set(key, list);
    }
    return map;
  });

  // Mappa compleanni per 'GG/MM'
  readonly compleanniByDayMonth = computed(() => {
    const map = new Map<string, Giocatore[]>();
    const giocatori = this.statsEngine.giocatoriRaw() || [];
    for (const g of giocatori) {
      if (!g.dataNascita) continue;
      const parts = g.dataNascita.split('/');
      if (parts.length >= 2) {
        const dd = parts[0].padStart(2, '0');
        const mm = parts[1].padStart(2, '0');
        const key = `${dd}/${mm}`;
        const list = map.get(key) || [];
        list.push(g);
        map.set(key, list);
      }
    }
    return map;
  });

  // Mappa meteo per 'YYYY-MM-DD'
  readonly weatherMap = computed(() => {
    const map = new Map<string, DailyWeatherForecast>();
    for (const item of this.weatherForecast()) {
      map.set(item.date, item);
    }
    return map;
  });

  // Griglia 7 colonne del mese corrente
  readonly calendarGrid = computed<CalendarDayCell[]>(() => {
    const monthDate = this.selectedMonth();
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();

    const todayStr = new Date().toISOString().split('T')[0];
    const selected = this.selectedDateStr();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    let startingDayOfWeek = firstDay.getDay() - 1;
    if (startingDayOfWeek === -1) startingDayOfWeek = 6;

    const cells: CalendarDayCell[] = [];

    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthLastDay - i);
      cells.push(this.creaCell(d, false, todayStr, selected));
    }

    for (let day = 1; day <= lastDay.getDate(); day++) {
      const d = new Date(year, month, day);
      cells.push(this.creaCell(d, true, todayStr, selected));
    }

    const remaining = (7 - (cells.length % 7)) % 7;
    for (let day = 1; day <= remaining; day++) {
      const d = new Date(year, month + 1, day);
      cells.push(this.creaCell(d, false, todayStr, selected));
    }

    return cells;
  });

  private creaCell(
    d: Date,
    isCurrentMonth: boolean,
    todayStr: string,
    selectedStr: string
  ): CalendarDayCell {
    const yearStr = d.getFullYear();
    const mmStr = String(d.getMonth() + 1).padStart(2, '0');
    const ddStr = String(d.getDate()).padStart(2, '0');
    const dateStr = `${yearStr}-${mmStr}-${ddStr}`;
    const dayMonthKey = `${ddStr}/${mmStr}`;

    const matches = this.partiteByDate().get(dateStr) || [];
    const birthdays = this.compleanniByDayMonth().get(dayMonthKey) || [];
    const weather = this.weatherMap().get(dateStr);

    const activeSummaries = this.availabilityService.daySummaries();
    const daySummary = activeSummaries.find((s) => s.date === dateStr);
    const voteCount = daySummary?.voterCount;
    const isQuorumReached = daySummary?.hasQuorum;

    return {
      date: d,
      dateStr,
      dayNumber: d.getDate(),
      isCurrentMonth,
      isToday: dateStr === todayStr,
      isSelected: dateStr === selectedStr,
      isPast: dateStr < todayStr,
      matches,
      birthdays,
      weather,
      voteCount,
      isQuorumReached,
    };
  }

  selezionaGiorno(cellOrDateStr: CalendarDayCell | string) {
    const dateStr =
      typeof cellOrDateStr === 'string' ? cellOrDateStr : cellOrDateStr.dateStr;
    this.selectedDateStr.set(dateStr);
  }

  // Dettaglio del giorno selezionato
  readonly selectedDayDetail = computed(() => {
    const dateStr = this.selectedDateStr();
    if (!dateStr) return null;

    const parts = dateStr.split('-');
    if (parts.length !== 3) return null;

    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const ddStr = String(d.getDate()).padStart(2, '0');
    const mmStr = String(d.getMonth() + 1).padStart(2, '0');
    const dayMonthKey = `${ddStr}/${mmStr}`;

    const dateFormatted = d.toLocaleDateString('it-IT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const matches = this.partiteByDate().get(dateStr) || [];
    const birthdays = this.compleanniByDayMonth().get(dayMonthKey) || [];
    const weather = this.weatherMap().get(dateStr);

    const activeSummaries = this.availabilityService.daySummaries();
    const daySummary = activeSummaries.find((s) => s.date === dateStr);
    const allPlayers = this.statsEngine.giocatoriRaw();
    const availablePlayers = (daySummary?.voters || [])
      .map((v) =>
        allPlayers.find(
          (g) =>
            (v.playerId && g.id === v.playerId) ||
            (g.linkedUid && g.linkedUid === v.uid)
        )
      )
      .filter((g): g is Giocatore => !!g);

    const isAvailableForMe = this.availabilityService.myVotedDates().includes(dateStr);
    const isMaybeForMe = this.availabilityService.myMaybeDates().includes(dateStr);
    const maybePlayers = (daySummary?.maybeVoters || [])
      .map((v) =>
        allPlayers.find(
          (g) =>
            (v.playerId && g.id === v.playerId) ||
            (g.linkedUid && g.linkedUid === v.uid)
        )
      )
      .filter((g): g is Giocatore => !!g);

    return {
      date: d,
      dateStr,
      dateFormatted:
        dateFormatted.charAt(0).toUpperCase() + dateFormatted.slice(1),
      isPast: dateStr < new Date().toISOString().split('T')[0],
      isToday: dateStr === new Date().toISOString().split('T')[0],
      matches,
      birthdays,
      weather,
      daySummary,
      availablePlayers,
      maybePlayers,
      isAvailableForMe,
      isMaybeForMe,
      isInActiveWeek: !!daySummary,
    };
  });

  /** Giorno selezionato nella striscia settimanale compatta per la scheda focus */
  readonly selectedWeekDayStr = signal<string | null>(null);

  // Voti nei 7 giorni della settimana attiva (Lun -> Dom)
  readonly activeWeekDaysList = computed(() => {
    const summaries = this.availabilityService.daySummaries();
    const myVoted = this.availabilityService.myVotedDates();
    const myMaybe = this.availabilityService.myMaybeDates();
    const allPlayers = this.statsEngine.giocatoriRaw();
    const todayStr = getLocalIsoDate();
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowStr = getLocalIsoDate(tomorrowDate);

    // Identifica il massimo di preferenze per far risaltare il giorno o i giorni con più voti (anche con pareggio)
    const upcomingSummaries = summaries.filter((s) => s.date >= todayStr);
    const maxVotes = Math.max(0, ...upcomingSummaries.map((s) => s.voterCount));

    return summaries.map((s) => {
      const weather = this.weatherMap().get(s.date);

      const players = s.voters
        .map((v) =>
          allPlayers.find(
            (g) =>
              (v.playerId && g.id === v.playerId) ||
              (g.linkedUid && g.linkedUid === v.uid)
          )
        )
        .filter((g): g is Giocatore => !!g);

      const maybePlayers = s.maybeVoters
        .map((v) =>
          allPlayers.find(
            (g) =>
              (v.playerId && g.id === v.playerId) ||
              (g.linkedUid && g.linkedUid === v.uid)
          )
        )
        .filter((g): g is Giocatore => !!g);

      const isPast = s.date < todayStr;
      const isToday = s.date === todayStr;
      const isTomorrow = s.date === tomorrowStr;
      const isTopVoted = !isPast && maxVotes > 0 && s.voterCount === maxVotes;
      const matches = this.partiteByDate().get(s.date) || [];

      const [y, m, d] = s.date.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      const rawFull = dateObj.toLocaleDateString('it-IT', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
      const dayLabelFull = rawFull.charAt(0).toUpperCase() + rawFull.slice(1);

      const shortMonth = dateObj.toLocaleDateString('it-IT', { month: 'short' }).replace('.', '');
      const shortDateLabel = `${s.dayName} ${s.dayNumber} ${shortMonth.charAt(0).toUpperCase() + shortMonth.slice(1)}`;

      const quorumTarget = 10;
      const pollPercentage = Math.min(100, Math.round((s.voterCount / quorumTarget) * 100));

      const avatarSlice = players.slice(0, 4);
      const extraCount = Math.max(0, players.length - 4);

      return {
        dateStr: s.date,
        dayName: s.dayName,
        dayNumber: s.dayNumber,
        dayLabel: `${s.dayName} ${s.dayNumber}`,
        dayLabelFull,
        shortDateLabel,
        pollPercentage,
        avatarSlice,
        extraCount,
        summary: s,
        isPast,
        isToday,
        isTomorrow,
        matches,
        count: s.voterCount,
        maybeCount: s.maybeCount,
        isQuorumReached: s.hasQuorum,
        missingToQuorum: s.missingForQuorum,
        formatInfo: s.formatInfo,
        weather,
        isVotedByMe: myVoted.includes(s.date),
        isMaybeByMe: myMaybe.includes(s.date),
        isTopVoted,
        players,
        maybePlayers,
      };
    });
  });

  /** Giorni della settimana attiva che hanno raggiunto il quorum (>= 10 voti) per la creazione partita da parte del Mister */
  readonly daysWithQuorum = computed(() => {
    return this.activeWeekDaysList().filter((d) => d.isQuorumReached && !d.isPast);
  });

  /** Giorno attualmente in focus nella striscia settimanale */
  readonly focusedWeekDay = computed(() => {
    const days = this.activeWeekDaysList();
    if (days.length === 0) return null;
    const selected = this.selectedWeekDayStr();
    if (selected) {
      const found = days.find((d) => d.dateStr === selected);
      if (found) return found;
    }
    // Default: il giorno più votato futuro, oppure oggi, oppure il primo giorno non passato
    const nonPast = days.filter((d) => !d.isPast);
    if (nonPast.length > 0) {
      const top = nonPast.find((d) => d.isTopVoted);
      if (top) return top;
      const today = nonPast.find((d) => d.isToday);
      if (today) return today;
      return nonPast[0];
    }
    return days[0];
  });

  // Giorno attualmente espanso con il micro-accordion (single-expand: solo uno alla volta)
  expandedDay = signal<string | null>(null);

  toggleAccordionDay(dateStr: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    const current = this.expandedDay();
    this.expandedDay.set(current === dateStr ? null : dateStr);
  }

  /** Mostra elenco convocati in un alert dialog compatto e leggibile */
  async apriDettaglioVotanti(day: any, event?: Event): Promise<void> {
    if (event) {
      event.stopPropagation();
    }
    if (!day.players || day.players.length === 0) return;

    const namesList = day.players
      .map((p: Giocatore, idx: number) => `<b>${idx + 1}.</b> ${p.nome}`)
      .join('<br>');
    const quorumMsg = day.isQuorumReached
      ? '<br><br><span style="color:#10b981;font-weight:bold;">🟢 Quorum raggiunto (' +
        day.count +
        '/10)</span>'
      : `<br><br><span style="color:#94a3b8;">Mancano ${day.missingToQuorum} atleti al quorum</span>`;

    const alert = await this.alertCtrl.create({
      header: day.dayLabelFull,
      subHeader: `${day.count} presenze confermate`,
      message: `${namesList}${quorumMsg}`,
      buttons: ['Chiudi'],
      cssClass: 'voters-detail-alert',
    });
    await alert.present();
  }

  selezionaGiornoSettimana(dateStr: string): void {
    this.selectedWeekDayStr.set(dateStr);
  }

  /**
   * Click rapido a 1-tap sulla pillola della settimana:
   * - Seleziona il giorno nel calendario/dettaglio sottostante
   * - Vota/deseleziona la presenza istantaneamente come in un sondaggio
   */
  onStripDayClick(dateStr: string): void {
    this.selezionaGiorno(dateStr);
    const todayStr = getLocalIsoDate();
    if (this.auth.isLoggedIn() && dateStr >= todayStr) {
      this.toggleVotoGiorno(dateStr);
    }
  }

  /** Dettaglio sintetico sul giorno più votato della settimana per evidenziarlo all'atleta */
  readonly topVotedDayInfo = computed(() => {
    const days = this.activeWeekDaysList().filter((d) => !d.isPast);
    const maxVotes = Math.max(0, ...days.map((d) => d.count));
    if (maxVotes === 0) return null;
    const topDays = days.filter((d) => d.count === maxVotes);
    if (topDays.length === 0) return null;
    if (topDays.length === 1) {
      return {
        label: topDays[0].dayLabel,
        count: topDays[0].count,
        hasQuorum: topDays[0].isQuorumReached,
      };
    }
    return {
      label: topDays.map((d) => d.dayLabel).join(' e '),
      count: maxVotes,
      hasQuorum: topDays.some((d) => d.isQuorumReached),
    };
  });

  readonly isDevMode = !environment.production;

  async simulaVotiCompagniDev(): Promise<void> {
    try {
      await this.availabilityService.simulaVotiCompagniDev();
      const t = await this.toastCtrl.create({
        message: '⚡ Voti compagni simulati con successo (numeri diversi per giorno)!',
        duration: 2500,
        color: 'success',
        position: 'top',
      });
      await t.present();
    } catch (e: any) {
      const t = await this.toastCtrl.create({
        message: e.message || 'Errore simulazione voti',
        duration: 3000,
        color: 'danger',
        position: 'top',
      });
      await t.present();
    }
  }

  async resetVotiCompagniDev(): Promise<void> {
    try {
      await this.availabilityService.resetVotiCompagniDev();
      const t = await this.toastCtrl.create({
        message: '↺ Voti simulati azzerati.',
        duration: 2000,
        color: 'medium',
        position: 'top',
      });
      await t.present();
    } catch {
      // ignore
    }
  }

  /** Mostra toast con meteo dettagliato (fondamentale per mobile dove il title non ha hover) */
  async mostraInfoMeteo(
    weather?: DailyWeatherForecast,
    dayLabel?: string,
    event?: Event
  ): Promise<void> {
    if (event) {
      event.stopPropagation();
    }
    if (!weather) return;

    const safeEmoji = (weather.iconEmoji && !weather.iconEmoji.includes('🌫')) ? weather.iconEmoji : '🌁';
    const toast = await this.toastCtrl.create({
      header: `Meteo ${dayLabel ? dayLabel : ''} ${safeEmoji}`,
      message: `${weather.conditionDescription} • Max ${weather.tempMax}°C / Min ${weather.tempMin}°C • 💧 Rischio Pioggia: ${weather.rainProbability}%`,
      duration: 3500,
      position: 'top',
      color: 'dark',
      buttons: [
        {
          text: 'Chiudi',
          role: 'cancel',
        },
      ],
    });
    await toast.present();
  }

  // Toggle voto atleta per un giorno specifico ('yes' = Ci sono, 'maybe' = Forse)
  async toggleVotoGiorno(dateStr: string, type: 'yes' | 'maybe' = 'yes') {
    if (!this.auth.isLoggedIn()) {
      const t = await this.toastCtrl.create({
        message: 'Accedi per esprimere le tue disponibilità.',
        duration: 3000,
        color: 'warning',
        position: 'top',
      });
      await t.present();
      return;
    }

    try {
      await this.availabilityService.toggleDayVote(dateStr, type);
    } catch (e: any) {
      const t = await this.toastCtrl.create({
        message: e.message || 'Errore durante il salvataggio della disponibilità',
        duration: 3000,
        color: 'danger',
        position: 'top',
      });
      await t.present();
    }
  }

  // Fissa / Crea Partita Ufficiale da uno slot del calendario (Mister / Presidente)
  async fissaPartitaSlot(dateStr: string) {
    if (!this.auth.isSuperUser()) return;

    const activeSummaries = this.availabilityService.daySummaries();
    let day: DaySummary = activeSummaries.find((d) => d.date === dateStr) || {
      date: dateStr,
      dayName: 'Lun',
      dayNumber: new Date(dateStr).getDate(),
      voters: [],
      voterCount: 0,
      maybeVoters: [],
      maybeCount: 0,
      formatInfo: {
        format: 'calcetto',
        label: 'Calcetto (5v5)',
        perTeam: 5,
      },
      hasQuorum: false,
      missingForQuorum: 10,
    };

    const count = day.voterCount || 0;
    const defaultCampo = 'Roma 6';
    const campoMapsUrl = this.campiService.getGoogleMapsUrl(defaultCampo);

    try {
      const newMatchId = await this.availabilityService.convertDayToMatch(
        day,
        defaultCampo,
        campoMapsUrl,
        '21:00'
      );

      if (newMatchId) {
        const toast = await this.toastCtrl.create({
          message:
            count > 0
              ? `⚽ Partita avviata per ${day.date}! ${count} atleti nei convocati. Personalizza campo, maps e dettagli.`
              : `⚽ Nuova partita avviata per ${day.date}! Scegli campo, maps e coordinate.`,
          duration: 3000,
          color: 'success',
          position: 'top',
        });
        await toast.present();
        this.router.navigate(['/partite', newMatchId], {
          queryParams: { returnUrl: '/disponibilita' },
        });
      }
    } catch (err: any) {
      const toast = await this.toastCtrl.create({
        message: err.message || 'Errore nella creazione della partita',
        duration: 3500,
        color: 'danger',
        position: 'top',
      });
      await toast.present();
    }
  }

  // Condividi disponibilità su WhatsApp (Azione diretta One-Tap con testo ultra-compatto)
  async condividiSuWhatsApp() {
    await this.shareService.shareWeeklyAvailability(this.topVotedDayInfo());
  }

  // Toggle Pausa Estiva (Mister & Presidente)
  async togglePausaEstiva() {
    if (!this.auth.isSuperUser()) return;
    const isCurrentlyActive = this.availabilityService.isSummerBreakActive();
    await this.availabilityService.toggleSummerBreak(!isCurrentlyActive);
    const t = await this.toastCtrl.create({
      message: !isCurrentlyActive ? 'Pausa estiva attivata.' : 'Pausa estiva terminata.',
      duration: 2500,
      color: 'success',
    });
    await t.present();
  }

  getExtraPlayersTitle(players: Giocatore[]): string {
    return players.slice(5).map((p) => p.nome).join(', ');
  }

  apriPartita(matchId?: string) {
    if (!matchId) return;
    this.router.navigate(['/partite', matchId], {
      queryParams: { returnUrl: '/disponibilita' },
    });
  }

  getGoogleMapsUrl(campo?: string): string {
    return this.campiService.getGoogleMapsUrl(campo || 'Roma');
  }

  getMatchConvocatiCount(m: any): number {
    if (Array.isArray(m?.convocati) && m.convocati.length > 0) {
      return m.convocati.length;
    }
    return (m?.teamA?.length || 0) + (m?.teamB?.length || 0);
  }

  getMatchConvocatiPreview(m: any): any[] {
    if (Array.isArray(m?.convocati) && m.convocati.length > 0) {
      return m.convocati;
    }
    return [...(m?.teamA || []), ...(m?.teamB || [])];
  }

  getEtaCompleanno(dataNascita?: string, targetDate?: Date): string | null {
    if (!dataNascita) return null;
    const eta = calcolaEta(dataNascita, targetDate);
    return eta !== null ? `(compie ${eta} anni)` : null;
  }
}
