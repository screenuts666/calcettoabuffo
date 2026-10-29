import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonItem,
  IonIcon,
  IonInput,
  IonTextarea,
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
} from 'ionicons/icons';
import { MatchStateService } from '../../match-state.service';
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
    PlayerAvatarComponent,
  ],
})
export class StepDettagliComponent {
  public state = inject(MatchStateService);

  readonly MIN_CURRENT_SEASON_DATE = MIN_CURRENT_SEASON_DATE;
  readonly CURRENT_SEASON = CURRENT_SEASON;

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
    });
  }

  formatFormatoPartita(): string {
    const tot = this.state.totaleConvocati();
    if (tot === 0) return '0 giocatori';
    const half1 = Math.floor(tot / 2);
    const half2 = Math.ceil(tot / 2);
    return `${half1} vs ${half2}`;
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
    this.state.salvaSnapshotLocale();
    this.state.salvaSetupPredefinito();
  }

  aggiornaOrario(val: string) {
    this.state.orario.set(val);
    this.state.salvaSnapshotLocale();
    this.state.salvaSetupPredefinito();
  }

  tornaAConvocati() {
    this.state.step.set('convocati');
  }

  toggleModalitaA(modalita?: 'rotazione' | 'fisso') {
    const next =
      modalita ?? (this.state.modalitaPortieriA() === 'fisso' ? 'rotazione' : 'fisso');
    this.state.impostaModalitaPortiere('A', next);
    this.state.salvaSnapshotLocale();
    this.state.salvaSetupPredefinito();
  }

  toggleModalitaB(modalita?: 'rotazione' | 'fisso') {
    const next =
      modalita ?? (this.state.modalitaPortieriB() === 'fisso' ? 'rotazione' : 'fisso');
    this.state.impostaModalitaPortiere('B', next);
    this.state.salvaSnapshotLocale();
    this.state.salvaSetupPredefinito();
  }

  vaiASquadre() {
    if (!this.state.isDettagliValidi()) return;
    const scelti = this.state.convocati();
    const idsScelti = scelti.map((g) => g.id);

    this.state.teamA.update((t) => t.filter((g) => idsScelti.includes(g.id)));
    this.state.teamB.update((t) => t.filter((g) => idsScelti.includes(g.id)));

    const idsAssegnati = [...this.state.teamA(), ...this.state.teamB()].map(
      (g) => g.id,
    );

    const nuoviArrivati = scelti.filter((g) => !idsAssegnati.includes(g.id));

    if (nuoviArrivati.length > 0) {
      this.state.teamA.update((t) => [...t, ...nuoviArrivati]);
    }

    this.state.salvaInDatabase(false);
    this.state.step.set('squadre');
  }
}
