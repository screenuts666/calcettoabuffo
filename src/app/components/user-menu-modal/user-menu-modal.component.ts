import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader,
  IonContent,
  IonIcon,
  IonAvatar,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  closeOutline,
  personOutline,
  createOutline,
  footballOutline,
  personAddOutline,
  shieldCheckmarkOutline,
  peopleOutline,
  settingsOutline,
  personCircleOutline,
  logOutOutline,
  chevronForwardOutline,
} from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';
import { StatsEngineService } from '../../services/stats-engine.service';
import { Giocatore } from '../../models/giocatore.model';
import { PlayerAvatarComponent } from '../player-avatar/player-avatar.component';

export type UserMenuActionResult =
  | { type: 'navigate'; url: any[]; queryParams?: any }
  | { type: 'auth'; openClaimPicker?: boolean }
  | { type: 'settings' }
  | { type: 'logout' };

@Component({
  selector: 'app-user-menu-modal',
  templateUrl: './user-menu-modal.component.html',
  styleUrls: ['./user-menu-modal.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    IonHeader,
    IonContent,
    IonIcon,
    IonAvatar,
    PlayerAvatarComponent,
  ],
})
export class UserMenuModalComponent {
  public authService = inject(AuthService);
  public statsEngine = inject(StatsEngineService);
  private modalCtrl = inject(ModalController);

  /** Giocatore collegato all'account utente corrente (se presente) */
  readonly linkedPlayer = computed<Giocatore | null>(() => {
    const pid = this.authService.linkedPlayerId();
    if (!pid) return null;
    const all = this.statsEngine.giocatoriRaw() || [];
    return all.find((g) => g.id === pid) || null;
  });

  /** Nome mostrato con fallback: nome giocatore collegato > displayName Google/Email > 'Utente' */
  readonly displayName = computed<string>(() => {
    const lp = this.linkedPlayer();
    return lp?.nome || this.authService.displayName() || 'Utente';
  });

  /** Foto profilo con fallback: foto giocatore collegato > foto profilo Google/Firebase */
  readonly userAvatarUrl = computed<string | null>(() => {
    return this.linkedPlayer()?.fotoUrl || this.authService.photoURL() || null;
  });

  constructor() {
    addIcons({
      closeOutline,
      personOutline,
      createOutline,
      footballOutline,
      personAddOutline,
      shieldCheckmarkOutline,
      peopleOutline,
      settingsOutline,
      personCircleOutline,
      logOutOutline,
      chevronForwardOutline,
    });
  }

  chiudi() {
    this.modalCtrl.dismiss();
  }

  naviga(url: any[], queryParams?: any) {
    this.modalCtrl.dismiss({ type: 'navigate', url, queryParams });
  }

  apriClaim() {
    this.modalCtrl.dismiss({ type: 'auth', openClaimPicker: true });
  }

  apriAuth() {
    this.modalCtrl.dismiss({ type: 'auth', openClaimPicker: false });
  }

  apriGestioneRuoli() {
    this.modalCtrl.dismiss({
      type: 'navigate',
      url: ['/impostazioni'],
      queryParams: { tab: 'ruoli' },
    });
  }

  apriImpostazioni() {
    this.modalCtrl.dismiss({
      type: 'navigate',
      url: ['/impostazioni'],
    });
  }

  apriAccount() {
    this.modalCtrl.dismiss({
      type: 'navigate',
      url: ['/impostazioni'],
      queryParams: { tab: 'sistema' },
    });
  }

  esci() {
    this.modalCtrl.dismiss({ type: 'logout' });
  }
}

