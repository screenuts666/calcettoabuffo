import {
  Injectable,
  inject,
  signal,
  computed,
  effect,
} from '@angular/core';
import {
  Firestore,
} from '@angular/fire/firestore';
import {
  collection,
  doc,
  getDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { Storage } from '@angular/fire/storage';
import { ref, deleteObject } from 'firebase/storage';
import { ToastController } from '@ionic/angular/standalone';
import { AuthService } from './auth.service';
import { Giocatore } from '../models/giocatore.model';

export type TrashCollectionType = 'giocatori' | 'partite';

export interface TrashItem {
  id: string;
  originalId: string;
  collectionName: TrashCollectionType;
  label: string;
  subtitle?: string;
  payload: Record<string, any>;
  fotoPath?: string | null;
  deletedAt: number;
  expiresAt: number;
  deletedByUid: string;
  deletedByEmail: string | null;
}

/** Finestra di conservazione nel cestino: 24 ore (in millisecondi) */
export const TRASH_RETENTION_MS = 24 * 60 * 60 * 1000;

/** Durata del Toast per l'Undo immediato post-eliminazione (8 secondi) */
export const IMMEDIATE_UNDO_TOAST_MS = 8000;

@Injectable({
  providedIn: 'root',
})
export class TrashService {
  private firestore = inject(Firestore, { optional: true });
  private storage = inject(Storage, { optional: true });
  private auth = inject(AuthService);
  private toastCtrl = inject(ToastController);

  private trashUnsub: Unsubscribe | null = null;

  /** Lista reattiva degli elementi attualmente nel cestino (ultime 24h) */
  readonly trashItems = signal<TrashItem[]>([]);

  /** Giocatori eliminati nelle ultime 24h (ripristinabili dal Mister) */
  readonly deletedPlayers = computed<TrashItem[]>(() =>
    this.trashItems()
      .filter((i) => i.collectionName === 'giocatori')
      .sort((a, b) => b.deletedAt - a.deletedAt)
  );

  /** Partite eliminate nelle ultime 24h (ripristinabili dal Mister) */
  readonly deletedMatches = computed<TrashItem[]>(() =>
    this.trashItems()
      .filter((i) => i.collectionName === 'partite')
      .sort((a, b) => b.deletedAt - a.deletedAt)
  );

  constructor() {
    // Attiva/disattiva il listener sul cestino `_trash` automaticamente in base al ruolo Mister
    effect(() => {
      const isMister = this.auth.isSuperUser();
      if (isMister) {
        this.startTrashListener();
      } else {
        this.stopTrashListener();
        this.trashItems.set([]);
      }
    });
  }

  private startTrashListener() {
    if (this.trashUnsub || !this.firestore) return;

    const trashCol = collection(this.firestore, '_trash');
    this.trashUnsub = onSnapshot(
      trashCol,
      (snap) => {
        const now = Date.now();
        const active: TrashItem[] = [];
        const expired: TrashItem[] = [];

        snap.forEach((docSnap) => {
          const item = {
            ...(docSnap.data() as TrashItem),
            id: docSnap.id,
          };
          if (item.expiresAt <= now) {
            expired.push(item);
          } else {
            active.push(item);
          }
        });

        this.trashItems.set(active);

        // Auto-purge silenzioso degli elementi scaduti oltre le 24 ore
        for (const exp of expired) {
          this.permanentlyDeleteItem(exp.id, true).catch(() => {});
        }
      },
      () => {
        // Ignora errori di permessi durante cambi di stato auth
      }
    );
  }

  private stopTrashListener() {
    if (this.trashUnsub) {
      this.trashUnsub();
      this.trashUnsub = null;
    }
  }

  /**
   * Sposta un Giocatore nel cestino di 24 ore (`_trash/giocatori_{id}`)
   * e mostra subito il Toast "↩️ ANNULLA" di 8 secondi.
   */
  async softDeletePlayer(player: Giocatore): Promise<void> {
    if (!this.firestore || !this.auth.isSuperUser() || !player?.id) {
      throw new Error('Solo il Mister può eliminare un giocatore.');
    }

    const user = this.auth.firebaseUser();
    const now = Date.now();
    const trashId = `giocatori_${player.id}`;

    // Rimuovi il campo `id` virtuale e `phoneNumber` (protetto in sottocollezione) dal payload pubblico
    const cleanPayload: Record<string, any> = { ...player };
    delete cleanPayload['id'];
    delete cleanPayload['phoneNumber'];

    const trashItem: TrashItem = {
      id: trashId,
      originalId: player.id,
      collectionName: 'giocatori',
      label: player.nome || 'Giocatore',
      subtitle: player.soprannome
        ? `"${player.soprannome}"`
        : player.ruoloPreferito || 'Scheda giocatore',
      payload: cleanPayload,
      fotoPath: null,
      deletedAt: now,
      expiresAt: now + TRASH_RETENTION_MS,
      deletedByUid: user?.uid || 'mister',
      deletedByEmail: user?.email || null,
    };

    const batch = writeBatch(this.firestore);
    batch.set(doc(this.firestore, `_trash/${trashId}`), trashItem);
    batch.delete(doc(this.firestore, `giocatori/${player.id}`));
    await batch.commit();

    await this.presentUndoToast(
      `🗑️ "${player.nome}" eliminato (Cestino 24h)`,
      trashId
    );
  }

  /**
   * Sposta una Partita nel cestino di 24 ore (`_trash/partite_{id}`)
   * mantenendo intatta la foto su Storage finché non scadono le 24h,
   * e mostra subito il Toast "↩️ ANNULLA" di 8 secondi.
   */
  async softDeleteMatch(match: any): Promise<void> {
    if (!this.firestore || !this.auth.isSuperUser() || !match?.id) {
      throw new Error('Solo il Mister può eliminare una partita.');
    }

    const user = this.auth.firebaseUser();
    const now = Date.now();
    const trashId = `partite_${match.id}`;

    const cleanPayload: Record<string, any> = { ...match };
    delete cleanPayload['id'];

    const dataFmt = match.dataPartita
      ? new Date(match.dataPartita).toLocaleDateString('it-IT')
      : '';
    const scoreInfo =
      match.status === 'conclusa' || match.matchConcluso
        ? `Bianchi ${match.scoreA ?? 0} - ${match.scoreB ?? 0} Neri`
        : 'In programma';

    const trashItem: TrashItem = {
      id: trashId,
      originalId: match.id,
      collectionName: 'partite',
      label: `${match.luogo || 'Partita'}${dataFmt ? ' (' + dataFmt + ')' : ''}`,
      subtitle: scoreInfo,
      payload: cleanPayload,
      fotoPath: match.fotoPath || null,
      deletedAt: now,
      expiresAt: now + TRASH_RETENTION_MS,
      deletedByUid: user?.uid || 'mister',
      deletedByEmail: user?.email || null,
    };

    const batch = writeBatch(this.firestore);
    batch.set(doc(this.firestore, `_trash/${trashId}`), trashItem);
    batch.delete(doc(this.firestore, `partite/${match.id}`));
    await batch.commit();

    await this.presentUndoToast(
      `🗑️ Partita "${trashItem.label}" eliminata (Cestino 24h)`,
      trashId
    );
  }

  /**
   * Ripristina un Giocatore o una Partita dal cestino con il suo ID originale esatto!
   */
  async restoreItem(trashId: string): Promise<void> {
    if (!this.firestore || !this.auth.isSuperUser()) return;

    let item = this.trashItems().find((i) => i.id === trashId);
    if (!item) {
      const snap = await getDoc(doc(this.firestore, `_trash/${trashId}`));
      if (!snap.exists()) {
        const errToast = await this.toastCtrl.create({
          message: 'Elemento non più presente nel cestino.',
          duration: 2500,
          color: 'warning',
          position: 'bottom',
          mode: 'ios',
        });
        await errToast.present();
        return;
      }
      item = { ...(snap.data() as TrashItem), id: snap.id };
    }

    const batch = writeBatch(this.firestore);
    batch.set(
      doc(this.firestore, `${item.collectionName}/${item.originalId}`),
      item.payload
    );
    batch.delete(doc(this.firestore, `_trash/${trashId}`));
    await batch.commit();

    const okToast = await this.toastCtrl.create({
      message: `✅ "${item.label}" ripristinato con successo!`,
      duration: 3000,
      color: 'success',
      position: 'bottom',
      mode: 'ios',
    });
    await okToast.present();
  }

  /**
   * Elimina definitivamente un elemento dal cestino (e rimuove l'eventuale foto da Storage).
   */
  async permanentlyDeleteItem(
    trashId: string,
    silent = false
  ): Promise<void> {
    if (!this.firestore || !this.auth.isSuperUser()) return;

    const item = this.trashItems().find((i) => i.id === trashId);
    if (item?.collectionName === 'partite' && item.fotoPath && this.storage) {
      try {
        await deleteObject(ref(this.storage, item.fotoPath));
      } catch {
        // Ignora se la foto non esiste più su Storage
      }
    }

    await deleteDoc(doc(this.firestore, `_trash/${trashId}`));

    if (!silent) {
      const toast = await this.toastCtrl.create({
        message: 'Elemento eliminato definitivamente dal cestino.',
        duration: 2200,
        color: 'medium',
        position: 'bottom',
        mode: 'ios',
      });
      await toast.present();
    }
  }

  /**
   * Formatta il tempo rimanente prima della scadenza delle 24 ore (es. "23h 45m").
   */
  formatRemainingTime(expiresAt: number): string {
    const diffMs = Math.max(0, expiresAt - Date.now());
    const totalMinutes = Math.ceil(diffMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  }

  private async presentUndoToast(
    message: string,
    trashId: string
  ): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: IMMEDIATE_UNDO_TOAST_MS,
      position: 'bottom',
      mode: 'ios',
      color: 'dark',
      buttons: [
        {
          text: '↩️ ANNULLA',
          role: 'cancel',
          handler: () => {
            this.restoreItem(trashId);
          },
        },
      ],
    });
    await toast.present();
  }
}

