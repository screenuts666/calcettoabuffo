import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonAvatar,
  IonFab,
  IonFabButton,
  IonIcon,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  checkmark,
  sparkles,
  swapHorizontal,
  flash,
  alertCircleOutline,
} from 'ionicons/icons';
import { MatchStateService } from '../../match-state.service';
import {
  MatchmakingService,
  MatchmakingProposal,
} from 'src/app/services/matchmaking.service';
import { StatsEngineService } from 'src/app/services/stats-engine.service';
import { MatchmakingModalComponent } from './matchmaking-modal/matchmaking-modal.component';

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
  ],
})
export class StepSquadreComponent {
  public state = inject(MatchStateService);
  private matchmakingService = inject(MatchmakingService);
  private statsEngine = inject(StatsEngineService);
  private toastCtrl = inject(ToastController);

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
    const getMmr = (p: any) =>
      statsRes.allTime.get(p.id)?.currentMmr ?? 1000;

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

  constructor() {
    addIcons({
      checkmark,
      sparkles,
      swapHorizontal,
      flash,
      alertCircleOutline,
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

    const generated = this.matchmakingService.generateProposals(pool);
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

  confermaSquadre() {
    this.state.status.set('pronta');
    this.state.salvaInDatabase(false);
    this.state.step.set('match');
  }
}
