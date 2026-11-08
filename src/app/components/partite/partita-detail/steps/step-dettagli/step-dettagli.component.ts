import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonItem,
  IonIcon,
  IonInput,
  IonTextarea,
  IonSpinner,
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
} from 'ionicons/icons';
import { MatchStateService } from '../../match-state.service';
import { CampiService } from '../../../../../services/campi.service';
import { CampoDaGioco } from '../../../../../models/campo.model';
import { getMatchFormatByPlayerCount } from '../../../../../models/partita.model';
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

  readonly MIN_CURRENT_SEASON_DATE = MIN_CURRENT_SEASON_DATE;
  readonly CURRENT_SEASON = CURRENT_SEASON;

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
    });
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
    this.state.luogo.set(val);
    const resolvedUrl = mapsUrl || this.campiService.getGoogleMapsUrl(val);
    this.state.campoGoogleMapsUrl.set(resolvedUrl);
    this.state.salvaSetupPredefinito();
    this.state.triggerAutoSave();
  }

  onLuogoInput(val: string) {
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
