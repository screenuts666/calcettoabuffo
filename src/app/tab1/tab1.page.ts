import {
  Component,
  inject,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonList,
  IonItem,
  IonAvatar,
  IonLabel,
  IonNote,
  IonSpinner,
  IonModal,
} from '@ionic/angular/standalone';
import { AsyncPipe, CommonModule } from '@angular/common';
import { Firestore, collection, collectionData } from '@angular/fire/firestore';
import { Observable, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import { SchedaGiocatoreComponent } from './scheda-giocatore/scheda-giocatore.component';

@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AsyncPipe,
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonAvatar,
    IonLabel,
    IonNote,
    IonSpinner,
    IonModal,
    SchedaGiocatoreComponent,
  ],
})
export class Tab1Page {
  private firestore: Firestore = inject(Firestore);

  classifica$: Observable<any[]>;

  isModalOpen = signal(false);
  giocatoreSelezionato = signal<any>(null);

  constructor() {
    const giocatori$ = collectionData(collection(this.firestore, 'giocatori'), {
      idField: 'id',
    });
    const partite$ = collectionData(collection(this.firestore, 'partite'), {
      idField: 'id',
    });

    this.classifica$ = combineLatest([giocatori$, partite$]).pipe(
      map(([giocatori, partite]) => {
        const partiteValide = partite.filter(
          (p) => p['pagelleInserite'] === true,
        );

        const classificaCalcolata = giocatori.map((g) => {
          let punti = 0;
          let golTotali = 0;
          let sommaVoti = 0;
          let partiteGiocate = 0;

          partiteValide.forEach((p: any) => {
            const inTeamA = p.teamA?.find((pl: any) => pl.id === g.id);
            const inTeamB = p.teamB?.find((pl: any) => pl.id === g.id);

            if (inTeamA || inTeamB) {
              partiteGiocate++;

              const won =
                (inTeamA && p.scoreA > p.scoreB) ||
                (inTeamB && p.scoreB > p.scoreA);
              const draw = p.scoreA === p.scoreB;
              punti += won ? 3 : draw ? 2 : 1;

              const eventi = p.eventiGol || [];
              const golFatti = eventi.filter(
                (eg: any) => eg.idAssegnato === g.id && !eg.isAutogoal,
              ).length;
              const autogolFatti = eventi.filter(
                (eg: any) => eg.idAssegnato === g.id && eg.isAutogoal,
              ).length;

              golTotali += golFatti;
              punti += golFatti * 3;
              punti += autogolFatti * -2;

              const playerObj = inTeamA || inTeamB;
              const voto = Number(playerObj.voto) || 0;
              sommaVoti += voto;
              punti += voto;
            }
          });

          const mediaVoto = partiteGiocate > 0 ? sommaVoti / partiteGiocate : 0;

          return {
            ...g,
            puntiVal: punti,
            puntiDisplay: punti.toFixed(1),
            golTotali,
            mediaVotoVal: mediaVoto,
            mediaVotoDisplay: mediaVoto.toFixed(2),
            partiteGiocate,
          };
        });

        return classificaCalcolata.sort((a, b) => {
          if (b.puntiVal !== a.puntiVal) return b.puntiVal - a.puntiVal;
          return b.mediaVotoVal - a.mediaVotoVal;
        });
      }),
    );
  }

  apriDettagliGiocatore(giocatore: any) {
    this.giocatoreSelezionato.set(giocatore);
    this.isModalOpen.set(true);
  }

  chiudiModale = () => {
    this.isModalOpen.set(false);
  };
}
