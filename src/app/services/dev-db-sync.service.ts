import { Injectable, inject, signal } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import { initializeApp, deleteApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  writeBatch,
  doc,
  DocumentData,
} from 'firebase/firestore';
import { environment } from 'src/environments/environment';
import { environment as prodEnvironment } from 'src/environments/environment.prod';
import { AuthService } from './auth.service';

export interface DbSyncReport {
  giocatoriSynced: number;
  partiteSynced: number;
  stagioniSynced: number;
  otherDocsSynced: number;
  orphansRemoved: number;
  completedAt: string;
}

const COLLECTIONS_TO_SYNC = [
  'giocatori',
  'partite',
  'stagioni',
  'config_stagioni',
  'voti',
  'skill',
  'confronti',
] as const;

const MAX_BATCH_OPS = 400; // Sotto il limite Firestore di 500 operazioni per batch

@Injectable({
  providedIn: 'root',
})
export class DevDbSyncService {
  private devFirestore = inject(Firestore);
  private authService = inject(AuthService);

  /** True solo ed esclusivamente quando l'app gira sul progetto di sviluppo (!production) */
  readonly isDevMode: boolean =
    !environment.production &&
    environment.firebase.projectId === 'calcettoabuffone' &&
    environment.firebase.projectId !== prodEnvironment.firebase.projectId;

  isSyncing = signal<boolean>(false);
  progressMessage = signal<string>('');
  lastReport = signal<DbSyncReport | null>(null);

  /**
   * Clona in modo pulito e sicuro il database Firestore di PROD dentro DEV.
   * - Eseguibile SOLO in ambiente DEV (!environment.production)
   * - Richiede Super-Lock (Vault) sbloccato
   * - Apre una connessione temporanea READ-ONLY verso PROD (nessuna scrittura possibile su PROD)
   * - Rimuove da DEV eventuali record orfani/di test e allinea tutti i documenti con gli stessi ID di PROD.
   */
  async syncProdToDev(): Promise<DbSyncReport> {
    // 1. Guardia ferrea di ambiente: mai eseguibile in produzione
    if (
      environment.production ||
      !this.isDevMode ||
      environment.firebase.projectId === prodEnvironment.firebase.projectId
    ) {
      throw new Error(
        'Operazione bloccata per sicurezza: la copia PROD → DEV è consentita esclusivamente in DEV MODE.'
      );
    }

    // 2. Guardia di sicurezza Super User + Super-Lock (2° livello)
    if (!this.authService.isAdmin() || !this.authService.isVaultUnlocked()) {
      throw new Error(
        'Sblocca prima il Super-Lock (PIN Cassaforte) per autorizzare la sincronizzazione del database.'
      );
    }

    if (this.isSyncing()) {
      throw new Error('Sincronizzazione già in corso.');
    }

    this.isSyncing.set(true);
    this.progressMessage.set('Connessione in sola lettura a PROD...');

    let tempProdApp: FirebaseApp | null = null;

    try {
      const appName = `prod_readonly_sync_${Date.now()}`;
      tempProdApp = initializeApp(prodEnvironment.firebase, appName);
      const prodDb = getFirestore(tempProdApp);

      // Fase 1: Lettura completa da PROD in memoria prima di toccare DEV
      const prodSnapshots = new Map<
        string,
        Array<{ id: string; data: DocumentData }>
      >();

      for (const colName of COLLECTIONS_TO_SYNC) {
        this.progressMessage.set(`Lettura collezione "${colName}" da PROD...`);
        const snap = await getDocs(collection(prodDb, colName));
        const docs: Array<{ id: string; data: DocumentData }> = [];
        snap.forEach((d) => {
          docs.push({ id: d.id, data: d.data() });
        });
        prodSnapshots.set(colName, docs);
      }

      const prodPlayers = prodSnapshots.get('giocatori') || [];
      const prodMatches = prodSnapshots.get('partite') || [];

      // Salvaguardia contro letture vuote per problemi di rete
      if (prodPlayers.length === 0 && prodMatches.length === 0) {
        throw new Error(
          'Il database PROD ha restituito 0 giocatori e 0 partite. Sincronizzazione annullata per sicurezza.'
        );
      }

      // Fase 2: Preparazione operazioni di pulizia orfani + scrittura (upsert) su DEV
      type BatchOp =
        | { type: 'set'; col: string; id: string; data: DocumentData }
        | { type: 'delete'; col: string; id: string };

      const operations: BatchOp[] = [];
      let orphansRemoved = 0;

      for (const colName of COLLECTIONS_TO_SYNC) {
        this.progressMessage.set(`Confronto collezione "${colName}" con DEV...`);
        const prodDocs = prodSnapshots.get(colName) || [];
        const prodIds = new Set(prodDocs.map((d) => d.id));

        // Leggiamo i documenti attuali in DEV per rimuovere i dati sporchi/di test non presenti in PROD
        const devSnap = await getDocs(collection(this.devFirestore, colName));
        devSnap.forEach((devDoc) => {
          if (!prodIds.has(devDoc.id)) {
            operations.push({
              type: 'delete',
              col: colName,
              id: devDoc.id,
            });
            orphansRemoved++;
          }
        });

        // Programmiamo l'allineamento di tutti i documenti di PROD dentro DEV
        for (const pDoc of prodDocs) {
          operations.push({
            type: 'set',
            col: colName,
            id: pDoc.id,
            data: pDoc.data,
          });
        }
      }

      // Fase 3: Esecuzione atomica a blocchi (batch) esclusivamente su DEV
      const totalChunks = Math.max(
        1,
        Math.ceil(operations.length / MAX_BATCH_OPS)
      );
      for (let i = 0; i < operations.length; i += MAX_BATCH_OPS) {
        const chunkIndex = Math.floor(i / MAX_BATCH_OPS) + 1;
        this.progressMessage.set(
          `Scrittura pulita su DEV (lotto ${chunkIndex}/${totalChunks})...`
        );

        const batch = writeBatch(this.devFirestore);
        const chunk = operations.slice(i, i + MAX_BATCH_OPS);

        for (const op of chunk) {
          const targetRef = doc(this.devFirestore, op.col, op.id);
          if (op.type === 'delete') {
            batch.delete(targetRef);
          } else {
            batch.set(targetRef, op.data);
          }
        }

        await batch.commit();
      }

      const stagioniSynced =
        (prodSnapshots.get('stagioni')?.length || 0) +
        (prodSnapshots.get('config_stagioni')?.length || 0);
      const otherDocsSynced =
        (prodSnapshots.get('voti')?.length || 0) +
        (prodSnapshots.get('skill')?.length || 0) +
        (prodSnapshots.get('confronti')?.length || 0);

      const completedAt = new Intl.DateTimeFormat('it-IT', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(new Date());

      const report: DbSyncReport = {
        giocatoriSynced: prodPlayers.length,
        partiteSynced: prodMatches.length,
        stagioniSynced,
        otherDocsSynced,
        orphansRemoved,
        completedAt,
      };

      this.lastReport.set(report);
      this.progressMessage.set('');
      return report;
    } finally {
      this.isSyncing.set(false);
      this.progressMessage.set('');
      if (tempProdApp) {
        await deleteApp(tempProdApp).catch(() => {});
      }
    }
  }
}

