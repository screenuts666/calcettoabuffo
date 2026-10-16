import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonList,
  IonItem,
  IonAvatar,
  IonLabel,
  IonCheckbox,
  IonSearchbar,
  IonIcon,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeCircle, search } from 'ionicons/icons';
import { MatchStateService } from '../../match-state.service';
import {
  getAvatarUrl,
  handleAvatarError,
} from '../../../../../utils/avatar-utils';

import { PlayerAvatarComponent } from '../../../../player-avatar/player-avatar.component';

@Component({
  selector: 'app-step-convocati',
  templateUrl: './step-convocati.component.html',
  styleUrls: ['./step-convocati.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonList,
    IonItem,
    IonAvatar,
    IonLabel,
    IonCheckbox,
    IonSearchbar,
    IonIcon,
    PlayerAvatarComponent,
  ],
})
export class StepConvocatiComponent {
  public state = inject(MatchStateService);

  getAvatar(fotoUrl?: string | null): string {
    return getAvatarUrl(fotoUrl);
  }

  onImgError(event: Event) {
    handleAvatarError(event);
  }

  constructor() {
    addIcons({ closeCircle, search });
  }

  toggleSelezione(giocatore: any) {
    this.state.tutti.update((lista) =>
      lista.map((g) =>
        g.id === giocatore.id ? { ...g, selezionato: !g.selezionato } : g,
      ),
    );
  }
}
