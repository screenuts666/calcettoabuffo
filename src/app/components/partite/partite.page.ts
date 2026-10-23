import {
  Component,
  inject,
  ChangeDetectionStrategy,
  computed,
  signal,
  effect,
} from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonIcon,
  IonFab,
  IonFabButton,
  ModalController,
  AlertController,
  ToastController,
  IonButton,
  IonList,
  IonItem,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  IonListHeader,
  IonLabel,
  IonSpinner,
  IonButtons,
} from '@ionic/angular/standalone';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  query,
  orderBy,
  deleteDoc,
} from '@angular/fire/firestore';
import { Storage, ref, deleteObject } from '@angular/fire/storage';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { addIcons } from 'ionicons';
import {
  add,
  calendarOutline,
  checkmarkDoneCircle,
  starHalf,
  playCircle,
  timeOutline,
  locationOutline,
  peopleOutline,
  footballOutline,
  calendarClearOutline,
  trash,
  close,
  arrowBack,
  radioOutline,
  image,
  imageOutline,
  expandOutline,
  sparkles,
  globeOutline,
  logoWhatsapp,
  shareSocialOutline,
  chatboxEllipsesOutline,
  chevronDown,
  chevronUp,
} from 'ionicons/icons';
import { FotoViewerModalComponent } from './foto-viewer-modal/foto-viewer-modal.component';
import { MatchShareModalComponent } from './match-share-modal/match-share-modal.component';
import { TacticalPitchComponent } from './tactical-pitch/tactical-pitch.component';
import { AuthService } from 'src/app/services/auth.service';
import {
  CURRENT_SEASON,
  PREVIOUS_SEASON,
  ALL_SEASONS,
  STAGIONI,
  getStagionePartita,
  getStagioniDisponibili,
  formatShortSeason,
} from 'src/app/utils/season-utils';

@Component({
  selector: 'app-partite',
  templateUrl: 'partite.page.html',
  styleUrls: ['partite.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonIcon,
    IonFab,
    IonFabButton,
    IonList,
    IonListHeader,
    IonLabel,
    IonItem,
    IonItemSliding,
    IonItemOptions,
    IonItemOption,
    IonSpinner,
    IonButtons,
    ThemeToggleComponent,
    TacticalPitchComponent,
  ],
})
export class PartitePage {
  private firestore = inject(Firestore);
  private storage = inject(Storage);
  private modalCtrl = inject(ModalController);
  private alertController = inject(AlertController);
  private toastController = inject(ToastController);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private location = inject(Location);

  highlightMatchId = signal<string | null>(null);
  openedPitches = signal<Record<string, boolean>>({});

  togglePiantina(matchId?: string) {
    if (!matchId) return;
    this.openedPitches.update((prev) => ({
      ...prev,
      [matchId]: !prev[matchId],
    }));
  }

  isPiantinaAperta(matchId?: string): boolean {
    if (!matchId) return false;
    return !!this.openedPitches()[matchId];
  }

  getFormazioneLabel(m: any): string {
    const lenA = Array.isArray(m?.teamA) ? m.teamA.length : 0;
    const lenB = Array.isArray(m?.teamB) ? m.teamB.length : 0;
    if (lenA > 0 && lenB > 0) {
      return `${lenA} vs ${lenB}`;
    }
    const tot =
      lenA || lenB || (Array.isArray(m?.convocati) ? m.convocati.length : 0);
    if (tot >= 2) {
      const half = Math.ceil(tot / 2);
      return `${half} vs ${tot - half}`;
    }
    return 'Schieramento';
  }

  partite = toSignal<any[]>(
    collectionData(
      query(collection(this.firestore, 'partite'), orderBy('dataOra', 'desc')),
      { idField: 'id' },
    ).pipe(
      map((list: any[]) => {
        // priority: 0 = LIVE (matchConcluso === false)
        // 1 = DA VOTARE (matchConcluso === true && pagelleInserite === false)
        // 2 = ARCHIVIATA (pagelleInserite === true)
        const priority = (m: any) =>
          m.matchConcluso ? (m.pagelleInserite ? 2 : 1) : 0;

        return [...list].sort((a: any, b: any) => {
          const pa = priority(a);
          const pb = priority(b);
          if (pa !== pb) return pa - pb;

          const at = a.dataOra?.seconds ?? 0;
          const bt = b.dataOra?.seconds ?? 0;
          return bt - at;
        });
      }),
    ),
  );

