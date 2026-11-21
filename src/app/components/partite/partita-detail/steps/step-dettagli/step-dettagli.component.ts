import {
  Component,
  OnDestroy,
  ViewChild,
  effect,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonItem,
  IonIcon,
  IonInput,
  IonTextarea,
  IonSpinner,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  locationOutline,
  location,
  calendarOutline,
  timeOutline,
  checkmark,
  arrowForward,
  alertCircleOutline,
  sparklesOutline,
  chatboxEllipsesOutline,
  swapHorizontalOutline,
  createOutline,
  peopleOutline,
  informationCircleOutline,
  navigateOutline,
  searchOutline,
  openOutline,
  mapOutline,
  shieldOutline,
  repeatOutline,
  optionsOutline,
  footballOutline,
  checkmarkCircleOutline,
  closeCircleOutline,
  addOutline,
  chevronUpOutline,
  chevronDownOutline,
  chevronForwardOutline,
  lockClosedOutline,
  timerOutline,
} from 'ionicons/icons';
import { MatchStateService } from '../../match-state.service';
import { CampiService } from '../../../../../services/campi.service';
import { WeatherService } from '../../../../../services/weather.service';
import { AuthService } from '../../../../../services/auth.service';
import { CampoDaGioco } from '../../../../../models/campo.model';
import { getMatchFormatByPlayerCount, normalizeRsvpStatus } from '../../../../../models/partita.model';
import {
  MIN_CURRENT_SEASON_DATE,
  CURRENT_SEASON,
} from '../../../../../utils/season-utils';
import {
  getAvatarUrl,
  handleAvatarError,
} from '../../../../../utils/avatar-utils';

import { PlayerAvatarComponent } from '../../../../player-avatar/player-avatar.component';

@Component({
  selector: 'app-step-dettagli',
  templateUrl: './step-dettagli.component.html',
  styleUrls: ['./step-dettagli.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonItem,
    IonIcon,
    IonInput,
    IonTextarea,
    IonSpinner,
    PlayerAvatarComponent,
  ],
})
export class StepDettagliComponent implements OnDestroy {
  public state = inject(MatchStateService);
  public campiService = inject(CampiService);
  public weatherService = inject(WeatherService);
  public auth = inject(AuthService);
  private toastCtrl = inject(ToastController);

  @ViewChild('luogoInput') luogoInputRef?: IonInput;

  get isAdmin(): boolean {
    return this.auth.isSuperUser();
  }

  isSavingRsvp = signal<boolean>(false);
  showNotes = signal<boolean>(false);

  // Stato locale disaccoppiato per tutti i campi editabili (anti-overwrite real-time + focus stabile)
  readonly dataDisplayValue = signal<string>('');
  readonly orarioDisplayValue = signal<string>('');
  readonly luogoDisplayValue = signal<string>('');
  readonly noteDisplayValue = signal<string>('');

  readonly isDataFocused = signal<boolean>(false);
  readonly isOrarioFocused = signal<boolean>(false);
  readonly isLuogoFocused = signal<boolean>(false);
  readonly isNoteFocused = signal<boolean>(false);

  private draftData = '';
  private lastCommittedData = '';
  private isDataDirty = false;
  private dataDebounceTimer?: ReturnType<typeof setTimeout>;

  private draftOrario = '';
  private lastCommittedOrario = '';
  private isOrarioDirty = false;
  private orarioDebounceTimer?: ReturnType<typeof setTimeout>;

  private draftLuogo = '';
  private lastCommittedLuogo = '';
  private isLuogoDirty = false;
  private luogoDebounceTimer?: ReturnType<typeof setTimeout>;

  private draftNote = '';
  private lastCommittedNote = '';
  private isNoteDirty = false;
  private noteDebounceTimer?: ReturnType<typeof setTimeout>;

  private unregisterFlusher?: () => void;
  private readonly DEBOUNCE_MS = 700;

  readonly isNotesOpen = computed(
    () =>
      this.showNotes() ||
      this.isNoteFocused() ||
      !!this.state.commentoPartita()?.trim(),
  );

