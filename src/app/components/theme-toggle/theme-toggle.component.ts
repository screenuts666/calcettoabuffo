import {
  Component,
  inject,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonIcon,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  sunny,
  sunnyOutline,
  moon,
  moonOutline,
  contrastOutline,
  settingsOutline,
  personCircleOutline,
  personOutline,
  createOutline,
  shieldCheckmark,
  shieldCheckmarkOutline,
  logOutOutline,
  logInOutline,
  footballOutline,
  peopleOutline,
  personAddOutline,
  chevronForwardOutline,
  chevronDownOutline,
  closeOutline,
} from 'ionicons/icons';
import { environment } from 'src/environments/environment';
import { ThemeService } from '../../services/theme.service';
import { AppUpdateService } from '../../services/app-update.service';
import { AuthService } from '../../services/auth.service';
import { StatsEngineService } from '../../services/stats-engine.service';
import { Giocatore } from '../../models/giocatore.model';
import {
  SettingsTab,
} from '../impostazioni/impostazioni.page';
import {
  AuthModalComponent,
  AuthModalView,
} from '../auth-modal/auth-modal.component';
import { PlayerAvatarComponent } from '../player-avatar/player-avatar.component';

@Component({
  selector: 'app-theme-toggle',
  templateUrl: './theme-toggle.component.html',
  styleUrls: ['./theme-toggle.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, IonIcon, PlayerAvatarComponent],
})
export class ThemeToggleComponent {
  public themeService = inject(ThemeService);
  public appUpdate = inject(AppUpdateService);
  public authService = inject(AuthService);
  public statsEngine = inject(StatsEngineService);
  private modalCtrl = inject(ModalController);
  private router = inject(Router);

  readonly isDevEnvironment: boolean = !environment.production;

  /** Giocatore associato all'utente loggato (se Atleta o Mister-Giocatore) */
  readonly linkedPlayer = computed<Giocatore | null>(() => {
    const pid = this.authService.linkedPlayerId();
    if (!pid) return null;
    const all = this.statsEngine.giocatoriRaw() || [];
    return all.find((g) => g.id === pid) || null;
  });

  readonly shortUserName = computed<string>(() => {
    const pl = this.linkedPlayer();
    const raw = pl?.nome || this.authService.displayName();
    return (raw || 'Utente').split(' ')[0];
  });

  readonly userAvatarUrl = computed<string | null>(() => {
    return this.linkedPlayer()?.fotoUrl || this.authService.photoURL() || null;
  });

  readonly displayName = computed<string>(() => {
    const pl = this.linkedPlayer();
    return pl?.nome || this.authService.displayName() || 'Utente';
  });

  constructor() {
    addIcons({
      sunny,
      sunnyOutline,
      moon,
      moonOutline,
      contrastOutline,
      settingsOutline,
      personCircleOutline,
      personOutline,
      createOutline,
      shieldCheckmark,
      shieldCheckmarkOutline,
      logOutOutline,
      logInOutline,
      footballOutline,
      peopleOutline,
      personAddOutline,
      chevronForwardOutline,
      chevronDownOutline,
      closeOutline,
    });
  }

  /**
   * Click sull'unico pill Utente nell'Header:
   * - Se NON è loggato: apre il modale di Login / Registrazione
   * - Se è loggato: naviga direttamente alla vista unificata Account & Impostazioni (tab 'account' di default)
   */
  async onUserHeaderClick(event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    if (!this.authService.isLoggedIn()) {
      await this.openAuthModal('login');
      return;
    }

    await this.openThemeMenu('account');
  }

  async openAuthModal(
    initialMode: AuthModalView = 'login',
    openClaimPicker = false,
  ) {
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;
    const currentUrl = this.router.url;
    this.authService.setReturnUrl(currentUrl);
    const modal = await this.modalCtrl.create({
      component: AuthModalComponent,
      componentProps: { initialMode, openClaimPicker, returnUrl: currentUrl },
      mode: 'ios',
      cssClass: isDesktop ? 'auth-desktop-modal' : undefined,
    });
    await modal.present();
    const { data } = await modal.onWillDismiss();
    if (data === 'open-settings') {
      await this.openThemeMenu('account');
    }
  }

  async openThemeMenu(tab: SettingsTab = 'account') {
    const topModal = await this.modalCtrl.getTop();
    if (topModal) {
      await this.modalCtrl.dismiss();
    }
    await this.router.navigate(['/impostazioni'], {
      queryParams: tab && tab !== 'account' ? { tab } : undefined,
    });
  }
}
