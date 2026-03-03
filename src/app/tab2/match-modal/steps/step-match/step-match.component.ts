import { Component, inject, OnInit, OnDestroy } from '@angular/core';
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
import { doc, updateDoc } from '@angular/fire/firestore';
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
export class StepMatchComponent implements OnInit, OnDestroy {
  public state = inject(MatchStateService);
  private actionSheetCtrl = inject(ActionSheetController);
  private alertCtrl = inject(AlertController);

  private timerRef: any;

  constructor() {
    addIcons({ locationOutline, timeOutline, play, pause, add, remove, stop });
  }

  // 🔥 IL MOTORE MATEMATICO DEL TIMER
  ngOnInit() {
    // Questo gira ogni secondo ma NON SCRIVE MAI SUL DATABASE. Aggiorna solo lo schermo.
    this.timerRef = setInterval(() => {
      if (this.state.isTimerRunning()) {
        const start = this.state.timerStartAt() || Date.now();
        const diffSec = Math.floor((Date.now() - start) / 1000);
        this.state.cronometro.set(this.state.accumulatedTime() + diffSec);
      } else {
        this.state.cronometro.set(this.state.accumulatedTime());
      }
    }, 1000);
  }

  ngOnDestroy() {
    if (this.timerRef) clearInterval(this.timerRef);
  }

  // 🔥 I PULSANTI SCRIVONO SUL DB UNA VOLTA SOLA
  async toggleTimer() {
    if (!this.state.matchId()) return;

    if (this.state.isTimerRunning()) {
      // PAUSA: Calcoliamo quanti secondi sono passati e li salviamo
      const start = this.state.timerStartAt() || Date.now();
      const diffSec = Math.floor((Date.now() - start) / 1000);
      const nuovoAccumulo = this.state.accumulatedTime() + diffSec;

      await updateDoc(
        doc(this.state.firestore, `partite/${this.state.matchId()}`),
        {
          isTimerRunning: false,
          accumulatedTime: nuovoAccumulo,
          timerStartAt: null,
        },
      );
    } else {
      // PLAY: Salviamo solo l'ora di inizio
      await updateDoc(
        doc(this.state.firestore, `partite/${this.state.matchId()}`),
        {
          isTimerRunning: true,
          timerStartAt: Date.now(),
        },
      );
    }
  }

  // ... (Tutto il resto: chiediChiHaSegnato, registraGol, rimuoviUltimoGol, finisciMatch RIMANE IDENTICO a prima!)
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
