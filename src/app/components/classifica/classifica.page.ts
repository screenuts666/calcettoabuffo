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
  ToastController,
  AlertController,
  IonIcon,
} from '@ionic/angular/standalone';
import { AsyncPipe, CommonModule } from '@angular/common';
import { Firestore, collection, collectionData } from '@angular/fire/firestore';
import { Observable, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import { SchedaGiocatoreComponent } from './scheda-giocatore/scheda-giocatore.component';
import { addIcons } from 'ionicons';
import { flame } from 'ionicons/icons';
import { Giocatore } from 'src/app/models/giocatore.model';
import { AuthService } from 'src/app/services/auth.service';

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
    IonIcon,
  ],
})
export class ClassificaPage {
  private firestore: Firestore = inject(Firestore);
  private authService = inject(AuthService);
  private alertController = inject(AlertController);
  private toastController = inject(ToastController);

  classifica$: Observable<GiocatoreConPunti[]>;

  isModalOpen = signal(false);
  giocatoreSelezionato = signal<GiocatoreConPunti | null>(null);

  isAdmin = this.authService.isAdmin;

  constructor() {
    addIcons({ flame });
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

              const scoreA = Number(p.scoreA);
              const scoreB = Number(p.scoreB);
              const won =
                (inTeamA && scoreA > scoreB) || (inTeamB && scoreB > scoreA);
              const draw = scoreA === scoreB;
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

  private clickCount = 0;

  async secretTitleClick() {
    this.clickCount++;
    if (this.clickCount >= 5) {
      this.clickCount = 0;
      if (this.isAdmin()) {
        await this.logoutAdmin();
      } else {
        await this.loginAdmin();
      }
    }
  }

  async loginAdmin() {
    const alert = await this.alertController.create({
      header: 'Admin Access',
      inputs: [
        { name: 'email', type: 'email', placeholder: 'Email' },
        { name: 'password', type: 'password', placeholder: 'Password' },
      ],
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        {
          text: 'Entra',
          handler: async (res) => {
            try {
              await this.authService.loginAdmin(res.email, res.password);
              (
                await this.toastController.create({
                  message: 'Benvenuto Boss! 🕶️',
                  duration: 2000,
                  color: 'success',
                })
              ).present();
            } catch (err) {
              (
                await this.toastController.create({
                  message: 'Credenziali errate',
                  duration: 2000,
                  color: 'danger',
                })
              ).present();
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async logoutAdmin() {
    const alert = await this.alertController.create({
      header: 'Logout',
      message: 'Vuoi tornare tra i comuni mortali?',
      buttons: [
        { text: 'Resta Admin', role: 'cancel' },
        {
          text: 'Esci',
          handler: async () => {
            await this.authService.logoutAdmin();
            (
              await this.toastController.create({
                message: 'Logout effettuato',
                duration: 2000,
              })
            ).present();
          },
        },
      ],
    });
    await alert.present();
  }
}
