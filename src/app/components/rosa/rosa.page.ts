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
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  IonIcon,
  IonSearchbar,
  AlertController,
  IonFab,
  IonFabButton,
  IonButtons,
} from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  deleteDoc,
  query,
  orderBy,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { addIcons } from 'ionicons';
import {
  add,
  trash,
  person,
  create,
  search,
  closeCircle,
  people,
} from 'ionicons/icons';
import { Giocatore } from 'src/app/models/giocatore.model';
import { PiedePreferito } from 'src/app/models/piede-preferito.enum';
import { RuoloPreferito } from 'src/app/models/ruolo-preferito.enum';
import { AuthService } from 'src/app/services/auth.service';
import {
  DEFAULT_AVATAR,
  getAvatarUrl,
  handleAvatarError,
} from 'src/app/utils/avatar-utils';

import { PlayerAvatarComponent } from '../player-avatar/player-avatar.component';

@Component({
  selector: 'app-rosa',
  templateUrl: 'rosa.page.html',
  styleUrls: ['rosa.page.scss'],
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
    IonItemSliding,
    IonItemOptions,
    IonItemOption,
    IonIcon,
    IonSearchbar,
    IonFab,
    IonFabButton,
    IonButtons,
    ThemeToggleComponent,
    PlayerAvatarComponent,
  ],
})
export class RosaPage {
  private firestore = inject(Firestore);
  private alertController = inject(AlertController);
  private auth = inject(AuthService);
  private router = inject(Router);

  readonly DEFAULT_AVATAR = DEFAULT_AVATAR;

  getAvatar(fotoUrl?: string | null): string {
    return getAvatarUrl(fotoUrl);
  }

  onImgError(event: Event) {
    handleAvatarError(event);
  }

  filtro = signal('');

  tuttiIGiocatori = toSignal<Giocatore[], Giocatore[]>(
    collectionData(
      query(collection(this.firestore, 'giocatori'), orderBy('nome')),
      { idField: 'id' },
    ) as Observable<Giocatore[]>,
    { initialValue: [] },
  );
  giocatoriFiltrati = computed(() => {
    const f = this.filtro().toLowerCase().trim();
    const lista = this.tuttiIGiocatori();
    if (!f) return lista;
    return lista.filter((g) => {
      const nome = (g.nome || '').toLowerCase();
      const soprannome = (g.soprannome || '').toLowerCase();
      const anno = (g.annoNascita || '').toString();
      const piede = (g.piedePreferito as string || '').toLowerCase();
      const ruolo = (g.ruoloPreferito as string || '').toLowerCase();
      return (
        nome.includes(f) ||
        soprannome.includes(f) ||
        anno.includes(f) ||
        piede.includes(f) ||
        ruolo.includes(f)
      );
    });
  });

  constructor() {
    addIcons({ add, trash, person, create, search, closeCircle, people });
  }

  get isAdmin(): boolean {
    return this.auth.isAdmin();
  }

  apriDettagliGiocatore(g: Giocatore) {
    this.router.navigate(['/giocatori', g.id]);
  }

  creaNuovoGiocatore() {
    this.router.navigate(['/giocatori', 'nuovo']);
  }

  modificaGiocatore(g: Giocatore, slidingItem?: IonItemSliding) {
    slidingItem?.close();
    this.router.navigate(['/giocatori', g.id, 'modifica']);
  }

  async eliminaGiocatore(id: string, slidingItem: IonItemSliding) {
    const alert = await this.alertController.create({
      header: 'Elimina Giocatore?',
      message: 'Sei sicuro? I suoi dati statistici andranno persi.',
      buttons: [
        { text: 'Annulla', role: 'cancel', handler: () => slidingItem.close() },
        {
          text: 'Elimina',
          role: 'destructive',
          handler: async () => {
            await deleteDoc(doc(this.firestore, `giocatori/${id}`));
            slidingItem.close();
          },
        },
      ],
    });
    await alert.present();
  }
}
