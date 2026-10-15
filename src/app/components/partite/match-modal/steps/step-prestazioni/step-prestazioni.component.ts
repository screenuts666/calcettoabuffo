import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonAvatar,
  IonTextarea,
  IonIcon,
  ModalController,
  AlertController,
  ToastController,
  IonSpinner,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  checkmarkDone,
  football,
  stopwatchOutline,
  createOutline,
  saveOutline,
  warningOutline,
  flame,
  snowOutline,
  trophy,
  trophyOutline,
  star,
  ribbon,
  trendingUpOutline,
  trendingDownOutline,
  logoWhatsapp,
  shareSocialOutline,
  calendarOutline,
  locationOutline,
  peopleOutline,
  sparkles,
  expandOutline,
  image,
  imageOutline,
  heart,
  skull,
  flash,
  ribbonOutline,
  refreshOutline,
  micOutline,
  bulbOutline,
} from 'ionicons/icons';
import {
  PlayerPerformance,
  RatingClass,
  RatingThresholds,
} from '../../../../../models/player-performance.model';
import { MatchStateService } from '../../match-state.service';
import { MatchPhotoComponent } from '../../../match-photo/match-photo.component';
import { StatsEngineService } from '../../../../../services/stats-engine.service';
import { MatchShareModalComponent } from '../../../match-share-modal/match-share-modal.component';
import { FotoViewerModalComponent } from '../../../foto-viewer-modal/foto-viewer-modal.component';
import { MatchReportData } from '../../../../../models/mmr.model';
import { GeminiService } from '../../../../../services/gemini.service';
import { formatAiMarkdown } from '../../../../../utils/ai-format.utils';

@Component({
  selector: 'app-step-prestazioni',
  templateUrl: './step-prestazioni.component.html',
  styleUrls: ['./step-prestazioni.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonAvatar,
    IonTextarea,
    IonIcon,
    IonSpinner,
    MatchPhotoComponent,
  ],
})
export class StepPrestazioniComponent {
  public state = inject(MatchStateService);
  public statsEngine = inject(StatsEngineService);
  public geminiService = inject(GeminiService);
  private modalCtrl = inject(ModalController);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  readonly formatAiMarkdown = formatAiMarkdown;

  isGeneratingPronostico = signal<boolean>(false);
  isGeneratingCronaca = signal<boolean>(false);

  constructor() {
    addIcons({
      checkmarkDone,
      football,
      stopwatchOutline,
      createOutline,
      saveOutline,
      warningOutline,
      flame,
      snowOutline,
      trophy,
      trophyOutline,
      star,
      ribbon,
      ribbonOutline,
      trendingUpOutline,
      trendingDownOutline,
      logoWhatsapp,
      shareSocialOutline,
      calendarOutline,
      locationOutline,
      peopleOutline,
      sparkles,
      expandOutline,
      image,
      imageOutline,
      heart,
      skull,
      flash,
      refreshOutline,
      micOutline,
      bulbOutline,
    });
  }

  /**
   * Report iperdettagliato calcolato in maniera reattiva dai dati di stato della partita
   */
  report = computed<MatchReportData>(() => {
    const currentMatch = {
      id: this.state.matchId() || '',
      dataPartita: this.state.dataPartita(),
      luogo: this.state.luogo(),
      orario: this.state.orario(),
      scoreA: this.state.scoreA(),
      scoreB: this.state.scoreB(),
      teamA: this.state.teamA(),
      teamB: this.state.teamB(),
      eventiGol: this.state.eventiGol(),
      matchConcluso: this.state.matchConcluso(),
      pagelleInserite: this.state.pagelleInserite(),
      fotoUrl: this.state.fotoUrl(),
      fotoPath: this.state.fotoPath(),
      status: this.state.status(),
      pronosticoAi: this.state.pronosticoAi(),
      cronacaAi: this.state.cronacaAi(),
    };
    return this.statsEngine.getMatchReport(currentMatch);
  });