  toggleNotes() {
    this.showNotes.update((v) => !v);
  }

  /** Stato RSVP attuale del giocatore loggato ('yes' | 'maybe' | 'no' | null) */
  readonly myRsvpStatus = computed<'yes' | 'maybe' | 'no' | null>(() => {
    const uid = this.auth.firebaseUser()?.uid;
    const pid = this.auth.linkedPlayerId();
    const map = this.state.rsvp() || {};
    if (uid && map[uid]) {
      return normalizeRsvpStatus(map[uid].status);
    }
    if (pid) {
      const byPid = Object.values(map).find((e) => e?.playerId === pid);
      if (byPid) return normalizeRsvpStatus(byPid.status);
      const inTutti = this.state.tutti().find((g) => g.id === pid);
      if (inTutti?.rsvpStatus) return inTutti.rsvpStatus;
    }
    return null;
  });

  readonly meteoForecast = computed(() => {
    const d = this.state.dataPartita();
    if (!d) return null;
    const w = this.weatherService.getWeatherForDate(d);
    if (!w) return null;
    return {
      ...w,
      iconEmoji: (w.iconEmoji && !w.iconEmoji.includes('🌫')) ? w.iconEmoji : '🌁',
    };
  });

  readonly MIN_CURRENT_SEASON_DATE = MIN_CURRENT_SEASON_DATE;
  readonly CURRENT_SEASON = CURRENT_SEASON;
  readonly turnMinutesOptions = [3, 4, 5, 6, 7, 8, 10];

  suggerimentiCampi = signal<CampoDaGioco[]>([]);
  isSearchingCampi = signal<boolean>(false);
  private searchTimer?: any;

  getAvatar(fotoUrl?: string | null): string {
    return getAvatarUrl(fotoUrl);
  }

  onImgError(event: Event) {
    handleAvatarError(event);
  }

  constructor() {
    addIcons({
      location,
      locationOutline,
      calendarOutline,
      timeOutline,
      checkmark,
      arrowForward,
      alertCircleOutline,
      sparklesOutline,
      chatboxEllipsesOutline,
      swapHorizontalOutline,
      createOutline,
      peopleOutline,
      informationCircleOutline,
      navigateOutline,
      searchOutline,
      openOutline,
      mapOutline,
      shieldOutline,
      repeatOutline,
      optionsOutline,
      footballOutline,
      checkmarkCircleOutline,
      closeCircleOutline,
      addOutline,
      chevronUpOutline,
      chevronDownOutline,
      chevronForwardOutline,
      lockClosedOutline,
      timerOutline,
    });

    // Sincronizza ciascun campo locale dallo stato remoto SOLO quando non è in focus/dirty
    effect(() => {
      const v = this.state.dataPartita() || '';
      if (!this.isDataFocused() && !this.isDataDirty) {
        this.draftData = v;
        this.lastCommittedData = v;
        this.dataDisplayValue.set(v);
      }
    });

    effect(() => {
      const v = this.state.orario() || '';
      if (!this.isOrarioFocused() && !this.isOrarioDirty) {
        this.draftOrario = v;
        this.lastCommittedOrario = v;
        this.orarioDisplayValue.set(v);
      }
    });

    effect(() => {
      const v = this.state.luogo() || '';
      if (!this.isLuogoFocused() && !this.isLuogoDirty) {
        this.draftLuogo = v;
        this.lastCommittedLuogo = v;
        this.luogoDisplayValue.set(v);
      }
    });

    effect(() => {
      const v = this.state.commentoPartita() || '';
      if (!this.isNoteFocused() && !this.isNoteDirty) {
        this.draftNote = v;
        this.lastCommittedNote = v;
        this.noteDisplayValue.set(v);
      }
    });

    this.unregisterFlusher = this.state.registerDraftFlusher(() =>
      this.flushAllDraftsToStateOnly(),
    );
  }

