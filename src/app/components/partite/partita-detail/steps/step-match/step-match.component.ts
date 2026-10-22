import { Component, inject, OnInit, OnDestroy, Input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonButton,
  IonIcon,
  IonListHeader,
  IonLabel,
  IonAvatar,
  ActionSheetController,
  AlertController,
  ToastController,
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
  football, // Aggiunta per i badge gol
  trashOutline, // Aggiunta per il tasto rimuovi
  musicalNotes,
  volumeMute,
  diceOutline,
  listOutline,
  chevronUpOutline,
  shieldOutline,
} from 'ionicons/icons';
import { doc, updateDoc } from '@angular/fire/firestore';
import { MatchStateService } from '../../match-state.service';
import { EventoGol } from '../../../../../models/partita.model';
import { PlayerAvatarComponent } from '../../../../player-avatar/player-avatar.component';

@Component({
  selector: 'app-step-match',
  templateUrl: './step-match.component.html',
  styleUrls: ['./step-match.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonButton,
    IonIcon,
    IonListHeader,
    IonLabel,
    IonAvatar,
    PlayerAvatarComponent,
  ],
})
export class StepMatchComponent implements OnInit, OnDestroy {
  public state = inject(MatchStateService);
  private actionSheetCtrl = inject(ActionSheetController);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);

  @Input() isAdmin: boolean = false;

  private timerRef: any;
  private wakeLock: any = null;
  private audio: HTMLAudioElement | null = null;

  // Traccia l'ultimo minuto "multiplo di 5" già triggerato per evitare doppioni
  private ultimoCambioMinuto: number = -1;

  isSequenzaAperta = signal<boolean>(false);

  toggleSequenza() {
    this.isSequenzaAperta.update((v) => !v);
  }

  async rimescolaPortieri(team?: 'A' | 'B') {
    if (team === 'A') {
      this.state.rimescolaSquadra('A');
      await this.mostraToastFeedback('🎲 Rotazione Bianchi rimescolata');
    } else if (team === 'B') {
      this.state.rimescolaSquadra('B');
      await this.mostraToastFeedback('🎲 Rotazione Neri rimescolata');
    } else {
      this.state.inizializzaRotazionePortieri(true);
      await this.mostraToastFeedback('🎲 Rotazione rimescolata per entrambe le squadre');
    }
    await this.state.salvaInDatabase(false);
  }

  async scambiaOrdine(team: 'A' | 'B', idx1: number, idx2: number) {
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
      const isDiRuolo = ((p as any)?.ruoloPreferito as string)?.toLowerCase() === 'portiere';
      const isCurrent = p.id === currFixedId;
      return {
        text: `${isCurrent ? '🧤 ' : ''}${p.nome}${isDiRuolo ? ' (👑 Di Ruolo)' : ''}`,
        role: isCurrent ? 'selected' : undefined,
        handler: async () => {
          this.state.impostaPortiereFisso(team, p.id);
          await this.state.salvaInDatabase(false);
          await this.mostraToastFeedback(`🧤 Portiere fisso ${teamNome} impostato su ${p.nome}`);
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

  constructor() {
    // Registriamo TUTTE le icone necessarie
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
      diceOutline,
      listOutline,
      chevronUpOutline,
      shieldOutline,
    });
  }

  ngOnInit() {
    if (this.isAdmin && !this.state.rotazionePortieri()) {
      this.state.inizializzaRotazionePortieri(false);
    }
    // ─── WAKE LOCK SEMPRE ATTIVO ───────────────────────────────────────
    this.attivaWakeLock();
    if ('wakeLock' in navigator) {
      document.addEventListener('visibilitychange', this.riattivaWakeLock);
    }

    // ─── AUDIO PRE-LOAD E SBLOCCO USER GESTURE ─────────────────────────
    this.audio = new Audio('/assets/sound/CAMBIO.wav');
    this.audio.loop = true;
    this.audio.load();
    document.addEventListener('click', this.sbloccaAudioUserGesture, { once: true });

    // ─── TIMER PRINCIPALE ──────────────────────────────────────────────
    this.timerRef = setInterval(() => {
      if (this.state.isTimerRunning()) {
        const start = this.state.timerStartAt() || Date.now();
        const diffSec = Math.floor((Date.now() - start) / 1000);
        const newCronometro = this.state.accumulatedTime() + diffSec;
        this.state.cronometro.set(newCronometro);

        // ─── LOGICA SUONO CAMBIO (ogni 5 minuti esatti, solo se c'è almeno una rotazione) ───────────────
        const hasRotatingTeam =
          this.state.modalitaPortieriA() === 'rotazione' ||
          this.state.modalitaPortieriB() === 'rotazione';

        if (this.isAdmin && hasRotatingTeam) {
          const minutiGiocati = Math.floor(newCronometro / 60);
          const isMultiploDiCinque = minutiGiocati > 0 && minutiGiocati % 5 === 0;

          if (isMultiploDiCinque && minutiGiocati !== this.ultimoCambioMinuto) {
            this.ultimoCambioMinuto = minutiGiocati;
            this.attivaAlertCambio();
          }
        }
      } else {
        this.state.cronometro.set(this.state.accumulatedTime());
      }

      // ─── GESTIONE AUDIO CAMBIO (reattivo allo stato Firestore) ──────
      if (this.isAdmin) {
        const cambioAttivo = this.state.cambioAttivo();
        if (cambioAttivo && (!this.audio || this.audio.paused)) {
          this.avviaAudio();
        } else if (!cambioAttivo && this.audio && !this.audio.paused) {
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

  // ──────────────────────────────────────────────────────────────────────
  // WAKE LOCK
  // ──────────────────────────────────────────────────────────────────────

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
  // SUONO CAMBIO
  // ──────────────────────────────────────────────────────────────────────

  private async attivaAlertCambio() {
    if (!this.state.matchId()) return;
    await updateDoc(
      doc(this.state.firestore, `partite/${this.state.matchId()}`),
      { cambioAttivo: true }
    );
  }

  async fermaCambio() {
    if (!this.state.matchId()) return;
    await updateDoc(
      doc(this.state.firestore, `partite/${this.state.matchId()}`),
      { cambioAttivo: false }
    );
    this.fermaAudio();
  }

  private sbloccaAudioUserGesture = () => {
    if (this.audio) {
      this.audio.play()
        .then(() => {
          this.audio!.pause();
          this.audio!.currentTime = 0;
          console.log('Audio sbloccato con successo tramite interazione utente');
        })
        .catch((e) => console.warn('Impossibile sbloccare audio:', e));
    }
  };

  private avviaAudio() {
    if (!this.audio) {
      this.audio = new Audio('/assets/sound/CAMBIO.wav');
      this.audio.loop = true;
    }
    this.audio.currentTime = 0;
    this.audio.play().catch((err) => console.warn('Audio non riprodotto:', err));
  }

  private fermaAudio() {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // TIMER PARTITA
  // ──────────────────────────────────────────────────────────────────────

  async toggleTimer() {
    if (!this.state.matchId()) return;

    if (this.state.isTimerRunning()) {
      const start = this.state.timerStartAt() || Date.now();
      const diffSec = Math.floor((Date.now() - start) / 1000);
      const nuovoAccumulo = this.state.accumulatedTime() + diffSec;

      this.state.isTimerRunning.set(false);
      this.state.accumulatedTime.set(nuovoAccumulo);
      this.state.timerStartAt.set(null);
      this.state.cronometro.set(nuovoAccumulo);

      await updateDoc(
        doc(this.state.firestore, `partite/${this.state.matchId()}`),
        {
          isTimerRunning: false,
          accumulatedTime: nuovoAccumulo,
          timerStartAt: null,
          cronometro: nuovoAccumulo,
        },
      );
    } else {
      const payload: any = {
        isTimerRunning: true,
        timerStartAt: Date.now(),
      };
      const currentStatus = this.state.status();
      if (currentStatus !== 'in_corso' && currentStatus !== 'conclusa') {
        payload.status = 'in_corso';
      }
      await updateDoc(
        doc(this.state.firestore, `partite/${this.state.matchId()}`),
        payload,
      );
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // GOL & ASSIST (FLUSSO IMMEDIATO ZERO ATTRITO)
  // ──────────────────────────────────────────────────────────────────────

  async chiediChiHaSegnato(teamVantaggio: 'A' | 'B') {
    const teamCheSegna =
      teamVantaggio === 'A' ? this.state.teamA() : this.state.teamB();
    const teamAvversario =
      teamVantaggio === 'A' ? this.state.teamB() : this.state.teamA();

    const buttons = [
      ...teamCheSegna.map((g) => ({
        text: `⚽ ${g.nome}`,
        handler: () => {
          // Passaggio immediato allo Step 2 (Chi ha fatto l'assist)
          setTimeout(() => this.chiediChiHaFattoAssist(g, teamVantaggio), 120);
        },
      })),
      ...teamAvversario.map((g) => ({
        text: `⚠️ ${g.nome} (Autogol)`,
        role: 'destructive',
        handler: () => this.registraGol(g, teamVantaggio, true, null),
      })),
      { text: 'Annulla', role: 'cancel' },
    ];

    const as = await this.actionSheetCtrl.create({
      header: `⚽ Gol ${teamVantaggio === 'A' ? 'BIANCHI' : 'NERI'}! Chi ha segnato?`,
      subHeader: 'Seleziona il marcatore',
      buttons,
    });
    await as.present();
  }

  async chiediChiHaFattoAssist(marcatore: any, teamVantaggio: 'A' | 'B') {
    const teamCheSegna =
      teamVantaggio === 'A' ? this.state.teamA() : this.state.teamB();

    // Solo compagni della stessa squadra escluso il marcatore
    const compagni = teamCheSegna.filter((c: any) => c.id !== marcatore.id);

    const buttons = [
      // Bottone grande in cima: Azione Personale / Nessun assist
      {
        text: '⚡ Nessuno / Azione Personale',
        role: 'selected',
        handler: () => this.registraGol(marcatore, teamVantaggio, false, null),
      },
      ...compagni.map((c: any) => ({
        text: `👟 Assist di ${c.nome}`,
        handler: () => this.registraGol(marcatore, teamVantaggio, false, c),
      })),
      { text: 'Annulla (Non registrare)', role: 'cancel' },
    ];

    const as = await this.actionSheetCtrl.create({
      header: "👟 Chi ha fatto l'assist?",
      subHeader: `Gol di ${marcatore.nome} (${teamVantaggio === 'A' ? 'Bianchi' : 'Neri'})`,
      buttons,
    });
    await as.present();
  }

  async registraGol(
    giocatore: any,
    teamVantaggio: 'A' | 'B',
    isAutogoal: boolean,
    assistMan: any | null = null,
  ) {
    const defendingTeam = teamVantaggio === 'A' ? 'B' : 'A';
    const portiereInfo =
      defendingTeam === 'A'
        ? this.state.portieriInfoA()
        : this.state.portieriInfoB();
    const portiereSubito = portiereInfo?.attuale;

    const nuovoEvento: EventoGol = {
      idAssegnato: giocatore.id,
      nome: giocatore.nome,
      teamVantaggio,
      isAutogoal,
      tempo: this.state.formatTimer(),
      assistId: assistMan ? assistMan.id : null,
      assistNome: assistMan ? assistMan.nome : null,
      portiereSubitoId: portiereSubito?.id || null,
      portiereSubitoNome: portiereSubito?.nome || null,
    };

    this.state.eventiGol.update((list) => [...list, nuovoEvento]);

    teamVantaggio === 'A'
      ? this.state.scoreA.update((s) => s + 1)
      : this.state.scoreB.update((s) => s + 1);

    // 1. Aggiorna gol / autogol marcatore
    const updateScorer = (lista: any[]) =>
      lista.map((g) =>
        g.id === giocatore.id
          ? {
              ...g,
              gol: (g.gol || 0) + (isAutogoal ? 0 : 1),
              autogol: (g.autogol || 0) + (isAutogoal ? 1 : 0),
            }
          : g,
      );

    this.state.tutti.update(updateScorer);

    if (teamVantaggio === 'A' && !isAutogoal) {
      this.state.teamA.update(updateScorer);
    } else if (teamVantaggio === 'B' && !isAutogoal) {
      this.state.teamB.update(updateScorer);
    } else if (isAutogoal) {
      // Se è autogol, il gol va cercato nel team opposto a chi ha "vantaggio"
      teamVantaggio === 'A'
        ? this.state.teamB.update(updateScorer)
        : this.state.teamA.update(updateScorer);
    }

    // 2. Se presente assist-man, aggiorna assist count
    if (assistMan && !isAutogoal) {
      const updateAssist = (lista: any[]) =>
        lista.map((g) =>
          g.id === assistMan.id
            ? {
                ...g,
                assist: (g.assist || 0) + 1,
              }
            : g,
        );

      this.state.tutti.update(updateAssist);
      if (teamVantaggio === 'A') {
        this.state.teamA.update(updateAssist);
      } else {
        this.state.teamB.update(updateAssist);
      }
    }

    await this.state.salvaInDatabase(false);

    // Feedback rapido Toast
    const portiereTag = portiereSubito?.nome ? ` · 🧤 in porta: ${portiereSubito.nome}` : '';
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
    const list = this.state.eventiGol();
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].teamVantaggio === team) {
        const rimosso = list[i];
        this.state.eventiGol.update((l) => l.filter((_, index) => index !== i));

        team === 'A'
          ? this.state.scoreA.update((s) => Math.max(0, s - 1))
          : this.state.scoreB.update((s) => Math.max(0, s - 1));

        const removeGol = (lista: any[]) =>
          lista.map((g) =>
            g.id === rimosso.idAssegnato
              ? {
                  ...g,
                  gol: Math.max(0, (g.gol || 0) - (rimosso.isAutogoal ? 0 : 1)),
                  autogol: Math.max(
                    0,
                    (g.autogol || 0) - (rimosso.isAutogoal ? 1 : 0),
                  ),
                }
              : g,
          );

        this.state.tutti.update(removeGol);

        // Aggiorniamo il team corretto per la rimozione gol
        this.state.teamA().find((p) => p.id === rimosso.idAssegnato)
          ? this.state.teamA.update(removeGol)
          : this.state.teamB.update(removeGol);

        // Rimozione dell'assist associato se presente
        if (rimosso.assistId) {
          const removeAssist = (lista: any[]) =>
            lista.map((g) =>
              g.id === rimosso.assistId
                ? {
                    ...g,
                    assist: Math.max(0, (g.assist || 0) - 1),
                  }
                : g,
            );

          this.state.tutti.update(removeAssist);
          this.state.teamA().find((p) => p.id === rimosso.assistId)
            ? this.state.teamA.update(removeAssist)
            : this.state.teamB.update(removeAssist);
        }

        await this.state.salvaInDatabase(false);

        const undoMsg = rimosso.assistNome
          ? `Rimosso gol di ${rimosso.nome} (👟 assist di ${rimosso.assistNome})`
          : `Rimosso gol di ${rimosso.nome}`;
        await this.mostraToastFeedback(undoMsg, 'warning');
        break;
      }
    }
  }

  private async mostraToastFeedback(
    message: string,
    color: 'success' | 'warning' | 'danger' = 'success',
  ) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2500,
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
