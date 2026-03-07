import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonAvatar,
  IonTextarea,
  IonIcon,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkDone, football, stopwatchOutline } from 'ionicons/icons';
import { MatchStateService } from '../../match-state.service';

@Component({
  selector: 'app-step-prestazioni',
  templateUrl: './step-prestazioni.component.html',
  styleUrls: ['./step-prestazioni.component.scss'],
  standalone: true,
  imports: [CommonModule, IonAvatar, IonTextarea, IonIcon],
})
export class StepPrestazioniComponent {
  public state = inject(MatchStateService);
  private modalCtrl = inject(ModalController);

  constructor() {
    addIcons({ checkmarkDone, football, stopwatchOutline });
  }

  getRatingClass(voto: any): string {
    const v = parseFloat(voto);
    if (!v || isNaN(v) || v === 0) return '';
    if (v >= 7) return 'voto-alto';
    if (v >= 6) return 'voto-medio';
    return 'voto-basso';
  }

  aggiornaVoto(giocatore: any, event: any) {
    const inputElement = event.target;
    let v = parseFloat(inputElement.value.replace(',', '.'));
    if (isNaN(v)) v = 0;
    if (v > 10) v = 10;
    if (v < 0) v = 0;
    inputElement.value = v.toString();
    this.salvaVotoNelloStato(giocatore.id, v);
  }

  private salvaVotoNelloStato(id: string, voto: number) {
    const updateFn = (list: any[]) =>
      list.map((g) => (g.id === id ? { ...g, voto } : g));
    this.state.teamA().some((g) => g.id === id)
      ? this.state.teamA.update(updateFn)
      : this.state.teamB.update(updateFn);
  }

  aggiornaNote(giocatore: any, testo: string) {
    const updateFn = (list: any[]) =>
      list.map((g) => (g.id === giocatore.id ? { ...g, note: testo } : g));
    this.state.teamA().some((g) => g.id === giocatore.id)
      ? this.state.teamA.update(updateFn)
      : this.state.teamB.update(updateFn);
  }

  async concludiTutto() {
    await this.state.salvaInDatabase(true, true);
    this.modalCtrl.dismiss(true);
  }
}