  ngOnDestroy(): void {
    clearTimeout(this.searchTimer);
    if (this.dataDebounceTimer) {
      clearTimeout(this.dataDebounceTimer);
      this.dataDebounceTimer = undefined;
    }
    if (this.orarioDebounceTimer) {
      clearTimeout(this.orarioDebounceTimer);
      this.orarioDebounceTimer = undefined;
    }
    if (this.luogoDebounceTimer) {
      clearTimeout(this.luogoDebounceTimer);
      this.luogoDebounceTimer = undefined;
    }
    if (this.noteDebounceTimer) {
      clearTimeout(this.noteDebounceTimer);
      this.noteDebounceTimer = undefined;
    }
    this.unregisterFlusher?.();
    const hadDirty = this.flushAllDraftsToStateOnly();
    this.state.endFieldEdit('dataPartita');
    this.state.endFieldEdit('orario');
    this.state.endFieldEdit('luogo');
    this.state.endFieldEdit('commentoPartita');
    if (this.isAdmin && (hadDirty || this.state.isAutoSavePending())) {
      void this.state.flushAutoSave();
    }
  }

  onSingleLineEnter(event: Event): void {
    event.preventDefault();
    (event.target as HTMLElement | null)?.blur();
  }

  get isTurnDurationLocked(): boolean {
    return this.state.isMatchStartedOrCompleted();
  }

  impostaDurataTurno(min: number) {
    if (!this.isAdmin || this.isTurnDurationLocked) return;
    this.state.impostaDurataTurnoMinuti(min);
  }

  getRegolePortieriLabel(): string {
    const modA = this.state.modalitaPortieriA();
    const modB = this.state.modalitaPortieriB();
    const turno = this.state.durataTurnoMinuti();

    if (modA === 'rotazione' && modB === 'rotazione') {
      return `Portieri a rotazione ogni ${turno}'`;
    }
    if (modA === 'fisso' && modB === 'fisso') {
      return 'Portieri fissi di ruolo';
    }
    const labelA = modA === 'fisso' ? 'Fisso' : `Rotazione ${turno}'`;
    const labelB = modB === 'fisso' ? 'Fisso' : `Rotazione ${turno}'`;
    return `Bianchi: ${labelA} · Neri: ${labelB}`;
  }

  impostaModalitaEntrambe(modalita: 'rotazione' | 'fisso') {
    if (!this.isAdmin) return;
    this.state.impostaModalitaPortiere('A', modalita);
    this.state.impostaModalitaPortiere('B', modalita);
    this.state.salvaSetupPredefinito();
    this.state.triggerAutoSave(true);
  }

  toggleModalitaMiste() {
    if (!this.isAdmin) return;
    // Se non sono già miste, imposta A fisso e B rotazione
    if (this.state.modalitaPortieriA() === this.state.modalitaPortieriB()) {
      this.state.impostaModalitaPortiere('A', 'fisso');
      this.state.impostaModalitaPortiere('B', 'rotazione');
    } else {
      // Inverte
      const nextA = this.state.modalitaPortieriA() === 'fisso' ? 'rotazione' : 'fisso';
      const nextB = this.state.modalitaPortieriB() === 'fisso' ? 'rotazione' : 'fisso';
      this.state.impostaModalitaPortiere('A', nextA);
      this.state.impostaModalitaPortiere('B', nextB);
    }
    this.state.salvaSetupPredefinito();
    this.state.triggerAutoSave(true);
  }

  async toggleMioRsvp(target: 'yes' | 'no') {
    const curr = this.myRsvpStatus();
    const next = curr === target ? 'no' : target;
    await this.impostaMioRsvp(next);
  }

