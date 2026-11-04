import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  Input,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonContent,
  IonIcon,
  IonSpinner,
  ModalController,
  ToastController,
  AlertController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  closeOutline,
  personCircleOutline,
  logInOutline,
  personAddOutline,
  logOutOutline,
  shieldCheckmark,
  footballOutline,
  createOutline,
  personOutline,
  settingsOutline,
  searchOutline,
  checkmarkCircle,
  lockClosedOutline,
  linkOutline,
  unlinkOutline,
  peopleOutline,
  logoGoogle,
  mailOutline,
  keyOutline,
} from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';
import { StatsEngineService } from '../../services/stats-engine.service';
import { Giocatore } from '../../models/giocatore.model';
import {
  AppUserProfile,
  ROLE_METADATA,
  UserRole,
  isLegacySuperUserEmail,
} from '../../models/user-profile.model';
import { PlayerAvatarComponent } from '../player-avatar/player-avatar.component';

export type AuthModalView = 'login' | 'register';

@Component({
  selector: 'app-auth-modal',
  templateUrl: './auth-modal.component.html',
  styleUrls: ['./auth-modal.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonContent,
    IonIcon,
    IonSpinner,
    PlayerAvatarComponent,
  ],
})
export class AuthModalComponent implements OnInit {
  public authService = inject(AuthService);
  public statsEngine = inject(StatsEngineService);
  private modalCtrl = inject(ModalController);
  private toastCtrl = inject(ToastController);
  private alertCtrl = inject(AlertController);
  private router = inject(Router);

  @Input() initialMode: AuthModalView = 'login';
  @Input() openClaimPicker = false;

  authMode = signal<AuthModalView>('login');
  email = signal<string>('');
  password = signal<string>('');
  displayName = signal<string>('');
  errorMessage = signal<string | null>(null);
  isSubmitting = signal<boolean>(false);

  // Ricerca e selezione giocatore da associare ("Sono io!")
  showPlayerPicker = signal<boolean>(false);
  playerSearchQuery = signal<string>('');
  isClaimingId = signal<string | null>(null);

  // Gestione Utenti per il Mister (`superuser`)
  showUsersManager = signal<boolean>(false);
  allUsers = signal<AppUserProfile[]>([]);
  isLoadingUsers = signal<boolean>(false);

  readonly ROLE_METADATA = ROLE_METADATA;
  readonly isLegacySuperUserEmail = isLegacySuperUserEmail;

  /** Scheda del giocatore attualmente collegato all'utente loggato (Atleta o Mister-Giocatore) */
  readonly linkedPlayer = computed<Giocatore | null>(() => {
    const pid = this.authService.linkedPlayerId();
    if (!pid) return null;
    const all = this.statsEngine.giocatoriRaw() || [];
    return all.find((g) => g.id === pid) || null;
  });

  /** Lista giocatori filtrata per l'associazione profilo */
  readonly filteredPlayers = computed<Giocatore[]>(() => {
    const list = [...(this.statsEngine.giocatoriRaw() || [])].sort((a, b) =>
      (a.nome || '').localeCompare(b.nome || '')
    );
    const q = this.playerSearchQuery().toLowerCase().trim();
    if (!q) return list;
    return list.filter(
      (g) =>
        (g.nome || '').toLowerCase().includes(q) ||
        (g.soprannome || '').toLowerCase().includes(q) ||
        (g.soprannomeAi || '').toLowerCase().includes(q)
    );
  });

  constructor() {
    addIcons({
      closeOutline,
      personCircleOutline,
      logInOutline,
      personAddOutline,
      logOutOutline,
      shieldCheckmark,
      footballOutline,
      createOutline,
      personOutline,
      settingsOutline,
      searchOutline,
      checkmarkCircle,
      lockClosedOutline,
      linkOutline,
      unlinkOutline,
      peopleOutline,
      logoGoogle,
      mailOutline,
      keyOutline,
    });
  }

  ngOnInit() {
    this.authMode.set(this.initialMode);
    if (this.openClaimPicker) {
      this.showPlayerPicker.set(true);
    }
  }

