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
  logOutOutline,
  logInOutline,
  footballOutline,
  closeOutline,
} from 'ionicons/icons';
import { environment } from 'src/environments/environment';
import { ThemeService } from '../../services/theme.service';
import { AppUpdateService } from '../../services/app-update.service';
import { AuthService } from '../../services/auth.service';
import { StatsEngineService } from '../../services/stats-engine.service';
import { Giocatore } from '../../models/giocatore.model';
import { ImpostazioniModalComponent } from '../impostazioni-modal/impostazioni-modal.component';
import { AuthModalComponent, AuthModalView } from '../auth-modal/auth-modal.component';
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
      logOutOutline,
      logInOutline,
      footballOutline,
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

  /**
   * Click sul badge Utente nell'Header:
   * - Se NON è loggato: apre direttamente il modale di Login / Registrazione (Email + Google)
   * - Se è loggato: apre il moderno bottom sheet con profilo, scheda atleta, area mister, impostazioni e logout
   */
  async onUserHeaderClick() {
    if (!this.authService.isLoggedIn()) {
      await this.openAuthModal('login');
      return;
    }

    const modal = await this.modalCtrl.create({
      component: UserMenuModalComponent,
      breakpoints: [0, 0.78, 1],
      initialBreakpoint: 0.78,
      handle: true,
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

  async openAuthModal(
    initialMode: AuthModalView = 'login',
    openClaimPicker = false
  ) {
    const modal = await this.modalCtrl.create({
      component: AuthModalComponent,
      componentProps: { initialMode, openClaimPicker },
      mode: 'ios',
    });
    await modal.present();
    const { data } = await modal.onWillDismiss();
    if (data === 'open-settings') {
      await this.openThemeMenu();
    }
  }

  async openThemeMenu() {
    const modal = await this.modalCtrl.create({
      component: ImpostazioniModalComponent,
      mode: 'ios',
    });
    await modal.present();
  }
}