  async impostaMioRsvp(status: 'yes' | 'no') {
    if (this.isSavingRsvp()) return;

    if (!this.state.matchId() && this.isAdmin) {
      await this.state.ensureMatchCreatedForInvite();
    }

    if (!this.state.matchId()) {
      const toast = await this.toastCtrl.create({
        message: 'La partita deve essere salvata dal Mister prima di rispondere.',
        duration: 2500,
        color: 'warning',
        position: 'top',
        mode: 'ios',
      });
      await toast.present();
      return;
    }

    this.isSavingRsvp.set(true);
    try {
      await this.state.submitSelfRsvp(status);
      const nome = this.auth.displayName() || 'Te';
      const msg = status === 'yes'
        ? `${nome} inserito tra i convocati`
        : `${nome} rimosso dai convocati`;
      const toast = await this.toastCtrl.create({
        message: msg,
        duration: 2200,
        color: status === 'yes' ? 'success' : 'medium',
        position: 'bottom',
        mode: 'ios',
      });
      await toast.present();
    } catch (err: any) {
      console.warn('Errore auto-RSVP:', err);
      const toast = await this.toastCtrl.create({
        message: err?.message || 'Errore nel salvataggio della presenza',
        duration: 2500,
        color: 'danger',
        position: 'bottom',
        mode: 'ios',
      });
      await toast.present();
    } finally {
      this.isSavingRsvp.set(false);
    }
  }

  formatFormatoPartita(): string {
    const tot = this.state.totaleConvocati();
    if (tot === 0) return '0 giocatori';
    const fmt = getMatchFormatByPlayerCount(tot);
    const half1 = Math.floor(tot / 2);
    const half2 = Math.ceil(tot / 2);
    return `${fmt.label} (${half1} vs ${half2})`;
  }

  getMessaggioValidazione(): string {
    if (!this.state.luogo().trim()) {
      return 'Inserisci il luogo del match per continuare';
    }
    if (!this.state.dataPartita()) {
      return 'Seleziona la data della partita';
    }
    if (!this.state.orario()) {
      return "Inserisci l'orario del match";
    }
    if (!this.state.isDataStagioneValida()) {
      return 'La data selezionata non appartiene alla stagione corrente';
    }
    return '';
  }

  isCampoVerificato(): boolean {
    const luogo = this.state.luogo()?.trim();
    if (!luogo) return false;
    return this.campiService.getCampoByNome(luogo) !== undefined;
  }

  getNomeDisplay(): string {
    const luogo = this.state.luogo()?.trim();
    if (!luogo) return '';
    const canonical = this.campiService.getCampoByNome(luogo);
    return canonical?.nome || luogo;
  }

  getIndirizzoDisplay(): string {
    const luogo = this.state.luogo()?.trim();
    if (!luogo) return '';
    const canonical = this.campiService.getCampoByNome(luogo);
    if (canonical?.indirizzo) return canonical.indirizzo;
    return 'Roma • Indicazioni stradali su Google Maps';
  }

  isCampoActive(c: CampoDaGioco): boolean {
    const current = this.state.luogo()?.trim();
    if (!current) return false;
    if (current.toLowerCase() === c.nome.toLowerCase()) return true;
    const match = this.campiService.getCampoByNome(current);
    return match?.id === c.id;
  }

  aggiornaLuogo(val: string, mapsUrl?: string | null) {
    if (!this.isAdmin) return;
    this.state.touchFieldEdit('luogo');
    this.state.luogo.set(val);
    const resolvedUrl = mapsUrl || this.campiService.getGoogleMapsUrl(val);
    this.state.campoGoogleMapsUrl.set(resolvedUrl);
    this.state.salvaSetupPredefinito();
  }

  onLuogoFocus() {
    this.isLuogoFocused.set(true);
    this.state.beginFieldEdit('luogo');
  }

