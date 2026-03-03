import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonList,
  IonListHeader,
  IonLabel,
  IonItem,
  IonAvatar,
  IonTextarea,
  IonInput,
  IonBadge,
  IonFab,
  IonFabButton,
  IonIcon,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkDone } from 'ionicons/icons';
import { MatchStateService } from '../../match-state.service';

@Component({
  selector: 'app-step-prestazioni',
  templateUrl: './step-prestazioni.component.html',
  styleUrls: ['./step-prestazioni.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonList,
    IonListHeader,
    IonLabel,
    IonItem,
    IonAvatar,
    IonTextarea,
    IonInput,
    IonBadge,
    IonFab,
    IonFabButton,
    IonIcon,
  ],
})
export class StepPrestazioniComponent {
  public state = inject(MatchStateService);
  private modalCtrl = inject(ModalController);

  constructor() {
    addIcons({ checkmarkDone });
  }

  aggiornaVoto(giocatore: any, event: any) {
    const inputElement = event.target;
    let votoStr = inputElement.value;

    votoStr = votoStr.replace(/[^\d.,-]/g, '');
    votoStr = votoStr.replace(/-{2,}/g, '-');
    votoStr = votoStr.replace(',', '.');

    if (votoStr === '') {
      this.salvaVotoNelloStato(giocatore.id, 0);
      return;
    }

    let v = parseFloat(votoStr);

    if (v > 10) {
      inputElement.value = '10';
      v = 10;
    } else if (v < 0) {
      inputElement.value = '0';
      v = 0;
    } else {
      inputElement.value = v.toString();
    }

    if (isNaN(v)) v = 0;

    this.salvaVotoNelloStato(giocatore.id, v);
  }

  private salvaVotoNelloStato(id: string, voto: number) {
    if (this.state.teamA().find((g) => g.id === id)) {
      this.state.teamA.update((l) =>
        l.map((g) => (g.id === id ? { ...g, voto: voto } : g)),
      );
    } else {
      this.state.teamB.update((l) =>
        l.map((g) => (g.id === id ? { ...g, voto: voto } : g)),
      );
    }
  }

  aggiornaNote(giocatore: any, testo: string) {
    if (this.state.teamA().find((g) => g.id === giocatore.id)) {
      this.state.teamA.update((l) =>
        l.map((g) => (g.id === giocatore.id ? { ...g, note: testo } : g)),
      );
    } else {
      this.state.teamB.update((l) =>
        l.map((g) => (g.id === giocatore.id ? { ...g, note: testo } : g)),
      );
    }
  }

  async concludiTutto() {
    await this.state.salvaInDatabase(true, true);
    this.modalCtrl.dismiss(true);
  }
}
