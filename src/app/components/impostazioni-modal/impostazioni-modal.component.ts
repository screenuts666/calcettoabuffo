import {
  Component,
  ChangeDetectionStrategy,
  inject,
  Input,
  OnInit,
  OnDestroy,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
  ModalController,
  AlertController,
  ToastController,
} from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { addIcons } from 'ionicons';
import {
  closeOutline,
  volumeHigh,
  volumeMute,
  play,
  stop,
  checkmarkCircle,
  sunny,
  moon,
  contrastOutline,
  sparklesOutline,
  refreshOutline,
  shieldCheckmark,
  flame,
  musicalNotes,
  megaphoneOutline,
  pulseOutline,
  timerOutline,
  footballOutline,
  settingsOutline,
  lockClosedOutline,
  logOutOutline,
  flash,
  notificationsOutline,
} from 'ionicons/icons';
import { environment } from 'src/environments/environment';
import { ThemeService, AppThemeMode } from '../../services/theme.service';
import { AppUpdateService } from '../../services/app-update.service';
import { AuthService } from '../../services/auth.service';
import {
  SoundSettingsService,
  GkSoundId,
  GoalSoundId,
  QuickSoundboardId,
} from '../../services/sound-settings.service';

export type SettingsTab = 'portiere' | 'effetti' | 'sistema';

@Component({
  selector: 'app-impostazioni-modal',
  templateUrl: './impostazioni-modal.component.html',
  styleUrls: ['./impostazioni-modal.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
  ],
})
export class ImpostazioniModalComponent implements OnInit, OnDestroy {
  public themeService = inject(ThemeService);
  public appUpdate = inject(AppUpdateService);
  public authService = inject(AuthService);
  public soundSettings = inject(SoundSettingsService);
  private modalCtrl = inject(ModalController);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private router = inject(Router);

  @Input() initialTab: SettingsTab = 'portiere';

  activeTab = signal<SettingsTab>('portiere');
  readonly isDevEnvironment: boolean = !environment.production;
  readonly turnMinutesOptions = [3, 4, 5, 6, 7, 8, 10];

  constructor() {
    addIcons({
      closeOutline,
      volumeHigh,
      volumeMute,
      play,
      stop,
      checkmarkCircle,
      sunny,
      moon,
      contrastOutline,
      sparklesOutline,
      refreshOutline,
      shieldCheckmark,
      flame,
      musicalNotes,
      megaphoneOutline,
      pulseOutline,
      timerOutline,
      footballOutline,
      settingsOutline,
      lockClosedOutline,
      logOutOutline,
      flash,
      notificationsOutline,
    });
  }

  ngOnInit() {
    if (!this.authService.isAdmin() && this.initialTab === 'portiere') {
      this.activeTab.set('sistema');
    } else {
      this.activeTab.set(this.initialTab);
    }
    this.soundSettings.unlockAudioOnUserGesture();
  }

  ngOnDestroy() {
    this.soundSettings.stopPreview();
  }

  setTab(tab: SettingsTab) {
    this.soundSettings.stopPreview();
    this.activeTab.set(tab);
  }

  chiudi() {
    this.soundSettings.stopPreview();
    this.modalCtrl.dismiss();
  }

  // ─── GESTIONE SUONO CAMBIO PORTIERE ────────────────────────────────────────

  selezionaSuonoPortiere(id: GkSoundId) {
    if (!this.authService.isAdmin()) {
      this.mostraToast('🔒 Solo il Super User può modificare il suono ufficiale', 'warning');
      return;
    }
    this.soundSettings.selectGkSound(id);
    const preset = this.soundSettings.gkPresets.find((p) => p.id === id);
    if (preset) {
      this.mostraToast(`${preset.emoji} Scelto: ${preset.name}`, 'success');
    }
  }

  toggleAnteprimaSuono(id: GkSoundId, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.soundSettings.togglePreviewGkSound(id);
  }

  toggleTurboBoost() {
    if (!this.authService.isAdmin()) return;
    const next = !this.soundSettings.config().turboVolumeBoost;
    this.soundSettings.updateConfig({ turboVolumeBoost: next });
    this.mostraToast(
      next
        ? '🔥 Turbo Boost Volume Massimo ATTIVATO!'
        : '🔉 Turbo Boost disattivato',
      next ? 'success' : 'medium'
    );
  }

  toggleVoiceAnnouncement() {
    if (!this.authService.isAdmin()) return;
    const next = !this.soundSettings.config().voiceAnnouncement;
    this.soundSettings.updateConfig({ voiceAnnouncement: next });
  }

