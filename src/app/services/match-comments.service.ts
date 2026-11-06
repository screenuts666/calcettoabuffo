import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  addDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { MatchComment } from '../models/match-comment.model';

@Injectable({
  providedIn: 'root',
})
export class MatchCommentsService {
  private firestore = inject(Firestore, { optional: true });

  /**
   * Ascolta in tempo reale i commenti per una determinata partita, ordinati cronologicamente
   */
  getComments$(matchId: string): Observable<MatchComment[]> {
    return new Observable<MatchComment[]>((subscriber) => {
      if (!this.firestore || !matchId) {
        subscriber.next([]);
        return;
      }

      try {
        const commentsCol = collection(
          this.firestore,
          `partite/${matchId}/commenti`
        );
        const q = query(commentsCol, orderBy('createdAt', 'asc'));

        const unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            const list: MatchComment[] = [];
            snapshot.forEach((snapDoc) => {
              const data = snapDoc.data() as any;
              list.push({
                id: snapDoc.id,
                matchId: data.matchId || matchId,
                authorUid: data.authorUid,
                authorName: data.authorName || 'Anonimo',
                authorPhotoUrl: data.authorPhotoUrl || null,
                authorRole: data.authorRole || 'user',
                playerId: data.playerId || null,
                playerTeam: data.playerTeam || null,
                playerBadge: data.playerBadge || null,
                text: data.text || '',
                createdAt: data.createdAt || new Date().toISOString(),
              });
            });
            subscriber.next(list);
          },
          (err) => {
            console.warn(`[MatchComments] Avviso sync commenti partita ${matchId}:`, err);
            subscriber.next([]);
          }
        );

        return () => unsubscribe();
      } catch (err) {
        console.warn(`[MatchComments] Errore inizializzazione listener ${matchId}:`, err);
        subscriber.next([]);
        return;
      }
    });
  }

  /**
   * Invia un nuovo commento per la partita
   */
  async addComment(
    matchId: string,
    comment: Omit<MatchComment, 'id'>
  ): Promise<string> {
    if (!this.firestore) {
      throw new Error('Firestore non configurato');
    }
    const commentsCol = collection(
      this.firestore,
      `partite/${matchId}/commenti`
    );
    const cleanData = {
      ...comment,
      matchId,
      createdAt: comment.createdAt || new Date().toISOString(),
    };
    const docRef = await addDoc(commentsCol, cleanData);
    return docRef.id;
  }

  /**
   * Rimuove un commento (consentito all'autore o al Mister)
   */
  async deleteComment(matchId: string, commentId: string): Promise<void> {
    if (!this.firestore) return;
    const docRef = doc(
      this.firestore,
      `partite/${matchId}/commenti/${commentId}`
    );
    await deleteDoc(docRef);
  }
}