  async generaPronostico(force = false) {
    if (this.isGeneratingPronostico()) return;
    this.isGeneratingPronostico.set(true);
    try {
      const currentMatch: any = {
        id: this.state.matchId() || '',
        dataPartita: this.state.dataPartita(),
        luogo: this.state.luogo(),
        orario: this.state.orario(),
        teamA: this.state.teamA(),
        teamB: this.state.teamB(),
        pronosticoAi: this.state.pronosticoAi(),
      };
      const text = await this.geminiService.getOrGeneratePronostico(
        currentMatch,
        this.report().odds,
        force,
      );
      this.state.pronosticoAi.set(text);
      const toast = await this.toastCtrl.create({
        message: '🔮 Pronostico del Mister generato e salvato!',
        duration: 2500,
        color: 'success',
        position: 'bottom',
      });
      await toast.present();
    } catch (err: any) {
      console.error(err);
      const toast = await this.toastCtrl.create({
        message: 'Errore generazione pronostico: ' + (err.message || err),
        duration: 3500,
        color: 'danger',
        position: 'bottom',
      });
      await toast.present();
    } finally {
      this.isGeneratingPronostico.set(false);
    }
  }

  async generaCronaca(force = false) {
    if (this.isGeneratingCronaca()) return;
    this.isGeneratingCronaca.set(true);
    try {
      const currentMatch: any = {
        id: this.state.matchId() || '',
        dataPartita: this.state.dataPartita(),
        luogo: this.state.luogo(),
        orario: this.state.orario(),
        scoreA: this.state.scoreA(),
        scoreB: this.state.scoreB(),
        teamA: this.state.teamA(),
        teamB: this.state.teamB(),
        eventiGol: this.state.eventiGol(),
        cronacaAi: this.state.cronacaAi(),
      };
      const text = await this.geminiService.getOrGenerateCronaca(
        currentMatch,
        this.report(),
        force,
      );
      this.state.cronacaAi.set(text);
      const toast = await this.toastCtrl.create({
        message: '🎙️ Cronaca Ignorante AI generata e salvata!',
        duration: 2500,
        color: 'success',
        position: 'bottom',
      });
      await toast.present();
    } catch (err: any) {
      console.error(err);
      const toast = await this.toastCtrl.create({
        message: 'Errore generazione cronaca: ' + (err.message || err),
        duration: 3500,
        color: 'danger',
        position: 'bottom',
      });
      await toast.present();
    } finally {
      this.isGeneratingCronaca.set(false);
    }
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

  async apriCondivisione() {
    const currentMatch: any = {
      id: this.state.matchId() || '',
      dataPartita: this.state.dataPartita(),
      luogo: this.state.luogo(),
      orario: this.state.orario(),
      scoreA: this.state.scoreA(),
      scoreB: this.state.scoreB(),
      teamA: this.state.teamA(),
      teamB: this.state.teamB(),
      eventiGol: this.state.eventiGol(),
      matchConcluso: this.state.matchConcluso(),
      pagelleInserite: this.state.pagelleInserite(),
      fotoUrl: this.state.fotoUrl(),
      fotoPath: this.state.fotoPath(),
      status: this.state.status(),
    };

    const modal = await this.modalCtrl.create({
      component: MatchShareModalComponent,
      componentProps: { partita: currentMatch },
      breakpoints: [0, 0.95, 1],
      initialBreakpoint: 0.95,
      handle: true,
    });
    await modal.present();
  }

  async apriFotoViewer() {
    const fotoUrl = this.state.fotoUrl();
    if (!fotoUrl) return;

    const modal = await this.modalCtrl.create({
      component: FotoViewerModalComponent,
      componentProps: {
        fotoUrl,
        luogo: this.state.luogo(),
        dataPartita: this.state.dataPartita(),
        risultato: `Bianchi ${this.state.scoreA()} - ${this.state.scoreB()} Neri`,
      },
    });
    await modal.present();
  }

  aggiornaVoto(giocatore: any, event: Event) {
    const input = event.target as HTMLInputElement | null;
    if (!input || input.value.trim() === '') {
      this.salvaVotoNelloStato(giocatore.id, 0);
      return;
    }
    const v = Number(input.value);
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

  aggiornaNote(giocatore: any, testo: string) {
    const updateFn = (list: PlayerPerformance[]) =>
      list.map((g) => (g.id === giocatore.id ? { ...g, note: testo } : g));
    this.state.teamA().some((g: PlayerPerformance) => g.id === giocatore.id)
      ? this.state.teamA.update(updateFn)
      : this.state.teamB.update(updateFn);
  }

  async apriModificaRisultato() {
    if (!this.state.matchDataOriginale?.isAdmin) return;

    const alertWarning = await this.alertCtrl.create({
      header: 'Modifica Risultato',
      subHeader: '⚠️ Operazione Critica',
      message:
        'La modifica manuale del risultato altererà direttamente le statistiche e la classifica generale. Vuoi procedere?',
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
