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

  aggiornaLuogo(val: string) {
    this.state.luogo.set(val);
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
    }, 350);
  }

  selezionaCampo(campo: CampoDaGioco) {
    this.aggiornaLuogo(campo.nome);
    if (campo.googleMapsUrl) {
      this.state.campoGoogleMapsUrl.set(campo.googleMapsUrl);
    }
    this.suggerimentiCampi.set([]);
  }

  getGoogleMapsUrl(): string {
    if (this.state.campoGoogleMapsUrl()) {
      return this.state.campoGoogleMapsUrl()!;
    }
    return this.campiService.getGoogleMapsUrl(this.state.luogo() || 'Roma');
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
