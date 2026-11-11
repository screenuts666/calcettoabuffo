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
  IonAvatar,
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
import { collection, query, orderBy } from 'firebase/firestore';
import { Firestore, collectionData } from '@angular/fire/firestore';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { addIcons } from 'ionicons';
import {
  add,
  trash,
  trashOutline,
  person,
  create,
  createOutline,
  search,
  closeCircle,
  closeOutline,
  people,
  refreshOutline,
  personAddOutline,
  callOutline,
  logoWhatsapp,
  shieldOutline,
  lockClosedOutline,
  arrowUndoOutline,
} from 'ionicons/icons';
import { Giocatore } from 'src/app/models/giocatore.model';
import { AuthService } from 'src/app/services/auth.service';
import { TrashService } from 'src/app/services/trash.service';
import { StatsEngineService } from 'src/app/services/stats-engine.service';
import {
  formatPhoneForTel,
  formatPhoneForWhatsAppUrl,
} from 'src/app/utils/whatsapp-formatter';
import { calcolaEta, formatDataNascitaEdEta } from 'src/app/utils/date-utils';
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
    IonAvatar,
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
  readonly statsEngine = inject(StatsEngineService);
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
      const anno = (g.annoNascita || '').toString();
      const dataNascita = (g.dataNascita || '').toLowerCase();
      const piede = ((g.piedePreferito as string) || '').toLowerCase();
      const ruolo = ((g.ruoloPreferito as string) || '').toLowerCase();
      const maglia =
        g.numeroMaglia !== null && g.numeroMaglia !== undefined
          ? `#${g.numeroMaglia}`
          : '';
      return (
        nome.includes(f) ||
        soprannome.includes(f) ||
        anno.includes(f) ||
        dataNascita.includes(f) ||
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
      trashOutline,
      person,
      create,
      createOutline,
      search,
      closeCircle,
      closeOutline,
      people,
      refreshOutline,
      personAddOutline,
      callOutline,
      logoWhatsapp,
      shieldOutline,
      lockClosedOutline,
      arrowUndoOutline,
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
        }),
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

  getDataNascitaDisplay(g?: Giocatore | null): string {
    return formatDataNascitaEdEta(g);
  }

  /**
   * Restituisce l'indicatore Ruolo / Tier MMR del giocatore per la Player Card
   */
  getPlayerBadgeInfo(g: Giocatore): { label: string; color: string } {
    const stats = this.statsEngine.statsResult()?.allTime?.get(g.id);
    if (stats && stats.partiteGiocate > 0 && stats.isRanked && stats.tier) {
      return {
        label: g.ruoloPreferito ? `${g.ruoloPreferito} • ${stats.tier.label}` : stats.tier.label,
        color: stats.tier.color || '#10b981',
      };
    }
    if (g.ruoloPreferito) {
      return {
        label: String(g.ruoloPreferito),
        color: '#10b981',
      };
    }
    return {
      label: 'Rosa',
      color: '#64748b',
    };
  }

  /**
   * Formato compatto senza emoji: es. "30 anni ('96)"
   */
  getEtaEAnnoShort(g: Giocatore): string | null {
    if (!g) return null;
    const rawData = (g.dataNascita || '').trim();
    const rawAnno = g.annoNascita ? String(g.annoNascita).trim() : '';

    if (g.nascondiAnnoNascita && rawData) {
      const parts = rawData.split('/');
      if (parts.length >= 2) {
        return `${parts[0]}/${parts[1]}`;
      }
      return null;
    }

    const eta = calcolaEta(rawData || rawAnno);
    let yearStr = '';

    if (rawData.includes('/')) {
      const parts = rawData.split('/');
      if (parts.length === 3 && parts[2].length === 4) {
        yearStr = parts[2].slice(-2);
      }
    } else if (rawData.includes('-')) {
      const parts = rawData.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        yearStr = parts[0].slice(-2);
      }
    } else if (/^\d{4}$/.test(rawData)) {
      yearStr = rawData.slice(-2);
    }

    if (!yearStr && /^\d{4}$/.test(rawAnno)) {
      yearStr = rawAnno.slice(-2);
    }

    if (eta !== null && yearStr) {
      return `${eta} anni ('${yearStr})`;
    }
    if (eta !== null) {
      return `${eta} anni`;
    }
    if (rawData) {
      return rawData;
    }
    return null;
  }

  /**
   * Formato fisico compatto senza emoji: es. "185cm • 71kg"
   */
  getFisicoShort(g: Giocatore): string | null {
    if (!g) return null;
    const h = (g.altezza || '').toString().trim().replace(/\s*cm$/i, '');
    const w = (g.peso || '').toString().trim().replace(/\s*kg$/i, '');
    if (h && w) return `${h}cm • ${w}kg`;
    if (h) return `${h}cm`;
    if (w) return `${w}kg`;
    return null;
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

  modificaGiocatore(g: Giocatore, event?: Event) {
    event?.stopPropagation();
    this.router.navigate(['/giocatori', g.id, 'modifica']);
  }

  async eliminaGiocatore(g: Giocatore, event?: Event) {
    event?.stopPropagation();
    if (!this.isAdmin) return;
    const alert = await this.alertController.create({
      header: 'Elimina Giocatore?',
      message: `Vuoi spostare "${g.nome}" nel Cestino? Potrai annullare subito o ripristinarlo entro 24 ore.`,
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        {
          text: 'Sposta nel Cestino (24h)',
          role: 'destructive',
          handler: async () => {
            await this.trashService.softDeletePlayer(g);
          },
        },
      ],
    });
    await alert.present();
  }
}
