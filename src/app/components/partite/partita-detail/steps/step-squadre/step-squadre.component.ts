import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonAvatar,
  IonFab,
  IonFabButton,
  IonIcon,
  ToastController,
  IonSpinner,
  ActionSheetController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  checkmark,
  sparkles,
  swapHorizontal,
  flash,
  alertCircleOutline,
  refreshOutline,
  trendingUpOutline,
  cloudDoneOutline,
} from 'ionicons/icons';
import { MatchStateService } from '../../match-state.service';
import {
  MatchmakingService,
  MatchmakingProposal,
} from 'src/app/services/matchmaking.service';
import { StatsEngineService } from 'src/app/services/stats-engine.service';
import { MatchmakingModalComponent } from './matchmaking-modal/matchmaking-modal.component';
import {
  getAvatarUrl,
  handleAvatarError,
} from 'src/app/utils/avatar-utils';
import { CURRENT_SEASON } from 'src/app/utils/season-utils';
import { GeminiService } from 'src/app/services/gemini.service';
import { TtsService } from 'src/app/services/tts.service';
import { formatAiMarkdown } from 'src/app/utils/ai-format.utils';
import { AiTtsButtonComponent } from '../../../../ai-tts-button/ai-tts-button.component';

import { PlayerAvatarComponent } from '../../../../player-avatar/player-avatar.component';

@Component({
  selector: 'app-step-squadre',
  templateUrl: './step-squadre.component.html',
  styleUrls: ['./step-squadre.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonAvatar,
    IonFab,
    IonFabButton,
    IonIcon,
    MatchmakingModalComponent,
    PlayerAvatarComponent,
    AiTtsButtonComponent,
    IonSpinner,
  ],
})
export class StepSquadreComponent {
  public state = inject(MatchStateService);
  private matchmakingService = inject(MatchmakingService);
  private statsEngine = inject(StatsEngineService);
  private ttsService = inject(TtsService);
  private toastCtrl = inject(ToastController);
  private actionSheetCtrl = inject(ActionSheetController);
  private geminiService = inject(GeminiService);

  readonly formatAiMarkdown = formatAiMarkdown;
  isGeneratingPronostico = signal<boolean>(false);

  getAvatar(fotoUrl?: string | null): string {
    return getAvatarUrl(fotoUrl);
  }

  onImgError(event: Event) {
    handleAvatarError(event);
  }

  isMatchmakingOpen = signal<boolean>(false);
  proposals = signal<MatchmakingProposal[]>([]);

  /**
   * Monitoraggio in tempo reale del bilanciamento tra Bianchi e Neri attualmente sul campo
   */
  currentBalanceInfo = computed(() => {
    const teamA = this.state.teamA();
    const teamB = this.state.teamB();

    if (teamA.length === 0 || teamB.length === 0) return null;

    const statsRes = this.statsEngine.statsResult();
    const activeSeasonId = this.state.stagione() || CURRENT_SEASON;
    const seasonMap =
      activeSeasonId && activeSeasonId !== 'Tutte'
        ? statsRes.bySeason.get(activeSeasonId)
        : null;

    const getMmr = (p: any) => {
      const s = seasonMap?.get(p.id);
      if (s) {
        return s.partiteGiocate > 0 ? s.currentMmr : (s.seasonStartMmr ?? 1000);
      }
      const a = statsRes.allTime.get(p.id);
      if (a) {
        return a.partiteGiocate > 0 ? a.currentMmr : (a.seasonStartMmr ?? 1000);
      }
      return 1000;
    };

    const avgA = Math.round(
      teamA.reduce((s, p) => s + getMmr(p), 0) / teamA.length,
    );
    const avgB = Math.round(
      teamB.reduce((s, p) => s + getMmr(p), 0) / teamB.length,
    );

    const odds = StatsEngineService.calculateOdds(avgA, avgB);
    const diff = Math.abs(odds.probAPercent - odds.probBPercent);
    const isBalanced = diff <= 4;

    return {
      avgA,
      avgB,
      probA: odds.probAPercent,
      probB: odds.probBPercent,
      diffMmr: Math.abs(avgA - avgB),
      isBalanced,
      text: isBalanced
        ? `Equilibrata (${odds.probAPercent}% - ${odds.probBPercent}%)`
        : `Sbilanciata (${odds.probAPercent}% - ${odds.probBPercent}%)`,
    };
  });

  currentOdds = computed(() => {
    const bal = this.currentBalanceInfo();
    if (!bal) return null;
    return StatsEngineService.calculateOdds(bal.avgA, bal.avgB);
  });

