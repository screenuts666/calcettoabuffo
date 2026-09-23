import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonAvatar,
  IonTextarea,
  IonIcon,
  ModalController,
  AlertController,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  checkmarkDone,
  football,
  stopwatchOutline,
  createOutline,
  saveOutline,
  warningOutline,
} from 'ionicons/icons';
import {
  PlayerPerformance,
  RatingClass,
  RatingThresholds,
} from '../../../../../models/player-performance.model';
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
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  constructor() {
    addIcons({
      checkmarkDone,
      football,
      stopwatchOutline,
      createOutline,
      saveOutline,
      warningOutline,
    });
  }

  getRatingClass(voto: number | undefined): RatingClass {
    const v = Number(voto);
    if (!v || isNaN(v) || v === 0) return '';
    if (v >= RatingThresholds.HIGH) return 'voto-alto';
    if (v >= RatingThresholds.MEDIUM) return 'voto-medio';
    return 'voto-basso';
  }

  getAutogolCount(giocatore: PlayerPerformance): number {
    const eventi =
      this.state.eventiGol() ||
      this.state.matchDataOriginale?.eventiGol ||
      [];
    const fromEvents = eventi.filter(
      (eg: any) =>
        Boolean(eg.isAutogoal) &&
        (eg.idAssegnato === giocatore.id || (eg.nome && eg.nome === giocatore.nome)),
    ).length;

    if (fromEvents > 0) {
      return fromEvents;
    }

    return (giocatore as any)?.autogol || 0;
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

  async apriModificaRisultato() {
    if (!this.state.matchDataOriginale?.isAdmin) return;

    // STEP 1: Warning Preventivo Critico Impatto Classifica
    const alertWarning = await this.alertCtrl.create({
      header: 'Modifica Risultato',
      subHeader: '⚠️ Operazione Critica',
      message:
        'La modifica manuale del risultato altererà direttamente le statistiche di vittoria, pareggio, sconfitta (PWDL) e la classifica generale di tutti i giocatori coinvolti.\n\nVuoi procedere?',
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        {
          text: 'Procedi',
          role: 'destructive',
          handler: () => {
            this.mostraFormModificaRisultato();
          },
        },
      ],
    });
    await alertWarning.present();
  }

  private async mostraFormModificaRisultato() {
    const scoreAttualeA = this.state.scoreA();
    const scoreAttualeB = this.state.scoreB();

    // STEP 2: Input punteggi numerici
    const alertInput = await this.alertCtrl.create({
      header: 'Inserisci Risultato',
      subHeader: 'Modifica punteggi Bianchi e Neri',
      inputs: [
        {
          name: 'scoreA',
          type: 'number',
          placeholder: 'Gol Bianchi',
          value: scoreAttualeA,
          min: 0,
        },
        {
          name: 'scoreB',
          type: 'number',
          placeholder: 'Gol Neri',
          value: scoreAttualeB,
          min: 0,
        },
      ],
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        {
          text: 'Avanti',
          handler: (data) => {
            const rawA = Number(data.scoreA);
            const rawB = Number(data.scoreB);
            if (isNaN(rawA) || isNaN(rawB) || rawA < 0 || rawB < 0) {
              this.mostraToast(
                'Inserisci valori numerici validi maggiori o uguali a 0.',
                'warning',
              );
              return false;
            }
            this.confermaNuovoRisultato(rawA, rawB);
            return true;
          },
        },
      ],
    });
    await alertInput.present();
  }

  private async confermaNuovoRisultato(nuovoScoreA: number, nuovoScoreB: number) {
    // STEP 3: Riepilogo e Conferma Definitiva
    const alertConfirm = await this.alertCtrl.create({
      header: 'Conferma Nuovo Risultato',
      message: `Stai per registrare il seguente risultato:\n\n⚪ TEAM BIANCHI: ${nuovoScoreA}\n⚫ TEAM NERI: ${nuovoScoreB}\n\nConfermi l'aggiornamento immediato?`,
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        {
          text: 'Conferma e Salva',
          role: 'destructive',
          handler: async () => {
            this.state.scoreA.set(nuovoScoreA);
            this.state.scoreB.set(nuovoScoreB);
            await this.state.salvaInDatabase(this.state.pagelleInserite(), true);
            await this.mostraToast(
              `Risultato aggiornato: Bianchi ${nuovoScoreA} - ${nuovoScoreB} Neri`,
              'success',
            );
          },
        },
      ],
    });
    await alertConfirm.present();
  }

  async salvaModifiche() {
    const wasArchived = this.state.pagelleInserite();
    await this.state.salvaInDatabase(true, true);
    await this.mostraToast(
      wasArchived
        ? 'Partita archiviata aggiornata con successo!'
        : 'Pagelle archiviate con successo!',
      'success',
    );
    this.modalCtrl.dismiss(true);
  }

  async concludiTutto() {
    await this.salvaModifiche();
  }

  private async mostraToast(
    message: string,
    color: 'success' | 'warning' | 'danger' = 'success',
  ) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      position: 'bottom',
      color,
    });
    await toast.present();
  }
}
