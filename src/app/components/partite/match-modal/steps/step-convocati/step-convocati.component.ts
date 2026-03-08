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
  ],
})
export class StepConvocatiComponent {
  public state = inject(MatchStateService);

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
