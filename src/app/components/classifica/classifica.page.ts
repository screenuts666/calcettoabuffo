import {
  Component,
  inject,
  signal,
  computed,
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
  IonModal,
  ToastController,
  AlertController,
  IonIcon,
  IonButtons,
  IonButton,
} from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { Firestore, collection, collectionData } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { SchedaGiocatoreComponent } from './scheda-giocatore/scheda-giocatore.component';
import { addIcons } from 'ionicons';
import {
  flame,
  logoWhatsapp,
  trophy,
  football,
  people,
  star,
  sparkles,
  timeOutline,
  globeOutline,
  shareSocialOutline,
} from 'ionicons/icons';
import { Giocatore } from 'src/app/models/giocatore.model';
import { AuthService } from 'src/app/services/auth.service';
import {
  CURRENT_SEASON,
  PREVIOUS_SEASON,
  ALL_SEASONS,
  STAGIONI,
  getStagionePartita,
  getStagioniDisponibili,
} from 'src/app/utils/season-utils';

export type CriterioOrdinamento =
  | 'punti'
  | 'presenze'
  | 'gol'
  | 'mediaVoto'
  | 'wins';

export interface CriterioOption {
  id: CriterioOrdinamento;
  label: string;
  icon: string;
  unit: string;
}

export const CRITERI_ORDINAMENTO: CriterioOption[] = [
  { id: 'punti', label: 'Punti', icon: 'trophy', unit: 'PUNTI' },
  { id: 'presenze', label: 'Presenze', icon: 'people', unit: 'MATCH' },
  { id: 'gol', label: 'Gol', icon: 'football', unit: 'GOL' },
  { id: 'mediaVoto', label: 'Media Voto', icon: 'star', unit: 'MEDIA' },
  { id: 'wins', label: 'Vittorie', icon: 'flame', unit: 'VITTORIE' },
];

export interface GiocatoreConPunti extends Giocatore {
  puntiVal: number;
  puntiDisplay: string;
  golTotali: number;
  mediaVotoVal: number;
  mediaVotoDisplay: string;
  partiteGiocate: number;
  wins: number;
  draws: number;
  losses: number;
}

@Component({
  selector: 'app-classifica',
  templateUrl: 'classifica.page.html',
  styleUrls: ['classifica.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
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
    IonModal,
    IonButtons,
    IonButton,
    SchedaGiocatoreComponent,
    IonIcon,
  ],
})
export class ClassificaPage {
  private firestore: Firestore = inject(Firestore);
  private authService = inject(AuthService);
  private alertController = inject(AlertController);
  private toastController = inject(ToastController);

  readonly CURRENT_SEASON = CURRENT_SEASON;
  readonly PREVIOUS_SEASON = PREVIOUS_SEASON;
  readonly ALL_SEASONS = ALL_SEASONS;
  readonly CRITERI_ORDINAMENTO = CRITERI_ORDINAMENTO;

  stagioneSelezionata = signal<string>(CURRENT_SEASON);
  criterioOrdinamento = signal<CriterioOrdinamento>('punti');

  stagioniList = computed(() => {
    return getStagioniDisponibili(this.partiteRaw());
  });

  isModalOpen = signal(false);
  giocatoreSelezionato = signal<GiocatoreConPunti | null>(null);

  isAdmin = this.authService.isAdmin;

  giocatoriRaw = toSignal<Giocatore[], Giocatore[]>(
    collectionData(collection(this.firestore, 'giocatori'), {
      idField: 'id',
    }) as Observable<Giocatore[]>,
    { initialValue: [] },
  );

  partiteRaw = toSignal<any[], any[]>(
    collectionData(collection(this.firestore, 'partite'), {
      idField: 'id',
    }) as Observable<any[]>,
    { initialValue: [] },
  );

