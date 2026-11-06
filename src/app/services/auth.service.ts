import { Injectable, inject, signal, computed } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  CanMatchFn,
  Router,
} from '@angular/router';
import {
  Auth,
  User,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
  signOut,
  authState,
} from '@angular/fire/auth';
import { Firestore } from '@angular/fire/firestore';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  writeBatch,
  collection,
  getDocs,
  Unsubscribe,
} from 'firebase/firestore';
import { firstValueFrom } from 'rxjs';
import {
  AppUserProfile,
  ROLE_METADATA,
  RoleMeta,
  UserRole,
  isLegacySuperUserEmail,
} from '../models/user-profile.model';
import { environment } from 'src/environments/environment';

/**
 * Codice di sicurezza di 2° livello (Step-Up Vault PIN) per sbloccare
 * la cassaforte di modifica dei parametri del motore nell'Area Segreta.
 */
export const DEFAULT_VAULT_PIN = '1000';
export const VAULT_SESSION_DURATION_MS = 5 * 60 * 1000; // 5 minuti di auto-lock

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private auth: Auth | null = inject(Auth, { optional: true });
  private firestore: Firestore | null = inject(Firestore, { optional: true });

  private profileUnsub: Unsubscribe | null = null;

  // Stato base utente Firebase Auth & Documento Firestore `users/{uid}`
  readonly firebaseUser = signal<User | null>(null);
  readonly userProfile = signal<AppUserProfile | null>(null);
  readonly authInitialized = signal<boolean>(false);

  // ─── FEATURE FLAG VISIBILITÀ ACCOUNT NELL'HEADER (v2.0) ───────────────────
  private readonly userAccountConfig = (environment as any).features?.userAccount || {
    enabled: false,
    showUiToggle: false,
  };

  /** In PROD showAccountUi è SEMPRE false, in DEV è true */
  readonly showAccountUi = signal<boolean>(Boolean(this.userAccountConfig.showUiToggle));

  /** In PROD isAccountEnabled è SEMPRE false, in DEV default true ma switchabile da Impostazioni */
  readonly isAccountEnabled = signal<boolean>(
    this.initAccountEnabledState(Boolean(this.userAccountConfig.enabled))
  );

  private initAccountEnabledState(defaultVal: boolean): boolean {
    if (!this.userAccountConfig.showUiToggle) {
      return false; // In PROD sempre disabilitato al 100%
    }
    if (typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem('calcetto_user_account_header_enabled');
        if (stored !== null) {
          return stored === 'true';
        }
      } catch {}
    }
    return defaultVal;
  }

  toggleAccountFeature(forcedValue?: boolean): boolean {
    if (!this.showAccountUi()) return false;
    const nextVal = forcedValue !== undefined ? forcedValue : !this.isAccountEnabled();
    this.isAccountEnabled.set(nextVal);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('calcetto_user_account_header_enabled', String(nextVal));
      } catch {}
    }
    return nextVal;
  }

  // ─── STATO REATTIVO RBAC A 3 RUOLI (Tifoso, Atleta, Mister) ──────────────
  readonly isLoggedIn = computed<boolean>(() => !!this.firebaseUser());

  readonly role = computed<UserRole>(() => {
    const fbUser = this.firebaseUser();
    if (!fbUser) return 'guest';

    // Protezione Account Legacy: sempre riconosciuto come `superuser` ("Mister")
    if (isLegacySuperUserEmail(fbUser.email)) {
      return 'superuser';
    }

    const prof = this.userProfile();
    if (!prof) return 'guest';

    if (prof.role === 'superuser') {
      return 'superuser';
    }
    if (prof.role === 'user' && !!prof.playerId) {
      return 'user';
    }
    return 'guest';
  });

  readonly roleMeta = computed<RoleMeta>(() => ROLE_METADATA[this.role()]);
  readonly roleLabel = computed<'Tifoso' | 'Atleta' | 'Mister'>(
    () => this.roleMeta().label
  );

  readonly isGuest = computed<boolean>(() => this.role() === 'guest');
  readonly isAtleta = computed<boolean>(() => this.role() === 'user');
  readonly isSuperUser = computed<boolean>(() => this.role() === 'superuser');

  /**
   * Alias retrocompatibile: `isAdmin()` riflette in modo reattivo `isSuperUser()` ("Mister").
   * Nessun dato o ruolo viene mai salvato in localStorage.
   */
  readonly isAdmin = this.isSuperUser;

  /** Alias per `isLoggedIn`: true se l'utente ha effettuato il login Firebase */
  readonly isAuthenticated = this.isLoggedIn;

  /**
   * ID del giocatore associato all'utente corrente.
   * Valido sia per l'`Atleta` (`role === 'user'`) sia per il `Mister` che gioca anche in campo (`role === 'superuser'`).
   */
  readonly linkedPlayerId = computed<string | null>(
    () => this.userProfile()?.playerId || null
  );

  readonly hasLinkedPlayer = computed<boolean>(() => !!this.linkedPlayerId());

  readonly displayName = computed<string>(() => {
    const prof = this.userProfile();
    if (prof?.displayName?.trim()) return prof.displayName.trim();
    const fb = this.firebaseUser();
    if (fb?.displayName?.trim()) return fb.displayName.trim();
    if (fb?.email) return fb.email.split('@')[0];
    return 'Tifoso';
  });

  readonly photoURL = computed<string | null>(() => {
    return (
      this.userProfile()?.photoURL || this.firebaseUser()?.photoURL || null
    );
  });

  // Livello 2: Cassaforte Parametri Motore (sempre bloccata all'avvio anche per il Mister!)
  readonly isVaultUnlocked = signal<boolean>(false);
  readonly vaultExpiresAt = signal<number | null>(null);
  private vaultTimerId: ReturnType<typeof setTimeout> | null = null;

  // Deep-Link Return URL (es. da invito partita `/partite/:id?invite=true`)
  readonly pendingReturnUrl = signal<string | null>(null);

  setReturnUrl(url: string | null) {
    this.pendingReturnUrl.set(url ? url.trim() : null);
  }

  consumeReturnUrl(): string | null {
    const val = this.pendingReturnUrl();
    this.pendingReturnUrl.set(null);
    return val;
  }

  constructor() {
    this.cleanupLegacyLocalStorage();

    if (this.auth) {
      authState(this.auth).subscribe({
        next: async (user) => {
          this.firebaseUser.set(user);
          if (!user) {
            this.stopProfileListener();
            this.userProfile.set(null);
            this.lockVault();
            this.authInitialized.set(true);
            return;
          }

          await this.syncAndListenUserProfile(user);
          this.authInitialized.set(true);
        },
        error: (err) => {
          console.warn('Avviso stato autenticazione Firebase:', err);
          this.authInitialized.set(true);
        },
      });
    } else {
      this.authInitialized.set(true);
    }
  }

  /**
   * Rimuove eventuali vecchie chiavi legacy dal localStorage per garantire
   * che nessun ruolo o stato di autenticazione risieda mai in chiaro.
   */
  private cleanupLegacyLocalStorage() {
    if (typeof localStorage === 'undefined') return;
    const forbiddenKeys = ['isAdmin', 'userRole', 'role', 'auth_role', 'calcetto_role'];
    for (const k of forbiddenKeys) {
      try {
        localStorage.removeItem(k);
      } catch { }
    }
  }

  private stopProfileListener() {
    if (this.profileUnsub) {
      this.profileUnsub();
      this.profileUnsub = null;
    }
  }

  /**
   * Allinea o crea al primo accesso il documento `users/{uid}` su Firestore
   * e attiva un listener in tempo reale (`onSnapshot`) per reagire istantaneamente
   * a cambi di ruolo o associazione giocatore.
   */
  private async syncAndListenUserProfile(user: User): Promise<void> {
    if (!this.firestore) return;

    this.stopProfileListener();
    const userDocRef = doc(this.firestore, `users/${user.uid}`);
    const now = new Date().toISOString();
    const isLegacyAdmin = isLegacySuperUserEmail(user.email);
    const providerId =
      user.providerData?.[0]?.providerId === 'google.com'
        ? 'google.com'
        : 'password';

    try {
      const snap = await getDoc(userDocRef);
      if (!snap.exists()) {
        // Verifica se esiste già un giocatore (o un profilo precedente con la stessa email, es. Admin Legacy entrato con Google)
        const autoPlayerId = await this.resolveAutoLinkedPlayerId(
          user,
          isLegacyAdmin
        );
        const initialRole: UserRole = isLegacyAdmin
          ? 'superuser'
          : autoPlayerId
            ? 'user'
            : 'guest';

        const initialProfile: AppUserProfile = {
          uid: user.uid,
          email: user.email || '',
          displayName:
            user.displayName || user.email?.split('@')[0] || 'Tifoso',
          photoURL: user.photoURL || null,
          role: initialRole,
          playerId: autoPlayerId,
          authProvider: providerId,
          createdAt: now,
          updatedAt: now,
          lastLoginAt: now,
        };
        await setDoc(userDocRef, initialProfile);
        this.userProfile.set(initialProfile);
      } else {
        const data = snap.data() as AppUserProfile;
        let linkedPid = data.playerId || null;
        if (!linkedPid) {
          linkedPid = await this.resolveAutoLinkedPlayerId(user, isLegacyAdmin);
        }

        const effectiveRole: UserRole = isLegacyAdmin
          ? 'superuser'
          : linkedPid && (data.role === 'guest' || !data.role)
            ? 'user'
            : data.role || 'guest';

        const mergedPhoto = data.photoURL || user.photoURL || null;
        const mergedName =
          data.displayName && data.displayName !== 'Tifoso'
            ? data.displayName
            : user.displayName || user.email?.split('@')[0] || 'Tifoso';

        this.userProfile.set({
          ...data,
          uid: user.uid,
          role: effectiveRole,
          playerId: linkedPid,
          photoURL: mergedPhoto,
          displayName: mergedName,
          authProvider: providerId,
        });

        // Aggiorna silenziosamente lastLoginAt, provider Google e auto-aggancio eventuale
        const patch: Record<string, any> = {
          lastLoginAt: now,
          updatedAt: now,
          authProvider: providerId,
        };
        if (isLegacyAdmin && data.role !== 'superuser') {
          patch['role'] = 'superuser';
        } else if (effectiveRole !== data.role) {
          patch['role'] = effectiveRole;
        }
        if (linkedPid && data.playerId !== linkedPid) {
          patch['playerId'] = linkedPid;
        }
        if (!data.photoURL && user.photoURL) {
          patch['photoURL'] = user.photoURL;
        }
        if (
          (!data.displayName || data.displayName === 'Tifoso') &&
          user.displayName
        ) {
          patch['displayName'] = user.displayName;
        }
        updateDoc(userDocRef, patch).catch(() => { });
      }
    } catch (err) {
      console.warn('Impossibile sincronizzare il profilo utente iniziale:', err);
      if (isLegacyAdmin) {
        this.userProfile.set({
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || 'Mister',
          photoURL: user.photoURL || null,
          role: 'superuser',
          playerId: null,
          authProvider: providerId,
          createdAt: now,
          updatedAt: now,
          lastLoginAt: now,
        });
      }
    }

    // Listener reattivo in tempo reale sul documento `users/{uid}`
    this.profileUnsub = onSnapshot(
      userDocRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as AppUserProfile;
          const effectiveRole: UserRole = isLegacySuperUserEmail(user.email)
            ? 'superuser'
            : data.role || 'guest';
          this.userProfile.set({
            ...data,
            uid: user.uid,
            role: effectiveRole,
          });
          if (effectiveRole !== 'superuser') {
            this.lockVault();
          }
        }
      },
      (err) => {
        console.warn('Avviso listener profilo utente:', err);
      }
    );
  }

  /**
   * Cerca automaticamente se esiste già una scheda giocatore in `giocatori` (o un profilo precedente con la stessa email)
   * associata all'utente o all'Admin Legacy che entra con Google Sign-In, riallineando `linkedUid` e `playerId`.
   */
  private async resolveAutoLinkedPlayerId(
    user: User,
    isLegacyAdmin: boolean
  ): Promise<string | null> {
    if (!this.firestore || !user.uid) return null;
    const cleanEmail = (user.email || '').trim().toLowerCase();

    try {
      const playersSnap = await getDocs(collection(this.firestore, 'giocatori'));
      let matchedPlayerId: string | null = null;

      playersSnap.forEach((pDoc) => {
        if (matchedPlayerId) return;
        const pData = pDoc.data();
        const pUid = pData?.['linkedUid'] || null;
        const pEmail = (pData?.['linkedEmail'] || '').trim().toLowerCase();

        if (pUid === user.uid || (cleanEmail && pEmail === cleanEmail)) {
          matchedPlayerId = pDoc.id;
        }
      });

      // Se è un Admin Legacy entrato con Google e aveva già un altro doc `users` con la stessa email e un `playerId`
      if (!matchedPlayerId && isLegacyAdmin && cleanEmail) {
        const usersSnap = await getDocs(collection(this.firestore, 'users'));
        usersSnap.forEach((uDoc) => {
          if (matchedPlayerId || uDoc.id === user.uid) return;
          const uData = uDoc.data() as AppUserProfile;
          if (
            (uData.email || '').trim().toLowerCase() === cleanEmail &&
            uData.playerId
          ) {
            matchedPlayerId = uData.playerId;
          }
        });
      }

      if (matchedPlayerId) {
        // Riallinea `linkedUid` e `linkedEmail` sulla scheda giocatore
        updateDoc(doc(this.firestore, `giocatori/${matchedPlayerId}`), {
          linkedUid: user.uid,
          linkedEmail: user.email || null,
          updatedAt: new Date().toISOString(),
        }).catch(() => { });
      }

      return matchedPlayerId;
    } catch {
      return null;
    }
  }

  // =========================================================================
  // FLUSSI DI AUTENTICAZIONE: LOGIN, SIGN UP, GOOGLE SIGN-IN & LOGOUT
  // =========================================================================

  async loginWithEmail(email: string, password: string): Promise<boolean> {
    if (!this.auth) {
      throw new Error('Servizio Firebase Auth non disponibile.');
    }
    const cred = await signInWithEmailAndPassword(
      this.auth,
      email.trim(),
      password
    );
    this.firebaseUser.set(cred.user);
    await this.syncAndListenUserProfile(cred.user);
    return true;
  }

  /**
   * Registrazione nuovo account con Email e Password.
   * Il ruolo iniziale nasce SEMPRE come `guest` ("Tifoso") salvo email Admin Legacy.
   */
  async registerWithEmail(
    email: string,
    password: string,
    displayName: string
  ): Promise<boolean> {
    if (!this.auth) {
      throw new Error('Servizio Firebase Auth non disponibile.');
    }
    const cleanName = displayName.trim() || email.split('@')[0];
    const cred = await createUserWithEmailAndPassword(
      this.auth,
      email.trim(),
      password
    );
    if (cleanName) {
      await updateProfile(cred.user, { displayName: cleanName }).catch(
        () => { }
      );
    }
    this.firebaseUser.set(cred.user);
    await this.syncAndListenUserProfile(cred.user);
    return true;
  }

  /**
   * Accesso tramite Google Sign-In OAuth 2.0 (con persistenza gestita da Firebase Auth SDK).
   */
  async loginWithGoogle(): Promise<boolean> {
    if (!this.auth) {
      throw new Error('Servizio Firebase Auth non disponibile.');
    }
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: 'select_account',
    });
    const cred = await signInWithPopup(this.auth, provider);
    this.firebaseUser.set(cred.user);
    await this.syncAndListenUserProfile(cred.user);
    return true;
  }

  async logout(): Promise<void> {
    this.lockVault();
    this.stopProfileListener();
    if (this.auth) {
      await signOut(this.auth);
    }
    this.firebaseUser.set(null);
    this.userProfile.set(null);
  }

  // Metodi alias per retrocompatibilità con i componenti v1.0
  async loginAdmin(email: string, password: string): Promise<boolean> {
    return this.loginWithEmail(email, password);
  }

  async logoutAdmin(): Promise<void> {
    return this.logout();
  }

  // =========================================================================
  // ASSOCIAZIONE GIOCATORE (CLAIMING) & GESTIONE MISTER-GIOCATORE
  // =========================================================================

  /**
   * Verifica se l'utente corrente ha il permesso di modificare la scheda di un giocatore:
   * - Il `Mister` (`superuser`) può modificare qualsiasi giocatore.
   * - L'`Atleta` (`user`) può modificare ESCLUSIVAMENTE la propria scheda (`linkedPlayerId === playerId`).
   */
  canEditPlayer(playerId?: string | null): boolean {
    if (!playerId) return false;
    if (this.isSuperUser()) return true;
    return this.isAtleta() && this.linkedPlayerId() === playerId;
  }

  /**
   * Privacy Strict Numero di Telefono:
   * Visibile ESCLUSIVAMENTE al `Mister` (`superuser`) e al giocatore proprietario della scheda
   * (`currentUser.uid === player.linkedUid` oppure `linkedPlayerId() === player.id`).
   * Tifosi (`guest`) e altri Atleti NON possono mai vederlo.
   */
  canViewPlayerPhone(
    player?: { id?: string | null; linkedUid?: string | null } | null
  ): boolean {
    if (!player) return false;
    if (this.isSuperUser()) return true;
    const uid = this.firebaseUser()?.uid;
    if (!uid) return false;
    if (player.linkedUid && player.linkedUid === uid) return true;
    if (player.id && this.linkedPlayerId() === player.id) return true;
    return false;
  }

  /**
   * Legge il numero di telefono dalla sottocollezione privata `giocatori/{playerId}/private/contact`.
   * Restituisce `null` se l'utente non è autorizzato o se non è stato impostato.
   */
  async getPlayerPhoneNumber(playerId?: string | null): Promise<string | null> {
    if (!playerId || !this.firestore || !this.isAuthenticated()) return null;
    if (!this.isSuperUser() && this.linkedPlayerId() !== playerId) return null;

    try {
      const contactSnap = await getDoc(
        doc(this.firestore, `giocatori/${playerId}/private/contact`)
      );
      if (!contactSnap.exists()) return null;
      const phone = (contactSnap.data()?.['phoneNumber'] || '').toString().trim();
      return phone || null;
    } catch {
      return null;
    }
  }

  /**
   * Salva il numero di telefono nella sottocollezione privata `giocatori/{playerId}/private/contact`.
   * Consentito solo al `Mister` (`superuser`) o all'`Atleta` proprietario della scheda.
   */
  async savePlayerPhoneNumber(
    playerId: string,
    phoneNumber: string
  ): Promise<void> {
    const user = this.firebaseUser();
    if (!playerId || !user || !this.firestore) return;
    if (!this.canEditPlayer(playerId)) return;

    const cleanPhone = (phoneNumber || '').toString().trim();
    const now = new Date().toISOString();
    await setDoc(doc(this.firestore, `giocatori/${playerId}/private/contact`), {
      phoneNumber: cleanPhone,
      updatedAt: now,
      updatedBy: user.uid,
    });
  }

  /**
   * Reclama un profilo giocatore (`giocatori/{playerId}`) associandolo all'utente loggato.
   * - Previene l'Account Hijacking: consente il reclamo solo se `linkedUid` sul giocatore è `null`/`undefined`
   *   (oppure se è il `Mister` a eseguire l'operazione).
   * - Se l'utente è `guest` ("Tifoso"), lo promuove automaticamente a `user` ("Atleta").
   * - Se l'utente è `superuser` ("Mister"), MANTIENE il ruolo `superuser` ("Mister") aggiungendo il `playerId`!
   */
  async claimPlayer(playerId: string): Promise<void> {
    const user = this.firebaseUser();
    if (!user || !this.firestore) {
      throw new Error('Devi effettuare il login per associare un giocatore.');
    }

    const playerRef = doc(this.firestore, `giocatori/${playerId}`);
    const playerSnap = await getDoc(playerRef);
    if (!playerSnap.exists()) {
      throw new Error('Scheda giocatore non trovata.');
    }

    const playerData = playerSnap.data();
    const existingLinkedUid = playerData?.['linkedUid'] || null;

    if (
      existingLinkedUid &&
      existingLinkedUid !== user.uid &&
      !this.isSuperUser()
    ) {
      throw new Error(
        'Questo giocatore è già stato reclamato da un altro utente. Contatta il Mister in caso di errore.'
      );
    }

    const now = new Date().toISOString();
    const userRef = doc(this.firestore, `users/${user.uid}`);
    const currentRole = this.role();
    const prevPlayerId = this.linkedPlayerId();

    const batch = writeBatch(this.firestore);

    // Se il Mister aveva già un altro giocatore collegato e lo sta cambiando, libera il precedente
    if (
      this.isSuperUser() &&
      prevPlayerId &&
      prevPlayerId !== playerId
    ) {
      const oldPlayerRef = doc(this.firestore, `giocatori/${prevPlayerId}`);
      batch.update(oldPlayerRef, {
        linkedUid: null,
        linkedEmail: null,
        claimedAt: null,
        updatedAt: now,
      });
    }

    // 1. Segna il giocatore come reclamato da `user.uid`
    batch.update(playerRef, {
      linkedUid: user.uid,
      linkedEmail: user.email || null,
      claimedAt: now,
      updatedAt: now,
    });

    // 2. Aggiorna il profilo `users/{uid}`:
    //    - Il Mister resta `superuser`
    //    - Il Tifoso (`guest`) diventa `user` ("Atleta")
    const nextRole: UserRole =
      currentRole === 'superuser' ? 'superuser' : 'user';

    batch.update(userRef, {
      role: nextRole,
      playerId: playerId,
      updatedAt: now,
      lastLoginAt: now,
    });

    await batch.commit();
  }

  /**
   * Crea una NUOVA scheda giocatore in `giocatori/{newId}` e la aggancia atomicamente
   * all'utenza corrente (`users/{uid}`).
   * - Usato quando un utente registrato non esiste ancora in rosa e crea direttamente il proprio giocatore.
   * - Se l'utente è `guest` ("Tifoso"), diventa automaticamente `user` ("Atleta").
   * - Se l'utente è `superuser` ("Mister"), mantiene `superuser` ("Mister") agganciando il `playerId`.
   */
  async createAndClaimPlayer(
    playerPayload: Record<string, any>,
    phoneNumber?: string | null
  ): Promise<string> {
    const user = this.firebaseUser();
    if (!user || !this.firestore) {
      throw new Error('Devi effettuare il login per creare la tua scheda giocatore.');
    }

    if (this.hasLinkedPlayer() && !this.isSuperUser()) {
      throw new Error('Hai già una scheda giocatore associata al tuo account.');
    }

    const now = new Date().toISOString();
    const newPlayerRef = doc(collection(this.firestore, 'giocatori'));
    const userRef = doc(this.firestore, `users/${user.uid}`);
    const currentRole = this.role();
    const prevPlayerId = this.linkedPlayerId();

    const batch = writeBatch(this.firestore);

    // Se il Mister aveva un altro giocatore collegato e sceglie di collegare il nuovo a sé, libera il vecchio
    if (this.isSuperUser() && prevPlayerId) {
      batch.update(doc(this.firestore, `giocatori/${prevPlayerId}`), {
        linkedUid: null,
        linkedEmail: null,
        claimedAt: null,
        updatedAt: now,
      });
    }

    batch.set(newPlayerRef, {
      ...playerPayload,
      linkedUid: user.uid,
      linkedEmail: user.email || null,
      claimedAt: now,
      updatedAt: now,
    });

    const cleanPhone = (phoneNumber || '').toString().trim();
    if (cleanPhone) {
      batch.set(
        doc(this.firestore, `giocatori/${newPlayerRef.id}/private/contact`),
        {
          phoneNumber: cleanPhone,
          updatedAt: now,
          updatedBy: user.uid,
        }
      );
    }

    const nextRole: UserRole =
      currentRole === 'superuser' ? 'superuser' : 'user';

    batch.update(userRef, {
      role: nextRole,
      playerId: newPlayerRef.id,
      updatedAt: now,
      lastLoginAt: now,
    });

    await batch.commit();
    return newPlayerRef.id;
  }

  /**
   * Consente al Mister di scollegare il proprio profilo giocatore (poiché per il Mister è facoltativo).
   */
  async unlinkMyPlayer(): Promise<void> {
    const user = this.firebaseUser();
    const currentPlayerId = this.linkedPlayerId();
    if (!user || !this.firestore || !currentPlayerId) return;
    if (!this.isSuperUser()) {
      throw new Error('Solo il Mister può scollegare autonomamente un giocatore.');
    }

    const now = new Date().toISOString();
    const batch = writeBatch(this.firestore);

    batch.update(doc(this.firestore, `giocatori/${currentPlayerId}`), {
      linkedUid: null,
      linkedEmail: null,
      claimedAt: null,
      updatedAt: now,
    });

    batch.update(doc(this.firestore, `users/${user.uid}`), {
      playerId: null,
      updatedAt: now,
    });

    await batch.commit();
  }

  /**
   * Funzione esclusiva per il `Mister` (`superuser`):
   * Recupera tutti gli utenti registrati da `users` per gestire ruoli (es. nominare un secondo Mister)
   * e associazioni giocatore.
   */
  async fetchAllUsersForMister(): Promise<AppUserProfile[]> {
    if (!this.firestore || !this.isSuperUser()) return [];
    const snap = await getDocs(collection(this.firestore, 'users'));
    const list: AppUserProfile[] = [];
    snap.forEach((d) => {
      list.push({ ...(d.data() as AppUserProfile), uid: d.id });
    });
    return list.sort((a, b) =>
      (a.displayName || a.email).localeCompare(b.displayName || b.email)
    );
  }

  /**
   * Funzione esclusiva per il `Mister` (`superuser`):
   * Aggiorna il ruolo (`guest` | `user` | `superuser`) e/o il `playerId` associato di un utente.
   */
  async adminUpdateUserRoleAndPlayer(
    targetUser: AppUserProfile,
    newRole: UserRole,
    newPlayerId: string | null
  ): Promise<void> {
    if (!this.firestore || !this.isSuperUser()) {
      throw new Error('Operazione riservata al Mister.');
    }

    // Impedisci il downgrade dell'account Legacy principale
    if (
      isLegacySuperUserEmail(targetUser.email) &&
      newRole !== 'superuser'
    ) {
      throw new Error(
        'Non è possibile rimuovere il ruolo di Mister dall\'account Admin principale.'
      );
    }

    // Un Atleta (`user`) senza giocatore diventa `guest`; un `guest` con giocatore diventa `user` (salvo sia `superuser`)
    let effectiveRole: UserRole = newRole;
    if (effectiveRole === 'user' && !newPlayerId) {
      effectiveRole = 'guest';
    } else if (effectiveRole === 'guest' && newPlayerId) {
      effectiveRole = 'user';
    }

    const now = new Date().toISOString();
    const batch = writeBatch(this.firestore);

    // Se l'utente aveva un giocatore precedente diverso, liberalo
    if (targetUser.playerId && targetUser.playerId !== newPlayerId) {
      batch.update(
        doc(this.firestore, `giocatori/${targetUser.playerId}`),
        {
          linkedUid: null,
          linkedEmail: null,
          claimedAt: null,
          updatedAt: now,
        }
      );
    }

    // Se è stato assegnato un nuovo giocatore, aggiorna `giocatori/{newPlayerId}`
    if (newPlayerId) {
      batch.update(doc(this.firestore, `giocatori/${newPlayerId}`), {
        linkedUid: targetUser.uid,
        linkedEmail: targetUser.email || null,
        claimedAt: now,
        updatedAt: now,
      });
    }

    batch.update(doc(this.firestore, `users/${targetUser.uid}`), {
      role: effectiveRole,
      playerId: newPlayerId || null,
      updatedAt: now,
    });

    await batch.commit();
  }

  // =========================================================================
  // VERIFICA SERVER-SIDE PER ROUTE GUARDS (ZERO DATA LEAK)
  // =========================================================================

  /**
   * Verifica asincrona direttamente su Firebase Auth + Firestore (`users/{uid}`)
   * se l'utente corrente possiede realmente il ruolo `superuser` ("Mister").
   */
  async verifySuperUserFromFirestore(): Promise<boolean> {
    if (!this.auth || !this.firestore) return false;

    try {
      const user = await firstValueFrom(authState(this.auth));
      if (!user) return false;

      if (isLegacySuperUserEmail(user.email)) {
        return true;
      }

      const snap = await getDoc(doc(this.firestore, `users/${user.uid}`));
      if (!snap.exists()) return false;

      const data = snap.data() as AppUserProfile;
      return data.role === 'superuser';
    } catch {
      return false;
    }
  }

  /**
   * Verifica asincrona su Firestore se l'utente corrente può modificare la scheda `playerId`
   * (è `superuser` oppure è il proprietario `linkedUid == user.uid`).
   */
  async verifyCanEditPlayerFromFirestore(
    playerId: string | null
  ): Promise<boolean> {
    if (!playerId || !this.auth || !this.firestore) return false;

    try {
      const user = await firstValueFrom(authState(this.auth));
      if (!user) return false;

      if (isLegacySuperUserEmail(user.email)) {
        return true;
      }

      const [userSnap, playerSnap] = await Promise.all([
        getDoc(doc(this.firestore, `users/${user.uid}`)),
        getDoc(doc(this.firestore, `giocatori/${playerId}`)),
      ]);

      if (userSnap.exists()) {
        const uData = userSnap.data() as AppUserProfile;
        if (uData.role === 'superuser') return true;
        if (
          uData.role === 'user' &&
          uData.playerId === playerId &&
          playerSnap.exists() &&
          playerSnap.data()?.['linkedUid'] === user.uid
        ) {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Verifica asincrona su Firestore se l'utente corrente può creare una scheda giocatore:
   * - Il `Mister` (`superuser`) può sempre creare giocatori.
   * - Un utente autenticato che NON ha ancora una scheda giocatore associata (`!playerId`)
   *   può creare la propria scheda in rosa e agganciarla subito.
   */
  async verifyCanCreatePlayerFromFirestore(): Promise<boolean> {
    if (!this.auth || !this.firestore) return false;

    try {
      const user = await firstValueFrom(authState(this.auth));
      if (!user) return false;

      if (isLegacySuperUserEmail(user.email)) {
        return true;
      }

      const userSnap = await getDoc(doc(this.firestore, `users/${user.uid}`));
      if (!userSnap.exists()) {
        // Utente appena autenticato senza documento o senza playerId -> può creare la propria scheda
        return true;
      }

      const uData = userSnap.data() as AppUserProfile;
      if (uData.role === 'superuser') return true;
      return !uData.playerId;
    } catch {
      return false;
    }
  }

  // =========================================================================
  // STEP-UP AUTHENTICATION: CASSAFORTE PARAMETRI MOTORE (VAULT)
  // =========================================================================

  async unlockVault(
    pin: string,
    email?: string,
    password?: string
  ): Promise<boolean> {
    const verifiedMister = await this.verifySuperUserFromFirestore();
    if (!verifiedMister) {
      return false;
    }

    if (this.auth && email && password) {
      try {
        await signInWithEmailAndPassword(this.auth, email, password);
      } catch {
        return false;
      }
    }

    if (pin.trim() !== DEFAULT_VAULT_PIN) {
      return false;
    }

    this.isVaultUnlocked.set(true);
    const expires = Date.now() + VAULT_SESSION_DURATION_MS;
    this.vaultExpiresAt.set(expires);

    if (this.vaultTimerId) {
      clearTimeout(this.vaultTimerId);
    }
    this.vaultTimerId = setTimeout(() => {
      this.lockVault();
    }, VAULT_SESSION_DURATION_MS);

    return true;
  }

  lockVault() {
    this.isVaultUnlocked.set(false);
    this.vaultExpiresAt.set(null);
    if (this.vaultTimerId) {
      clearTimeout(this.vaultTimerId);
      this.vaultTimerId = null;
    }
  }
}

/**
 * Route Guard `CanActivateFn` di 1° livello per `/area-segreta` e rotte riservate al Mister:
 * Interroga lo stato reale su Firebase Auth & Firestore (`role === 'superuser'`), non solo la memoria locale.
 */
export const superUserGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const allowed = await authService.verifySuperUserFromFirestore();
  if (allowed) {
    return true;
  }
  return router.createUrlTree(['/classifica']);
};

/**
 * Route Guard `CanMatchFn` per bloccare anche il lazy-loading del bundle JS dell'Area Segreta
 * agli utenti che non hanno il ruolo reale `superuser` su Firestore.
 */
export const superUserMatchGuard: CanMatchFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const allowed = await authService.verifySuperUserFromFirestore();
  if (allowed) {
    return true;
  }
  return router.createUrlTree(['/classifica']);
};

/**
 * Route Guard `CanActivateFn` per `/giocatori/:id/modifica`:
 * Consente l'accesso solo al `Mister` (`superuser`) o all'`Atleta` proprietario della scheda (`linkedUid == auth.uid`).
 */
export const canEditPlayerGuard: CanActivateFn = async (
  route: ActivatedRouteSnapshot
) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const playerId = route.paramMap.get('id');

  const allowed = await authService.verifyCanEditPlayerFromFirestore(playerId);
  if (allowed) {
    return true;
  }
  if (playerId) {
    return router.createUrlTree(['/giocatori', playerId]);
  }
  return router.createUrlTree(['/rosa']);
};

/**
 * Route Guard `CanActivateFn` per `/giocatori/nuovo`:
 * Consente l'accesso al `Mister` (`superuser`) oppure a qualsiasi utente autenticato
 * che non ha ancora un giocatore associato (per iscriversi in rosa e agganciare l'utenza).
 */
export const canCreatePlayerGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const allowed = await authService.verifyCanCreatePlayerFromFirestore();
  if (allowed) {
    return true;
  }
  return router.createUrlTree(['/rosa']);
};

