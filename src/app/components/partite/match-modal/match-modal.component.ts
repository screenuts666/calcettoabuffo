import { Component, Input, OnDestroy, OnInit, inject } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonIcon,
  ModalController,
  IonFab,
  IonFabButton,
  AlertController,
} from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { addIcons } from 'ionicons';
import { arrowBack, close, arrowForward } from 'ionicons/icons';

import { MatchStateService } from './match-state.service';
import { StepConvocatiComponent } from './steps/step-convocati/step-convocati.component';
import { StepDettagliComponent } from './steps/step-dettagli/step-dettagli.component';
import { StepSquadreComponent } from './steps/step-squadre/step-squadre.component';
import { StepMatchComponent } from './steps/step-match/step-match.component';
import { StepPrestazioniComponent } from './steps/step-prestazioni/step-prestazioni.component';

@Component({
  selector: 'app-match-modal',
  templateUrl: './match-modal.component.html',
  styleUrls: ['./match-modal.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonButton,
    IonIcon,
    IonFab,
    IonFabButton,
    StepConvocatiComponent,
    StepDettagliComponent,
    StepSquadreComponent,
    StepMatchComponent,
    StepPrestazioniComponent,
  ],
  providers: [MatchStateService],
})
export class MatchModalComponent implements OnInit, OnDestroy {
  private modalCtrl = inject(ModalController);
  public state = inject(MatchStateService);
  private alertCtrl = inject(AlertController);

  @Input() matchData: any;

  constructor() {
    addIcons({ arrowBack, close, arrowForward });
  }

  ngOnInit() {
    this.state.matchDataOriginale = this.matchData;
    this.state.matchId.set(this.matchData.id || null);
    this.state.matchConcluso.set(this.matchData.matchConcluso || false);
    this.state.pagelleInserite.set(this.matchData.pagelleInserite || false);
    this.state.status.set(this.matchData.status || 'da_definire');

    const baseGiocatori = (this.matchData.tuttiGiocatori || []).map(
      (g: any) => ({ ...g, selezionato: false }),
    );

    if (this.matchData.id) {
      this.state.luogo.set(this.matchData.luogo || '');
      this.state.dataPartita.set(this.matchData.dataPartita || '');
      this.state.orario.set(this.matchData.orario || '');

      this.state.cronometro.set(this.matchData.cronometro || 0);
      this.state.accumulatedTime.set(this.matchData.accumulatedTime || 0);
      this.state.timerStartAt.set(this.matchData.timerStartAt || null);
      this.state.isTimerRunning.set(this.matchData.isTimerRunning || false);

      const idsSalvati = (this.matchData.convocati || []).map((c: any) => c.id);
      this.state.tutti.set(
        baseGiocatori.map((g: any) => ({
          ...g,
          selezionato: idsSalvati.includes(g.id),
        })),
      );
      this.state.teamA.set(this.matchData.teamA || []);
      this.state.teamB.set(this.matchData.teamB || []);

      if (!this.state.isDettagliValidi()) this.state.step.set('dettagli');
      else if (
        this.state.teamA().length === 0 &&
        this.state.teamB().length === 0
      )
        this.state.step.set('squadre');
      else if (!this.matchData.matchConcluso) this.state.step.set('match');
      else this.state.step.set('prestazioni');

      this.state.avviaAscoltoReale();
    } else {
      this.state.tutti.set(baseGiocatori);
      this.state.dataPartita.set(this.getProssimoMercoledi());
      this.state.orario.set('21:00');
      this.state.step.set('convocati');
    }
  }

  ngOnDestroy() {
    this.state.fermaAscolto();
  }

  getProssimoMercoledi(): string {
    const d = new Date();
    d.setDate(
      d.getDate() + (d.getDay() <= 3 ? 3 - d.getDay() : 10 - d.getDay()),
    );
    return d.toISOString().split('T')[0];
  }

  chiudi() {
    this.modalCtrl.dismiss();
  }

  async confermaTornaASquadre() {
    const alert = await this.alertCtrl.create({
      header: 'Sei sicuro?',
      message:
        'Tornando indietro resetterai il punteggio e il cronometro. I dati di questa partita andranno persi.',
      buttons: [
        {
          text: 'Annulla',
          role: 'cancel',
        },
        {
          text: 'Conferma',
          handler: () => {
            this.state.resetMatchState();
            this.state.step.set('squadre');
          },
        },
      ],
    });

    await alert.present();
  }
}