  toggleVibrationAlert() {
    if (!this.authService.isAdmin()) return;
    const next = !this.soundSettings.config().vibrationAlert;
    this.soundSettings.updateConfig({ vibrationAlert: next });
  }

  setTurnMinutes(min: number) {
    if (!this.authService.isAdmin()) return;
    this.soundSettings.updateConfig({ gkTurnMinutes: min });
    this.mostraToast(`⏱️ Turno portieri impostato a ${min} minuti`, 'success');
  }

  togglePreAlert30Sec() {
    if (!this.authService.isAdmin()) return;
    const next = !this.soundSettings.config().preAlert30Sec;
    this.soundSettings.updateConfig({ preAlert30Sec: next });
    if (next) {
      this.soundSettings.playPreAlert30SecBeep();
    }
  }

  // ─── EFFETTI PARTITA & SOUNDBOARD ──────────────────────────────────────────

  selezionaGoalSound(id: GoalSoundId) {
    if (!this.authService.isAdmin()) return;
    this.soundSettings.updateConfig({ goalSoundId: id });
    if (id !== 'none') {
      this.soundSettings.playGoalPresetById(id);
    }
  }

  provaGoalSound(id: GoalSoundId, event: Event) {
    event.stopPropagation();
    this.soundSettings.playGoalPresetById(id);
  }

  toggleAutogoalSound() {
    if (!this.authService.isAdmin()) return;
    const next = !this.soundSettings.config().autogoalSoundEffect;
    this.soundSettings.updateConfig({ autogoalSoundEffect: next });
    if (next) {
      this.soundSettings.playSadTrombone();
    }
  }

  toggleMatchWhistles() {
    if (!this.authService.isAdmin()) return;
    const next = !this.soundSettings.config().matchWhistleEffects;
    this.soundSettings.updateConfig({ matchWhistleEffects: next });
    if (next) {
      this.soundSettings.playMatchWhistle('kickoff');
    }
  }

  suonaSoundboard(id: QuickSoundboardId) {
    this.soundSettings.playQuickSoundboard(id);
  }

  async ripristinaDefaultAudio() {
    this.soundSettings.resetToDefaults();
    await this.mostraToast('🔄 Impostazioni audio riportate ai valori consigliati', 'success');
  }

  // ─── TEMA & SISTEMA ────────────────────────────────────────────────────────

  async setTheme(mode: AppThemeMode) {
    this.themeService.setMode(mode);
    const labels: Record<AppThemeMode, string> = {
      light: '☀️ Tema Chiaro applicato',
      dark: '🌙 Tema Scuro applicato',
      auto: '⚙️ Tema Automatico di sistema attivato',
    };
    await this.mostraToast(labels[mode], 'dark');
  }

  apriNoteDiRilascio() {
    this.chiudi();
    setTimeout(() => {
      this.appUpdate.openReleaseNotes();
    }, 200);
  }

  forzaAggiornamentoApp() {
    this.chiudi();
    setTimeout(() => {
      this.appUpdate.checkForNewVersion(true);
    }, 200);
  }

  apriAreaSegreta() {
    this.chiudi();
    setTimeout(() => {
      this.router.navigate(['/area-segreta']);
    }, 150);
  }

  async promptLoginSuperUser() {
    const alert = await this.alertCtrl.create({
      header: '👑 Accesso Super User',
      subHeader: 'Inserisci le credenziali Admin per gestire suoni, partite e motore MMR',
      inputs: [
        { name: 'email', type: 'email', placeholder: 'Email Admin' },
        { name: 'password', type: 'password', placeholder: 'Password' },
      ],
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        {
          text: 'Entra',
          handler: async (res) => {
            try {
              await this.authService.loginAdmin(res.email, res.password);
              this.activeTab.set('portiere');
              await this.mostraToast('Benvenuto Boss! 🕶️ Controlli Super User sbloccati', 'success');
            } catch {
              await this.mostraToast('❌ Credenziali errate', 'danger');
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async logoutSuperUser() {
    await this.authService.logoutAdmin();
    await this.mostraToast('Logout Super User effettuato', 'medium');
  }

  private async mostraToast(
    message: string,
    color: 'success' | 'warning' | 'danger' | 'dark' | 'medium' = 'success'
  ) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2000,
      position: 'bottom',
      mode: 'ios',
      color,
    });
    await toast.present();
  }
}

