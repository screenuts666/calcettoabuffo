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
import { Giocatore } from '../models/giocatore.model';

// Definiamo un'interfaccia estesa per la classifica
interface GiocatoreConPunti extends Giocatore {
  puntiVal: number;
  puntiDisplay: string;
  golTotali: number;
  mediaVotoVal: number;
  mediaVotoDisplay: string;
  partiteGiocate: number;
}

@Component({
  selector: 'app-classifica',
  templateUrl: 'classifica.page.html',
  styleUrls: ['classifica.page.scss'],
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
export class ClassificaPage {
  private firestore: Firestore = inject(Firestore);

  classifica$: Observable<GiocatoreConPunti[]>;

  isModalOpen = signal(false);
  giocatoreSelezionato = signal<GiocatoreConPunti | null>(null);

  constructor() {
    const giocatori$ = collectionData(collection(this.firestore, 'giocatori'), {
      idField: 'id',
    }) as Observable<Giocatore[]>;
    const partite$ = collectionData(collection(this.firestore, 'partite'), {
      idField: 'id',
    }) as Observable<any[]>; // Manteniamo any qui per ora, non abbiamo un modello per Partita

    this.classifica$ = combineLatest([giocatori$, partite$]).pipe(
      map(([giocatori, partite]): GiocatoreConPunti[] => {
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

  apriDettagliGiocatore(giocatore: GiocatoreConPunti) {
    this.giocatoreSelezionato.set(giocatore);
    this.isModalOpen.set(true);
  }

  chiudiModale = () => {
    this.isModalOpen.set(false);
  };
}
