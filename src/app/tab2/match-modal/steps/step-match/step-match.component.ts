import { Component, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonBadge,
  IonButton,
  IonIcon,
  IonList,
  IonListHeader,
  IonItem,
  IonLabel,
  ActionSheetController,
  AlertController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  locationOutline,
  timeOutline,
  play,
  pause,
  add,
  remove,
  stop,
} from 'ionicons/icons';
import { MatchStateService } from '../../match-state.service';


@Component({
  selector: 'app-step-match',
  templateUrl: './step-match.component.html',
  styleUrls: ['./step-match.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonBadge,
    IonButton,
    IonIcon,
    IonList,
    IonListHeader,
    IonItem,
    IonLabel,
  ],
})
export class StepMatchComponent implements OnDestroy {
  public state = inject(MatchStateService);
  private actionSheetCtrl = inject(ActionSheetController);
  private alertCtrl = inject(AlertController);

  private timerRef: any;

  constructor() {
    addIcons({ locationOutline, timeOutline, play, pause, add, remove, stop });
  }

  ngOnDestroy() {
    if (this.timerRef) clearInterval(this.timerRef);
  }

  toggleTimer() {
    if (this.state.isTimerRunning()) {
      clearInterval(this.timerRef);
      this.state.isTimerRunning.set(false);
    } else {
      this.state.isTimerRunning.set(true);
      this.timerRef = setInterval(
        () => this.state.cronometro.update((t) => t + 1),
        1000,
      );
    }
  }

  async chiediChiHaSegnato(teamVantaggio: 'A' | 'B') {
    const teamCheSegna =
      teamVantaggio === 'A' ? this.state.teamA() : this.state.teamB();
    const teamAvversario =
      teamVantaggio === 'A' ? this.state.teamB() : this.state.teamA();

    const buttons = [
      ...teamCheSegna.map((g) => ({
        text: g.nome,
        handler: () => this.registraGol(g, teamVantaggio, false),
      })),
      ...teamAvversario.map((g) => ({
        text: g.nome + ' (Autogol)',
        role: 'destructive',
        handler: () => this.registraGol(g, teamVantaggio, true),
      })),
      { text: 'Annulla', role: 'cancel' },
    ];

    const as = await this.actionSheetCtrl.create({
      header: `Gol per i ${teamVantaggio === 'A' ? 'BIANCHI' : 'NERI'}! Chi ha segnato?`,
      buttons,
    });
    await as.present();
  }

  registraGol(giocatore: any, teamVantaggio: 'A' | 'B', isAutogoal: boolean) {
    this.state.eventiGol.update((list) => [
      ...list,
      {
        idAssegnato: giocatore.id,
        nome: giocatore.nome,
        teamVantaggio,
        isAutogoal,
        tempo: this.state.formatTimer(),
      },
    ]);

    teamVantaggio === 'A'
      ? this.state.scoreA.update((s) => s + 1)
      : this.state.scoreB.update((s) => s + 1);

    this.state.tutti.update((list) =>
      list.map((g) =>
        g.id === giocatore.id
          ? { ...g, gol: (g.gol || 0) + (isAutogoal ? 0 : 1) }
          : g,
      ),
    );
    this.state.salvaInDatabase(false);
  }

  rimuoviUltimoGol(team: 'A' | 'B') {
    const list = this.state.eventiGol();
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].teamVantaggio === team) {
        const rimosso = list[i];
        this.state.eventiGol.update((l) => l.filter((_, index) => index !== i));

        team === 'A'
          ? this.state.scoreA.update((s) => Math.max(0, s - 1))
          : this.state.scoreB.update((s) => Math.max(0, s - 1));

        this.state.tutti.update((l) =>
          l.map((g) =>
            g.id === rimosso.idAssegnato
              ? {
                  ...g,
                  gol: Math.max(0, (g.gol || 0) - (rimosso.isAutogoal ? 0 : 1)),
                }
              : g,
          ),
        );
        this.state.salvaInDatabase(false);
        break;
      }
    }
  }

  async finisciMatch() {
    const alert = await this.alertCtrl.create({
      header: 'Fischio Finale',
      message:
        'Sei sicuro di chiudere la partita? Non potrai più aggiungere gol o cambiare le squadre.',
      buttons: [
        { text: 'Continua a Giocare', role: 'cancel' },
        {
          text: 'Termina Partita',
          role: 'destructive',
          handler: () => {
            if (this.state.isTimerRunning()) this.toggleTimer();
            this.state.matchConcluso.set(true);
            this.state.salvaInDatabase(false, true);
            this.state.step.set('prestazioni');
          },
        },
      ],
    });
    await alert.present();
  }
}