  classificaCalcolata = computed<GiocatoreConPunti[]>(() => {
    const giocatori = this.giocatoriRaw() || [];
    const partite = this.partiteRaw() || [];

    const partiteValide = partite.filter((p) => p['pagelleInserite'] === true);
    const stagione = this.stagioneSelezionata();

    const partiteStagione =
      stagione === ALL_SEASONS
        ? partiteValide
        : partiteValide.filter((p) => getStagionePartita(p) === stagione);

    const calcolata = giocatori.map((g) => {
      let punti = 0;
      let golTotali = 0;
      let sommaVoti = 0;
      let partiteGiocate = 0;
      let wins = 0;
      let draws = 0;
      let losses = 0;

      partiteStagione.forEach((p: any) => {
        const inTeamA = p.teamA?.find((pl: any) => pl.id === g.id);
        const inTeamB = p.teamB?.find((pl: any) => pl.id === g.id);

        if (inTeamA || inTeamB) {
          partiteGiocate++;

          const scoreA = Number(p.scoreA);
          const scoreB = Number(p.scoreB);
          const won =
            (inTeamA && scoreA > scoreB) || (inTeamB && scoreB > scoreA);
          const draw = scoreA === scoreB;
          const lost = !won && !draw;

          punti += 2; // Partecipazione
          if (won) {
            punti += 2;
            wins++;
          } else if (draw) {
            punti += 1;
            draws++;
          } else if (lost) {
            losses++;
          }

          const eventi = p.eventiGol || [];
          const golFatti = eventi.filter(
            (eg: any) => eg.idAssegnato === g.id && !eg.isAutogoal,
          ).length;
          const autogolFatti = eventi.filter(
            (eg: any) => eg.idAssegnato === g.id && eg.isAutogoal,
          ).length;

          golTotali += golFatti;
          punti += golFatti * 1;
          punti += autogolFatti * -1;

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
        puntiDisplay: punti.toString(),
        golTotali,
        mediaVotoVal: mediaVoto,
        mediaVotoDisplay: mediaVoto.toFixed(2),
        partiteGiocate,
        wins,
        draws,
        losses,
      };
    });

    const crit = this.criterioOrdinamento();

    return calcolata.sort((a, b) => {
      switch (crit) {
        case 'presenze':
          if (b.partiteGiocate !== a.partiteGiocate) {
            return b.partiteGiocate - a.partiteGiocate;
          }
          if (b.puntiVal !== a.puntiVal) {
            return b.puntiVal - a.puntiVal;
          }
          return b.mediaVotoVal - a.mediaVotoVal;

        case 'gol':
          if (b.golTotali !== a.golTotali) {
            return b.golTotali - a.golTotali;
          }
          if (b.puntiVal !== a.puntiVal) {
            return b.puntiVal - a.puntiVal;
          }
          return b.mediaVotoVal - a.mediaVotoVal;

        case 'mediaVoto':
          // Chi ha giocato viene prima di chi ha 0 presenze
          if ((b.partiteGiocate > 0) !== (a.partiteGiocate > 0)) {
            return b.partiteGiocate > 0 ? 1 : -1;
          }
          if (b.mediaVotoVal !== a.mediaVotoVal) {
            return b.mediaVotoVal - a.mediaVotoVal;
          }
          if (b.partiteGiocate !== a.partiteGiocate) {
            return b.partiteGiocate - a.partiteGiocate;
          }
          return b.puntiVal - a.puntiVal;

        case 'wins':
          if (b.wins !== a.wins) {
            return b.wins - a.wins;
          }
          if (b.puntiVal !== a.puntiVal) {
            return b.puntiVal - a.puntiVal;
          }
          return b.partiteGiocate - a.partiteGiocate;

        case 'punti':
        default:
          if (b.puntiVal !== a.puntiVal) {
            return b.puntiVal - a.puntiVal;
          }
          if (b.mediaVotoVal !== a.mediaVotoVal) {
            return b.mediaVotoVal - a.mediaVotoVal;
          }
          return b.golTotali - a.golTotali;
      }
    });
  });

  constructor() {
    addIcons({
      flame,
      logoWhatsapp,
      trophy,
      football,
      people,
      star,
      sparkles,
      timeOutline,
      globeOutline,
      shareSocialOutline,
    });
  }

  selezionaStagione(id: string) {
    this.stagioneSelezionata.set(id);
  }

  selezionaCriterio(crit: CriterioOrdinamento) {
    this.criterioOrdinamento.set(crit);
  }

  getValorePrincipale(g: GiocatoreConPunti): {
    valore: string | number;
    etichetta: string;
  } {
    switch (this.criterioOrdinamento()) {
      case 'presenze':
        return { valore: g.partiteGiocate, etichetta: 'MATCH' };
      case 'gol':
        return { valore: g.golTotali, etichetta: 'GOL' };
      case 'mediaVoto':
        return { valore: g.mediaVotoDisplay, etichetta: 'MEDIA' };
      case 'wins':
        return { valore: g.wins, etichetta: 'VITTORIE' };
      case 'punti':
      default:
        return { valore: g.puntiDisplay, etichetta: 'PUNTI' };
    }
  }

  apriDettagliGiocatore(giocatore: GiocatoreConPunti) {
    this.giocatoreSelezionato.set(giocatore);
    this.isModalOpen.set(true);
  }

  chiudiModale = () => {
    this.isModalOpen.set(false);
  };

  async condividiSuWhatsApp() {
    const lista = this.classificaCalcolata();
    if (!lista || lista.length === 0) {
      const toast = await this.toastController.create({
        message: 'Nessun dato da condividere.',
        duration: 2000,
        color: 'warning',
      });
      await toast.present();
      return;
    }

    const stg = this.stagioniList().find((s) => s.id === this.stagioneSelezionata());
    const stagioneNome = stg ? stg.label : 'Classifica Generale';

    const crit = this.CRITERI_ORDINAMENTO.find(
      (c) => c.id === this.criterioOrdinamento(),
    );
    const criterioNome = crit ? crit.label : 'Punti';

    let msg = `⚽ *CALCETTO ABBUFFO* ⚽\n`;
    msg += `🏆 *${stagioneNome.toUpperCase()}*\n`;
    msg += `📊 *Classifica ordinata per:* ${criterioNome}\n\n`;

    lista.forEach((g, idx) => {
      const medaglia =
        idx === 0
          ? '🥇'
          : idx === 1
            ? '🥈'
            : idx === 2
              ? '🥉'
              : `${idx + 1}°`;

      const soprannome = g.soprannome ? ` ("${g.soprannome}")` : '';
      msg += `${medaglia} *${g.nome}*${soprannome}\n`;

      if (this.criterioOrdinamento() === 'gol') {
        msg += `   └ ⚽ *${g.golTotali} Gol* | 🏆 ${g.puntiDisplay} pt | 👥 ${g.partiteGiocate} match | ⭐ ${g.mediaVotoDisplay}\n`;
      } else if (this.criterioOrdinamento() === 'presenze') {
        msg += `   └ 👥 *${g.partiteGiocate} Match* | 🏆 ${g.puntiDisplay} pt | ⚽ ${g.golTotali} gol | ⭐ ${g.mediaVotoDisplay}\n`;
      } else if (this.criterioOrdinamento() === 'mediaVoto') {
        msg += `   └ ⭐ *Media ${g.mediaVotoDisplay}* | 🏆 ${g.puntiDisplay} pt | 👥 ${g.partiteGiocate} match | ⚽ ${g.golTotali} gol\n`;
      } else if (this.criterioOrdinamento() === 'wins') {
        msg += `   └ 🔥 *${g.wins} Vittorie* (V${g.wins}-P${g.draws}-S${g.losses}) | 🏆 ${g.puntiDisplay} pt | 👥 ${g.partiteGiocate} match\n`;
      } else {
        msg += `   └ 🏆 *${g.puntiDisplay} Punti* | 👥 ${g.partiteGiocate} match | ⚽ ${g.golTotali} gol | ⭐ ${g.mediaVotoDisplay}\n`;
      }
    });

    const oggi = new Date().toLocaleDateString('it-IT');
    msg += `\n📅 _Aggiornato al ${oggi}_\n`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Classifica Calcetto Abbuffo',
          text: msg,
        });
        return;
      } catch {
        // Fallback se annullato o errore share nativo
      }
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(msg);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = msg;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      const toast = await this.toastController.create({
        message: '📋 Classifica copiata per WhatsApp!',
        duration: 2500,
        color: 'success',
      });
      await toast.present();

      const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
      window.open(url, '_blank');
    } catch (err) {
      console.error('Errore durante la copia negli appunti:', err);
    }
  }

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
            } catch {
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
