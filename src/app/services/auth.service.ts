import { Injectable, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import {
  Auth,
  signInWithEmailAndPassword,
  signOut,
  authState,
} from '@angular/fire/auth';
import { environment } from 'src/environments/environment';

/**
 * Codice di sicurezza di 2° livello (Step-Up Vault PIN) per sbloccare
 * la cassaforte di modifica dei parametri del motore.
 * In futuro potrà essere verificato lato server tramite Custom Claims / Cloud Functions.
 */
export const DEFAULT_VAULT_PIN = '1000';
export const VAULT_SESSION_DURATION_MS = 5 * 60 * 1000; // 5 minuti di auto-lock

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  // In dev (!environment.production) non inizializziamo Firebase Auth per evitare
  // chiamate 403 Forbidden a identitytoolkit/getProjectConfig sul progetto di sviluppo.
  private auth: Auth | null = environment.production
    ? inject(Auth, { optional: true })
    : null;

  // Livello 1: Super User session (in dev è attivo di default, in prod richiede Firebase Auth)
  isAdmin = signal<boolean>(!environment.production);

  // Livello 2: Cassaforte Parametri Motore (sempre bloccata all'avvio anche per il Super User!)
  isVaultUnlocked = signal<boolean>(false);
  vaultExpiresAt = signal<number | null>(null);
  private vaultTimerId: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (environment.production && this.auth) {
      authState(this.auth).subscribe({
        next: (user) => {
          const loggedIn = !!user;
          this.isAdmin.set(loggedIn);
          if (!loggedIn) {
            this.lockVault();
          }
        },
        error: (err) => {
          console.warn('Avviso stato autenticazione Firebase:', err);
        },
      });
    } else {
      this.isAdmin.set(true);
    }
  }

  async loginAdmin(email: string, password: string) {
    if (!environment.production || !this.auth) {
      this.isAdmin.set(true);
      return true;
    }
    try {
      await signInWithEmailAndPassword(this.auth, email, password);
      return true;
    } catch (error) {
      console.error('Errore di login:', error);
      throw error;
    }
  }

  async logoutAdmin() {
    this.lockVault();
    if (environment.production && this.auth) {
      await signOut(this.auth);
    } else {
      this.isAdmin.set(true);
    }
  }

  /**
   * Sblocco di 2° livello (Step-Up Authentication) per la Cassaforte Parametri:
   * Richiede che l'utente sia già Super User (Livello 1) + inserimento del PIN Master
   * (o ri-autenticazione Firebase se vengono passate email e password).
   * Attiva un timer di auto-lock di 5 minuti.
   */
  async unlockVault(pin: string, email?: string, password?: string): Promise<boolean> {
    if (!this.isAdmin()) {
      return false;
    }

    // Se l'utente fornisce anche credenziali Firebase in produzione, esegue una Re-Auth reale sul server
    if (environment.production && this.auth && email && password) {
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
 * Route Guard di 1° livello: impedisce l'accesso via URL diretto a `/area-segreta`
 * se l'utente non ha i permessi di Super User (`isAdmin()`).
 */
export const superUserGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  if (authService.isAdmin()) {
    return true;
  }
  return router.createUrlTree(['/classifica']);
};
