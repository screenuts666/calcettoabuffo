import {
  Component,
  inject,
  signal,
  computed,
  effect,
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
  collection,
  query,
  orderBy,
} from 'firebase/firestore';
import { Firestore, collectionData } from '@angular/fire/firestore';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { addIcons } from 'ionicons';
import {
  add,
  trash,
  person,
  create,
  search,
  closeCircle,
  people,
  refreshOutline,
  personAddOutline,
  callOutline,
  logoWhatsapp,
} from 'ionicons/icons';
import { Giocatore } from 'src/app/models/giocatore.model';
import { AuthService } from 'src/app/services/auth.service';
import { TrashService } from 'src/app/services/trash.service';
import {
  formatPhoneForTel,
  formatPhoneForWhatsAppUrl,
} from 'src/app/utils/whatsapp-formatter';
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
  readonly auth = inject(AuthService);
  readonly trashService = inject(TrashService);
  private router = inject(Router);

  readonly DEFAULT_AVATAR = DEFAULT_AVATAR;

  getAvatar(fotoUrl?: string | null): string {
    return getAvatarUrl(fotoUrl);
  }

  onImgError(event: Event) {
    handleAvatarError(event);
  }

  filtro = signal('');
  privatePhonesMap = signal<Record<string, string>>({});

  tuttiIGiocatori = toSignal<Giocatore[], Giocatore[]>(
    (
      collectionData(
        query(collection(this.firestore, 'giocatori'), orderBy('nome')),
        { idField: 'id' },
      ) as Observable<Giocatore[]>
    ).pipe(catchError(() => of([] as Giocatore[]))),
    { initialValue: [] },
  );

  giocatoriFiltrati = computed(() => {
    const f = this.filtro().toLowerCase().trim();
    const lista = this.tuttiIGiocatori();
    if (!f) return lista;
    return lista.filter((g) => {
      const nome = (g.nome || '').toLowerCase();
      const soprannome = (g.soprannome || '').toLowerCase();
      const soprannomeAi = (g.soprannomeAi || '').toLowerCase();
      const anno = (g.annoNascita || '').toString();
      const piede = ((g.piedePreferito as string) || '').toLowerCase();
      const ruolo = ((g.ruoloPreferito as string) || '').toLowerCase();
      const maglia =
        g.numeroMaglia !== null && g.numeroMaglia !== undefined
          ? `#${g.numeroMaglia}`
          : '';
      return (
        nome.includes(f) ||
        soprannome.includes(f) ||
        soprannomeAi.includes(f) ||
        anno.includes(f) ||
        piede.includes(f) ||
        ruolo.includes(f) ||
        maglia.includes(f)
      );
    });
  });

  constructor() {
    addIcons({
      add,
      trash,
      person,
      create,
      search,
      closeCircle,
      people,
      refreshOutline,
      personAddOutline,
      callOutline,
      logoWhatsapp,
    });

    effect(() => {
      const lista = this.tuttiIGiocatori() || [];
      const isMister = this.auth.isSuperUser();
      const myPlayerId = this.auth.linkedPlayerId();
      const isAuth = this.auth.isAuthenticated();

      if (!isAuth || lista.length === 0) {
        this.privatePhonesMap.set({});
        return;
      }

      const targets = isMister
        ? lista.map((g) => g.id).filter(Boolean)
        : myPlayerId
          ? [myPlayerId]
          : [];

      if (targets.length === 0) {
        this.privatePhonesMap.set({});
        return;
      }

      Promise.all(
        targets.map(async (pid) => {
          const phone = await this.auth.getPlayerPhoneNumber(pid);
          return { pid, phone };
        })
      ).then((results) => {
        const nextMap: Record<string, string> = {};
        for (const r of results) {
          if (r.phone) {
            nextMap[r.pid] = r.phone;
          }
        }
        this.privatePhonesMap.set(nextMap);
      });
    });
  }

  get isAdmin(): boolean {
    return this.auth.isSuperUser();
  }

  canEditPlayer(playerId: string): boolean {
    return this.auth.canEditPlayer(playerId);
  }

  canViewPhone(g: Giocatore): boolean {
    return this.auth.canViewPlayerPhone(g);
  }

  getPhoneForPlayer(playerId?: string | null): string | null {
    if (!playerId) return null;
    return this.privatePhonesMap()[playerId] || null;
  }

  getTelUrl(phone?: string | null): string {
    return formatPhoneForTel(phone);
  }

  getWhatsAppUrl(phone?: string | null): string {
    return formatPhoneForWhatsAppUrl(phone);
  }

  isMyPlayer(playerId: string): boolean {
    return this.auth.linkedPlayerId() === playerId;
  }

  apriDettagliGiocatore(g: Giocatore) {
    this.router.navigate(['/giocatori', g.id]);
  }

  creaNuovoGiocatore() {
    this.router.navigate(['/giocatori', 'nuovo']);
  }

  creaMiaSchedaInRosa() {
    this.router.navigate(['/giocatori', 'nuovo'], {
      queryParams: { selfClaim: '1' },
    });
  }

  modificaGiocatore(g: Giocatore, slidingItem?: IonItemSliding) {
    slidingItem?.close();
    this.router.navigate(['/giocatori', g.id, 'modifica']);
  }

  async eliminaGiocatore(g: Giocatore, slidingItem: IonItemSliding) {
    if (!this.isAdmin) return;
    const alert = await this.alertController.create({
      header: 'Elimina Giocatore?',
      message: `Vuoi spostare "${g.nome}" nel Cestino? Potrai annullare subito o ripristinarlo entro 24 ore.`,
      buttons: [
        { text: 'Annulla', role: 'cancel', handler: () => slidingItem.close() },
        {
          text: 'Sposta nel Cestino (24h)',
          role: 'destructive',
          handler: async () => {
            slidingItem.close();
            await this.trashService.softDeletePlayer(g);
          },
        },
      ],
    });
    await alert.present();
  }
}
