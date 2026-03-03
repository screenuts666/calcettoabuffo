import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonSearchbar,
  IonList,
  IonListHeader,
  IonLabel,
  IonItem,
  IonAvatar,
  IonIcon,
  IonFab,
  IonFabButton,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  closeCircle,
  checkmarkCircle,
  ellipseOutline,
  arrowForward,
} from 'ionicons/icons';
import { MatchStateService } from '../../match-state.service';


@Component({
  selector: 'app-step-convocati',
  templateUrl: './step-convocati.component.html',
  styleUrls: ['./step-convocati.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonSearchbar,
    IonList,
    IonListHeader,
    IonLabel,
    IonItem,
    IonAvatar,
    IonIcon,
    IonFab,
    IonFabButton,
  ],
})
export class StepConvocatiComponent {
  public state = inject(MatchStateService);

  constructor() {
    addIcons({ closeCircle, checkmarkCircle, ellipseOutline, arrowForward });
  }

  toggleSelezione(giocatore: any) {
    this.state.tutti.update((list) =>
      list.map((g) =>
        g.id === giocatore.id ? { ...g, selezionato: !g.selezionato } : g,
      ),
    );
  }

  vaiADettagli() {
    this.state.step.set('dettagli');
  }
}
