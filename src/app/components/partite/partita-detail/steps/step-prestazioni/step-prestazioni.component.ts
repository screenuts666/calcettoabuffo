import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonIcon,
  ModalController,
  AlertController,
  ToastController,
  ActionSheetController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  checkmarkDone,
  saveOutline,
  flash,
  clipboardOutline,
  micOutline,
  trendingUpOutline,
} from 'ionicons/icons';
import { PlayerPerformance } from '../../../../../models/player-performance.model';
import { MatchStateService } from '../../match-state.service';
import { StatsEngineService } from '../../../../../services/stats-engine.service';
import { MatchShareModalComponent } from '../../../match-share-modal/match-share-modal.component';
import { MatchReportData } from '../../../../../models/mmr.model';
import { GeminiService } from '../../../../../services/gemini.service';

import { PrestazioniHeroComponent } from './components/prestazioni-hero/prestazioni-hero.component';
import { PrestazioniTabSintesiComponent } from './components/prestazioni-tab-sintesi/prestazioni-tab-sintesi.component';
import { PrestazioniTabPagelleComponent } from './components/prestazioni-tab-pagelle/prestazioni-tab-pagelle.component';
import { PrestazioniTabSpogliatoioComponent } from './components/prestazioni-tab-spogliatoio/prestazioni-tab-spogliatoio.component';
import { PrestazioniTabStatisticheComponent } from './components/prestazioni-tab-statistiche/prestazioni-tab-statistiche.component';

@Component({
  selector: 'app-step-prestazioni',
  templateUrl: './step-prestazioni.component.html',
  styleUrls: ['./step-prestazioni.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonIcon,
    PrestazioniHeroComponent,
    PrestazioniTabSintesiComponent,
    PrestazioniTabPagelleComponent,
    PrestazioniTabSpogliatoioComponent,
    PrestazioniTabStatisticheComponent,
  ],
})
export class StepPrestazioniComponent {
  public state = inject(MatchStateService);
  public statsEngine = inject(StatsEngineService);
  public geminiService = inject(GeminiService);
  private modalCtrl = inject(ModalController);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private actionSheetCtrl = inject(ActionSheetController);
  private router = inject(Router);

  // Navigazione a Schede (Sintesi, Pagelle, Spogliatoio & AI, Statistiche)
  activeTab = signal<'sintesi' | 'pagelle' | 'spogliatoio' | 'statistiche'>('sintesi');

  isGeneratingPronostico = signal<boolean>(false);
  isGeneratingCronaca = signal<boolean>(false);
  isSavingCommento = signal<boolean>(false);

  constructor() {
    addIcons({
      checkmarkDone,
      saveOutline,
      flash,
      clipboardOutline,
      micOutline,
      trendingUpOutline,
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
      commentoPartita: this.state.commentoPartita(),
    };
    return this.statsEngine.getMatchReport(currentMatch);
  });

  scorersA = computed(() => {
    const list = this.report()?.playersA || [];
    return list.filter((p) => (p.gol || 0) > 0).map((p) => ({ nome: p.nome, gol: p.gol }));
  });

  scorersB = computed(() => {
    const list = this.report()?.playersB || [];
    return list.filter((p) => (p.gol || 0) > 0).map((p) => ({ nome: p.nome, gol: p.gol }));
  });

  onCommentoPartitaChange(event: Event) {
    const val = (event.target as HTMLTextAreaElement)?.value ?? '';
    this.state.commentoPartita.set(val);
  }

