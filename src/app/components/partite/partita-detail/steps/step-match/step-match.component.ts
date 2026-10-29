import {
  Component,
  ChangeDetectionStrategy,
  inject,
  OnInit,
  OnDestroy,
  Input,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonButton,
  IonIcon,
  IonAvatar,
  ActionSheetController,
  AlertController,
  ToastController,
  ModalController,
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
  football,
  trashOutline,
  musicalNotes,
  volumeMute,
  volumeHigh,
  notificationsOutline,
      megaphoneOutline,
  settingsOutline,
  diceOutline,
  listOutline,
  chevronUpOutline,
  chevronDownOutline,
  shieldOutline,
  flash,
  closeOutline,
  arrowBackOutline,
  warningOutline,
  arrowUndoOutline,
} from 'ionicons/icons';
import { MatchStateService } from '../../match-state.service';
import { PlayerPerformance } from '../../../../../models/player-performance.model';
import { PlayerAvatarComponent } from '../../../../player-avatar/player-avatar.component';
import { SoundSettingsService } from '../../../../../services/sound-settings.service';
import { ImpostazioniModalComponent } from '../../../../impostazioni-modal/impostazioni-modal.component';

@Component({
  selector: 'app-step-match',
  templateUrl: './step-match.component.html',
  styleUrls: ['./step-match.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    IonButton,
    IonIcon,
    IonAvatar,
    PlayerAvatarComponent,
  ],
})
export class StepMatchComponent implements OnInit, OnDestroy {
  public state = inject(MatchStateService);
  public soundSettings = inject(SoundSettingsService);
  private actionSheetCtrl = inject(ActionSheetController);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private modalCtrl = inject(ModalController);

  @Input() isAdmin: boolean = false;

  private timerRef: ReturnType<typeof setInterval> | null = null;
  private wakeLock: any = null;

  // Traccia l'ultimo minuto di cambio già triggerato per evitare doppioni
  private ultimoCambioTurno: number = -1;
  private ultimoPreAlertTurno: number = -1;

  isSequenzaAperta = signal<boolean>(false);

  // ─── STATO VISUAL GOAL & ASSIST PICKER CON FOTO (BORDO CAMPO) ────────────
  goalPickerOpen = signal<boolean>(false);
  goalPickerStep = signal<'scorer' | 'assist'>('scorer');
  goalPickerTeam = signal<'A' | 'B'>('A');
  selectedScorer = signal<PlayerPerformance | null>(null);
  showAutogolList = signal<boolean>(false);

  pickerScoringTeamPlayers = computed(() => {
    return this.goalPickerTeam() === 'A'
      ? this.state.teamA()
      : this.state.teamB();
  });

  pickerOpposingTeamPlayers = computed(() => {
    return this.goalPickerTeam() === 'A'
      ? this.state.teamB()
      : this.state.teamA();
  });

  pickerAssistTeammates = computed(() => {
    const scorer = this.selectedScorer();
    const list = this.pickerScoringTeamPlayers();
    if (!scorer) return list;
    return list.filter((p) => p.id !== scorer.id);
  });

  constructor() {
    addIcons({
      locationOutline,
      timeOutline,
      play,
      pause,
      add,
      remove,
      stop,
      football,
      trashOutline,
      musicalNotes,
      volumeMute,
      volumeHigh,
      notificationsOutline,
      settingsOutline,
      diceOutline,
      listOutline,
      chevronUpOutline,
      chevronDownOutline,
      shieldOutline,
      flash,
      closeOutline,
      arrowBackOutline,
      warningOutline,
      arrowUndoOutline,
    });
  }