  readonly CURRENT_SEASON = CURRENT_SEASON;
  readonly PREVIOUS_SEASON = PREVIOUS_SEASON;
  readonly ALL_SEASONS = ALL_SEASONS;
  getStagionePartita = getStagionePartita;

  stagioneSelezionata = signal<string>(CURRENT_SEASON);

  stagioniList = computed(() => {
    return getStagioniDisponibili(this.partite());
  });

  partiteFiltrate = computed(() => {
    const list = this.partite() || [];
    const s = this.stagioneSelezionata();
    if (s === ALL_SEASONS) return list;
    return list.filter((m) => getStagionePartita(m) === s);
  });

  conteggioStagioni = computed<Record<string, number>>(() => {
    const list = this.partite() || [];
    const counts: Record<string, number> = {
      [this.ALL_SEASONS]: list.length,
      [this.CURRENT_SEASON]: 0,
      [this.PREVIOUS_SEASON]: 0,
    };
    for (const m of list) {
      const s = getStagionePartita(m);
      counts[s] = (counts[s] || 0) + 1;
    }
    return counts;
  });

  partiteInCorso = computed(() => {
    const list = this.partiteFiltrate();
    if (!list) return [];
    return [...list.filter((m: any) => m.status === 'in_corso')].sort(
      (a: any, b: any) => (b.dataOra?.seconds ?? 0) - (a.dataOra?.seconds ?? 0),
    );
  });

  partitePronte = computed(() => {
    const list = this.partiteFiltrate();
    if (!list) return [];
    return [
      ...list.filter((m: any) => m.status === 'pronta' || !m.status),
    ].sort(
      (a: any, b: any) => (b.dataOra?.seconds ?? 0) - (a.dataOra?.seconds ?? 0),
    );
  });

  partiteDaVotare = computed(() => {
    const list = this.partiteFiltrate();
    if (!list) return [];
    return [
      ...list.filter((m: any) => m.status === 'conclusa' && !m.pagelleInserite),
    ].sort(
      (a: any, b: any) => (b.dataOra?.seconds ?? 0) - (a.dataOra?.seconds ?? 0),
    );
  });

  partiteArchiviate = computed(() => {
    const list = this.partiteFiltrate();
    if (!list) return [];
    return [
      ...list.filter((m: any) => m.status === 'conclusa' && m.pagelleInserite),
    ].sort(
      (a: any, b: any) => (b.dataOra?.seconds ?? 0) - (a.dataOra?.seconds ?? 0),
    );
  });

  giocatori = toSignal<any[], any[]>(
    collectionData(
      query(collection(this.firestore, 'giocatori'), orderBy('nome')),
      { idField: 'id' },
    ) as Observable<any[]>,
    { initialValue: [] },
  );

  constructor() {
    addIcons({
      add,
      calendarOutline,
      checkmarkDoneCircle,
      starHalf,
      playCircle,
      timeOutline,
      locationOutline,
      peopleOutline,
      footballOutline,
      calendarClearOutline,
      trash,
      close,
      arrowBack,
      radioOutline,
      image,
      imageOutline,
      expandOutline,
      sparkles,
      globeOutline,
      logoWhatsapp,
      shareSocialOutline,
      chatboxEllipsesOutline,
      chevronDown,
      chevronUp,
    });
  }

  async apriCondivisione(partita: any) {
    const modal = await this.modalCtrl.create({
      component: MatchShareModalComponent,
      componentProps: { partita },
      breakpoints: [0, 0.95, 1],
      initialBreakpoint: 0.95,
      handle: true,
    });
    await modal.present();
  }

