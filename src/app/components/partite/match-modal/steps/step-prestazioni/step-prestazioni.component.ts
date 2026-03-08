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
import { PlayerPerformance, RatingClass, RatingThresholds } from '../../../../../models/player-performance.model';
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

  getRatingClass(voto: number | undefined): RatingClass {
    const v = Number(voto);
    if (!v || isNaN(v) || v === 0) return '';
    if (v >= RatingThresholds.HIGH) return 'voto-alto';
    if (v >= RatingThresholds.MEDIUM) return 'voto-medio';
    return 'voto-basso';
  }

  aggiornaVoto(giocatore: PlayerPerformance, event: Event) {
    const input = event.target as HTMLInputElement | null;
    const v = input ? Number(input.value) : NaN;
    if (!isNaN(v)) {
      this.salvaVotoNelloStato(giocatore.id, v);
    }
  }

  private salvaVotoNelloStato(id: string, voto: number) {
    const updateFn = (list: PlayerPerformance[]) =>
      list.map((g) => (g.id === id ? { ...g, voto } : g));
    this.state.teamA().some((g: PlayerPerformance) => g.id === id)
      ? this.state.teamA.update(updateFn)
      : this.state.teamB.update(updateFn);
  }

  aggiornaNote(giocatore: PlayerPerformance, testo: string) {
    const updateFn = (list: PlayerPerformance[]) =>
      list.map((g) => (g.id === giocatore.id ? { ...g, note: testo } : g));
    this.state.teamA().some((g: PlayerPerformance) => g.id === giocatore.id)
      ? this.state.teamA.update(updateFn)
      : this.state.teamB.update(updateFn);
  }

  async concludiTutto() {
    await this.state.salvaInDatabase(true, true);
    this.modalCtrl.dismiss(true);
  }
}
