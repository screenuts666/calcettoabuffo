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
import { deriveMatchState, MatchState } from 'src/app/models/match-state.enum';

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

  partiteLive = computed(() =>
    [...this.partite().filter((m: any) => !m.matchConcluso)].sort(
      (a: any, b: any) => (b.dataOra?.seconds ?? 0) - (a.dataOra?.seconds ?? 0),
    ),
  );

  partiteDaVotare = computed(() =>
    [
      ...this.partite().filter(
        (m: any) => m.matchConcluso && !m.pagelleInserite,
      ),
    ].sort(
      (a: any, b: any) => (b.dataOra?.seconds ?? 0) - (a.dataOra?.seconds ?? 0),
    ),
  );

  partiteArchiviate = computed(() =>
    [...this.partite().filter((m: any) => m.pagelleInserite)].sort(
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

  public MatchState = MatchState;

  getMatchState(m: any): MatchState {
    return deriveMatchState(m);
  }

  badgeClass(m: any) {
    const st = this.getMatchState(m);
    switch (st) {
      case MatchState.ARCHIVED:
        return 'badge-success';
      case MatchState.TO_VOTE:
        return 'badge-warning';
      case MatchState.LIVE:
      default:
        return 'badge-danger blink';
    }
  }

  badgeIcon(m: any) {
    const st = this.getMatchState(m);
    switch (st) {
      case MatchState.ARCHIVED:
        return 'checkmark-done-circle';
      case MatchState.TO_VOTE:
        return 'star-half';
      case MatchState.LIVE:
      default:
        return 'radio-outline';
    }
  }

  badgeLabel(m: any) {
    const st = this.getMatchState(m);
    switch (st) {
      case MatchState.ARCHIVED:
        return 'ARCHIVIATA';
      case MatchState.TO_VOTE:
        return 'DA VOTARE';
      case MatchState.LIVE:
      default:
        return 'LIVE';
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
        };

    data.tuttiGiocatori = tutti.map((g: any) => ({
      ...g,
      selezionato: false,
      voto: 6,
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
}