  async generaPronostico(force = false) {
    if (this.isGeneratingPronostico()) return;
    const odds = this.currentOdds();
    if (!odds) {
      const toast = await this.toastCtrl.create({
        message: '⚠️ Aggiungi almeno un giocatore per squadra per calcolare il pronostico.',
        duration: 2500,
        color: 'warning',
        position: 'top',
      });
      await toast.present();
      return;
    }

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
        odds,
        force,
      );
      this.state.pronosticoAi.set(text);
      if (force) {
        this.ttsService.invalidateCache('pronostico-squadre-' + (this.state.matchId() || 'temp'));
      }
      const toast = await this.toastCtrl.create({
        message: force ? '🔄 Pronostico rigenerato e salvato nel database!' : '🔮 Pronostico del Mister generato e salvato nel database!',
        duration: 2500,
        color: 'success',
        position: 'top',
      });
      await toast.present();
    } catch (err: any) {
      console.error(err);
      const toast = await this.toastCtrl.create({
        message: this.geminiService.formatUserError(err),
        duration: 4000,
        color: 'warning',
        position: 'top',
      });
      await toast.present();
    } finally {
      this.isGeneratingPronostico.set(false);
    }
  }

  constructor() {
    addIcons({
      checkmark,
      sparkles,
      swapHorizontal,
      flash,
      alertCircleOutline,
  refreshOutline,
  trendingUpOutline,
    });
  }

  async apriMatchmaking() {
    const convocati = this.state.convocati();
    const inCampo = [...this.state.teamA(), ...this.state.teamB()];

    // Preferisci la lista convocati se presente, altrimenti chi è già in campo
    const pool = convocati.length >= 2 ? convocati : inCampo;

    if (pool.length < 4) {
      const toast = await this.toastCtrl.create({
        message:
          '⚠️ Seleziona almeno 4 giocatori convocati per generare squadre bilanciate.',
        duration: 2500,
        color: 'warning',
        position: 'top',
      });
      await toast.present();
      return;
    }

    const generated = this.matchmakingService.generateProposals(
      pool,
      this.state.stagione() || CURRENT_SEASON,
    );
    if (!generated || generated.length === 0) {
      const toast = await this.toastCtrl.create({
        message: 'Impossibile generare combinazioni con i giocatori attuali.',
        duration: 2500,
        color: 'danger',
        position: 'top',
      });
      await toast.present();
      return;
    }

    this.proposals.set(generated);
    this.isMatchmakingOpen.set(true);
  }

  chiudiMatchmaking() {
    this.isMatchmakingOpen.set(false);
  }

  async applicaSquadre(proposal: MatchmakingProposal) {
    this.state.teamA.set([...proposal.teamA]);
    this.state.teamB.set([...proposal.teamB]);
    this.isMatchmakingOpen.set(false);
    this.state.salvaSnapshotLocale();

    const toast = await this.toastCtrl.create({
      message: `🎉 ${proposal.title} applicata! Squadre bilanciate con successo.`,
      duration: 2500,
      color: 'success',
      position: 'top',
    });
    await toast.present();
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

  isDiRuolo(giocatore: any): boolean {
    return (giocatore?.ruoloPreferito as string)?.toLowerCase() === 'portiere';
  }

  isPortiereFisso(team: 'A' | 'B', playerId: string): boolean {
    if (team === 'A') {
      return (
        this.state.modalitaPortieriA() === 'fisso' &&
        this.state.portieriInfoA().attuale?.id === playerId
      );
    } else {
      return (
        this.state.modalitaPortieriB() === 'fisso' &&
        this.state.portieriInfoB().attuale?.id === playerId
      );
    }
  }

  async apriSelettorePortiereFisso(team: 'A' | 'B') {
    const players = team === 'A' ? this.state.teamA() : this.state.teamB();
    const teamNome = team === 'A' ? 'Bianchi' : 'Neri';
    const currFixedId =
      team === 'A'
        ? this.state.portieriInfoA().attuale?.id
        : this.state.portieriInfoB().attuale?.id;

    const buttons = players.map((p) => {
      const diRuolo = this.isDiRuolo(p);
      const isCurrent = p.id === currFixedId;
      return {
        text: `${isCurrent ? '🧤 ' : ''}${p.nome}${diRuolo ? ' (👑 Portiere di Ruolo)' : ''}`,
        role: isCurrent ? 'selected' : undefined,
        handler: () => {
          this.state.impostaPortiereFisso(team, p.id);
          this.state.salvaInDatabase(false);
        },
      };
    });

    buttons.push({
      text: 'Annulla',
      role: 'cancel',
      handler: () => {},
    });

    const actionSheet = await this.actionSheetCtrl.create({
      header: `🧤 Scegli Portiere Fisso (${teamNome})`,
      subHeader: 'Chi difenderà la porta per tutta la gara?',
      buttons,
    });

    await actionSheet.present();
  }

  confermaSquadre() {
    this.state.inizializzaRotazionePortieri(false);
    this.state.status.set('pronta');
    this.state.salvaInDatabase(false);
    this.state.step.set('match');
  }
}