  ngOnInit() {
    this.ultimoCambioTurno = this.state.turnoAttualeIndex();
    if (this.isAdmin && !this.state.rotazionePortieri()) {
      this.state.inizializzaRotazionePortieri(false);
    }

    // ─── WAKE LOCK SEMPRE ATTIVO ───────────────────────────────────────
    this.attivaWakeLock();
    if ('wakeLock' in navigator) {
      document.addEventListener('visibilitychange', this.riattivaWakeLock);
    }

    // ─── AUDIO SBLOCCO USER GESTURE (solo su effettivo tocco dell'utente) ───
    document.addEventListener('click', this.sbloccaAudioUserGesture, {
      once: true,
    });

    // ─── TIMER PRINCIPALE ──────────────────────────────────────────────
    this.timerRef = setInterval(() => {
      if (this.state.isTimerRunning()) {
        const start = this.state.timerStartAt() || Date.now();
        const diffSec = Math.floor((Date.now() - start) / 1000);
        const newCronometro = this.state.accumulatedTime() + diffSec;
        this.state.cronometro.set(newCronometro);

        // Salvataggio periodico di sicurezza in locale ogni 5 secondi
        if (newCronometro % 5 === 0) {
          this.state.salvaSnapshotLocale();
        }

        // ─── LOGICA SUONO CAMBIO & PREAVVISO -30s (configurabile) ───────────
        const hasRotatingTeam =
          this.state.modalitaPortieriA() === 'rotazione' ||
          this.state.modalitaPortieriB() === 'rotazione';

        if (this.isAdmin && hasRotatingTeam) {
          const turnSec = this.state.durataTurnoSecondi();
          const turnIndex = this.state.turnoAttualeIndex();
          const secInTurn = newCronometro % turnSec;
          const secRim = turnSec - secInTurn;

          // Preavviso toast prima del cambio (-30s standard, -10s in DEV)
          const isPreAlertTime = (turnSec >= 60 && secRim === 30) || (turnSec === 30 && secRim === 10);
          if (
            isPreAlertTime &&
            this.ultimoPreAlertTurno !== turnIndex
          ) {
            this.ultimoPreAlertTurno = turnIndex;
            this.mostraToastFeedback(`⏳ Tra ${secRim} secondi cambio portiere!`, 'warning');
          }

          // Cambio portiere quando scade il turno
          if (newCronometro > 0 && turnIndex > 0 && turnIndex !== this.ultimoCambioTurno) {
            this.ultimoCambioTurno = turnIndex;
            this.state.setCambioPortiereAttivo(true);
          }
        }
      } else {
        this.state.cronometro.set(this.state.accumulatedTime());
      }

      // ─── GESTIONE AUDIO CAMBIO (reattivo allo stato cambioAttivo) ──────
      if (this.isAdmin) {
        const cambioAttivo = this.state.cambioAttivo();
        if (cambioAttivo && !this.soundSettings.isMatchAlarmPlaying()) {
          this.avviaAudio();
        } else if (!cambioAttivo && this.soundSettings.isMatchAlarmPlaying()) {
          this.fermaAudio();
        }
      }
    }, 1000);
  }

  ngOnDestroy() {
    if (this.timerRef) clearInterval(this.timerRef);
    document.removeEventListener('click', this.sbloccaAudioUserGesture);
    this.rilasciaWakeLock();
    this.fermaAudio();
  }

  toggleSequenza() {
    this.isSequenzaAperta.update((v) => !v);
  }

  isPlayerCurrentGk(playerId: string, team: 'A' | 'B'): boolean {
    const info =
      team === 'A' ? this.state.portieriInfoA() : this.state.portieriInfoB();
    return info?.attuale?.id === playerId;
  }

  async rimescolaPortieri(team?: 'A' | 'B') {
    this.triggerHaptic(30);
    if (team === 'A') {
      this.state.rimescolaSquadra('A');
      await this.mostraToastFeedback('🎲 Rotazione Bianchi rimescolata');
    } else if (team === 'B') {
      this.state.rimescolaSquadra('B');
      await this.mostraToastFeedback('🎲 Rotazione Neri rimescolata');
    } else {
      this.state.inizializzaRotazionePortieri(true);
      await this.mostraToastFeedback(
        '🎲 Rotazione rimescolata per entrambe le squadre'
      );
    }
    await this.state.salvaInDatabase(false);
  }

  async scambiaOrdine(team: 'A' | 'B', idx1: number, idx2: number) {
    this.triggerHaptic(20);
    this.state.scambiaOrdinePortieri(team, idx1, idx2);
    await this.state.salvaInDatabase(false);
  }

