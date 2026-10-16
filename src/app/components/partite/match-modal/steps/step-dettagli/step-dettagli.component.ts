import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonItem,
  IonIcon,
  IonInput,
  IonAvatar,
  IonFab,
  IonFabButton,
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
    IonAvatar,
    IonFab,
    IonFabButton,
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
    });
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
