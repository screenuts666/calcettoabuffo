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
  AlertController,
  ToastController,
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
  moonOutline,
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
} from 'ionicons/icons';

import { AuthService } from '../../services/auth.service';
import { StatsEngineService } from '../../services/stats-engine.service';
import { AvailabilityService, getLocalIsoDate } from '../../services/availability.service';
import { WeatherService, DailyWeatherForecast, LunarPhaseInfo } from '../../services/weather.service';
import { CampiService } from '../../services/campi.service';
import { calcolaEta } from '../../utils/date-utils';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';
import { PlayerAvatarComponent } from '../player-avatar/player-avatar.component';
import { Giocatore } from '../../models/giocatore.model';
import { Partita, getMatchFormatByPlayerCount } from '../../models/partita.model';
import { DaySummary } from '../../models/weekly-availability.model';
import { formatWeeklyAvailabilityForWhatsApp } from '../../utils/whatsapp-formatter';

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
  lunar?: LunarPhaseInfo;
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
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  // Filtri calendario salvati in LocalStorage
  mostraPartitePassate = signal<boolean>(
    localStorage.getItem('cal_mostra_partite') !== 'false'
  );
  mostraMeteo = signal<boolean>(
    localStorage.getItem('cal_mostra_meteo') !== 'false'
  );
  mostraFasiLunari = signal<boolean>(
    localStorage.getItem('cal_mostra_luna') === 'true'
  );
  mostraCompleanni = signal<boolean>(
    localStorage.getItem('cal_mostra_compleanni') !== 'false'
  );

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
      moonOutline,
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
  toggleFiltro(tipo: 'partite' | 'meteo' | 'luna' | 'compleanni') {
    if (tipo === 'partite') {
      const next = !this.mostraPartitePassate();
      this.mostraPartitePassate.set(next);
      localStorage.setItem('cal_mostra_partite', String(next));
    } else if (tipo === 'meteo') {
      const next = !this.mostraMeteo();
      this.mostraMeteo.set(next);
      localStorage.setItem('cal_mostra_meteo', String(next));
    } else if (tipo === 'luna') {
      const next = !this.mostraFasiLunari();
      this.mostraFasiLunari.set(next);
      localStorage.setItem('cal_mostra_luna', String(next));
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
    const lunar = this.mostraFasiLunari()
      ? this.weatherService.getLunarPhase(d)
      : undefined;

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
      lunar,
      voteCount,
      isQuorumReached,
    };
  }

  selezionaGiorno(cell: CalendarDayCell) {
    this.selectedDateStr.set(cell.dateStr);
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
    const lunar = this.weatherService.getLunarPhase(d);

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
      lunar,
      daySummary,
      availablePlayers,
      maybePlayers,
      isAvailableForMe,
      isMaybeForMe,
      isInActiveWeek: !!daySummary,
    };
  });

  // Voti nella settimana attiva (mostra solo i giorni da oggi in avanti)
  readonly activeWeekDaysList = computed(() => {
    const summaries = this.availabilityService.daySummaries();
    const myVoted = this.availabilityService.myVotedDates();
    const myMaybe = this.availabilityService.myMaybeDates();
    const allPlayers = this.statsEngine.giocatoriRaw();
    const todayStr = getLocalIsoDate();

    // Filtra via i giorni passati: mostra solo i giorni da oggi in avanti
    const upcomingSummaries = summaries.filter((s) => s.date >= todayStr);

    // Identifica il massimo di preferenze per far risaltare il giorno più scelto
    const maxVotes = Math.max(0, ...upcomingSummaries.map((s) => s.voterCount));
    // Mostra "Più Scelto" solo se ci sono almeno 2 voti e una chiara preferenza (max 2 giorni pari merito)
    const topDaysCount = upcomingSummaries.filter((s) => s.voterCount === maxVotes).length;
    const hasFavorite = maxVotes >= 2 && topDaysCount <= 2;

    return upcomingSummaries.map((s) => {
      const weather = this.weatherMap().get(s.date);
      const lunar = this.mostraFasiLunari()
        ? this.weatherService.getLunarPhase(s.date)
        : undefined;

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

      const isTopVoted = hasFavorite && s.voterCount === maxVotes;

      return {
        dateStr: s.date,
        dayLabel: `${s.dayName} ${s.dayNumber}`,
        summary: s,
        count: s.voterCount,
        maybeCount: s.maybeCount,
        isQuorumReached: s.hasQuorum,
        missingToQuorum: s.missingForQuorum,
        formatInfo: s.formatInfo,
        weather,
        lunar,
        isVotedByMe: myVoted.includes(s.date),
        isMaybeByMe: myMaybe.includes(s.date),
        isTopVoted,
        players,
        maybePlayers,
      };
    });
  });

  /** Dettaglio sintetico sul giorno più votato della settimana per evidenziarlo all'atleta */
  readonly topVotedDayInfo = computed(() => {
    const days = this.activeWeekDaysList();
    const topDays = days.filter((d) => d.isTopVoted && d.count >= 2);
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
      count: topDays[0].count,
      hasQuorum: topDays.some((d) => d.isQuorumReached),
    };
  });

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
    const subHeader =
      count > 0
        ? `Converti ${day.dayName} ${day.date} in partita ufficiale con i ${count} ${count === 1 ? 'atleta disponibile già inserito' : 'atleti disponibili già inseriti'} nei convocati!`
        : `Crea subito la partita per ${day.dayName} ${day.date}. Potrai aggiungere i convocati appena creata!`;

    const alert = await this.alertCtrl.create({
      header: count >= 10 ? 'Fissa Partita (Quorum Raggiunto!)' : 'Crea Partita da Calendario',
      subHeader,
      inputs: [
        {
          name: 'luogo',
          type: 'text',
          placeholder: 'Campo di gioco',
          value: 'Roma 6',
        },
        {
          name: 'orario',
          type: 'time',
          value: '21:00',
        },
      ],
      buttons: [
        {
          text: 'Annulla',
          role: 'cancel',
        },
        {
          text: count > 0 ? `Crea (${count} convocati)` : 'Crea Partita',
          handler: async (data) => {
            try {
              const campoMapsUrl = this.campiService.getGoogleMapsUrl(data.luogo || 'Roma 6');
              const newMatchId = await this.availabilityService.convertDayToMatch(
                day!,
                data.luogo || 'Roma 6',
                campoMapsUrl,
                data.orario || '21:00'
              );
              if (newMatchId) {
                const toast = await this.toastCtrl.create({
                  message:
                    count > 0
                      ? `Partita creata! ${count} atleti confermati e convocati.`
                      : 'Partita creata con successo!',
                  duration: 2500,
                  color: 'success',
                  position: 'top',
                });
                await toast.present();
                this.router.navigate(['/partite', newMatchId]);
              }
            } catch (err: any) {
              const toast = await this.toastCtrl.create({
                message: err.message || 'Errore nella creazione della partita',
                duration: 3500,
                color: 'danger',
              });
              await toast.present();
            }
          },
        },
      ],
    });
    await alert.present();
  }

  // Condividi disponibilità su WhatsApp (Aperto a tutti gli atleti!)
  async condividiSuWhatsApp() {
    const todayStr = getLocalIsoDate();
    const summaries = this.availabilityService
      .daySummaries()
      .filter((d) => d.date >= todayStr);
    const text = formatWeeklyAvailabilityForWhatsApp(
      summaries,
      this.availabilityService.missingAthletes()
    );
    const encoded = encodeURIComponent(text);
    const waUrl = `https://api.whatsapp.com/send?text=${encoded}`;

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }

    window.open(waUrl, '_blank');
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
    this.router.navigate(['/partite', matchId]);
  }

  getGoogleMapsUrl(campo?: string): string {
    return this.campiService.getGoogleMapsUrl(campo || 'Roma');
  }

  getEtaCompleanno(dataNascita?: string): string | null {
    if (!dataNascita) return null;
    const eta = calcolaEta(dataNascita);
    return eta !== null ? `(${eta} anni)` : null;
  }
}
