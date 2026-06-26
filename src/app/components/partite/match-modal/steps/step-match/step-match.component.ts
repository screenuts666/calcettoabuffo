import { Component, inject, OnInit, OnDestroy, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonButton,
  IonIcon,
  IonListHeader,
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
  football, // Aggiunta per i badge gol
  trashOutline, // Aggiunta per il tasto rimuovi
  musicalNotes,
  volumeMute,
} from 'ionicons/icons';
import { doc, updateDoc } from '@angular/fire/firestore';
import { MatchStateService } from '../../match-state.service';

@Component({
  selector: 'app-step-match',
  templateUrl: './step-match.component.html',
  styleUrls: ['./step-match.component.scss'],
  standalone: true,
  imports: [CommonModule, IonButton, IonIcon, IonListHeader, IonLabel],
})
export class StepMatchComponent implements OnInit, OnDestroy {
  public state = inject(MatchStateService);
  private actionSheetCtrl = inject(ActionSheetController);
  private alertCtrl = inject(AlertController);

  @Input() isAdmin: boolean = false;

  private timerRef: any;
  private wakeLock: any = null;
  private audio: HTMLAudioElement | null = null;

  // Traccia l'ultimo minuto "multiplo di 5" già triggerato per evitare doppioni
  private ultimoCambioMinuto: number = -1;

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
    });
  }

  ngOnInit() {
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

        // ─── LOGICA SUONO CAMBIO ───────────────────────────────────────
        if (this.isAdmin) {
          // --- LOGICA ORIGINALE (OGNI 5 MINUTI) COMMENTATA PER TEST: ---
          // const minutiGiocati = Math.floor(newCronometro / 60);
          // const isMultiploDiCinque = minutiGiocati > 0 && minutiGiocati % 5 === 0;
          // if (isMultiploDiCinque && minutiGiocati !== this.ultimoCambioMinuto) {
          //   this.ultimoCambioMinuto = minutiGiocati;
          //   this.attivaAlertCambio();
          // }

          // --- LOGICA TEST (OGNI 10 SECONDI): ---
          const isTestCambio = newCronometro > 0 && newCronometro % 10 === 0;
          if (isTestCambio && newCronometro !== this.ultimoCambioMinuto) {
            this.ultimoCambioMinuto = newCronometro;
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

      await updateDoc(
        doc(this.state.firestore, `partite/${this.state.matchId()}`),
        {
          isTimerRunning: false,
          accumulatedTime: nuovoAccumulo,
          timerStartAt: null,
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
  // GOL
  // ──────────────────────────────────────────────────────────────────────

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

    const updateGol = (lista: any[]) =>
      lista.map((g) =>
        g.id === giocatore.id
          ? { ...g, gol: (g.gol || 0) + (isAutogoal ? 0 : 1) }
          : g,
      );

    this.state.tutti.update(updateGol);

    if (teamVantaggio === 'A' && !isAutogoal) {
      this.state.teamA.update(updateGol);
    } else if (teamVantaggio === 'B' && !isAutogoal) {
      this.state.teamB.update(updateGol);
    } else if (isAutogoal) {
      // Se è autogol, il gol va cercato nel team opposto a chi ha "vantaggio"
      teamVantaggio === 'A'
        ? this.state.teamB.update(updateGol)
        : this.state.teamA.update(updateGol);
    }

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

        const removeGol = (lista: any[]) =>
          lista.map((g) =>
            g.id === rimosso.idAssegnato
              ? {
                  ...g,
                  gol: Math.max(0, (g.gol || 0) - (rimosso.isAutogoal ? 0 : 1)),
                }
              : g,
          );

        this.state.tutti.update(removeGol);

        // Aggiorniamo il team corretto per la rimozione
        this.state.teamA().find((p) => p.id === rimosso.idAssegnato)
          ? this.state.teamA.update(removeGol)
          : this.state.teamB.update(removeGol);

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
            this.state.status.set('conclusa');
            this.state.salvaInDatabase(false, true);
            this.state.step.set('prestazioni');
          },
        },
      ],
    });
    await alert.present();
  }
}
