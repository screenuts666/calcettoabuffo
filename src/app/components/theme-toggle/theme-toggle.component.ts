import {
  Component,
  inject,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonButton,
  IonIcon,
  ModalController,
  ActionSheetController,
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

@Component({
  selector: 'app-theme-toggle',
  templateUrl: './theme-toggle.component.html',
  styleUrls: ['./theme-toggle.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, IonButton, IonIcon, PlayerAvatarComponent],
})
export class ThemeToggleComponent {
  public themeService = inject(ThemeService);
  public appUpdate = inject(AppUpdateService);
  public authService = inject(AuthService);
  public statsEngine = inject(StatsEngineService);
  private modalCtrl = inject(ModalController);
  private actionSheetCtrl = inject(ActionSheetController);
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
   * - Se è loggato: apre il menu rapido con "La mia scheda", "Area Segreta" (solo Mister), "Profilo & Ruoli", "Impostazioni" e "Logout"
   */
  async onUserHeaderClick() {
    if (!this.authService.isLoggedIn()) {
      await this.openAuthModal('login');
      return;
    }

    const roleMeta = this.authService.roleMeta();
    const myPlayer = this.linkedPlayer();
    const buttons: any[] = [];

    // 1. Link a "La mia scheda" (se ha un playerId associato: Atleta o Mister-Giocatore)
    //    oppure "Associa il tuo Giocatore"
    if (myPlayer) {
      buttons.push({
        text: `👤 La mia scheda (${myPlayer.nome})`,
        icon: 'person-outline',
        handler: () => {
          this.router.navigate(['/giocatori', myPlayer.id]);
        },
      });
      buttons.push({
        text: '✏️ Modifica la mia scheda',
        icon: 'create-outline',
        handler: () => {
          this.router.navigate(['/giocatori', myPlayer.id, 'modifica']);
        },
      });
    } else {
      buttons.push({
        text: this.authService.isSuperUser()
          ? '⚽ Associa anche il tuo Giocatore (Opzionale Mister)'
          : '🙋‍♂️ Sei già in Rosa? Reclama il tuo Giocatore',
        icon: 'football-outline',
        handler: () => {
          this.openAuthModal('login', true);
        },
      });
      buttons.push({
        text: '➕ Non sei ancora in Rosa? Crea la tua Scheda',
        icon: 'create-outline',
        handler: () => {
          this.router.navigate(['/giocatori', 'nuovo'], {
            queryParams: { selfClaim: '1' },
          });
        },
      });
    }

    // 2. Link a "Area Segreta" (ESCLUSIVAMENTE per il Mister / superuser)
    if (this.authService.isSuperUser()) {
      buttons.push({
        text: '🔬 Area Segreta (Motore MMR & Raggi X)',
        icon: 'shield-checkmark',
        handler: () => {
          this.router.navigate(['/area-segreta']);
        },
      });
    }

    // 3. Riepilogo Profilo / Gestione Utenti
    buttons.push({
      text: this.authService.isSuperUser()
        ? '👑 Pannello Profilo & Gestione Ruoli'
        : '🛡️ Il mio Account & Ruolo',
      icon: 'person-circle-outline',
      handler: () => {
        this.openAuthModal('login');
      },
    });

    // 4. Impostazioni Audio & Tema
    buttons.push({
      text: this.authService.isSuperUser()
        ? '⚙️ Impostazioni Audio & Tema'
        : '⚙️ Impostazioni & Tema',
      icon: 'settings-outline',
      handler: () => {
        this.openThemeMenu();
      },
    });

    // 5. Logout
    buttons.push({
      text: '🚪 Esci (Logout)',
      icon: 'log-out-outline',
      role: 'destructive',
      handler: async () => {
        await this.authService.logout();
        const toast = await this.toastCtrl.create({
          message: 'Logout effettuato.',
          duration: 2000,
          position: 'bottom',
          mode: 'ios',
          color: 'medium',
        });
        await toast.present();
      },
    });

    buttons.push({
      text: 'Chiudi',
      icon: 'close-outline',
      role: 'cancel',
    });

    const subHeaderRole =
      this.authService.isSuperUser() && myPlayer
        ? `${roleMeta.badgeText} · ⚽ ${myPlayer.nome}`
        : `${roleMeta.badgeText} · ${this.authService.firebaseUser()?.email || ''}`;

    const sheet = await this.actionSheetCtrl.create({
      header: myPlayer?.nome || this.authService.displayName(),
      subHeader: subHeaderRole,
      mode: 'ios',
      buttons,
    });
    await sheet.present();
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
