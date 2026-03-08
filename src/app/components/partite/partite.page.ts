import {
  Component,
  inject,
  ChangeDetectionStrategy,
  computed,
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
  IonList,
  IonItem,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  IonListHeader,
  IonLabel,
} from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  query,
  orderBy,
  deleteDoc,
} from '@angular/fire/firestore';
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
} from 'ionicons/icons';
import { MatchModalComponent } from './match-modal/match-modal.component';
import { AuthService } from 'src/app/services/auth.service';

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
  ],
})
export class PartitePage {
  private firestore = inject(Firestore);
  private modalCtrl = inject(ModalController);
  private alertController = inject(AlertController);
  private auth = inject(AuthService);

  partite = toSignal<any[], any[]>(
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
    ) as Observable<any[]>,
    { initialValue: [] },
  );

  partiteInCorso = computed(() =>
    [
      ...this.partite().filter((m: any) => m.status === 'in_corso'),
    ].sort(
      (a: any, b: any) => (b.dataOra?.seconds ?? 0) - (a.dataOra?.seconds ?? 0),
    ),
  );

  partitePronte = computed(() =>
    [
      ...this.partite().filter(
        (m: any) => m.status === 'pronta' || !m.status,
      ),
    ].sort(
      (a: any, b: any) => (b.dataOra?.seconds ?? 0) - (a.dataOra?.seconds ?? 0),
    ),
  );

  partiteDaVotare = computed(() =>
    [
      ...this.partite().filter(
        (m: any) => m.status === 'conclusa' && !m.pagelleInserite,
      ),
    ].sort(
      (a: any, b: any) => (b.dataOra?.seconds ?? 0) - (a.dataOra?.seconds ?? 0),
    ),
  );

  partiteArchiviate = computed(() =>
    [
      ...this.partite().filter(
        (m: any) => m.status === 'conclusa' && m.pagelleInserite,
      ),
    ].sort(
      (a: any, b: any) => (b.dataOra?.seconds ?? 0) - (a.dataOra?.seconds ?? 0),
    ),
  );

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
    });
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

  async apriModalePartita(partita?: any) {
    const tutti = this.giocatori() ?? [];
    const data = partita
      ? JSON.parse(JSON.stringify(partita))
      : {
          id: null,
          scoreA: 0,
          scoreB: 0,
          teamA: [],
          teamB: [],
          convocati: [],
          status: 'pronta',
        };

    data.isAdmin = this.isAdmin;

    data.tuttiGiocatori = tutti.map((g: any) => ({
      ...g,
      selezionato: false,
      voto: null,
      gol: 0,
      note: '',
    }));

    const modal = await this.modalCtrl.create({
      component: MatchModalComponent,
      componentProps: { matchData: data },
    });
    return await modal.present();
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
            await deleteDoc(doc(this.firestore, `partite/${match.id}`));
            slidingItem.close();
          },
        },
      ],
    });
    await alert.present();
  }

  get isAdmin(): boolean {
    return this.auth.isAdmin();
  }
}
