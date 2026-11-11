import { Component, inject, signal, computed } from '@angular/core';
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
export class StepDettagliComponent {
  public state = inject(MatchStateService);
  public campiService = inject(CampiService);
  public weatherService = inject(WeatherService);
  public auth = inject(AuthService);
  private toastCtrl = inject(ToastController);

  get isAdmin(): boolean {
    return this.auth.isSuperUser();
  }

  isSavingRsvp = signal<boolean>(false);
  showNotes = signal<boolean>(false);
  readonly isNotesOpen = computed(() => this.showNotes() || !!this.state.commentoPartita()?.trim());

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
    this.state.luogo.set(val);
    const resolvedUrl = mapsUrl || this.campiService.getGoogleMapsUrl(val);
    this.state.campoGoogleMapsUrl.set(resolvedUrl);
    this.state.salvaSetupPredefinito();
    this.state.triggerAutoSave();
  }

  onLuogoInput(val: string) {
    if (!this.isAdmin) return;
    this.aggiornaLuogo(val);
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

  selezionaCampo(campo: CampoDaGioco) {
    if (!this.isAdmin) return;
    this.aggiornaLuogo(campo.nome, campo.googleMapsUrl);
    this.suggerimentiCampi.set([]);
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

  aggiornaData(val: string) {
    this.state.dataPartita.set(val);
    this.state.triggerAutoSave();
  }

  aggiornaOrario(val: string) {
    this.state.orario.set(val);
    this.state.salvaSetupPredefinito();
    this.state.triggerAutoSave();
  }

  aggiornaNote(val: string) {
    this.state.commentoPartita.set(val);
    this.state.triggerAutoSave();
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
