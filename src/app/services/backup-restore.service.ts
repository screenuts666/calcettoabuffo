import { Injectable, inject } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import {
  collection,
  getDocs,
  writeBatch,
  doc,
} from 'firebase/firestore';
import {
  Auth,
  GoogleAuthProvider,
  signInWithPopup,
} from '@angular/fire/auth';
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
  private auth: Auth | null = inject(Auth, { optional: true });
  private authService = inject(AuthService);

  private driveAccessToken: string | null = null;

  /**
   * Genera l'intero snapshot JSON di tutte le collezioni del database.
   */
  async buildBackupPayload(): Promise<{ filename: string; jsonStr: string; payload: DatabaseBackupPayload }> {
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
      version: '2.0.25',
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

    const jsonStr = JSON.stringify(payload, null, 2);
    return { filename, jsonStr, payload };
  }

  /**
   * Esporta un dump JSON completo di tutte le collezioni del database
   * e avvia il download locale del file sul dispositivo.
   */
  async exportDatabaseSnapshot(): Promise<{ filename: string; payload: DatabaseBackupPayload }> {
    const { filename, jsonStr, payload } = await this.buildBackupPayload();

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
   * Salva il backup direttamente su Google Drive dell'utente autenticato
   * (all'interno della cartella dedicata "Calcetto Abbuffo - Backup").
   */
  async uploadBackupToGoogleDrive(): Promise<{ filename: string; webViewLink?: string; folderName: string }> {
    if (!this.authService.isSuperUser()) {
      throw new Error('Accesso negato: solo il Presidente o il Mister possono eseguire il backup.');
    }
    if (!this.auth) {
      throw new Error('Servizio Google Auth non disponibile.');
    }

    // 1. Ottieni il token OAuth 2.0 con scope `drive.file`
    let token = this.driveAccessToken;
    if (!token) {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/drive.file');
      provider.setCustomParameters({
        prompt: 'consent',
      });
      const cred = await signInWithPopup(this.auth, provider);
      const googleCred = GoogleAuthProvider.credentialFromResult(cred);
      token = googleCred?.accessToken || null;
      if (!token) {
        throw new Error('Impossibile ottenere l\'autorizzazione per Google Drive.');
      }
      this.driveAccessToken = token;
    }

    // 2. Genera il payload del backup
    const { filename, jsonStr } = await this.buildBackupPayload();

    // 3. Trova o crea la cartella "Calcetto Abbuffo - Backup" su Google Drive
    const folderName = 'Calcetto Abbuffo - Backup';
    const folderQuery = encodeURIComponent(
      `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    );

    let folderId: string | null = null;
    try {
      const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${folderQuery}&fields=files(id,name)`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (searchRes.status === 401) {
        this.driveAccessToken = null;
        throw new Error('Sessione Google Drive scaduta. Riprova per riconnetterti.');
      }
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        folderId = searchData.files?.[0]?.id || null;
      }
    } catch (e: any) {
      if (e?.message?.includes('scaduta')) throw e;
    }

    if (!folderId) {
      const createFolderRes = await fetch(
        'https://www.googleapis.com/drive/v3/files',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
          }),
        },
      );
      if (!createFolderRes.ok) {
        throw new Error('Impossibile creare la cartella di backup su Google Drive.');
      }
      const folderData = await createFolderRes.json();
      folderId = folderData.id;
    }

    // 4. Esegui l'upload multipart del file JSON all'interno della cartella Drive
    const now = new Date();
    const metadata = {
      name: filename,
      parents: folderId ? [folderId] : [],
      mimeType: 'application/json',
      description: `Backup Calcetto Abbuffo generato il ${now.toLocaleString('it-IT')}`,
    };

    const boundary = '-------CalcettoDriveBackup' + Date.now();
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelim = `\r\n--${boundary}--`;

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      jsonStr +
      closeDelim;

    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartRequestBody,
      },
    );

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error('Errore caricamento su Google Drive:', errText);
      throw new Error(`Errore caricamento su Google Drive (status ${uploadRes.status})`);
    }

    const fileData = await uploadRes.json();
    return {
      filename,
      webViewLink: fileData.webViewLink,
      folderName,
    };
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