  onLuogoInput(val: string) {
    if (!this.isAdmin) return;
    this.draftLuogo = val;
    const changed = val !== this.lastCommittedLuogo;
    this.isLuogoDirty = changed;
    this.state.markFieldDraftDirty('luogo', changed);
    this.aggiornaLuogo(val);

    if (this.luogoDebounceTimer) {
      clearTimeout(this.luogoDebounceTimer);
      this.luogoDebounceTimer = undefined;
    }
    if (changed) {
      this.luogoDebounceTimer = setTimeout(() => {
        this.luogoDebounceTimer = undefined;
        if (this.draftLuogo !== this.lastCommittedLuogo) {
          this.isLuogoDirty = false;
          this.lastCommittedLuogo = this.draftLuogo;
          this.state.markFieldDraftDirty('luogo', false);
          this.state.triggerAutoSave(false, 100);
        }
      }, this.DEBOUNCE_MS);
    }

    clearTimeout(this.searchTimer);
    if (!val || val.trim().length < 2) {
      this.suggerimentiCampi.set([]);
      this.isSearchingCampi.set(false);
      return;
    }
    this.isSearchingCampi.set(true);
    this.searchTimer = setTimeout(() => {
      this.campiService.cercaCampiOnline(val).subscribe({
        next: (risultati: CampoDaGioco[]) => {
          this.suggerimentiCampi.set(risultati);
          this.isSearchingCampi.set(false);
        },
        error: () => {
          this.isSearchingCampi.set(false);
        },
      });
    }, 250);
  }

  onLuogoBlur() {
    if (this.luogoDebounceTimer) {
      clearTimeout(this.luogoDebounceTimer);
      this.luogoDebounceTimer = undefined;
    }
    const changed = this.draftLuogo !== this.lastCommittedLuogo;
    this.isLuogoDirty = false;
    this.state.markFieldDraftDirty('luogo', false);
    this.luogoDisplayValue.set(this.draftLuogo);
    this.isLuogoFocused.set(false);
    this.state.endFieldEdit('luogo');
    if (changed) {
      this.lastCommittedLuogo = this.draftLuogo;
      this.state.triggerAutoSave(false, 150);
    }
  }

  selezionaCampo(campo: CampoDaGioco) {
    if (!this.isAdmin) return;
    if (this.luogoDebounceTimer) {
      clearTimeout(this.luogoDebounceTimer);
      this.luogoDebounceTimer = undefined;
    }
    const changed = campo.nome !== this.lastCommittedLuogo;
    this.draftLuogo = campo.nome;
    this.lastCommittedLuogo = campo.nome;
    this.isLuogoDirty = false;
    this.state.markFieldDraftDirty('luogo', false);
    this.luogoDisplayValue.set(campo.nome);
    if (this.luogoInputRef) {
      this.luogoInputRef.value = campo.nome;
    }
    this.aggiornaLuogo(campo.nome, campo.googleMapsUrl);
    this.suggerimentiCampi.set([]);
    if (changed) {
      this.state.triggerAutoSave(false, 150);
    }
  }

  getGoogleMapsUrl(): string {
    const luogo = this.state.luogo()?.trim();
    if (!luogo) {
      return this.campiService.getGoogleMapsUrl('Roma');
    }
    const noto = this.campiService.getCampoByNome(luogo);
    if (noto?.googleMapsUrl) {
      return noto.googleMapsUrl;
    }
    const savedUrl = this.state.campoGoogleMapsUrl();
    if (savedUrl && !this.isStaleUrl(savedUrl, luogo)) {
      return savedUrl;
    }
    return this.campiService.getGoogleMapsUrl(luogo);
  }

  private isStaleUrl(url: string, currentLuogo: string): boolean {
    const cleanLuogo = currentLuogo.toLowerCase();
    const cleanUrl = url.toLowerCase();
    if (cleanLuogo.includes('montesacro') && cleanUrl.includes('roma+6')) return true;
    if (cleanLuogo.includes('vigor') && cleanUrl.includes('roma+6')) return true;
    if (cleanLuogo.includes('pro roma') && cleanUrl.includes('roma+6')) return true;
    if (cleanLuogo.includes('roma 6') && cleanUrl.includes('montesacro')) return true;
    return false;
  }

  apriRicercaGoogleMaps(query?: string) {
    const q = (query || this.state.luogo() || 'campi da calcetto Roma').trim();
    const cleanQuery = q.toLowerCase().includes('roma') ? q : `${q} Roma`;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanQuery)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  onDataFocus() {
    this.isDataFocused.set(true);
    this.state.beginFieldEdit('dataPartita');
  }

