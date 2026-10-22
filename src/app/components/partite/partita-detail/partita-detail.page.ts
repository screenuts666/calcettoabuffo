import { Component, Input, OnDestroy, OnInit, inject, signal } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonIcon,
  IonFab,
  IonFabButton,
  AlertController,
  ToastController,
  IonBackButton,
  IonSpinner,
} from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
} from '@angular/fire/firestore';
import { Subscription } from 'rxjs';
import { addIcons } from 'ionicons';
import { arrowBack, close, arrowForward, checkmark } from 'ionicons/icons';

import { AuthService } from '../../../services/auth.service';
import { MatchStateService } from './match-state.service';
import { MIN_CURRENT_SEASON_DATE } from '../../../utils/season-utils';
import { StepConvocatiComponent } from './steps/step-convocati/step-convocati.component';
import { StepDettagliComponent } from './steps/step-dettagli/step-dettagli.component';
import { StepSquadreComponent } from './steps/step-squadre/step-squadre.component';
import { StepMatchComponent } from './steps/step-match/step-match.component';
import { StepPrestazioniComponent } from './steps/step-prestazioni/step-prestazioni.component';

@Component({
  selector: 'app-partita-detail',
  templateUrl: './partita-detail.page.html',
  styleUrls: ['./partita-detail.page.scss'],
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
    IonBackButton,
    IonSpinner,
    StepConvocatiComponent,
    StepDettagliComponent,
    StepSquadreComponent,
    StepMatchComponent,
    StepPrestazioniComponent,
  ],
  providers: [MatchStateService],
})
export class PartitaDetailPage implements OnInit, OnDestroy {
  public state = inject(MatchStateService);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private firestore = inject(Firestore);
  private auth = inject(AuthService);

  @Input() matchData: any;
  isAdmin: boolean = false;
  isLoading = signal<boolean>(false);
  private routeSub?: Subscription;

  constructor() {
    addIcons({ arrowBack, close, arrowForward, checkmark });
  }

  async ngOnInit() {
    this.isAdmin = this.auth.isAdmin();

    // 1. Se aperto via modale con dati già pronti
    if (this.matchData) {
      this.initMatchData(this.matchData);
      return;
    }

    // 2. Se aperto via Routing (/partite/nuova o /partite/:id)
    this.routeSub = this.route.paramMap.subscribe(async (params) => {
      const routeId = params.get('id');
      if (!routeId || routeId === 'nuova') {
        await this.initNuovaPartita();
      } else {
        await this.caricaPartitaDaFirestore(routeId);
      }
    });
  }

  ngOnDestroy() {
    if (this.routeSub) {
      this.routeSub.unsubscribe();
    }
    this.state.fermaAscolto();
  }

