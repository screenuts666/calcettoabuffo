import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonAvatar,
  IonFab,
  IonFabButton,
  IonIcon,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmark } from 'ionicons/icons';
import { MatchStateService } from '../../match-state.service';

@Component({
  selector: 'app-step-squadre',
  templateUrl: './step-squadre.component.html',
  styleUrls: ['./step-squadre.component.scss'],
  standalone: true,
  imports: [CommonModule, IonAvatar, IonFab, IonFabButton, IonIcon],
})
export class StepSquadreComponent {
  public state = inject(MatchStateService);

  constructor() {
    addIcons({ checkmark });
  }

  spostaIn(giocatore: any, target: 'A' | 'B') {
    if (target === 'A') {
      this.state.teamB.update((list) =>
        list.filter((g) => g.id !== giocatore.id),
      );
      if (!this.state.teamA().find((g) => g.id === giocatore.id))
        this.state.teamA.update((l) => [...l, giocatore]);
    } else {
      this.state.teamA.update((list) =>
        list.filter((g) => g.id !== giocatore.id),
      );
      if (!this.state.teamB().find((g) => g.id === giocatore.id))
        this.state.teamB.update((l) => [...l, giocatore]);
    }
  }

  confermaSquadre() {
    this.state.salvaInDatabase(false);
    this.state.step.set('match');
  }
}
