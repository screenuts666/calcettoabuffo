import { Injectable, inject, signal } from '@angular/core';
import {
  Auth,
  signInWithEmailAndPassword,
  signOut,
  authState,
} from '@angular/fire/auth';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private auth = inject(Auth);

  isAdmin = signal<boolean>(false);

  constructor() {
    authState(this.auth).subscribe((user) => {
      this.isAdmin.set(!!user);
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
  }
}
