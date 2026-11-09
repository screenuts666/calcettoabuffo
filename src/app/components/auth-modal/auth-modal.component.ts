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
import { ActivatedRoute, Router } from '@angular/router';
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
  trashOutline,
  openOutline,
  alertCircleOutline,
} from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';
import { StatsEngineService } from '../../services/stats-engine.service';
import { Giocatore } from '../../models/giocatore.model';
import {
  AppUserProfile,
  ROLE_METADATA,
  UserRole,
  isLegacySuperUserEmail,
  isPresidenteEmail,
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
  private route = inject(ActivatedRoute, { optional: true });

  @Input() initialMode: AuthModalView = 'login';
  @Input() openClaimPicker = false;
  @Input() returnUrl: string | null = null;

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
      trashOutline,
      openOutline,
      alertCircleOutline,
    });
  }

  ngOnInit() {
    this.authMode.set(this.initialMode);
    const queryReturn = this.route?.snapshot?.queryParamMap?.get('returnUrl');
    if (this.returnUrl || queryReturn) {
      this.authService.setReturnUrl(this.returnUrl || queryReturn || null);
    }
    if (this.openClaimPicker || (this.authService.isLoggedIn() && !this.authService.hasLinkedPlayer() && this.authService.pendingReturnUrl())) {
      this.showPlayerPicker.set(true);
    }
  }

  private async handlePostAuthRedirect(): Promise<boolean> {
    const targetUrl =
      this.returnUrl ||
      this.route?.snapshot?.queryParamMap?.get('returnUrl') ||
      this.authService.consumeReturnUrl();
    if (!targetUrl) return false;

    const topModal = await this.modalCtrl.getTop();
    if (topModal) {
      await this.modalCtrl.dismiss('redirected');
    }
    await this.router.navigateByUrl(targetUrl);
    return true;
  }

  async chiudi(result?: string) {
    const topModal = await this.modalCtrl.getTop();
    if (topModal) {
      await this.modalCtrl.dismiss(result);
      return;
    }
    const isReadyForProtected =
      this.authService.isLoggedIn() &&
      (this.authService.hasLinkedPlayer() || this.authService.isSuperUser());

    let targetUrl =
      this.returnUrl ||
      this.route?.snapshot?.queryParamMap?.get('returnUrl') ||
      this.authService.consumeReturnUrl() ||
      '/partite';

    // Se l'utente non ha completato login/associazione e preme "Chiudi",
    // non rimandarlo a /disponibilita per evitare un loop infinito di reindirizzamento
    if (!isReadyForProtected && (targetUrl.includes('disponibilita') || targetUrl.includes('calendario'))) {
      targetUrl = '/partite';
    }

    await this.router.navigateByUrl(targetUrl);
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
        if (this.authService.hasLinkedPlayer() || this.authService.isSuperUser()) {
          await this.handlePostAuthRedirect();
        } else {
          this.showPlayerPicker.set(true);
        }
      } else {
        await this.authService.registerWithEmail(
          mail,
          pass,
          this.displayName()
        );
        if (this.authService.hasLinkedPlayer()) {
          await this.handlePostAuthRedirect();
        } else {
          this.showPlayerPicker.set(true);
          await this.mostraToast(
            'Registrazione completata! Ora associa il tuo profilo giocatore per continuare.',
            'success'
          );
        }
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
      await this.mostraToast(
        `Accesso effettuato come ${this.authService.displayName()} (${this.authService.roleMeta().badgeText})`,
        'success'
      );
      if (!this.authService.hasLinkedPlayer() && !this.authService.isSuperUser()) {
        this.showPlayerPicker.set(true);
      } else {
        await this.handlePostAuthRedirect();
      }
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
      await this.handlePostAuthRedirect();
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
    const returnUrl =
      this.returnUrl ||
      this.route?.snapshot?.queryParamMap?.get('returnUrl') ||
      this.authService.pendingReturnUrl();
    this.modalCtrl.getTop().then((top) => {
      if (top) this.modalCtrl.dismiss();
    });
    setTimeout(() => {
      this.router.navigate(['/giocatori', 'nuovo'], {
        queryParams: {
          selfClaim: '1',
          ...(returnUrl ? { returnUrl } : {}),
        },
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

  async modificaSchedaAtleta(u: AppUserProfile) {
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
      message: 'Seleziona il giocatore in rosa da abbinare a questo account:',
      inputs,
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        ...(u.playerId
          ? [
              {
                text: 'Scollega Scheda',
                role: 'destructive',
                handler: async () => {
                  await this.scollegaSchedaAtleta(u);
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
              await this.caricaUtentiRegistrati();
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

  async scollegaSchedaAtleta(u: AppUserProfile) {
    if (!this.authService.isPresidente() || !u.playerId) return;
    const playerName = this.getPlayerNameById(u.playerId);
    const alert = await this.alertCtrl.create({
      header: 'Scollega Scheda Atleta',
      message: `Vuoi scollegare la scheda di "${playerName}" dall'account ${u.displayName || u.email}?\n\nL'account rimarrà attivo e la scheda dell'atleta rimarrà nella rosa con tutte le sue statistiche.`,
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        {
          text: 'Scollega',
          role: 'destructive',
          handler: async () => {
            try {
              await this.authService.unlinkPlayerFromUser(u);
              await this.caricaUtentiRegistrati();
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

  async eliminaAccount(u: AppUserProfile) {
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
      header: '⚠️ Elimina Account',
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
              await this.caricaUtentiRegistrati();
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

  async apriGestioneImpostazioni() {
    await this.chiudi();
    await this.router.navigate(['/impostazioni'], {
      queryParams: { tab: 'ruoli' },
    });
  }

  private formatFirebaseAuthError(err: any): string {
    const code = err?.code || '';
    if (code.includes('requests-from-referer')) {
      return 'Dominio bloccato nelle restrizioni API Key di Google Cloud Console: aggiungi https://calcettoabuffone.web.app/* e https://calcettoabuffone.firebaseapp.com/* ai referrer consentiti.';
    }
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

