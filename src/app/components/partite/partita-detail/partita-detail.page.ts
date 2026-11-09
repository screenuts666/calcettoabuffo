import {
  Component,
  Input,
  OnDestroy,
  OnInit,
  inject,
  signal,
  computed,
  effect,
} from '@angular/core';
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
  ModalController,
  IonSpinner,
} from '@ionic/angular/standalone';
import { CommonModule, Location } from '@angular/common';
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
  logoWhatsapp,
  shareSocialOutline,
} from 'ionicons/icons';

import { AuthService } from '../../../services/auth.service';
import { MatchStateService } from './match-state.service';
import { MIN_CURRENT_SEASON_DATE } from '../../../utils/season-utils';
import { ModalitaPortiere, Partita } from 'src/app/models/partita.model';
import { MatchShareModalComponent } from '../match-share-modal/match-share-modal.component';
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
  private modalCtrl = inject(ModalController);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private location = inject(Location);
  private firestore = inject(Firestore);
  public auth = inject(AuthService);

  @Input() matchData: any;
  isLoading = signal<boolean>(false);
  isInviteLink = signal<boolean>(false);
  private routeSub?: Subscription;
  private querySub?: Subscription;

  get isAdmin(): boolean {
    return this.auth.isAdmin();
  }

  constructor() {
    addIcons({
      arrowBack,
      arrowBackOutline,
      listOutline,
      closeOutline,
      close,
      arrowForward,
      checkmark,
      logoWhatsapp,
      shareSocialOutline,
    });

    // Flusso Deep-Link & Auth Redirect:
    // Se l'utente apre un link di invito (?invite=true) e non è loggato,
    // salva il returnUrl e reindirizzalo al Login/Sign-Up.
    effect(() => {
      const authReady = this.auth.authInitialized();
      const invite = this.isInviteLink();
      const loggedIn = this.auth.isLoggedIn();
      const mId = this.state.matchId() || this.route.snapshot.paramMap.get('id');

      if (authReady && invite && !loggedIn && mId && mId !== 'nuova') {
        const returnUrl = `/partite/${mId}?invite=true`;
        this.auth.setReturnUrl(returnUrl);
        this.router.navigate(['/login'], { queryParams: { returnUrl } });
      }
    });
  }

  async ngOnInit() {
    this.state.onMatchCreated = (newId: string) => {
      this.location.replaceState('/partite/' + newId);
    };

    this.querySub = this.route.queryParamMap.subscribe((qp) => {
      const inv = qp.get('invite');
      const isInv = inv === 'true' || inv === '1';
      this.isInviteLink.set(isInv);
      if (isInv && !this.state.matchConcluso() && this.state.status() !== 'in_corso') {
        this.state.step.set('convocati');
      }
    });

    if (this.matchData) {
      this.initMatchData(this.matchData);
      return;
    }

    this.routeSub = this.route.paramMap.subscribe(async (params) => {
      const rawId = params.get('id');
      const routeId = rawId ? rawId.replace(/[^a-zA-Z0-9_-]/g, '').trim() : '';
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
    if (this.querySub) {
      this.querySub.unsubscribe();
    }
    if (this.isAdmin) {
      this.state.flushAutoSave();
    }
    this.state.fermaAscolto();
    this.state.soundSettings?.stopAllSounds();
  }

  private async initNuovaPartita() {
    this.isLoading.set(true);
    try {
      const snap = await getDocs(
        query(collection(this.firestore, 'giocatori'), orderBy('nome'))
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
      let durataTurnoMinutiPredefinita =
        this.state.soundSettings?.config().gkTurnMinutes || 5;

      try {
        if (typeof localStorage !== 'undefined') {
          const rawSetup = localStorage.getItem('calcetto_last_match_setup');
          if (rawSetup) {
            const parsed = JSON.parse(rawSetup);
            if (parsed.luogo) luogoPredefinito = parsed.luogo;
            if (parsed.orario) orarioPredefinito = parsed.orario;
            if (parsed.modalitaA) modalitaAPredefinita = parsed.modalitaA;
            if (parsed.modalitaB) modalitaBPredefinita = parsed.modalitaB;
            if (parsed.durataTurnoMinuti)
              durataTurnoMinutiPredefinita = parsed.durataTurnoMinuti;
          }
        }
      } catch {}

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
            if (
              !luogoPredefinito &&
              d['luogo'] &&
              typeof d['luogo'] === 'string' &&
              d['luogo'].trim() !== ''
            ) {
              luogoPredefinito = d['luogo'].trim();
            }
            if (
              (!orarioPredefinito || orarioPredefinito === '21:00') &&
              d['orario'] &&
              typeof d['orario'] === 'string'
            ) {
              orarioPredefinito = d['orario'];
            }
            if (d['rotazionePortieri']) {
              if (d['rotazionePortieri'].modalitaA)
                modalitaAPredefinita = d['rotazionePortieri'].modalitaA;
              if (d['rotazionePortieri'].modalitaB)
                modalitaBPredefinita = d['rotazionePortieri'].modalitaB;
              if (d['rotazionePortieri'].durataTurnoMinuti)
                durataTurnoMinutiPredefinita =
                  d['rotazionePortieri'].durataTurnoMinuti;
            }
            if (luogoPredefinito) break;
          }
        }
      } catch (e) {
        console.warn(
          'Impossibile recuperare ultimo setup partita da Firestore:',
          e
        );
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
        rsvp: {},
        status: 'da_definire',
        step: 'dettagli',
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
        getDocs(
          query(collection(this.firestore, 'giocatori'), orderBy('nome'))
        ),
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
    this.state.rsvp.set(matchData.rsvp || {});

    const baseGiocatori = (matchData.tuttiGiocatori || []).map((g: any) => ({
      ...g,
      selezionato: false,
    }));

    if (matchData.id) {
      this.state.luogo.set(matchData.luogo || '');
      this.state.dataPartita.set(matchData.dataPartita || '');
      this.state.orario.set(matchData.orario || '');
      this.state.fotoUrl.set(matchData.fotoUrl || null);
      this.state.fotoPath.set(matchData.fotoPath || null);
      this.state.pronosticoAi.set(matchData.pronosticoAi || null);
      this.state.cronacaAi.set(matchData.cronacaAi || null);
      this.state.commentoPartita.set(
        matchData.commentoPartita || matchData.commento || ''
      );
      this.state.notePortieri.set(matchData.notePortieri || null);
      this.state.parateIncredibili.set(matchData.parateIncredibili || {});

      this.state.scoreA.set(matchData.scoreA || 0);
      this.state.scoreB.set(matchData.scoreB || 0);
      this.state.eventiGol.set(matchData.eventiGol || []);

      this.state.cronometro.set(matchData.cronometro || 0);
      this.state.accumulatedTime.set(matchData.accumulatedTime || 0);
      this.state.timerStartAt.set(matchData.timerStartAt || null);
      const startMs = matchData.startedAt
        ?? (matchData.inizioPartita?.toMillis ? matchData.inizioPartita.toMillis() : matchData.inizioPartita?.seconds ? matchData.inizioPartita.seconds * 1000 : null)
        ?? matchData.timerStartAt
        ?? null;
      const endMs = matchData.endedAt
        ?? (matchData.finePartita?.toMillis ? matchData.finePartita.toMillis() : matchData.finePartita?.seconds ? matchData.finePartita.seconds * 1000 : null)
        ?? matchData.finishedAt
        ?? null;

      this.state.startedAt.set(startMs);
      this.state.endedAt.set(endMs);
      const orarioInizioStr = matchData.orarioInizioReale || (startMs ? new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' }).format(new Date(startMs)) : null);
      const orarioFineStr = matchData.orarioFineReale || (endMs ? new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' }).format(new Date(endMs)) : null);
      this.state.orarioInizioReale.set(orarioInizioStr);
      this.state.orarioFineReale.set(orarioFineStr);
      this.state.isTimerRunning.set(matchData.isTimerRunning || false);
      const turnSec = (matchData.rotazionePortieri?.durataTurnoMinuti || 5) * 60;
      const isPastFirstTurn = (matchData.cronometro || 0) >= turnSec;
      this.state.cambioAttivo.set(
        matchData.isTimerRunning && isPastFirstTurn
          ? matchData.cambioAttivo || false
          : false
      );

      this.state.tutti.set(baseGiocatori);
      this.state.reconcileConvocatiWithRsvp(
        matchData.convocati || [],
        matchData.rsvp || {}
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
              : eventi.filter(
                  (eg: any) =>
                    eg.assistId === p.id ||
                    (!eg.assistId && eg.assistNome === p.nome)
                ).length,
        };
      };

      this.state.teamA.set((matchData.teamA || []).map(normalizePlayer));
      this.state.teamB.set((matchData.teamB || []).map(normalizePlayer));
      this.state.rotazionePortieri.set(matchData.rotazionePortieri || null);

      const isConvocatiPhase =
        !matchData.matchConcluso &&
        matchData.status !== 'in_corso' &&
        (matchData.step === 'convocati' ||
          matchData.step === 'dettagli' ||
          (!matchData.step &&
            (!matchData.teamA || matchData.teamA.length === 0) &&
            (!matchData.teamB || matchData.teamB.length === 0)));

      // Se l'utente non è il Mister:
      // - Se la partita è nello step 'convocati' o 'dettagli' o se entra da link invito, mostra lo step 'convocati' (con Auto-RSVP attivo)
      // - Se è conclusa, mostra il Report ('prestazioni')
      // - Altrimenti mostra il tabellone ('match') con convocazioni chiuse
      if (!this.isAdmin) {
        if (matchData.matchConcluso) {
          this.state.step.set('prestazioni');
        } else if (isConvocatiPhase || this.isInviteLink()) {
          this.state.step.set('convocati');
        } else {
          this.state.step.set('match');
        }
      } else if (this.isInviteLink() && !matchData.matchConcluso && matchData.status !== 'in_corso') {
        this.state.step.set('convocati');
      } else if (matchData.matchConcluso) {
        this.state.step.set('prestazioni');
      } else if (matchData.status === 'in_corso') {
        this.state.step.set('match');
      } else if (matchData.step) {
        this.state.step.set(matchData.step);
      } else {
        if (!this.state.isDettagliValidi()) {
          this.state.step.set('dettagli');
        } else if (
          matchData.status === 'pronta' &&
          this.state.teamA().length > 0 &&
          this.state.teamB().length > 0
        ) {
          this.state.step.set('match');
        } else if (this.state.totaleConvocati() < 2) {
          this.state.step.set('convocati');
        } else {
          this.state.step.set('squadre');
        }
      }

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
      this.state.step.set('dettagli');
    }

    if (this.isAdmin) {
      this.state.ripristinaSnapshotLocaleSeRecente(matchData.id || null);
    }
  }

  getProssimoMercoledi(): string {
    const d = new Date();
    d.setDate(
      d.getDate() + (d.getDay() <= 3 ? 3 - d.getDay() : 10 - d.getDay())
    );
    const iso = d.toISOString().split('T')[0];
    return iso < MIN_CURRENT_SEASON_DATE ? MIN_CURRENT_SEASON_DATE : iso;
  }

  chiudi() {
    this.router.navigate(['/partite']);
  }

  async apriCondivisionePartita() {
    if (!this.state.matchId() && this.isAdmin) {
      await this.state.ensureMatchCreatedForInvite();
    }
    const partitaSnapshot: Partita = {
      id: this.state.matchId() || undefined,
      luogo: this.state.luogo(),
      dataPartita: this.state.dataPartita(),
      orario: this.state.orario(),
      status: this.state.status(),
      step: this.state.step(),
      matchConcluso: this.state.matchConcluso(),
      pagelleInserite: this.state.pagelleInserite(),
      scoreA: this.state.scoreA(),
      scoreB: this.state.scoreB(),
      teamA: this.state.teamA(),
      teamB: this.state.teamB(),
      convocati: this.state.convocati(),
      rsvp: this.state.rsvp(),
      eventiGol: this.state.eventiGol(),
      fotoUrl: this.state.fotoUrl(),
      fotoPath: this.state.fotoPath(),
      commentoPartita: this.state.commentoPartita(),
      pronosticoAi: this.state.pronosticoAi(),
      cronacaAi: this.state.cronacaAi(),
    };

    const modal = await this.modalCtrl.create({
      component: MatchShareModalComponent,
      componentProps: { partita: partitaSnapshot },
      mode: 'ios',
    });
    await modal.present();
  }

  cambiaStep(
    step: 'dettagli' | 'convocati' | 'squadre' | 'match' | 'prestazioni'
  ) {
    if (!this.isAdmin) return;
    this.state.cambiaStep(step);
  }

  tornaIndietroDestinazione() {
    if (this.isAdmin) {
      this.state.flushAutoSave();
      this.state.salvaSnapshotLocale();
    }
    const returnUrl =
      this.route.snapshot.queryParamMap.get('returnUrl') ||
      (history.state && history.state.returnUrl);
    if (returnUrl) {
      this.router.navigateByUrl(returnUrl);
    } else if (window.history.length > 1) {
      this.location.back();
    } else {
      this.router.navigate(['/partite']);
    }
  }

  async gestisciIndietro() {
    if (!this.isAdmin) {
      this.tornaIndietroDestinazione();
      return;
    }

    const currentStep = this.state.step();

    // Se siamo al primo step di configurazione o su match concluso a prestazioni, usciamo tornando all'origine
    if (
      currentStep === 'dettagli' ||
      (this.state.matchConcluso() && currentStep === 'prestazioni')
    ) {
      this.tornaIndietroDestinazione();
      return;
    }

    // Step intermedi: scala allo step precedente senza uscire dal flusso
    if (currentStep === 'convocati') {
      this.state.cambiaStep('dettagli');
      return;
    }

    if (currentStep === 'squadre') {
      this.state.cambiaStep('convocati');
      return;
    }

    if (currentStep === 'prestazioni' && !this.state.matchConcluso()) {
      this.state.cambiaStep('match');
      return;
    }

    if (currentStep === 'match') {
      const isMatchInProgress =
        !this.state.matchConcluso() &&
        (this.state.isTimerRunning() ||
          this.state.cronometro() > 0 ||
          this.state.eventiGol().length > 0);

      if (isMatchInProgress) {
        const actionSheet = await this.actionSheetCtrl.create({
          header: 'Partita in corso',
          subHeader: 'Il match rimane attivo e salvato in tempo reale',
          buttons: [
            {
              text: 'Esci dal Match (Salva e Torna indietro)',
              icon: 'arrow-back-outline',
              handler: () => {
                this.tornaIndietroDestinazione();
              },
            },
            {
              text: 'Resetta Match e torna a Formazioni & Squadre',
              icon: 'refresh-outline',
              role: 'destructive',
              handler: () => {
                this.confermaTornaASquadre();
              },
            },
            {
              text: 'Resta nel Match',
              icon: 'close-outline',
              role: 'cancel',
            },
          ],
        });
        await actionSheet.present();
      } else {
        this.state.cambiaStep('squadre');
      }
      return;
    }

    this.tornaIndietroDestinazione();
  }

  tornaAPartite() {
    this.tornaIndietroDestinazione();
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
            this.state.status.set('da_definire');
            this.state.cambiaStep('squadre');
          },
        },
      ],
    });

    await alert.present();
  }
}
