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
  ActionSheetController,
  ToastController,
  IonSpinner,
} from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { environment } from 'src/environments/environment';
import { Firestore } from '@angular/fire/firestore';
import { Subscription } from 'rxjs';
import { addIcons } from 'ionicons';
import {
  arrowBack,
      arrowBackOutline,
      listOutline,
      closeOutline,
  close,
  arrowForward,
  checkmark,
} from 'ionicons/icons';

import { AuthService } from '../../../services/auth.service';
import { MatchStateService } from './match-state.service';
import { MIN_CURRENT_SEASON_DATE } from '../../../utils/season-utils';
import { ModalitaPortiere } from 'src/app/models/partita.model';
import { StepConvocatiComponent } from './steps/step-convocati/step-convocati.component';
import { StepDettagliComponent } from './steps/step-dettagli/step-dettagli.component';
import { StepSquadreComponent } from './steps/step-squadre/step-squadre.component';
import { StepMatchComponent } from './steps/step-match/step-match.component';
import { StepPrestazioniComponent } from './steps/step-prestazioni/step-prestazioni.component';
import { SyncStatusBadgeComponent } from '../../sync-status-badge/sync-status-badge.component';
import { ThemeToggleComponent } from '../../theme-toggle/theme-toggle.component';

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
    IonSpinner,
    StepConvocatiComponent,
    StepDettagliComponent,
    StepSquadreComponent,
    StepMatchComponent,
    StepPrestazioniComponent,
    SyncStatusBadgeComponent,
    ThemeToggleComponent,
  ],
  providers: [MatchStateService],
})
export class PartitaDetailPage implements OnInit, OnDestroy {
  public state = inject(MatchStateService);
  private alertCtrl = inject(AlertController);
  private actionSheetCtrl = inject(ActionSheetController);
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
    addIcons({
      arrowBack,
      close,
      arrowForward,
      checkmark,
    });
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
    this.state.soundSettings?.stopAllSounds();
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

      let luogoPredefinito = '';
      let orarioPredefinito = '21:00';
      let modalitaAPredefinita: ModalitaPortiere = 'rotazione';
      let modalitaBPredefinita: ModalitaPortiere = 'rotazione';
      let durataTurnoMinutiPredefinita = this.state.soundSettings?.config().gkTurnMinutes || 5;

      // 1. Prova prima dal setup ricordato e salvato in localStorage
      try {
        if (typeof localStorage !== 'undefined') {
          const rawSetup = localStorage.getItem('calcetto_last_match_setup');
          if (rawSetup) {
            const parsed = JSON.parse(rawSetup);
            if (parsed.luogo) luogoPredefinito = parsed.luogo;
            if (parsed.orario) orarioPredefinito = parsed.orario;
            if (parsed.modalitaA) modalitaAPredefinita = parsed.modalitaA;
            if (parsed.modalitaB) modalitaBPredefinita = parsed.modalitaB;
            if (parsed.durataTurnoMinuti) durataTurnoMinutiPredefinita = parsed.durataTurnoMinuti;
          }
        }
      } catch {}

      // 2. Se mancanti o su nuovo device, recupera dall'ultima partita memorizzata su Firestore
      try {
        const lastMatchSnap = await getDocs(
          query(
            collection(this.firestore, 'partite'),
            orderBy('dataOra', 'desc'),
            limit(5)
          )
        );
        for (const docSnap of lastMatchSnap.docs) {
          const d = docSnap.data();
          if (d) {
            if (!luogoPredefinito && d['luogo'] && typeof d['luogo'] === 'string' && d['luogo'].trim() !== '') {
              luogoPredefinito = d['luogo'].trim();
            }
            if ((!orarioPredefinito || orarioPredefinito === '21:00') && d['orario'] && typeof d['orario'] === 'string') {
              orarioPredefinito = d['orario'];
            }
            if (d['rotazionePortieri']) {
              if (d['rotazionePortieri'].modalitaA) modalitaAPredefinita = d['rotazionePortieri'].modalitaA;
              if (d['rotazionePortieri'].modalitaB) modalitaBPredefinita = d['rotazionePortieri'].modalitaB;
              if (d['rotazionePortieri'].durataTurnoMinuti) durataTurnoMinutiPredefinita = d['rotazionePortieri'].durataTurnoMinuti;
            }
            if (luogoPredefinito) break;
          }
        }
      } catch (e) {
        console.warn('Impossibile recuperare ultimo setup partita da Firestore:', e);
      }

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
        luogo: luogoPredefinito,
        orario: orarioPredefinito,
        rotazionePortieri: {
          modalitaA: modalitaAPredefinita,
          modalitaB: modalitaBPredefinita,
          teamA: [],
          teamB: [],
          durataTurnoMinuti: durataTurnoMinutiPredefinita,
        },
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
      this.state.notePortieri.set(matchData.notePortieri || null);
      this.state.parateIncredibili.set(matchData.parateIncredibili || {});

      this.state.scoreA.set(matchData.scoreA || 0);
      this.state.scoreB.set(matchData.scoreB || 0);
      this.state.eventiGol.set(matchData.eventiGol || []);

