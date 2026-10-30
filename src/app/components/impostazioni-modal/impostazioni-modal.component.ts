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
  cloudDoneOutline,
  syncOutline,
} from 'ionicons/icons';
import { environment } from 'src/environments/environment';
import { ThemeService, AppThemeMode } from '../../services/theme.service';
import { AppUpdateService } from '../../services/app-update.service';
import { AuthService } from '../../services/auth.service';
import { SoundSettingsService, GkSoundId } from '../../services/sound-settings.service';

export type SettingsTab = 'portiere' | 'match' | 'sistema';

@Component({
  selector: 'app-impostazioni-modal',
  templateUrl: './impostazioni-modal.component.html',
  styleUrls: ['./impostazioni-modal.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    IonHeader,
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
      cloudDoneOutline,
      syncOutline,
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

  async selezionaSuonoPortiere(id: GkSoundId) {
    if (!this.authService.isAdmin()) {
      this.mostraToast('🔒 Solo il Super User può modificare il suono ufficiale', 'warning');
      return;
    }
    await this.soundSettings.updateConfig({ selectedGkSoundId: id });
    const preset = this.soundSettings.gkPresets.find((p) => p.id === id);
    if (preset) {
      this.mostraToast(`${preset.emoji} Scelto: ${preset.name} (salvato nel cloud)`, 'success');
    }
  }

  toggleAnteprimaSuono(id: GkSoundId, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.soundSettings.togglePreviewGkSound(id);
  }

  async toggleVoiceAnnouncement() {
    if (!this.authService.isAdmin()) return;
    const next = !this.soundSettings.config().voiceAnnouncement;
    await this.soundSettings.updateConfig({ voiceAnnouncement: next });
    this.mostraToast(
      next ? '🗣️ Speaker vocale portieri attivato' : '🔇 Speaker vocale disattivato',
      'success'
    );
  }

  async toggleVibrationAlert() {
    if (!this.authService.isAdmin()) return;
    const next = !this.soundSettings.config().vibrationAlert;
    await this.soundSettings.updateConfig({ vibrationAlert: next });
    this.mostraToast(
      next ? '📳 Vibrazione emergenza attivata' : '📴 Vibrazione emergenza disattivata',
      'success'
    );
  }

  async setTurnMinutes(min: number) {
    if (!this.authService.isAdmin()) return;
    await this.soundSettings.updateConfig({ gkTurnMinutes: min });
    this.mostraToast(`⏱️ Turno portieri impostato a ${min} minuti (salvato nel cloud)`, 'success');
  }

  async ripristinaDefaultAudio() {
    await this.soundSettings.resetToDefaults();
    await this.mostraToast('🔄 Impostazioni audio ripristinate ai valori di fabbrica', 'success');
  }

  // ─── GESTIONE EFFETTI MATCH & FISCHIETTO ──────────────────────────────────

  async toggleMatchWhistleEffects() {
    if (!this.authService.isAdmin()) return;
    const next = !this.soundSettings.config().matchWhistleEffects;
    await this.soundSettings.updateConfig({ matchWhistleEffects: next });
    this.mostraToast(
      next ? '🏁 Fischi arbitro attivati' : '🏁 Fischi arbitro disattivati',
      'success'
    );
  }

  async toggleGoalSoundEffects() {
    if (!this.authService.isAdmin()) return;
    const next = !this.soundSettings.config().goalSoundEffects;
    await this.soundSettings.updateConfig({ goalSoundEffects: next });
    this.mostraToast(
      next ? '🎺 Fanfara celebrazione gol attivata' : '🎺 Celebrazione gol disattivata',
      'success'
    );
  }

  async toggleAutogoalSoundEffects() {
    if (!this.authService.isAdmin()) return;
    const next = !this.soundSettings.config().autogoalSoundEffects;
    await this.soundSettings.updateConfig({ autogoalSoundEffects: next });
    this.mostraToast(
      next ? '🎷 Trombone autogol attivato' : '🎷 Trombone autogol disattivato',
      'success'
    );
  }

  testaEffetto(effectId: 'whistle_kickoff' | 'whistle_final' | 'goal_celebration' | 'sad_trombone') {
    if (this.soundSettings.previewingEffectId() === effectId) {
      this.soundSettings.stopEffect();
    } else {
      this.soundSettings.playEffect(effectId);
    }
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

  cycleTheme() {
    const current = this.themeService.mode();
    const next: AppThemeMode =
      current === 'dark' ? 'light' : current === 'light' ? 'auto' : 'dark';
    this.setTheme(next);
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

