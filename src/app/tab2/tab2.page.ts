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
  LoadingController,
} from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
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
} from 'ionicons/icons';
import { MatchModalComponent } from './match-modal/match-modal.component';

interface Partita {
  id: string;
  dataPartita: string;
  luogo: string;
  scoreA: number;
  scoreB: number;
  matchConcluso: boolean;
  pagelleInserite: boolean;
  isTimerRunning: boolean;
  convocati: any[];
  teamA: any[];
  teamB: any[];
  classificaAggiornata?: boolean;
}

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
  ],
})
export class Tab2Page {
  private firestore = inject(Firestore);
  private modalCtrl = inject(ModalController);
  private alertController = inject(AlertController);
  private loadingController = inject(LoadingController);

  partite = toSignal<Partita[], Partita[]>(
    collectionData(
      query(collection(this.firestore, 'partite'), orderBy('dataOra', 'desc')),
      { idField: 'id' },
    ) as Observable<Partita[]>,
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
    });
  }

  async apriModalePartita(partita?: Partita) {
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

  async aggiornaClassifica(partita: Partita) {
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