      this.state.cronometro.set(matchData.cronometro || 0);
      this.state.accumulatedTime.set(matchData.accumulatedTime || 0);
      this.state.timerStartAt.set(matchData.timerStartAt || null);
      this.state.isTimerRunning.set(matchData.isTimerRunning || false);
      this.state.cambioAttivo.set(
        matchData.isTimerRunning ? (matchData.cambioAttivo || false) : false
      );

      const idsSalvati = (matchData.convocati || []).map((c: any) => c.id);
      this.state.tutti.set(
        baseGiocatori.map((g: any) => ({
          ...g,
          selezionato: idsSalvati.includes(g.id),
        })),
      );
      const eventi = matchData.eventiGol || [];
      const normalizePlayer = (p: any) => {
        const liveG = baseGiocatori.find((bg: any) => bg.id === p.id);
        return {
          ...p,
          nome: liveG?.nome || p.nome,
          fotoUrl: liveG?.fotoUrl || p.fotoUrl || null,
          soprannome: liveG?.soprannome || p.soprannome,
          ruoloPreferito: liveG?.ruoloPreferito || p.ruoloPreferito,
          piedePreferito: liveG?.piedePreferito || p.piedePreferito,
          gol: p.gol || 0,
          autogol: p.autogol || 0,
          assist:
            p.assist !== undefined
              ? p.assist
              : eventi.filter((eg: any) => eg.assistId === p.id || (!eg.assistId && eg.assistNome === p.nome)).length,
        };
      };

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
      this.state.luogo.set(matchData.luogo || '');
      this.state.dataPartita.set(this.getProssimoMercoledi());
      this.state.orario.set(matchData.orario || '21:00');
      this.state.fotoUrl.set(null);
      this.state.fotoPath.set(null);
      this.state.commentoPartita.set('');
      this.state.rotazionePortieri.set(matchData.rotazionePortieri || null);
      this.state.resetMatchState();
      this.state.step.set('convocati');
    }

    // Ripristina snapshot locale di sicurezza se presente e più recente / offline
    this.state.ripristinaSnapshotLocaleSeRecente(matchData.id || null);
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

  /**
   * Torna alla pagina /partite senza chiudere o concludere la partita.
   * Il match resta attivo, salvato in locale e nel DB, e riapribile dall'elenco "In Corso".
   */
  /**
   * Gestisce il tap sulla freccia indietro: chiede all'utente se tornare alla lista partite
   * oppure andare allo step precedente del match.
   */
  async gestisciIndietro() {
    const currentStep = this.state.step();

    // Se siamo nel primo step ('convocati') o la partita è già conclusa in 'prestazioni', torna direttamente
    if (currentStep === 'convocati' || (this.state.matchConcluso() && currentStep === 'prestazioni')) {
      this.tornaAPartite();
      return;
    }

    let prevStepName = '';
    let prevStepTarget: 'convocati' | 'dettagli' | 'squadre' | 'match' | null = null;

    switch (currentStep) {
      case 'dettagli':
        prevStepName = 'Convocati';
        prevStepTarget = 'convocati';
        break;
      case 'squadre':
        prevStepName = 'Dettagli';
        prevStepTarget = 'dettagli';
        break;
      case 'match':
        prevStepName = 'Formazioni & Squadre';
        prevStepTarget = 'squadre';
        break;
      case 'prestazioni':
        prevStepName = 'Tabellone Match';
        prevStepTarget = 'match';
        break;
    }

    const isMatchInProgress = currentStep === 'match' && !this.state.matchConcluso();

    const actionSheet = await this.actionSheetCtrl.create({
      header: 'Dove vuoi tornare?',
      subHeader: isMatchInProgress
        ? 'La partita in corso rimane attiva e riapribile'
        : undefined,
      buttons: [
        {
          text: isMatchInProgress
            ? 'Torna alla Lista Partite (Match salvato)'
            : 'Torna alla Lista Partite',
          icon: 'list-outline',
          handler: () => {
            this.tornaAPartite();
          },
        },
        ...(prevStepTarget
          ? [
              {
                text: isMatchInProgress
                  ? `Step precedente (Resetta Match e torna a ${prevStepName})`
                  : `Step precedente (${prevStepName})`,
                icon: 'arrow-back-outline',
                role: isMatchInProgress ? ('destructive' as const) : undefined,
                handler: () => {
                  if (isMatchInProgress) {
                    this.confermaTornaASquadre();
                  } else {
                    this.state.salvaSnapshotLocale();
                    this.state.step.set(prevStepTarget!);
                  }
                },
              },
            ]
          : []),
        {
          text: 'Resta qui (Annulla)',
          icon: 'close-outline',
          role: 'cancel',
        },
      ],
    });

    await actionSheet.present();
  }

  tornaAPartite() {
    this.state.salvaSnapshotLocale();
    this.router.navigate(['/partite']);
  }

  async confermaTornaASquadre() {
    const alert = await this.alertCtrl.create({
      header: 'Attenzione: Reset Match',
      subHeader: 'Sei sicuro di voler tornare a Formazioni & Squadre?',
      message:
        'Tornando indietro il punteggio, il cronometro e la rotazione portieri verranno azzerati. I dati correnti del match andranno persi.',
      buttons: [
        {
          text: 'Annulla (Resta nel Match)',
          role: 'cancel',
        },
        {
          text: 'Sì, resetta e torna indietro',
          role: 'destructive',
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
