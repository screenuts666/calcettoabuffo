import {
  Component,
  inject,
  computed,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonIcon,
  ModalController,
  ToastController,
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
  closeOutline,
} from 'ionicons/icons';
import { environment } from 'src/environments/environment';
import { ThemeService } from '../../services/theme.service';
import { AppUpdateService } from '../../services/app-update.service';
import { AuthService } from '../../services/auth.service';
import { StatsEngineService } from '../../services/stats-engine.service';
import { Giocatore } from '../../models/giocatore.model';
import {
  ImpostazioniModalComponent,
  SettingsTab,
} from '../impostazioni-modal/impostazioni-modal.component';
import {
  AuthModalComponent,
  AuthModalView,
} from '../auth-modal/auth-modal.component';
import { PlayerAvatarComponent } from '../player-avatar/player-avatar.component';
import {
  UserMenuModalComponent,
  UserMenuActionResult,
} from '../user-menu-modal/user-menu-modal.component';

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
  private toastCtrl = inject(ToastController);
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

  readonly isDesktopMenuOpen = signal<boolean>(false);

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
      closeOutline,
    });
  }

  get currentIcon(): string {
    const mode = this.themeService.mode();
    if (mode === 'light') return 'sunny';
    if (mode === 'dark') return 'moon';
    return this.themeService.isDarkEffective()
      ? 'moon-outline'
      : 'sunny-outline';
  }

  closeDesktopMenu() {
    this.isDesktopMenuOpen.set(false);
  }

  /**
   * Click sul badge Utente nell'Header:
   * - Se NON è loggato: apre direttamente il modale di Login / Registrazione
   * - Su Desktop: apre/chiude il menu a discesa nativo ancorato all'avatar (ZERO MODALI!)
   * - Su Mobile: apre il bottom sheet con profilo completo
   */
  async onUserHeaderClick(event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    if (!this.authService.isLoggedIn()) {
      await this.openAuthModal('login');
      return;
    }

    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;
    const modal = await this.modalCtrl.create({
      component: UserMenuModalComponent,
      breakpoints: isDesktop ? undefined : [0, 0.78, 1],
      initialBreakpoint: isDesktop ? undefined : 0.78,
      handle: !isDesktop,
      mode: 'ios',
      cssClass: 'user-menu-sheet-modal',
    });
    await modal.present();

    const { data } = await modal.onWillDismiss<UserMenuActionResult>();
    if (!data) return;

    if (data.type === 'navigate') {
      await this.router.navigate(data.url, { queryParams: data.queryParams });
    } else if (data.type === 'auth') {
      await this.openAuthModal('login', data.openClaimPicker);
    } else if (data.type === 'settings') {
      await this.openThemeMenu();
    } else if (data.type === 'logout') {
      await this.authService.logout();
      const toast = await this.toastCtrl.create({
        message: 'Logout effettuato.',
        duration: 2000,
        position: 'bottom',
        mode: 'ios',
        color: 'medium',
      });
      await toast.present();
    }
  }

  async navigaDaDropdown(url: any[], queryParams?: any) {
    this.closeDesktopMenu();
    await this.router.navigate(url, { queryParams });
  }

  async apriClaimDaDropdown() {
    this.closeDesktopMenu();
    await this.openAuthModal('login', true);
  }

  async eseguiLogoutDaDropdown() {
    this.closeDesktopMenu();
    await this.authService.logout();
    const toast = await this.toastCtrl.create({
      message: 'Logout effettuato.',
      duration: 2000,
      position: 'bottom',
      mode: 'ios',
      color: 'medium',
    });
    await toast.present();
  }

  async openAuthModal(
    initialMode: AuthModalView = 'login',
    openClaimPicker = false,
  ) {
    const isDesktop = window.innerWidth >= 768;
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
      await this.openThemeMenu();
    }
  }

  async openThemeMenu(tab?: SettingsTab) {
    if (window.innerWidth >= 768) {
      await this.router.navigate(['/impostazioni'], {
        queryParams: tab ? { tab } : undefined,
      });
      return;
    }
    const modal = await this.modalCtrl.create({
      component: ImpostazioniModalComponent,
      componentProps: tab ? { initialTab: tab } : undefined,
      mode: 'ios',
    });
    await modal.present();
  }
}