  async mostraToastPartitaNonTrovata() {
    const toast = await this.toastController.create({
      message: 'Partita non trovata',
      duration: 3000,
      position: 'bottom',
      color: 'warning',
      mode: 'ios',
      buttons: [{ text: 'OK', role: 'cancel' }],
    });
    await toast.present();
  }

  stagioneBadgeClass(m: any): string {
    return getStagionePartita(m) === this.CURRENT_SEASON
      ? 'badge-season-current'
      : 'badge-season-old';
  }

  stagioneBadgeLabel(m: any): string {
    const s = getStagionePartita(m);
    const short = formatShortSeason(s);
    return s === this.CURRENT_SEASON ? `⚡ ${short}` : `🏛️ ${short}`;
  }

  stagioneCardClass(m: any): string {
    return getStagionePartita(m) === this.CURRENT_SEASON
      ? 'card-season-current'
      : 'card-season-old';
  }

  selezionaStagione(s: string) {
    this.stagioneSelezionata.set(s);
  }

  badgeClass(m: any): string {
    switch (m.status) {
      case 'in_corso':
        return 'badge-danger blink';
      case 'conclusa':
        return m.pagelleInserite ? 'badge-success' : 'badge-warning';
      case 'pronta':
      default:
        return 'badge-primary';
    }
  }

  badgeIcon(m: any): string {
    switch (m.status) {
      case 'in_corso':
        return 'radio-outline';
      case 'conclusa':
        return m.pagelleInserite ? 'checkmark-done-circle' : 'star-half';
      case 'pronta':
      default:
        return 'play-circle';
    }
  }

  badgeLabel(m: any): string {
    switch (m.status) {
      case 'in_corso':
        return 'LIVE';
      case 'conclusa':
        return m.pagelleInserite ? 'ARCHIVIATA' : 'DA VOTARE';
      case 'pronta':
      default:
        return "Fischio d'inizio";
    }
  }

  async apriPartita(partita?: any) {
    if (!partita && this.stagioneSelezionata() === this.PREVIOUS_SEASON) {
      const alert = await this.alertController.create({
        header: 'Stagione Conclusa',
        message: `Non è possibile aggiungere nuove partite alla stagione ${this.PREVIOUS_SEASON}. Le nuove partite possono essere create esclusivamente per la stagione corrente (${this.CURRENT_SEASON}).`,
        buttons: ['OK'],
      });
      await alert.present();
      return;
    }

    if (partita?.id) {
      await this.router.navigate(['/partite', partita.id]);
    } else {
      await this.router.navigate(['/partite', 'nuova']);
    }
  }

  async confermaEliminazione(match: any, slidingItem: IonItemSliding) {
    const alert = await this.alertController.create({
      header: 'Elimina Partita',
      message: `Sei sicuro di voler eliminare definitivamente il match a ${match.luogo}?`,
      buttons: [
        {
          text: 'Annulla',
          role: 'cancel',
          handler: () => slidingItem.close(),
        },
        {
          text: 'Elimina',
          role: 'destructive',
          handler: async () => {
            if (match.fotoPath) {
              try {
                const storageRef = ref(this.storage, match.fotoPath);
                await deleteObject(storageRef);
              } catch (e) {
                console.warn('Errore eliminazione foto da storage:', e);
              }
            }
            await deleteDoc(doc(this.firestore, `partite/${match.id}`));
            slidingItem.close();
          },
        },
      ],
    });
    await alert.present();
  }

  async apriFotoViewer(m: any) {
    if (!m?.fotoUrl) return;

    const modal = await this.modalCtrl.create({
      component: FotoViewerModalComponent,
      componentProps: {
        fotoUrl: m.fotoUrl,
        luogo: m.luogo,
        dataPartita: m.dataPartita,
        risultato:
          m.status === 'conclusa'
            ? `Bianchi ${m.scoreA} - ${m.scoreB} Neri`
            : undefined,
      },
    });

    await modal.present();
  }

  get isAdmin(): boolean {
    return this.auth.isAdmin();
  }
}
