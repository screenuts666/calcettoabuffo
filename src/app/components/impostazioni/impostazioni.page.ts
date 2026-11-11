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
  IonAvatar,
  ModalController,
  AlertController,
  ToastController,
} from '@ionic/angular/standalone';
import { Router, ActivatedRoute } from '@angular/router';
import { addIcons } from 'ionicons';
import {
  closeOutline,
  volumeHigh,
  volumeMute,
  play,
  stop,
  checkmarkCircle,
  sunny,
  sunnyOutline,
  moon,
  moonOutline,
  contrastOutline,
  colorPaletteOutline,
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
  personCircleOutline,
  peopleOutline,
  personAddOutline,
  personRemoveOutline,
  trashOutline,
  shieldCheckmarkOutline,
  searchOutline,
  linkOutline,
  unlinkOutline,
  createOutline,
  alertCircleOutline,
  arrowBackOutline,
  cloudDownloadOutline,
  cloudUploadOutline,
  logoGoogle,
  statsChartOutline,
  chevronForwardOutline,
  constructOutline,
  informationCircleOutline,
} from 'ionicons/icons';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { ThemeService, AppThemeMode } from '../../services/theme.service';
import { AppUpdateService } from '../../services/app-update.service';
import { AuthService } from '../../services/auth.service';
import { SoundSettingsService, GkSoundId } from '../../services/sound-settings.service';
import { StatsEngineService } from '../../services/stats-engine.service';
import { BackupRestoreService } from '../../services/backup-restore.service';
import { AuthModalComponent } from '../auth-modal/auth-modal.component';
import { PlayerAvatarComponent } from '../player-avatar/player-avatar.component';
import { Giocatore } from '../../models/giocatore.model';
import {
  AppUserProfile,
  AuthorizedRoleDoc,
  UserRole,
  ROLE_METADATA,
  isPresidenteEmail,
  isLegacySuperUserEmail,
} from '../../models/user-profile.model';

export type SettingsTab = 'account' | 'ruoli' | 'audio' | 'sistema' | 'portiere' | 'match';

@Component({
  selector: 'app-impostazioni',
  templateUrl: './impostazioni.page.html',
  styleUrls: ['./impostazioni.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    IonHeader,
    IonIcon,
    IonContent,
    IonAvatar,
    PlayerAvatarComponent,
  ],
})
export class ImpostazioniPage implements OnInit, OnDestroy {
  public themeService = inject(ThemeService);
  public appUpdate = inject(AppUpdateService);
  public authService = inject(AuthService);
  public soundSettings = inject(SoundSettingsService);
  public statsEngine = inject(StatsEngineService);
  public backupRestore = inject(BackupRestoreService);
  private modalCtrl = inject(ModalController);
  private alertCtrl = inject(AlertController);
  private toastCtrl = inject(ToastController);
  private router = inject(Router);
  private route = inject(ActivatedRoute, { optional: true });

  @Input() initialTab: SettingsTab = 'account';

  activeTab = signal<SettingsTab>('account');
  readonly isDevEnvironment: boolean = !environment.production;
  readonly turnMinutesOptions = [3, 4, 5, 6, 7, 8, 10];
  readonly isPresidenteEmail = isPresidenteEmail;
  readonly isLegacySuperUserEmail = isLegacySuperUserEmail;

  // ─── STATO PROFILO & ACCOUNT ───────────────────────────────────────────────
  readonly linkedPlayer = computed<Giocatore | null>(() => {
    const pid = this.authService.linkedPlayerId();
    if (!pid) return null;
    const all = this.statsEngine.giocatoriRaw() || [];
    return all.find((g) => g.id === pid) || null;
  });

  readonly displayName = computed<string>(() => {
    const lp = this.linkedPlayer();
    return lp?.nome || this.authService.displayName() || 'Utente';
  });

  readonly userAvatarUrl = computed<string | null>(() => {
    return this.linkedPlayer()?.fotoUrl || this.authService.photoURL() || null;
  });

  // ─── STATO GESTIONE RUOLI (PRESIDENTE) ────────────────────────────────────
  memberSearchQuery = signal<string>('');
  newPreAuthEmail = signal<string>('');
  newPreAuthRole = signal<UserRole>('superuser');
  isSubmittingRole = signal<boolean>(false);

