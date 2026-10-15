import { Injectable, inject, signal } from '@angular/core';
import {
  Auth,
  signInWithEmailAndPassword,
  signOut,
  authState,
} from '@angular/fire/auth';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private auth = inject(Auth);

  // In ambiente di sviluppo (dev), l'utente ha sempre tutti i permessi di superuser
  isAdmin = signal<boolean>(!environment.production);

  constructor() {
    authState(this.auth).subscribe((user) => {
      if (!environment.production) {
        this.isAdmin.set(true);
      } else {
        this.isAdmin.set(!!user);
      }
    });
  }

  async loginAdmin(email: string, password: string) {
    try {
      await signInWithEmailAndPassword(this.auth, email, password);
      return true;
    } catch (error) {
      console.error('Errore di login:', error);
      throw error;
    }
  }

  async logoutAdmin() {
    await signOut(this.auth);
    if (!environment.production) {
      this.isAdmin.set(true);
    }
  }
}
