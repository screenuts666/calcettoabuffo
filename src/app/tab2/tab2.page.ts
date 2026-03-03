import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
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
} from 'ionicons/icons';
import { MatchModalComponent } from './match-modal/match-modal.component';

@Component({
  selector: 'app-tab2',
  templateUrl: 'tab2.page.html',
  styleUrls: ['tab2.page.scss'],
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
    IonItem,
    IonItemSliding,
    IonItemOptions,
    IonItemOption,
  ],
})
export class Tab2Page {
  private firestore = inject(Firestore);
  private modalCtrl = inject(ModalController);
  private alertController = inject(AlertController);

  partite = toSignal<any[], any[]>(
    collectionData(
      query(collection(this.firestore, 'partite'), orderBy('dataOra', 'desc')),
      { idField: 'id' },
    ) as Observable<any[]>,
    { initialValue: [] },
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
    });
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

  /**
   * Mostra l'alert di conferma prima di procedere con la pulizia del DB.
   */
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