  aggiornaData(val: string) {
    this.draftData = val;
    const changed = val !== this.lastCommittedData;
    this.isDataDirty = changed;
    this.state.markFieldDraftDirty('dataPartita', changed);
    this.state.touchFieldEdit('dataPartita');
    this.state.dataPartita.set(val);

    if (this.dataDebounceTimer) {
      clearTimeout(this.dataDebounceTimer);
      this.dataDebounceTimer = undefined;
    }
    if (changed) {
      this.dataDebounceTimer = setTimeout(() => {
        this.dataDebounceTimer = undefined;
        if (this.draftData !== this.lastCommittedData) {
          this.isDataDirty = false;
          this.lastCommittedData = this.draftData;
          this.state.markFieldDraftDirty('dataPartita', false);
          this.state.triggerAutoSave(false, 100);
        }
      }, this.DEBOUNCE_MS);
    }
  }

  onDataBlur() {
    if (this.dataDebounceTimer) {
      clearTimeout(this.dataDebounceTimer);
      this.dataDebounceTimer = undefined;
    }
    const changed = this.draftData !== this.lastCommittedData;
    this.isDataDirty = false;
    this.state.markFieldDraftDirty('dataPartita', false);
    this.dataDisplayValue.set(this.draftData);
    this.isDataFocused.set(false);
    this.state.endFieldEdit('dataPartita');
    if (changed) {
      this.lastCommittedData = this.draftData;
      this.state.triggerAutoSave(false, 150);
    }
  }

  onOrarioFocus() {
    this.isOrarioFocused.set(true);
    this.state.beginFieldEdit('orario');
  }

  aggiornaOrario(val: string) {
    this.draftOrario = val;
    const changed = val !== this.lastCommittedOrario;
    this.isOrarioDirty = changed;
    this.state.markFieldDraftDirty('orario', changed);
    this.state.touchFieldEdit('orario');
    this.state.orario.set(val);
    this.state.salvaSetupPredefinito();

    if (this.orarioDebounceTimer) {
      clearTimeout(this.orarioDebounceTimer);
      this.orarioDebounceTimer = undefined;
    }
    if (changed) {
      this.orarioDebounceTimer = setTimeout(() => {
        this.orarioDebounceTimer = undefined;
        if (this.draftOrario !== this.lastCommittedOrario) {
          this.isOrarioDirty = false;
          this.lastCommittedOrario = this.draftOrario;
          this.state.markFieldDraftDirty('orario', false);
          this.state.triggerAutoSave(false, 100);
        }
      }, this.DEBOUNCE_MS);
    }
  }

  onOrarioBlur() {
    if (this.orarioDebounceTimer) {
      clearTimeout(this.orarioDebounceTimer);
      this.orarioDebounceTimer = undefined;
    }
    const changed = this.draftOrario !== this.lastCommittedOrario;
    this.isOrarioDirty = false;
    this.state.markFieldDraftDirty('orario', false);
    this.orarioDisplayValue.set(this.draftOrario);
    this.isOrarioFocused.set(false);
    this.state.endFieldEdit('orario');
    if (changed) {
      this.lastCommittedOrario = this.draftOrario;
      this.state.triggerAutoSave(false, 150);
    }
  }

  onNoteFocus() {
    this.isNoteFocused.set(true);
    this.showNotes.set(true);
    this.state.beginFieldEdit('commentoPartita');
  }

  aggiornaNote(val: string) {
    this.draftNote = val;
    const changed = val !== this.lastCommittedNote;
    this.isNoteDirty = changed;
    this.state.markFieldDraftDirty('commentoPartita', changed);
    this.state.touchFieldEdit('commentoPartita');

    if (this.noteDebounceTimer) {
      clearTimeout(this.noteDebounceTimer);
      this.noteDebounceTimer = undefined;
    }
    if (changed) {
      this.noteDebounceTimer = setTimeout(() => {
        this.noteDebounceTimer = undefined;
        if (this.draftNote !== this.lastCommittedNote) {
          this.isNoteDirty = false;
          this.lastCommittedNote = this.draftNote;
          this.state.markFieldDraftDirty('commentoPartita', false);
          this.state.commentoPartita.set(this.draftNote);
          this.state.triggerAutoSave(false, 100);
        }
      }, this.DEBOUNCE_MS);
    }
  }