  async cambiaPortiereFisso(team: 'A' | 'B') {
    const players = team === 'A' ? this.state.teamA() : this.state.teamB();
    const teamNome = team === 'A' ? 'Bianchi' : 'Neri';
    const currFixedId =
      team === 'A'
        ? this.state.portieriInfoA().attuale?.id
        : this.state.portieriInfoB().attuale?.id;

    const buttons: any[] = players.map((p) => {
      const isDiRuolo =
        ((p as any)?.ruoloPreferito as string)?.toLowerCase() === 'portiere';
      const isCurrent = p.id === currFixedId;
      return {
        text: `${isCurrent ? '🧤 ' : ''}${p.nome}${isDiRuolo ? ' (👑 Di Ruolo)' : ''}`,
        role: isCurrent ? 'selected' : undefined,
        handler: async () => {
          this.state.impostaPortiereFisso(team, p.id);
          await this.state.salvaInDatabase(false);
          await this.mostraToastFeedback(
            `🧤 Portiere fisso ${teamNome} impostato su ${p.nome}`
          );
        },
      };
    });

    buttons.push({
      text: 'Annulla',
      role: 'cancel',
      handler: async () => {},
    });

    const actionSheet = await this.actionSheetCtrl.create({
      header: `🧤 Sostituisci Portiere Fisso (${teamNome})`,
      subHeader: 'Chi difenderà la porta tra i pali?',
      buttons,
    });

    await actionSheet.present();
  }

  // ──────────────────────────────────────────────────────────────────────
  // WAKE LOCK & HAPTICS
  // ──────────────────────────────────────────────────────────────────────

