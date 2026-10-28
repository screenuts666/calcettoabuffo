import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonButton,
  IonIcon,
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
  checkmarkCircle,
  closeOutline,
  refreshOutline,
  sparklesOutline,
} from 'ionicons/icons';
import { environment } from 'src/environments/environment';
import { ThemeService, AppThemeMode } from '../../services/theme.service';
import { AppUpdateService } from '../../services/app-update.service';

@Component({
  selector: 'app-theme-toggle',
  templateUrl: './theme-toggle.component.html',
  styleUrls: ['./theme-toggle.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, IonButton, IonIcon],
})
export class ThemeToggleComponent {
  public themeService = inject(ThemeService);
  public appUpdate = inject(AppUpdateService);
  private actionSheetCtrl = inject(ActionSheetController);
  private toastCtrl = inject(ToastController);

  readonly isDevEnvironment: boolean = !environment.production;

  constructor() {
    addIcons({
      sunny,
      sunnyOutline,
      moon,
      moonOutline,
      contrastOutline,
      settingsOutline,
      checkmarkCircle,
      closeOutline,
      refreshOutline,
      sparklesOutline,
    });
  }

  get currentIcon(): string {
    const mode = this.themeService.mode();
    if (mode === 'light') return 'sunny';
    if (mode === 'dark') return 'moon';
    return this.themeService.isDarkEffective() ? 'moon-outline' : 'sunny-outline';
  }

  get currentLabel(): string {
    const mode = this.themeService.mode();
    if (mode === 'light') return 'Tema Chiaro';
    if (mode === 'dark') return 'Tema Scuro';
    return 'Tema Automatico (Sistema)';
  }

  async openThemeMenu() {
    const currentMode = this.themeService.mode();
    const envLabel = this.isDevEnvironment ? ' · 🛠️ DEV MODE' : ' · 🟢 PROD';

    const actionSheet = await this.actionSheetCtrl.create({
      header: `Impostazioni & Versione (v${this.appUpdate.version}${envLabel})`,
      subHeader: `Build: ${this.appUpdate.buildDate} · ${this.currentLabel}`,
      mode: 'ios',
      buttons: [
        {
          text: `✨ Note di Rilascio & Novità (v${this.appUpdate.version})`,
          icon: 'sparkles-outline',
          handler: () => {
            this.appUpdate.openReleaseNotes();
          },
        },
        {
          text: `🔄 Forza Aggiornamento & Svuota Cache (v${this.appUpdate.version})`,
          icon: 'refresh-outline',
          handler: () => {
            this.appUpdate.checkForNewVersion(true);
          },
        },
        {
          text: currentMode === 'light' ? '☀️ Tema Chiaro (Attivo)' : '☀️ Tema Chiaro',
          icon: currentMode === 'light' ? 'checkmark-circle' : 'sunny-outline',
          handler: () => {
            this.setTheme('light');
          },
        },
        {
          text: currentMode === 'dark' ? '🌙 Tema Scuro (Attivo)' : '🌙 Tema Scuro',
          icon: currentMode === 'dark' ? 'checkmark-circle' : 'moon-outline',
          handler: () => {
            this.setTheme('dark');
          },
        },
        {
          text: currentMode === 'auto' ? '⚙️ Automatico / Sistema (Attivo)' : '⚙️ Automatico / Sistema',
          icon: currentMode === 'auto' ? 'checkmark-circle' : 'contrast-outline',
          handler: () => {
            this.setTheme('auto');
          },
        },
        {
          text: 'Annulla',
          icon: 'close-outline',
          role: 'cancel',
        },
      ],
    });

    await actionSheet.present();
  }

  private async setTheme(mode: AppThemeMode) {
    this.themeService.setMode(mode);

    const labels: Record<AppThemeMode, string> = {
      light: '☀️ Tema Chiaro applicato',
      dark: '🌙 Tema Scuro applicato',
      auto: '⚙️ Tema Automatico di sistema attivato',
    };

    const toast = await this.toastCtrl.create({
      message: labels[mode],
      duration: 1800,
      position: 'bottom',
      mode: 'ios',
      color: 'dark',
    });
    await toast.present();
  }
}