  onNoteBlur() {
    if (this.noteDebounceTimer) {
      clearTimeout(this.noteDebounceTimer);
      this.noteDebounceTimer = undefined;
    }
    const changed = this.draftNote !== this.lastCommittedNote;
    this.isNoteDirty = false;
    this.state.markFieldDraftDirty('commentoPartita', false);
    this.noteDisplayValue.set(this.draftNote);
    this.isNoteFocused.set(false);
    this.state.endFieldEdit('commentoPartita');
    if (changed) {
      this.lastCommittedNote = this.draftNote;
      this.state.commentoPartita.set(this.draftNote);
      this.state.triggerAutoSave(false, 150);
    }
  }

  private flushAllDraftsToStateOnly(): boolean {
    if (this.dataDebounceTimer) {
      clearTimeout(this.dataDebounceTimer);
      this.dataDebounceTimer = undefined;
    }
    if (this.orarioDebounceTimer) {
      clearTimeout(this.orarioDebounceTimer);
      this.orarioDebounceTimer = undefined;
    }
    if (this.luogoDebounceTimer) {
      clearTimeout(this.luogoDebounceTimer);
      this.luogoDebounceTimer = undefined;
    }
    if (this.noteDebounceTimer) {
      clearTimeout(this.noteDebounceTimer);
      this.noteDebounceTimer = undefined;
    }

    let flushed = false;

    if (this.draftData !== this.lastCommittedData) {
      this.lastCommittedData = this.draftData;
      this.isDataDirty = false;
      this.state.markFieldDraftDirty('dataPartita', false);
      this.state.dataPartita.set(this.draftData);
      flushed = true;
    }

    if (this.draftOrario !== this.lastCommittedOrario) {
      this.lastCommittedOrario = this.draftOrario;
      this.isOrarioDirty = false;
      this.state.markFieldDraftDirty('orario', false);
      this.state.orario.set(this.draftOrario);
      flushed = true;
    }

    if (this.draftLuogo !== this.lastCommittedLuogo) {
      this.lastCommittedLuogo = this.draftLuogo;
      this.isLuogoDirty = false;
      this.state.markFieldDraftDirty('luogo', false);
      this.state.luogo.set(this.draftLuogo);
      flushed = true;
    }

    if (this.draftNote !== this.lastCommittedNote) {
      this.lastCommittedNote = this.draftNote;
      this.isNoteDirty = false;
      this.state.markFieldDraftDirty('commentoPartita', false);
      this.state.commentoPartita.set(this.draftNote);
      flushed = true;
    }

    return flushed;
  }

  vaiAConvocati() {
    if (!this.state.isDettagliValidi()) return;
    this.state.cambiaStep('convocati');
  }

  tornaAConvocati() {
    this.vaiAConvocati();
  }

  toggleModalitaA(modalita?: 'rotazione' | 'fisso') {
    const next =
      modalita ?? (this.state.modalitaPortieriA() === 'fisso' ? 'rotazione' : 'fisso');
    this.state.impostaModalitaPortiere('A', next);
    this.state.salvaSetupPredefinito();
    this.state.triggerAutoSave(true);
  }

  toggleModalitaB(modalita?: 'rotazione' | 'fisso') {
    const next =
      modalita ?? (this.state.modalitaPortieriB() === 'fisso' ? 'rotazione' : 'fisso');
    this.state.impostaModalitaPortiere('B', next);
    this.state.salvaSetupPredefinito();
    this.state.triggerAutoSave(true);
  }

  vaiASquadre() {
    if (!this.state.isDettagliValidi()) return;
    this.state.cambiaStep('squadre');
  }
}
