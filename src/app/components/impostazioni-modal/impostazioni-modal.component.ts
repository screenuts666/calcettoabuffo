import {
  Component,
  ChangeDetectionStrategy,
  inject,
  Input,
  OnInit,
  OnDestroy,
  signal,
  computed,
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
  mailOutline,
  personOutline,
  peopleOutline,
  personAddOutline,
  personRemoveOutline,
  trashOutline,
  shieldCheckmarkOutline,
  searchOutline,
  linkOutline,
  unlinkOutline,
} from 'ionicons/icons';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { ThemeService, AppThemeMode } from '../../services/theme.service';
import { AppUpdateService } from '../../services/app-update.service';
import { AuthService } from '../../services/auth.service';
import { SoundSettingsService, GkSoundId } from '../../services/sound-settings.service';
import { GmailIntegrationService } from '../../services/gmail-integration.service';
import { StatsEngineService } from '../../services/stats-engine.service';
import { AuthModalComponent } from '../auth-modal/auth-modal.component';
import {
  AppUserProfile,
  AuthorizedRoleDoc,
  UserRole,
  ROLE_METADATA,
} from '../../models/user-profile.model';

export type SettingsTab = 'ruoli' | 'portiere' | 'match' | 'sistema';

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
  public gmail = inject(GmailIntegrationService);
  public statsEngine = inject(StatsEngineService);
  private modalCtrl = inject(ModalController);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private router = inject(Router);

  @Input() initialTab: SettingsTab = 'portiere';

  activeTab = signal<SettingsTab>('portiere');
  readonly isDevEnvironment: boolean = !environment.production;
  readonly turnMinutesOptions = [3, 4, 5, 6, 7, 8, 10];

  // ─── STATO GESTIONE RUOLI (PRESIDENTE) ────────────────────────────────────
  memberSearchQuery = signal<string>('');
  newPreAuthEmail = signal<string>('');
  newPreAuthRole = signal<UserRole>('superuser');
  isSubmittingRole = signal<boolean>(false);

  // ─── STATO ASSOCIAZIONE SCHEDA ATLETA ──────────────────────────────────────
  selectedPlayerToLink = signal<string>('');
  isLinkingAthlete = signal<boolean>(false);

  // Streams reattivi da Firestore
  users$: Observable<AppUserProfile[]> = this.authService.getAllUsers$();
  authorizedRoles$: Observable<AuthorizedRoleDoc[]> = this.authService.getAuthorizedRoles$();

  // Giocatori liberi in rosa per l'associazione (opzionale)
  availablePlayersToLink = computed(() => {
    const list = this.statsEngine.giocatoriRaw() || [];
    const myUid = this.authService.firebaseUser()?.uid;
    return list
      .filter((g) => !g.linkedUid || (myUid && g.linkedUid === myUid))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  });

  currentLinkedPlayerName = computed(() => {
    const pid = this.authService.linkedPlayerId();
    if (!pid) return '';
    const list = this.statsEngine.giocatoriRaw() || [];
    const p = list.find((g) => g.id === pid);
    return p ? `${p.nome}${p.soprannome ? ' ("' + p.soprannome + '")' : ''}` : 'Atleta collegato';
  });

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
      mailOutline,
      personOutline,
      peopleOutline,
      personAddOutline,
      personRemoveOutline,
      trashOutline,
      shieldCheckmarkOutline,
      searchOutline,
      linkOutline,
      unlinkOutline,
    });
  }

  ngOnInit() {
    if (this.authService.isPresidente()) {
      this.activeTab.set(this.initialTab === 'portiere' ? 'ruoli' : this.initialTab);
    } else if (this.authService.isSuperUser()) {
      this.activeTab.set(this.initialTab);
    } else {
      this.activeTab.set('sistema');
    }
    this.soundSettings.unlockAudioOnUserGesture();
  }

  ngOnDestroy() {
    this.soundSettings.stopPreview();
  }

  setTab(tab: SettingsTab) {
    if (!this.authService.isSuperUser() && tab !== 'sistema') {
      this.activeTab.set('sistema');
      return;
    }
    if (tab === 'ruoli' && !this.authService.isPresidente()) {
      this.activeTab.set('portiere');
      return;
    }
    this.soundSettings.stopPreview();
    this.activeTab.set(tab);
  }

  chiudi() {
    this.soundSettings.stopPreview();
    this.modalCtrl.dismiss();
  }

  // ─── GESTIONE RUOLI (WHATSAPP-STYLE ADMIN MANAGEMENT) ─────────────────────

  filteredUsers(users: AppUserProfile[]): AppUserProfile[] {
    const q = this.memberSearchQuery().trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.displayName || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q),
    );
  }

  getRoleBadgeText(role: UserRole): string {
    return ROLE_METADATA[role]?.badgeText || role;
  }

  getInitials(text?: string): string {
    if (!text) return '?';
    const parts = text.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return text.slice(0, 2).toUpperCase();
  }

  async onAddPreAuth() {
    const email = this.newPreAuthEmail().trim();
    if (!email || !email.includes('@')) {
      await this.mostraToast('Inserisci un indirizzo email valido', 'warning');
      return;
    }

    this.isSubmittingRole.set(true);
    try {
      await this.authService.preAuthorizeEmail(email, this.newPreAuthRole());
      await this.mostraToast(
        `Email autorizzata: ${this.newPreAuthRole() === 'superuser' ? 'Mister' : 'Atleta'}`,
        'success',
      );
      this.newPreAuthEmail.set('');
    } catch (err: any) {
      await this.mostraToast(err?.message || 'Errore pre-autorizzazione', 'danger');
    } finally {
      this.isSubmittingRole.set(false);
    }
  }

  async onRevokePreAuth(email: string) {
    const alert = await this.alertCtrl.create({
      header: 'Revoca autorizzazione',
      message: `Vuoi rimuovere l'autorizzazione per ${email}?`,
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        {
          text: 'Revoca',
          role: 'destructive',
          handler: async () => {
            try {
              await this.authService.revokeAuthorizedEmail(email);
              await this.mostraToast('Autorizzazione rimossa', 'success');
            } catch (err: any) {
              await this.mostraToast(err?.message || 'Errore revoca', 'danger');
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async onPromoteToMister(u: AppUserProfile) {
    const name = u.displayName || u.email;
    const alert = await this.alertCtrl.create({
      header: 'Promuovi a Mister',
      message: `Vuoi assegnare il ruolo di Mister a ${name}? Potrà gestire convocazioni, match e pagelle.`,
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        {
          text: 'Promuovi',
          handler: async () => {
            try {
              await this.authService.promoteUserToMister(u.uid);
              await this.mostraToast(`👔 ${name} è ora Mister`, 'success');
            } catch (err: any) {
              await this.mostraToast(err?.message || 'Errore promozione', 'danger');
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async onDemoteFromMister(u: AppUserProfile) {
    const name = u.displayName || u.email;
    const alert = await this.alertCtrl.create({
      header: 'Rimuovi ruolo Mister',
      message: `Vuoi togliere il ruolo di Mister a ${name}? Tornerà a ${u.playerId ? 'Atleta' : 'Tifoso'}.`,
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        {
          text: 'Rimuovi',
          role: 'destructive',
          handler: async () => {
            try {
              await this.authService.demoteUserFromMister(u.uid, !!u.playerId);
              await this.mostraToast(`Ruolo Mister rimosso a ${name}`, 'medium');
            } catch (err: any) {
              await this.mostraToast(err?.message || 'Errore revoca ruolo', 'danger');
            }
          },
        },
      ],
    });
    await alert.present();
  }

  // ─── ASSOCIAZIONE SCHEDA ATLETA ───────────────────────────────────────────

  async collegaSchedaSelezionata() {
    const pid = this.selectedPlayerToLink();
    if (!pid) return;

    this.isLinkingAthlete.set(true);
    try {
      await this.authService.claimPlayer(pid);
      await this.mostraToast('⚽ Scheda atleta collegata con successo!', 'success');
      this.selectedPlayerToLink.set('');
    } catch (err: any) {
      await this.mostraToast(err?.message || 'Errore associazione atleta', 'danger');
    } finally {
      this.isLinkingAthlete.set(false);
    }
  }

  async scollegaSchedaAtleta() {
    const alert = await this.alertCtrl.create({
      header: 'Scollega Scheda Atleta',
      message: 'Vuoi scollegare il tuo profilo giocatore? Il tuo account resterà attivo.',
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        {
          text: 'Scollega',
          role: 'destructive',
          handler: async () => {
            try {
              await this.authService.unlinkCurrentPlayer();
              await this.mostraToast('Scheda atleta scollegata', 'medium');
            } catch (err: any) {
              await this.mostraToast(err?.message || 'Errore scollegamento', 'danger');
            }
          },
        },
      ],
    });
    await alert.present();
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
    this.chiudi();
    setTimeout(async () => {
      const modal = await this.modalCtrl.create({
        component: AuthModalComponent,
        componentProps: { initialMode: 'login' },
        mode: 'ios',
      });
      await modal.present();
    }, 150);
  }

  async logoutSuperUser() {
    await this.authService.logoutAdmin();
    await this.mostraToast('Logout effettuato', 'medium');
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