  private triggerHaptic(ms = 30) {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(ms);
      }
    } catch {
      // Ignora su dispositivi non supportati
    }
  }

  private async attivaWakeLock() {
    if (this.wakeLock) return;
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await (navigator as any).wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => {
          this.wakeLock = null;
        });
      } catch (err) {
        console.warn('WakeLock non disponibile:', err);
      }
    }
  }

  private riattivaWakeLock = async () => {
    if (document.visibilityState === 'visible') {
      await this.attivaWakeLock();
    }
  };

  private rilasciaWakeLock() {
    if ('wakeLock' in navigator) {
      document.removeEventListener('visibilitychange', this.riattivaWakeLock);
    }
    if (this.wakeLock) {
      this.wakeLock.release().catch(() => {});
      this.wakeLock = null;
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // SUONO CAMBIO PORTIERE & IMPOSTAZIONI
  // ──────────────────────────────────────────────────────────────────────

  async fermaCambio() {
    this.triggerHaptic(30);
    await this.state.setCambioPortiereAttivo(false);
    this.fermaAudio();
  }

  async suonaCambioManuale() {
    this.triggerHaptic(35);
    const nuovoStato = !this.state.cambioAttivo();
    await this.state.setCambioPortiereAttivo(nuovoStato);
    if (!nuovoStato) {
      this.fermaAudio();
    } else {
      this.avviaAudio();
    }
  }

  async apriImpostazioniSuoni() {
    const modal = await this.modalCtrl.create({
      component: ImpostazioniModalComponent,
      componentProps: { initialTab: 'portiere' },
      mode: 'ios',
    });
    await modal.present();
  }

  private sbloccaAudioUserGesture = () => {
    this.soundSettings.unlockAudioOnUserGesture();
  };

  private buildCambioSpeechText(): string {
    const currA = this.state.portieriInfoA().attuale?.nome;
    const currB = this.state.portieriInfoB().attuale?.nome;
    if (currA && currB) {
      return `Attenzione! Cambio portiere! In porta ${currA} per i Bianchi e ${currB} per i Neri!`;
    } else if (currA) {
      return `Attenzione! Cambio portiere! In porta ${currA} per i Bianchi!`;
    } else if (currB) {
      return `Attenzione! Cambio portiere! In porta ${currB} per i Neri!`;
    }
    return 'Attenzione! Cambio portiere!';
  }

  private avviaAudio() {
    this.soundSettings.startMatchCambioAlarm(this.buildCambioSpeechText());
  }

  private fermaAudio() {
    this.soundSettings.stopMatchCambioAlarm();
  }

  // ──────────────────────────────────────────────────────────────────────
  // TIMER PARTITA
  // ──────────────────────────────────────────────────────────────────────

  async toggleTimer() {
    this.triggerHaptic(40);
    if (this.state.cronometro() === 0 && !this.state.isTimerRunning()) {
      this.soundSettings.playMatchWhistle('kickoff');
    }
    await this.state.toggleTimerState();
  }

  // ──────────────────────────────────────────────────────────────────────
  // SISTEMA GOL RAPIDO BORDO CAMPO (CON FOTO GRANDI & 1-TAP)
  // ──────────────────────────────────────────────────────────────────────

  async chiediChiHaSegnato(teamVantaggio: 'A' | 'B') {
    if (this.state.cronometro() <= 0) {
      await this.mostraToastFeedback(
        '⏱️ Premi prima ▶ AVVIA per far partire la partita!',
        'warning'
      );
      return;
    }
    this.triggerHaptic(35);
    this.goalPickerTeam.set(teamVantaggio);
    this.selectedScorer.set(null);
    this.goalPickerStep.set('scorer');
    this.showAutogolList.set(false);
    this.goalPickerOpen.set(true);
  }

  async toccaGiocatorePerGolRapido(
    player: PlayerPerformance,
    teamVantaggio: 'A' | 'B'
  ) {
    if (this.state.cronometro() <= 0) {
      await this.mostraToastFeedback(
        '⏱️ Premi prima ▶ AVVIA per far partire la partita!',
        'warning'
      );
      return;
    }
    this.triggerHaptic(40);
    this.goalPickerTeam.set(teamVantaggio);
    this.selectedScorer.set(player);
    this.goalPickerStep.set('assist');
    this.showAutogolList.set(false);
    this.goalPickerOpen.set(true);
  }

  selezionaMarcatoreNelPicker(player: PlayerPerformance, isAutogoal = false) {
    this.triggerHaptic(35);
    if (isAutogoal) {
      const team = this.goalPickerTeam();
      this.chiudiGoalPicker();
      this.registraGol(player, team, true, null);
      return;
    }
    this.selectedScorer.set(player);
    this.goalPickerStep.set('assist');
  }

  tornaASceltaMarcatore() {
    this.triggerHaptic(20);
    this.selectedScorer.set(null);
    this.goalPickerStep.set('scorer');
  }

  toggleAutogolNelPicker() {
    this.triggerHaptic(20);
    this.showAutogolList.update((v) => !v);
  }

  confermaAssistNelPicker(assistMan: PlayerPerformance | null) {
    this.triggerHaptic(45);
    const scorer = this.selectedScorer();
    const team = this.goalPickerTeam();
    if (!scorer) return;
    this.chiudiGoalPicker();
    this.registraGol(scorer, team, false, assistMan);
  }

  chiudiGoalPicker() {
    this.goalPickerOpen.set(false);
    this.selectedScorer.set(null);
    this.showAutogolList.set(false);
  }

  async registraGol(
    giocatore: PlayerPerformance,
    teamVantaggio: 'A' | 'B',
    isAutogoal: boolean,
    assistMan: PlayerPerformance | null = null
  ) {
    const { portiereSubitoNome } = await this.state.aggiungiGolPartita(
      giocatore,
      teamVantaggio,
      isAutogoal,
      assistMan
    );
    this.soundSettings.playGoalSound(isAutogoal);


    const portiereTag = portiereSubitoNome
      ? ` · 🧤 in porta: ${portiereSubitoNome}`
      : '';
    let feedbackMsg = '';
    if (isAutogoal) {
      feedbackMsg = `⚠️ Autogol di ${giocatore.nome}!${portiereTag}`;
    } else if (assistMan) {
      feedbackMsg = `⚽ Gol di ${giocatore.nome} (👟 Assist di ${assistMan.nome})${portiereTag}`;
    } else {
      feedbackMsg = `⚽ Gol di ${giocatore.nome} (⚡ Azione Personale)${portiereTag}`;
    }
    await this.mostraToastFeedback(feedbackMsg);
  }

  async rimuoviUltimoGol(team: 'A' | 'B') {
    this.triggerHaptic(30);
    const rimosso = await this.state.annullaUltimoGolSquadra(team);
    if (!rimosso) return;

    const undoMsg = rimosso.assistNome
      ? `Rimosso gol di ${rimosso.nome} (👟 assist di ${rimosso.assistNome})`
      : `Rimosso gol di ${rimosso.nome}`;
    await this.mostraToastFeedback(undoMsg, 'warning');
  }

  private async mostraToastFeedback(
    message: string,
    color: 'success' | 'warning' | 'danger' = 'success'
  ) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2400,
      position: 'bottom',
      color,
      mode: 'ios',
    });
    await toast.present();
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
          handler: async () => {
            if (this.state.isTimerRunning()) {
              await this.toggleTimer();
            }
            this.soundSettings.playMatchWhistle('final');
            this.state.matchConcluso.set(true);
            this.state.status.set('conclusa');
            await this.state.salvaInDatabase(false, true);
            this.state.step.set('prestazioni');
          },
        },
      ],
    });
    await alert.present();
  }
}