  async salvaCommentoPartita(silent = false) {
    if (!this.state.matchId() || this.isSavingCommento()) return;
    this.isSavingCommento.set(true);
    try {
      await this.state.salvaInDatabase(
        this.state.pagelleInserite(),
        this.state.matchConcluso(),
      );
      if (!silent) {
        await this.mostraToast('📝 Note a bordocampo salvate con successo!', 'success');
      }
    } catch (err) {
      console.error('Errore salvataggio commento partita:', err);
      if (!silent) {
        await this.mostraToast('Errore durante il salvataggio delle note.', 'danger');
      }
    } finally {
      this.isSavingCommento.set(false);
    }
  }

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
        commentoPartita: this.state.commentoPartita(),
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
        message: this.geminiService.formatUserError(err),
        duration: 4000,
        color: 'warning',
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
      // Salva preventivamente le ultime note di bordocampo e lo stato su Firestore se la partita esiste
      if (this.state.matchId()) {
        try {
          await this.state.salvaInDatabase(
            this.state.pagelleInserite(),
            this.state.matchConcluso(),
          );
        } catch (saveErr) {
          console.warn('Avviso pre-salvataggio note match:', saveErr);
        }
      }

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
        commentoPartita: this.state.commentoPartita(),
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
        message: this.geminiService.formatUserError(err),
        duration: 4000,
        color: 'warning',
        position: 'bottom',
      });
      await toast.present();
    } finally {
      this.isGeneratingCronaca.set(false);
    }
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

  getAssistCount(giocatore: PlayerPerformance): number {
    const eventi =
      this.state.eventiGol() ||
      this.state.matchDataOriginale?.eventiGol ||
      [];
    const fromEvents = eventi.filter(
      (eg: any) =>
        eg.assistId === giocatore.id ||
        (!eg.assistId && eg.assistNome && eg.assistNome === giocatore.nome),
    ).length;

    if (fromEvents > 0) {
      return fromEvents;
    }

    return (giocatore as any)?.assist || 0;
  }

  async modificaAssist(giocatore: any) {
    if (!this.state.matchDataOriginale?.isAdmin) return;

    const currentAssist = this.getAssistCount(giocatore);
    const alert = await this.alertCtrl.create({
      header: `👟 Assist: ${giocatore.nome}`,
      subHeader: 'Modifica manuale del numero di assist',
      inputs: [
        {
          name: 'assist',
          type: 'number',
          min: 0,
          max: 20,
          value: currentAssist,
          placeholder: 'Numero assist',
        },
      ],
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        {
          text: 'Salva',
          handler: async (data) => {
            const val = parseInt(data.assist, 10);
            if (isNaN(val) || val < 0) return false;
            this.salvaAssistNelloStato(giocatore.id, val);
            await this.state.salvaInDatabase(this.state.pagelleInserite(), true);
            await this.mostraToast(
              `👟 Assist di ${giocatore.nome} impostati a ${val}`,
              'success',
            );
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  private salvaAssistNelloStato(id: string, assist: number) {
    const updateFn = (list: PlayerPerformance[]) =>
      list.map((g) => (g.id === id ? { ...g, assist } : g));
    this.state.teamA().some((g: PlayerPerformance) => g.id === id)
      ? this.state.teamA.update(updateFn)
      : this.state.teamB.update(updateFn);
    this.state.tutti.update(updateFn);
  }

  async modificaAssistEvento(index: number) {
    if (!this.state.matchDataOriginale?.isAdmin) return;

    const eventi = this.state.eventiGol();
    const evento = eventi[index];
    if (!evento || evento.isAutogoal) return;

    const team =
      evento.teamVantaggio === 'A' ? this.state.teamA() : this.state.teamB();
    const compagni = team.filter((c: any) => c.id !== evento.idAssegnato);

    const buttons = [
      {
        text: '⚡ Nessuno / Azione Personale',
        role: evento.assistId ? undefined : 'selected',
        handler: async () => {
          await this.aggiornaAssistEvento(index, null, null);
        },
      },
      ...compagni.map((c: any) => ({
        text: `👟 Assist di ${c.nome}`,
        role: evento.assistId === c.id ? 'selected' : undefined,
        handler: async () => {
          await this.aggiornaAssistEvento(index, c.id, c.nome);
        },
      })),
      { text: 'Annulla', role: 'cancel' },
    ];

    const as = await this.actionSheetCtrl.create({
      header: '👟 Modifica Assist per il gol',
      subHeader: `Gol di ${evento.nome} (${evento.teamVantaggio === 'A' ? 'Bianchi' : 'Neri'})`,
      buttons,
    });
    await as.present();
  }

  private async aggiornaAssistEvento(
    index: number,
    assistId: string | null,
    assistNome: string | null,
  ) {
    const eventi = [...this.state.eventiGol()];
    if (!eventi[index]) return;

    eventi[index] = {
      ...eventi[index],
      assistId,
      assistNome,
    };
    this.state.eventiGol.set(eventi);

    // Sincronizza i totali assist per tutti i giocatori in base agli eventi
    this.sincronizzaAssistDaiGoalEventi();

    await this.state.salvaInDatabase(this.state.pagelleInserite(), true);
    await this.mostraToast(
      assistNome
        ? `👟 Assist assegnato a ${assistNome}!`
        : '⚡ Assist rimosso (Azione personale)',
      'success',
    );
  }

  private sincronizzaAssistDaiGoalEventi() {
    const eventi = this.state.eventiGol();
    const syncFn = (list: PlayerPerformance[]) =>
      list.map((g) => {
        const count = eventi.filter(
          (eg: any) =>
            eg.assistId === g.id ||
            (!eg.assistId && eg.assistNome && eg.assistNome === g.nome),
        ).length;
        return { ...g, assist: count };
      });

    this.state.teamA.update(syncFn);
    this.state.teamB.update(syncFn);
    this.state.tutti.update(syncFn);
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
    if (this.modalCtrl && (await this.modalCtrl.getTop())) {
      await this.modalCtrl.dismiss(true);
    } else {
      await this.router.navigate(['/partite']);
    }
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
