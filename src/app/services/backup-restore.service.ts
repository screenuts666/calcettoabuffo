import { Injectable, inject } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import {
  collection,
  getDocs,
  writeBatch,
  doc,
} from 'firebase/firestore';
import { AuthService } from './auth.service';

export interface DatabaseBackupPayload {
  app: string;
  version: string;
  exportedAt: string;
  exportedBy: string;
  counts: Record<string, number>;
  collections: {
    partite: any[];
    giocatori: any[];
    stagioni: any[];
    config_stagioni: any[];
    authorized_roles: any[];
  };
}

@Injectable({
  providedIn: 'root',
})
export class BackupRestoreService {
  private firestore: Firestore | null = inject(Firestore, { optional: true });
  private authService = inject(AuthService);

  /**
   * Esporta un dump JSON completo di tutte le collezioni critiche del database
   * e avvia automaticamente il download sul dispositivo locale.
   */
  async exportDatabaseSnapshot(): Promise<{ filename: string; payload: DatabaseBackupPayload }> {
    if (!this.authService.isSuperUser()) {
      throw new Error('Accesso negato: solo il Presidente o il Mister possono esportare il database.');
    }
    if (!this.firestore) {
      throw new Error('Servizio Firestore non disponibile.');
    }

    const colNames = ['partite', 'giocatori', 'stagioni', 'config_stagioni', 'authorized_roles'] as const;
    const collectionsData: Record<string, any[]> = {};
    const counts: Record<string, number> = {};

    for (const name of colNames) {
      const snap = await getDocs(collection(this.firestore, name));
      collectionsData[name] = snap.docs.map((d) => ({
        _docId: d.id,
        ...d.data(),
      }));
      counts[name] = snap.docs.length;
    }

    const now = new Date();
    const timestampStr = now.toISOString();
    const dateFormatted = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `calcetto_backup_${dateFormatted}.json`;

    const payload: DatabaseBackupPayload = {
      app: 'calcettoabbuffo',
      version: '2.0.24',
      exportedAt: timestampStr,
      exportedBy: `${this.authService.roleLabel()} (${this.authService.displayName()})`,
      counts,
      collections: {
        partite: collectionsData['partite'] || [],
        giocatori: collectionsData['giocatori'] || [],
        stagioni: collectionsData['stagioni'] || [],
        config_stagioni: collectionsData['config_stagioni'] || [],
        authorized_roles: collectionsData['authorized_roles'] || [],
      },
    };

    // Trigger download automatico via Blob
    const jsonStr = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return { filename, payload };
  }

  /**
   * Ripristina documenti da un file JSON di backup precedentemente esportato.
   * Scrive in Firestore a blocchi batch atomici (massimo 500 operazioni per batch).
   */
  async restoreDatabaseFromSnapshot(rawJson: string): Promise<{ restoredCounts: Record<string, number> }> {
    if (!this.authService.isPresidente()) {
      throw new Error('Accesso negato: solo il Presidente può ripristinare il database.');
    }
    if (!this.firestore) {
      throw new Error('Servizio Firestore non disponibile.');
    }

    let parsed: DatabaseBackupPayload;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      throw new Error('Il file fornito non è un file JSON valido.');
    }

    if (!parsed.collections || !parsed.app) {
      throw new Error('Formato backup non riconosciuto: mancano le collezioni richieste.');
    }

    const restoredCounts: Record<string, number> = {};
    const colNames = ['stagioni', 'config_stagioni', 'giocatori', 'partite', 'authorized_roles'] as const;

    for (const name of colNames) {
      const items = parsed.collections[name] || [];
      if (items.length === 0) continue;

      // Scrittura a lotti di 400 per rispettare il limite Firestore di 500
      const chunkSize = 400;
      for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        const batch = writeBatch(this.firestore);

        for (const item of chunk) {
          const docId = item._docId || item.id;
          if (!docId) continue;

          const cleanItem = { ...item };
          delete cleanItem._docId;

          const docRef = doc(this.firestore, `${name}/${docId}`);
          batch.set(docRef, cleanItem, { merge: true });
        }

        await batch.commit();
      }

      restoredCounts[name] = items.length;
    }

    return { restoredCounts };
  }
}