  // ─── STATO ASSOCIAZIONE SCHEDA ATLETA ──────────────────────────────────────
  selectedPlayerToLink = signal<string>('');
  isLinkingAthlete = signal<boolean>(false);
  isExportingBackup = signal<boolean>(false);
  isSavingToDrive = signal<boolean>(false);

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
      sunnyOutline,
      moon,
      moonOutline,
      contrastOutline,
      colorPaletteOutline,
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
      personCircleOutline,
      peopleOutline,
      personAddOutline,
      personRemoveOutline,
      trashOutline,
      shieldCheckmarkOutline,
      searchOutline,
      linkOutline,
      unlinkOutline,
      createOutline,
      alertCircleOutline,
      arrowBackOutline,
      cloudDownloadOutline,
      cloudUploadOutline,
      logoGoogle,
      statsChartOutline,
      chevronForwardOutline,
      constructOutline,
      informationCircleOutline,
    });
  }

  ngOnInit() {
    const queryTab = this.route?.snapshot?.queryParams?.['tab'] as SettingsTab | undefined;
    this.applyTab(queryTab || this.initialTab || 'account');

    this.route?.queryParams?.subscribe((params) => {
      const qTab = params?.['tab'] as SettingsTab | undefined;
      if (qTab) {
        this.applyTab(qTab);
      }
    });

    this.soundSettings.unlockAudioOnUserGesture();
  }

  private applyTab(targetTab: SettingsTab) {
    if (!this.authService.isSuperUser()) {
      this.activeTab.set('account');
      return;
    }
    const normalized: SettingsTab =
      targetTab === 'portiere' || targetTab === 'match' ? 'audio' : targetTab;
    if (normalized === 'ruoli' && !this.authService.isPresidente()) {
      this.activeTab.set('account');
      return;
    }
    this.activeTab.set(normalized || 'account');
  }

  ngOnDestroy() {
    this.soundSettings.stopPreview();
  }

  setTab(tab: SettingsTab) {
    const normalized: SettingsTab =
      tab === 'portiere' || tab === 'match' ? 'audio' : tab;
    if (!this.authService.isSuperUser() && normalized !== 'account') {
      this.activeTab.set('account');
      return;
    }
    if (normalized === 'ruoli' && !this.authService.isPresidente()) {
      this.activeTab.set('account');
      return;
    }
    this.soundSettings.stopPreview();
    this.activeTab.set(normalized);
  }

  async vaiAllaMiaScheda(playerId: string) {
    await this.chiudi();
    setTimeout(() => {
      this.router.navigate(['/giocatori', playerId]);
    }, 100);
  }

  async modificaMioProfiloAtleta(playerId: string) {
    await this.chiudi();
    setTimeout(() => {
      this.router.navigate(['/giocatori', playerId, 'modifica']);
    }, 100);
  }

  async creaNuovaSchedaAtleta() {
    await this.chiudi();
    setTimeout(() => {
      this.router.navigate(['/giocatori', 'nuovo'], { queryParams: { selfClaim: '1' } });
    }, 100);
  }

  async chiudi() {
    this.soundSettings.stopPreview();
    const top = await this.modalCtrl.getTop();
    if (top) {
      await this.modalCtrl.dismiss();
    } else {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        await this.router.navigate(['/']);
      }
    }
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

  getPlayerNameById(playerId?: string | null): string {
    if (!playerId) return '';
    const g = (this.statsEngine.giocatoriRaw() || []).find((p) => p.id === playerId);
    if (!g) return playerId;
    return `${g.nome}${g.soprannome ? ' ("' + g.soprannome + '")' : ''}`;
  }

  async onModificaSchedaAtleta(u: AppUserProfile) {
    if (!this.authService.isPresidente()) return;
    const allPlayers = [...(this.statsEngine.giocatoriRaw() || [])].sort((a, b) =>
      (a.nome || '').localeCompare(b.nome || '')
    );

    const inputs = allPlayers.map((p) => {
      const isMine = p.id === u.playerId;
      const isTaken = !!p.linkedUid && p.linkedUid !== u.uid;
      const sub = p.soprannome ? ` (${p.soprannome})` : '';
      const tag = isMine ? ' [Attuale]' : isTaken ? ' [Associato ad altro]' : '';
      return {
        name: 'selectedPlayer',
        type: 'radio' as const,
        label: `${p.nome}${sub}${tag}`,
        value: p.id,
        checked: isMine,
      };
    });

    const alert = await this.alertCtrl.create({
      header: 'Associa Scheda Atleta',
      subHeader: u.displayName || u.email,
      message: 'Seleziona il giocatore in rosa da collegare a questo account:',
      inputs,
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        ...(u.playerId
          ? [
              {
                text: 'Scollega Scheda',
                role: 'destructive',
                handler: async () => {
                  await this.onScollegaSchedaAtleta(u);
                },
              },
            ]
          : []),
        {
          text: 'Salva Associazione',
          handler: async (selectedPlayerId: string) => {
            if (!selectedPlayerId) return;
            try {
              await this.authService.assignPlayerToUser(u, selectedPlayerId);
              await this.mostraToast(
                `⚽ Scheda "${this.getPlayerNameById(selectedPlayerId)}" associata a ${u.displayName || u.email}`,
                'success'
              );
            } catch (err: any) {
              await this.mostraToast(err?.message || 'Errore associazione scheda', 'danger');
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async onScollegaSchedaAtleta(u: AppUserProfile) {
    if (!this.authService.isPresidente() || !u.playerId) return;
    const playerName = this.getPlayerNameById(u.playerId);
    const alert = await this.alertCtrl.create({
      header: 'Scollega Scheda Atleta',
      message: `Vuoi scollegare la scheda di "${playerName}" dall'account ${u.displayName || u.email}?\n\nL'account rimarrà attivo e la scheda rimarrà nella rosa con tutte le sue statistiche.`,
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        {
          text: 'Scollega',
          role: 'destructive',
          handler: async () => {
            try {
              await this.authService.unlinkPlayerFromUser(u);
              await this.mostraToast(`Scheda di ${playerName} scollegata`, 'medium');
            } catch (err: any) {
              await this.mostraToast(err?.message || 'Errore scollegamento', 'danger');
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async onEliminaAccount(u: AppUserProfile) {
    if (!this.authService.isPresidente()) return;
    if (u.role === 'presidente' || isPresidenteEmail(u.email)) {
      await this.mostraToast("Non puoi eliminare l'account del Presidente.", 'warning');
      return;
    }
    const myUid = this.authService.firebaseUser()?.uid;
    if (u.uid === myUid) {
      await this.mostraToast('Non puoi eliminare il tuo stesso account.', 'warning');
      return;
    }

    const alert = await this.alertCtrl.create({
      header: '⚠️ Elimina Account Utente',
      subHeader: u.displayName || u.email,
      message: `Sei sicuro di voler eliminare definitivamente questo account?\n\n⚠️ OCCHIO: Verrà eliminato SOLO l'account di accesso. La scheda del giocatore associata NON verrà cancellata ma solo scollegata.`,
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        {
          text: 'Elimina Account',
          role: 'destructive',
          handler: async () => {
            try {
              await this.authService.deleteUserAccount(u);
              await this.mostraToast(
                `🗑️ Account di ${u.displayName || u.email} eliminato. La scheda giocatore è rimasta in rosa.`,
                'medium'
              );
            } catch (err: any) {
              await this.mostraToast(err?.message || 'Errore eliminazione account', 'danger');
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

  async salvaBackupSuGoogleDrive() {
    this.isSavingToDrive.set(true);
    try {
      const res = await this.backupRestore.uploadBackupToGoogleDrive();
      const alert = await this.alertCtrl.create({
        header: 'Backup su Google Drive',
        message: `Backup salvato con successo nella cartella "${res.folderName}" del tuo account Google Drive (${res.filename}).`,
        buttons: [
          ...(res.webViewLink
            ? [
                {
                  text: 'Visualizza in Drive',
                  handler: () => {
                    window.open(res.webViewLink, '_blank', 'noopener,noreferrer');
                  },
                },
              ]
            : []),
          { text: 'OK', role: 'cancel' },
        ],
      });
      await alert.present();
    } catch (err: any) {
      await this.mostraToast(err?.message || 'Errore salvataggio su Drive', 'danger');
    } finally {
      this.isSavingToDrive.set(false);
    }
  }

  async scaricaBackupDatabase() {
    this.isExportingBackup.set(true);
    try {
      const res = await this.backupRestore.exportDatabaseSnapshot();
      await this.mostraToast(`💾 Backup salvato: ${res.filename}`, 'success');
    } catch (err: any) {
      await this.mostraToast(err?.message || 'Errore durante il backup', 'danger');
    } finally {
      this.isExportingBackup.set(false);
    }
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