  chiudi(result?: string) {
    this.modalCtrl.dismiss(result);
  }

  setAuthMode(mode: AuthModalView) {
    this.errorMessage.set(null);
    this.authMode.set(mode);
  }

  async submitEmailForm() {
    this.errorMessage.set(null);
    const mail = this.email().trim();
    const pass = this.password();

    if (!mail || !pass) {
      this.errorMessage.set('Inserisci email e password.');
      return;
    }

    if (this.authMode() === 'register' && pass.length < 6) {
      this.errorMessage.set('La password deve contenere almeno 6 caratteri.');
      return;
    }

    this.isSubmitting.set(true);
    try {
      if (this.authMode() === 'login') {
        await this.authService.loginWithEmail(mail, pass);
        await this.mostraToast(
          `Benvenuto ${this.authService.displayName()}! (${this.authService.roleMeta().badgeText})`,
          'success'
        );
      } else {
        await this.authService.registerWithEmail(
          mail,
          pass,
          this.displayName()
        );
        this.showPlayerPicker.set(true);
        await this.mostraToast(
          'Registrazione completata! Ora puoi associare il tuo profilo giocatore.',
          'success'
        );
      }
      this.password.set('');
    } catch (err: any) {
      this.errorMessage.set(this.formatFirebaseAuthError(err));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async loginConGoogle() {
    this.errorMessage.set(null);
    this.isSubmitting.set(true);
    try {
      await this.authService.loginWithGoogle();
      if (!this.authService.hasLinkedPlayer()) {
        this.showPlayerPicker.set(true);
      }
      await this.mostraToast(
        `Accesso effettuato come ${this.authService.displayName()} (${this.authService.roleMeta().badgeText})`,
        'success'
      );
    } catch (err: any) {
      const msg = this.formatFirebaseAuthError(err);
      if (msg) {
        this.errorMessage.set(msg);
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async reclamaGiocatore(giocatore: Giocatore) {
    if (!giocatore?.id || this.isClaimingId()) return;

    const currentUid = this.authService.firebaseUser()?.uid;
    if (
      giocatore.linkedUid &&
      giocatore.linkedUid !== currentUid &&
      !this.authService.isSuperUser()
    ) {
      await this.mostraToast(
        '🔒 Questo giocatore è già stato associato a un altro account.',
        'warning'
      );
      return;
    }

    this.isClaimingId.set(giocatore.id);
    try {
      await this.authService.claimPlayer(giocatore.id);
      this.showPlayerPicker.set(false);
      const roleInfo = this.authService.isSuperUser()
        ? '👑 Mister & ⚽ Giocatore'
        : '⚽ Atleta';
      await this.mostraToast(
        `✅ Profilo associato a ${giocatore.nome} (${roleInfo})!`,
        'success'
      );
    } catch (err: any) {
      await this.mostraToast(
        err?.message || 'Errore durante l\'associazione del giocatore.',
        'danger'
      );
    } finally {
      this.isClaimingId.set(null);
    }
  }

  async scollegaMioGiocatore() {
    if (!this.authService.isSuperUser()) return;
    try {
      await this.authService.unlinkMyPlayer();
      await this.mostraToast(
        'Giocatore scollegato dal tuo profilo Mister.',
        'medium'
      );
    } catch (err: any) {
      await this.mostraToast(
        err?.message || 'Errore durante lo scollegamento.',
        'danger'
      );
    }
  }

  vaiAllaMiaScheda() {
    const pid = this.authService.linkedPlayerId();
    if (!pid) return;
    this.chiudi();
    setTimeout(() => {
      this.router.navigate(['/giocatori', pid]);
    }, 150);
  }

  modificaLaMiaScheda() {
    const pid = this.authService.linkedPlayerId();
    if (!pid) return;
    this.chiudi();
    setTimeout(() => {
      this.router.navigate(['/giocatori', pid, 'modifica']);
    }, 150);
  }

  creaMioGiocatoreInRosa() {
    this.chiudi();
    setTimeout(() => {
      this.router.navigate(['/giocatori', 'nuovo'], {
        queryParams: { selfClaim: '1' },
      });
    }, 150);
  }

  apriAreaSegreta() {
    if (!this.authService.isSuperUser()) return;
    this.chiudi();
    setTimeout(() => {
      this.router.navigate(['/area-segreta']);
    }, 150);
  }

  apriImpostazioniApp() {
    this.chiudi('open-settings');
  }

  async eseguiLogout() {
    await this.authService.logout();
    this.showPlayerPicker.set(false);
    this.showUsersManager.set(false);
    await this.mostraToast('Hai effettuato il logout.', 'medium');
  }

  // ─── GESTIONE UTENTI & RUOLI (SOLO MISTER) ─────────────────────────────────

  async toggleUsersManager() {
    const next = !this.showUsersManager();
    this.showUsersManager.set(next);
    if (next) {
      await this.caricaUtentiRegistrati();
    }
  }

  async caricaUtentiRegistrati() {
    this.isLoadingUsers.set(true);
    try {
      const list = await this.authService.fetchAllUsersForMister();
      this.allUsers.set(list);
    } catch (err) {
      console.warn('Errore caricamento lista utenti:', err);
    } finally {
      this.isLoadingUsers.set(false);
    }
  }

  getPlayerNameById(playerId?: string | null): string | null {
    if (!playerId) return null;
    const g = (this.statsEngine.giocatoriRaw() || []).find(
      (p) => p.id === playerId
    );
    return g ? g.nome : playerId;
  }

  async promuoviORevocaMister(target: AppUserProfile) {
    if (!this.authService.isSuperUser()) return;
    const isTargetMister = target.role === 'superuser';
    if (isTargetMister && isLegacySuperUserEmail(target.email)) {
      await this.mostraToast(
        '👑 Questo è uno dei 2 account Mister fondatori (protetto da lockout).',
        'warning'
      );
      return;
    }

    const nextRole: UserRole = isTargetMister
      ? target.playerId
        ? 'user'
        : 'guest'
      : 'superuser';

    const alert = await this.alertCtrl.create({
      header: isTargetMister ? 'Revoca Ruolo Mister' : '👑 Promuovi a Mister',
      message: isTargetMister
        ? `Vuoi riportare ${target.displayName || target.email} al ruolo di ${target.playerId ? 'Atleta' : 'Tifoso'}?`
        : `Vuoi promuovere ${target.displayName || target.email} a Mister (Superuser con accesso completo e Area Segreta)?`,
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        {
          text: 'Conferma',
          handler: async () => {
            try {
              await this.authService.adminUpdateUserRoleAndPlayer(
                target,
                nextRole,
                target.playerId || null
              );
              await this.caricaUtentiRegistrati();
              await this.mostraToast(
                `Ruolo di ${target.displayName || target.email} aggiornato a ${ROLE_METADATA[nextRole].badgeText}`,
                'success'
              );
            } catch (err: any) {
              await this.mostraToast(
                err?.message || 'Errore aggiornamento ruolo.',
                'danger'
              );
            }
          },
        },
      ],
    });
    await alert.present();
  }

  private formatFirebaseAuthError(err: any): string {
    const code = err?.code || '';
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Credenziali non valide. Verifica email e password.';
      case 'auth/email-already-in-use':
        return 'Questa email è già registrata. Passa alla scheda "Accedi".';
      case 'auth/invalid-email':
        return 'Formato indirizzo email non valido.';
      case 'auth/weak-password':
        return 'Password troppo debole (minimo 6 caratteri).';
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request':
        return '';
      case 'auth/popup-blocked':
        return 'Il browser ha bloccato il popup di Google. Consenti i popup per questo sito.';
      case 'auth/too-many-requests':
        return 'Troppi tentativi ravvicinati. Riprova tra qualche minuto.';
      default:
        return err?.message || 'Errore di autenticazione. Riprova.';
    }
  }

  private async mostraToast(
    message: string,
    color: 'success' | 'warning' | 'danger' | 'medium' = 'success'
  ) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2400,
      position: 'bottom',
      mode: 'ios',
      color,
    });
    await toast.present();
  }
}

