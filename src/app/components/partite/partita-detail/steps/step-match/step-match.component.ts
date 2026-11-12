import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  NgZone,
  inject,
  OnInit,
  OnDestroy,
  Input,
  signal,
  computed,
  isDevMode,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { environment } from 'src/environments/environment';
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
  time,
  timeOutline,
  play,
  pause,
  playSkipForwardOutline,
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
  flashOutline,
  closeOutline,
  arrowBackOutline,
  warningOutline,
  createOutline,
  arrowUndoOutline,
  handLeftOutline,
  footballOutline,
  footstepsOutline,
} from 'ionicons/icons';
import { MatchStateService } from '../../match-state.service';
import { PlayerPerformance } from '../../../../../models/player-performance.model';
import { PlayerAvatarComponent } from '../../../../player-avatar/player-avatar.component';
import { SoundSettingsService } from '../../../../../services/sound-settings.service';
import { AuthService } from '../../../../../services/auth.service';
import { ImpostazioniPage } from '../../../../impostazioni/impostazioni.page';

@Component({
  selector: 'app-step-match',
  templateUrl: './step-match.component.html',
  styleUrls: ['./step-match.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, IonButton, IonIcon, IonAvatar, PlayerAvatarComponent],
})
export class StepMatchComponent implements OnInit, OnDestroy {
  public state = inject(MatchStateService);
  public soundSettings = inject(SoundSettingsService);
  public auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);
  private actionSheetCtrl = inject(ActionSheetController);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private modalCtrl = inject(ModalController);

  private _isAdmin: boolean = false;
  @Input()
  set isAdmin(val: boolean) {
    this._isAdmin = val;
  }
  get isAdmin(): boolean {
    return this._isAdmin || this.auth.isSuperUser();
  }

  /**
   * Controllo Pausa / Stop / Fast-Forward visibile ESCLUSIVAMENTE in ambiente DEV (`!environment.production || isDevMode()`).
   */
  readonly isDevModeActive: boolean = !environment.production || isDevMode();

  private timerRef: ReturnType<typeof setInterval> | null = null;
  private wakeLock: any = null;

  // Traccia l'ultimo turno di cambio già triggerato per evitare doppioni
  private ultimoCambioTurno: number = -1;
  private ultimoPreAlertTurno: number = -1;

  isSequenzaAperta = signal<boolean>(false);

  /**
   * Etichetta con i nomi dei NUOVI portieri pronti a subentrare quando si clicca
   * su "🔊 FERMA SUONO E CAMBIA PORTIERI ([Nuovo Bianchi] / [Nuovo Neri])".
   */
  prossimiPortieriCambioLabel = computed<string>(() => {
    const nextA =
      this.state.modalitaPortieriA() === 'rotazione'
        ? this.state.portieriInfoA().prossimo?.nome ||
          this.state.portieriInfoA().attuale?.nome ||
          'Bianchi'
        : `${this.state.portieriInfoA().attuale?.nome || 'Bianchi'} (Fisso)`;
    const nextB =
      this.state.modalitaPortieriB() === 'rotazione'
        ? this.state.portieriInfoB().prossimo?.nome ||
          this.state.portieriInfoB().attuale?.nome ||
          'Neri'
        : `${this.state.portieriInfoB().attuale?.nome || 'Neri'} (Fisso)`;
    return `${nextA} / ${nextB}`;
  });

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
      volumeMute,
      createOutline,
      locationOutline,
      time,
      timeOutline,
      play,
      playSkipForwardOutline,
      football,
      footballOutline,
      arrowUndoOutline,
      volumeHigh,
      megaphoneOutline,
      diceOutline,
      stop,
      closeOutline,
      arrowBackOutline,
      pause,
      add,
      remove,
      trashOutline,
      musicalNotes,
      notificationsOutline,
      settingsOutline,
      listOutline,
      chevronUpOutline,
      chevronDownOutline,
      shieldOutline,
      flash,
      flashOutline,
      warningOutline,
      handLeftOutline,
      footstepsOutline,
    });
  }

  ngOnInit() {
    const currentTurn = this.state.turnoAttualeIndex();
    this.ultimoCambioTurno = this.state.cambioAttivo() ? currentTurn : -1;
    this.ultimoPreAlertTurno = -1;

    // Se la partita è a 00:00 e non è stata avviata, azzera categoricamente qualsiasi allarme residuo
    if (this.state.cronometro() === 0 && !this.state.isTimerRunning()) {
      this.state.setCambioPortiereAttivo(false);
      this.soundSettings.stopMatchCambioAlarm();
    }

    if (this.isAdmin && !this.state.rotazionePortieri()) {
      this.state.inizializzaRotazionePortieri(false);
    }

    // ─── WAKE LOCK & VISIBILITY CHANGE (RIPRESA ISTANTANEA DA LOCKSCREEN) ───
    this.attivaWakeLock();
    document.addEventListener('visibilitychange', this.gestisciVisibilityChange);

    // ─── AUDIO SBLOCCO USER GESTURE (solo su effettivo tocco dell'utente) ───
    document.addEventListener('click', this.sbloccaAudioUserGesture, {
      once: true,
    });

    // ─── TIMER PRINCIPALE BASATO SU TIMESTAMP REALI (Date.now()) ───────
    this.timerRef = setInterval(() => {
      this.ngZone.run(() => {
        this.eseguiTickTimer();
      });
    }, 1000);
  }

  ngOnDestroy() {
    if (this.timerRef) clearInterval(this.timerRef);
    document.removeEventListener('visibilitychange', this.gestisciVisibilityChange);
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
      await this.mostraToastFeedback('Rotazione Bianchi rimescolata');
    } else if (team === 'B') {
      this.state.rimescolaSquadra('B');
      await this.mostraToastFeedback('Rotazione Neri rimescolata');
    } else {
      this.state.inizializzaRotazionePortieri(true);
      await this.mostraToastFeedback(
        'Rotazione rimescolata per entrambe le squadre',
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
        text: `${p.nome}${isDiRuolo ? ' (Di Ruolo)' : ''}${isCurrent ? ' [In porta]' : ''}`,
        role: isCurrent ? 'selected' : undefined,
        handler: async () => {
          this.state.impostaPortiereFisso(team, p.id);
          await this.state.salvaInDatabase(false);
          await this.mostraToastFeedback(
            `Portiere fisso ${teamNome} impostato su ${p.nome}`,
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
      header: `Sostituisci Portiere Fisso (${teamNome})`,
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

  private gestisciVisibilityChange = async () => {
    if (document.visibilityState === 'visible') {
      await this.attivaWakeLock();
      this.eseguiTickTimer();
      this.cdr.markForCheck();
      this.cdr.detectChanges();
    }
  };

  private rilasciaWakeLock() {
    if (this.wakeLock) {
      this.wakeLock.release().catch(() => {});
      this.wakeLock = null;
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // SUONO CAMBIO PORTIERE & IMPOSTAZIONI
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Click su "🔊 FERMA SUONO E CAMBIA PORTIERI":
   * Ferma l'allarme in loop, applica lo switch effettivo ai nuovi portieri e fa ripartire il countdown del nuovo turno (es. 05:00).
   */
  async fermaCambio() {
    if (!this.isAdmin) return;
    this.triggerHaptic(40);
    this.fermaAudio();
    await this.state.confermaCambioPortiere();
    this.ultimoCambioTurno = -1;
    this.ultimoPreAlertTurno = -1;

    const newA = this.state.portieriInfoA().attuale?.nome;
    const newB = this.state.portieriInfoB().attuale?.nome;
    if (newA || newB) {
      await this.mostraToastFeedback(
        `Cambio confermato! In porta: ${newA || '—'} (Bianchi) / ${newB || '—'} (Neri)`,
        'success',
      );
    }
  }

  async suonaCambioManuale() {
    if (!this.isAdmin) return;
    this.triggerHaptic(35);
    if (this.state.cambioAttivo()) {
      await this.fermaCambio();
    } else {
      await this.state.setCambioPortiereAttivo(true);
      this.avviaAudio();
    }
  }

  async apriImpostazioniSuoni() {
    const modal = await this.modalCtrl.create({
      component: ImpostazioniPage,
      componentProps: { initialTab: 'audio' },
      mode: 'ios',
    });
    await modal.present();
  }

  private sbloccaAudioUserGesture = () => {
    this.soundSettings.unlockAudioOnUserGesture();
  };

  private buildCambioSpeechText(): string {
    const nextA =
      this.state.modalitaPortieriA() === 'rotazione'
        ? this.state.portieriInfoA().prossimo?.nome
        : this.state.portieriInfoA().attuale?.nome;
    const nextB =
      this.state.modalitaPortieriB() === 'rotazione'
        ? this.state.portieriInfoB().prossimo?.nome
        : this.state.portieriInfoB().attuale?.nome;
    if (nextA && nextB) {
      return `Attenzione! Cambio portiere! Prepararsi ${nextA} per i Bianchi e ${nextB} per i Neri!`;
    } else if (nextA) {
      return `Attenzione! Cambio portiere! Prepararsi ${nextA} per i Bianchi!`;
    } else if (nextB) {
      return `Attenzione! Cambio portiere! Prepararsi ${nextB} per i Neri!`;
    }
    return 'Attenzione! Cambio portiere!';
  }

  private inviaNotificaWebCambioPortiere() {
    try {
      if (
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted'
      ) {
        new Notification('🔊 CAMBIO PORTIERE!', {
          body: `Entrano in porta: ${this.prossimiPortieriCambioLabel()}. Apri l'app per fermare il suono e confermare il cambio.`,
          tag: 'calcetto-gk-change',
          requireInteraction: true,
        });
      }
    } catch {
      // Ignora su browser/dispositivi senza Web Notification API
    }
  }

  private avviaAudio() {
    this.soundSettings.startMatchCambioAlarm(this.buildCambioSpeechText());
  }

  private fermaAudio() {
    this.soundSettings.stopMatchCambioAlarm();
  }

  // ──────────────────────────────────────────────────────────────────────
  // TIMER PARTITA & CONTROLLI ESCLUSIVI MODALITÀ DEV
  // ──────────────────────────────────────────────────────────────────────

  async avviaMatch() {
    if (!this.isAdmin) return;
    this.triggerHaptic(40);
    if (this.state.isTimerRunning() && !this.state.isPausedDev()) return;

    // 1. Suono fischio immediato (sincrono su user gesture per non perdere audio context mobile)
    try {
      this.soundSettings.playMatchWhistle('kickoff');
    } catch (err) {
      console.warn('Audio kickoff non riprodotto:', err);
    }

    // 2. Se avviamo il cronometro dall'inizio (00:00), azzeriamo allarmi residui (senza attendere la rete)
    if (this.state.cronometro() === 0) {
      this.ultimoCambioTurno = -1;
      this.ultimoPreAlertTurno = -1;
      this.soundSettings.stopMatchCambioAlarm();
      this.state.setCambioPortiereAttivo(false);
    }

    // 3. Avvio immediato e sincrono del timer (imposta subito signals e snapshot locale)
    this.state.avviaTimer();

    // 4. Assicura che l'intervallo sia attivo ed esegue subito il tick
    if (!this.timerRef) {
      this.timerRef = setInterval(() => {
        this.ngZone.run(() => {
          this.eseguiTickTimer();
        });
      }, 1000);
    }
    this.eseguiTickTimer();

    // 5. Forza l'aggiornamento visivo immediato della UI OnPush
    this.cdr.markForCheck();
    this.cdr.detectChanges();

    // 6. Notifiche web in background (non bloccanti)
    try {
      if (
        typeof Notification !== 'undefined' &&
        Notification.permission === 'default'
      ) {
        Notification.requestPermission().catch(() => {});
      }
    } catch {
      // ignore
    }
  }

  /**
   * Calcolo del secondo del cronometro in tempo reale e gestione degli eventi periodici di cambio portiere
   */
  private eseguiTickTimer() {
    if (this.state.isTimerRunning() && !this.state.isPausedDev()) {
      const now = Date.now();
      const base =
        this.state.timerStartAt() || this.state.startedAt() || now;
      const elapsedSinceResume = Math.max(
        0,
        Math.floor((now - base) / 1000),
      );
      const newCronometro =
        this.state.timerStartAt() && this.state.accumulatedTime() > 0
          ? this.state.accumulatedTime() + elapsedSinceResume
          : elapsedSinceResume;
      this.state.cronometro.set(newCronometro);

      // Salvataggio periodico di sicurezza in locale ogni 5 secondi
      if (newCronometro % 5 === 0) {
        this.state.salvaSnapshotLocale();
      }

      // ─── MACCHINA A STATI CAMBIO PORTIERE ('running' -> 'alarm_ringing') ───
      const hasRotatingTeam =
        this.state.modalitaPortieriA() === 'rotazione' ||
        this.state.modalitaPortieriB() === 'rotazione';

      if (this.isAdmin && hasRotatingTeam) {
        const turnSec = this.state.durataTurnoSecondi();
        const turnIndex = this.state.turnoAttualeIndex();
        const secRim = this.state.secondiRimanentiAlCambio();

        if (!this.state.cambioAttivo()) {
          // Preavviso toast prima del cambio (-30s standard, -10s per turni brevi)
          const isPreAlertTime =
            (turnSec >= 60 && secRim === 30) ||
            (turnSec < 60 && secRim === 10);
          if (isPreAlertTime && this.ultimoPreAlertTurno !== turnIndex) {
            this.ultimoPreAlertTurno = turnIndex;
            this.mostraToastFeedback(
              `Tra ${secRim} secondi cambio portiere!`,
              'warning',
            );
          }

          // Quando il countdown del turno arriva a 00:00 -> stato 'alarm_ringing'
          // I portieri precedenti RIMANGONO in porta finché non si clicca su "FERMA SUONO E CAMBIA PORTIERI"
          if (
            newCronometro > 0 &&
            secRim === 0 &&
            this.ultimoCambioTurno !== turnIndex
          ) {
            this.ultimoCambioTurno = turnIndex;
            this.state.setCambioPortiereAttivo(true);
            this.inviaNotificaWebCambioPortiere();
          }
        }
      }
    } else {
      this.state.cronometro.set(this.state.accumulatedTime());
    }

    this.cdr.markForCheck();

    // ─── GESTIONE AUDIO IN LOOP CONTINUO FINO ALLO STOP MANUALE ──────
    if (this.isAdmin) {
      const shouldPlayAlarm =
        this.state.cambioAttivo() && !this.state.isPausedDev();
      if (shouldPlayAlarm && !this.soundSettings.isMatchAlarmPlaying()) {
        this.avviaAudio();
      } else if (
        !shouldPlayAlarm &&
        this.soundSettings.isMatchAlarmPlaying()
      ) {
        this.fermaAudio();
      }
    }
  }

  /**
   * ESCLUSIVO MODALITÀ DEV: Pausa / Riprendi timer in diretta per testare comodamente il match.
   */
  async togglePausaDev() {
    if (!this.auth.isDevToolsAllowed()) return;
    this.triggerHaptic(30);
    if (this.state.isPausedDev()) {
      await this.state.riprendiTimerDev();
      await this.mostraToastFeedback('▶ Timer DEV ripreso', 'success');
    } else if (this.state.isTimerRunning()) {
      this.fermaAudio();
      await this.state.pausaTimerDev();
      await this.mostraToastFeedback('⏸ Timer messo in Pausa DEV', 'warning');
    }
  }

  /**
   * ESCLUSIVO MODALITÀ DEV: Avanza rapidamente il countdown a -5s dal cambio portiere.
   */
  async avanzaCambioDev() {
    if (!this.auth.isDevToolsAllowed()) return;
    this.triggerHaptic(30);
    this.ultimoCambioTurno = -1;
    await this.state.avanzaAlProssimoCambioDev();
    await this.mostraToastFeedback(
      '⏩ Countdown portato a -5s dal cambio (DEV)',
      'warning',
    );
  }

  async toggleTimer() {
    await this.avviaMatch();
  }

  // ──────────────────────────────────────────────────────────────────────
  // SISTEMA GOL RAPIDO BORDO CAMPO (CON FOTO GRANDI & 1-TAP)
  // ──────────────────────────────────────────────────────────────────────

  async chiediChiHaSegnato(teamVantaggio: 'A' | 'B') {
    if (!this.isAdmin) return;
    if (this.state.cronometro() <= 0 && !this.state.isTimerRunning()) {
      await this.mostraToastFeedback(
        "Fischia prima l'inizio con FISCHIO D'INIZIO per sbloccare i gol!",
        'warning',
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

  /**
   * PITCH-MODE ULTRA RAPIDO: Toccare la card del giocatore assegna SUBITO +1 Gol!
   * Progettato specificamente per l'uso al volo su smartphone a bordo campo.
   */
  async toccaGiocatorePerGolRapido(
    player: PlayerPerformance,
    teamVantaggio: 'A' | 'B',
  ) {
    if (!this.isAdmin) return;
    if (this.state.cronometro() <= 0 && !this.state.isTimerRunning()) {
      await this.mostraToastFeedback(
        "Avvia prima la partita con FISCHIO D'INIZIO!",
        'warning',
      );
      return;
    }
    this.triggerHaptic(50);
    await this.registraGol(player, teamVantaggio, false, null);
  }

  /**
   * UNDO IMMEDIATO SOTTO IL TABELLONE: Annulla istantaneamente l'ultimo gol segnato
   * senza dover navigare sottomenu.
   */
  async annullaUltimoGolImmediato() {
    if (!this.isAdmin) return;
    this.triggerHaptic(40);
    const rimosso = await this.state.annullaUltimoGolGenerale();
    if (!rimosso) return;

    const undoMsg = rimosso.isAutogoal
      ? `Annullato autogol di ${rimosso.nome}`
      : `Annullato gol di ${rimosso.nome}`;
    await this.mostraToastFeedback(undoMsg, 'warning');
  }

  selezionaMarcatoreNelPicker(player: PlayerPerformance, isAutogoal = false) {
    if (!this.isAdmin) return;
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
    assistMan: PlayerPerformance | null = null,
  ) {
    if (!this.isAdmin) return;
    const { portiereSubitoNome } = await this.state.aggiungiGolPartita(
      giocatore,
      teamVantaggio,
      isAutogoal,
      assistMan,
    );
    this.soundSettings.playGoalSound(isAutogoal);

    const portiereTag = portiereSubitoNome
      ? ` · in porta: ${portiereSubitoNome}`
      : '';
    let feedbackMsg = '';
    if (isAutogoal) {
      feedbackMsg = `Autogol di ${giocatore.nome}!${portiereTag}`;
    } else if (assistMan) {
      feedbackMsg = `Gol di ${giocatore.nome} (Assist: ${assistMan.nome})${portiereTag}`;
    } else {
      feedbackMsg = `Gol di ${giocatore.nome}!${portiereTag}`;
    }
    await this.mostraToastFeedback(feedbackMsg);
  }

  async rimuoviUltimoGol(team: 'A' | 'B') {
    if (!this.isAdmin) return;
    this.triggerHaptic(30);
    const rimosso = await this.state.annullaUltimoGolSquadra(team);
    if (!rimosso) return;

    const undoMsg = rimosso.assistNome
      ? `Annullato gol di ${rimosso.nome} (assist di ${rimosso.assistNome})`
      : `Annullato gol di ${rimosso.nome}`;
    await this.mostraToastFeedback(undoMsg, 'warning');
  }

  private async mostraToastFeedback(
    message: string,
    color: 'success' | 'warning' | 'danger' = 'success',
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
    if (!this.isAdmin) return;
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
            await this.state.concludiTimer();
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