  private async initNuovaPartita() {
    this.isLoading.set(true);
    try {
      const snap = await getDocs(
        query(collection(this.firestore, 'giocatori'), orderBy('nome')),
      );
      const baseGiocatori = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        selezionato: false,
      }));

      const nuovaData: any = {
        id: null,
        isAdmin: this.isAdmin,
        tuttiGiocatori: baseGiocatori,
        scoreA: 0,
        scoreB: 0,
        teamA: [],
        teamB: [],
        convocati: [],
        status: 'pronta',
      };

      this.initMatchData(nuovaData);
    } catch (err) {
      console.error('Errore inizializzazione nuova partita:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  private async caricaPartitaDaFirestore(matchId: string) {
    this.isLoading.set(true);
    try {
      const [matchSnap, giocatoriSnap] = await Promise.all([
        getDoc(doc(this.firestore, `partite/${matchId}`)),
        getDocs(query(collection(this.firestore, 'giocatori'), orderBy('nome'))),
      ]);

      if (!matchSnap.exists()) {
        const toast = await this.toastCtrl.create({
          message: 'Partita non trovata.',
          duration: 3000,
          color: 'warning',
          position: 'bottom',
        });
        await toast.present();
        this.router.navigate(['/partite']);
        return;
      }

      const matchData = {
        id: matchSnap.id,
        ...matchSnap.data(),
        isAdmin: this.isAdmin,
        tuttiGiocatori: giocatoriSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })),
      };

      this.initMatchData(matchData);
    } catch (err) {
      console.error('Errore caricamento partita:', err);
      const toast = await this.toastCtrl.create({
        message: 'Errore durante il caricamento della partita.',
        duration: 3000,
        color: 'danger',
        position: 'bottom',
      });
      await toast.present();
      this.router.navigate(['/partite']);
    } finally {
      this.isLoading.set(false);
    }
  }

  private initMatchData(matchData: any) {
    this.matchData = matchData;
    this.state.matchDataOriginale = matchData;
    this.state.matchId.set(matchData.id || null);
    this.state.matchConcluso.set(matchData.matchConcluso || false);
    this.state.pagelleInserite.set(matchData.pagelleInserite || false);
    this.state.status.set(matchData.status || 'da_definire');
    this.isAdmin = matchData.isAdmin ?? this.auth.isAdmin();

    const baseGiocatori = (matchData.tuttiGiocatori || []).map(
      (g: any) => ({ ...g, selezionato: false }),
    );

    if (matchData.id) {
      this.state.luogo.set(matchData.luogo || '');
      this.state.dataPartita.set(matchData.dataPartita || '');
      this.state.orario.set(matchData.orario || '');
      this.state.fotoUrl.set(matchData.fotoUrl || null);
      this.state.fotoPath.set(matchData.fotoPath || null);
      this.state.pronosticoAi.set(matchData.pronosticoAi || null);
      this.state.cronacaAi.set(matchData.cronacaAi || null);
      this.state.commentoPartita.set(matchData.commentoPartita || matchData.commento || '');

      this.state.scoreA.set(matchData.scoreA || 0);
      this.state.scoreB.set(matchData.scoreB || 0);
      this.state.eventiGol.set(matchData.eventiGol || []);

      this.state.cronometro.set(matchData.cronometro || 0);
      this.state.accumulatedTime.set(matchData.accumulatedTime || 0);
      this.state.timerStartAt.set(matchData.timerStartAt || null);
      this.state.isTimerRunning.set(matchData.isTimerRunning || false);

      const idsSalvati = (matchData.convocati || []).map((c: any) => c.id);
      this.state.tutti.set(
        baseGiocatori.map((g: any) => ({
          ...g,
          selezionato: idsSalvati.includes(g.id),
        })),
      );
      const eventi = matchData.eventiGol || [];
      const normalizePlayer = (p: any) => ({
        ...p,
        gol: p.gol || 0,
        autogol: p.autogol || 0,
        assist:
          p.assist !== undefined
            ? p.assist
            : eventi.filter(
                (eg: any) =>
                  eg.assistId === p.id ||
                  (!eg.assistId && eg.assistNome && eg.assistNome === p.nome),
              ).length,
      });
      this.state.teamA.set((matchData.teamA || []).map(normalizePlayer));
      this.state.teamB.set((matchData.teamB || []).map(normalizePlayer));
      this.state.rotazionePortieri.set(matchData.rotazionePortieri || null);

      if (!this.state.isDettagliValidi()) this.state.step.set('dettagli');
      else if (
        this.state.teamA().length === 0 &&
        this.state.teamB().length === 0
      )
        this.state.step.set('squadre');
      else if (!matchData.matchConcluso) this.state.step.set('match');
      else this.state.step.set('prestazioni');

      this.state.avviaAscoltoReale();
    } else {
      this.state.tutti.set(baseGiocatori);
      this.state.dataPartita.set(this.getProssimoMercoledi());
      this.state.orario.set('21:00');
      this.state.fotoUrl.set(null);
      this.state.fotoPath.set(null);
      this.state.commentoPartita.set('');
      this.state.rotazionePortieri.set(null);
      this.state.resetMatchState();
      this.state.step.set('convocati');
    }
  }

  getProssimoMercoledi(): string {
    const d = new Date();
    d.setDate(
      d.getDate() + (d.getDay() <= 3 ? 3 - d.getDay() : 10 - d.getDay()),
    );
    const iso = d.toISOString().split('T')[0];
    return iso < MIN_CURRENT_SEASON_DATE ? MIN_CURRENT_SEASON_DATE : iso;
  }

  chiudi() {
    this.router.navigate(['/partite']);
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
