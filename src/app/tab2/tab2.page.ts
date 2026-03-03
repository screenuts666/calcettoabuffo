import { Component, inject } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonList,
  IonItem,
  IonIcon,
  IonFab,
  IonFabButton,
  IonButtons,
  IonButton,
  IonBadge,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  ModalController,
  AlertController,
  LoadingController,
  IonLabel,
} from '@ionic/angular/standalone';
import { AsyncPipe, CommonModule } from '@angular/common';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  updateDoc,
  getDoc,
  query,
  orderBy,
  deleteDoc,
} from '@angular/fire/firestore';
import { Observable, firstValueFrom } from 'rxjs';
import { addIcons } from 'ionicons';
import {
  add,
  football,
  checkmarkDone,
  trash,
  timeOutline,
  locationOutline,
  people,
} from 'ionicons/icons';
import { MatchModalComponent } from './match-modal/match-modal.component';

@Component({
  selector: 'app-tab2',
  templateUrl: 'tab2.page.html',
  standalone: true,
  imports: [
    CommonModule,
    AsyncPipe,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonIcon,
    IonFab,
    IonFabButton,
    IonButtons,
    IonButton,
    IonBadge,
    IonItemSliding,
    IonItemOptions,
    IonItemOption,
    IonLabel,
  ],
})
export class Tab2Page {
  private firestore = inject(Firestore);
  private modalCtrl = inject(ModalController);
  private alertController = inject(AlertController);
  private loadingController = inject(LoadingController);

  partite$: Observable<any[]>;
  giocatori$: Observable<any[]>;

  constructor() {
    addIcons({
      add,
      football,
      checkmarkDone,
      trash,
      timeOutline,
      locationOutline,
      people,
    });
    this.partite$ = collectionData(
      query(collection(this.firestore, 'partite'), orderBy('dataOra', 'desc')),
      { idField: 'id' },
    );
    this.giocatori$ = collectionData(
      query(collection(this.firestore, 'giocatori'), orderBy('nome')),
      { idField: 'id' },
    );
  }

  async apriModale(partita?: any) {
    const tutti = await firstValueFrom(this.giocatori$);

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

  async aggiornaClassifica(partita: any) {
    if (partita.classificaAggiornata || !partita.pagelleInserite) return;
    const alert = await this.alertController.create({
      header: 'Confermi invio dati?',
      buttons: [
        { text: 'Annulla' },
        {
          text: 'Aggiorna',
          handler: async () => {
            const loading = await this.loadingController.create({
              message: 'Aggiornamento...',
            });
            await loading.present();
            const updatePlayer = async (
              team: any[],
              vinto: boolean,
              pareggio: boolean,
            ) => {
              for (let p of team) {
                const ref = doc(this.firestore, `giocatori/${p.id}`);
                const snap = await getDoc(ref);
                const d = snap.data();
                if (!d) continue;
                const nGiocate = (d['partiteGiocate'] || 0) + 1;
                const nuoviPunti =
                  (d['punti'] || 0) + (vinto ? 3 : pareggio ? 1 : 0);
                const nuoviGol = (d['gol'] || 0) + (Number(p.gol) || 0);
                const mediaPrecedente = d['mediaVoto'] || 0;
                const nuovaMedia =
                  (mediaPrecedente * (nGiocate - 1) + Number(p.voto)) /
                  nGiocate;
                await updateDoc(ref, {
                  punti: nuoviPunti,
                  gol: nuoviGol,
                  mediaVoto: parseFloat(nuovaMedia.toFixed(2)),
                  partiteGiocate: nGiocate,
                });
              }
            };
            await updatePlayer(
              partita.teamA,
              partita.scoreA > partita.scoreB,
              partita.scoreA === partita.scoreB,
            );
            await updatePlayer(
              partita.teamB,
              partita.scoreB > partita.scoreA,
              partita.scoreA === partita.scoreB,
            );
            await updateDoc(doc(this.firestore, `partite/${partita.id}`), {
              classificaAggiornata: true,
            });
            loading.dismiss();
          },
        },
      ],
    });
    await alert.present();
  }

  async eliminaPartita(id: string) {
    const alert = await this.alertController.create({
      header: 'Elimina Match?',
      buttons: [
        { text: 'No' },
        {
          text: 'Elimina',
          handler: () => deleteDoc(doc(this.firestore, `partite/${id}`)),
        },
      ],
    });
    await alert.present();
  }

  async eliminaPagelle(id: string) {
    await updateDoc(doc(this.firestore, `partite/${id}`), {
      scoreA: 0,
      scoreB: 0,
      pagelleInserite: false,
    });
  }
}
