import { Injectable, inject } from '@angular/core';
import { ToastController } from '@ionic/angular/standalone';
import { Partita } from '../models/partita.model';
import {
  getAppBaseUrl,
  getMatchDeepLink,
  getMatchInviteDeepLink,
  formatMatchForWhatsApp,
  formatWeeklyAvailabilityForWhatsApp,
} from '../utils/whatsapp-formatter';

export interface ShareDirectOptions {
  title?: string;
  text: string;
  url?: string;
}

@Injectable({
  providedIn: 'root',
})
export class ShareService {
  private toastCtrl = inject(ToastController);

  /**
   * Condivisione diretta One-Tap:
   * 1. Usa Web Share API nativa se disponibile (mobile Android / iOS).
   * 2. In alternativa apre WhatsApp direttamente (wa.me) e copia il link negli appunti.
   */
  async shareDirect(options: ShareDirectOptions): Promise<void> {
    const title = options.title || 'Calcetto Abbuffo';
    const text = options.text;
    const url = options.url || '';

    // Verifica se la Web Share API è supportata (es. su mobile)
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({
          title,
          text,
          url: url || undefined,
        });
        return;
      } catch (err: any) {
        // Se l'utente annulla il dialog di condivisione nativo, usciamo silenziosamente
        if (err?.name === 'AbortError') return;
      }
    }

    // Fallback: Copia negli appunti e apri WhatsApp
    const messageToShare = url && !text.includes(url) ? `${text}\n${url}` : text;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(messageToShare);
      }
    } catch {
      // Ignora errori clipboard non autorizzati
    }

    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(messageToShare)}`;
    window.open(waUrl, '_blank');

    const toast = await this.toastCtrl.create({
      message: 'Messaggio copiato e WhatsApp aperto!',
      duration: 2000,
      position: 'bottom',
      color: 'success',
    });
    await toast.present();
  }

  /**
   * Caso A — Condivisione / Sollecito Disponibilità Settimana:
   * Se c'è un giorno favorito:
   * ⚽ *Calcetto* • Votate le disponibilità! (Top: *Mer 11* con 9 presenti)
   * 👉 <LINK_APP>
   * Se non ci sono ancora voti:
   * ⚽ *Calcetto* • Quando giochiamo questa settimana? Votate qui:
   * 👉 <LINK_APP>
   */
  async shareWeeklyAvailability(
    topDay?: { label?: string; dayName?: string; count?: number; voterCount?: number; hasQuorum?: boolean } | null
  ): Promise<void> {
    const text = formatWeeklyAvailabilityForWhatsApp(topDay);
    const link = `${getAppBaseUrl()}/disponibilita`;
    await this.shareDirect({
      title: 'Disponibilità Calcetto',
      text,
      url: link,
    });
  }

  /**
   * Condivisione Partita:
   * - Caso B (Creata / Convocazioni / In programma):
   *   ⚽ *Partita Mer 11 Nov (ore 21:00)* • 10/10 convocati (o "Mancano 2!")
   *   👉 <LINK_PARTITA>
   * - Caso C (Risultato / Pagelle Post-Partita):
   *   🏆 *Finale: Squadra A 6 - 4 Squadra B* • Voti e classifica:
   *   👉 <LINK_PARTITA>
   */
  async shareMatch(match: Partita | any, isInvite = false): Promise<void> {
    if (!match) return;

    const text = formatMatchForWhatsApp(match);
    const link = isInvite
      ? getMatchInviteDeepLink(match.id)
      : getMatchDeepLink(match.id);

    await this.shareDirect({
      title: 'Calcetto Abbuffo',
      text,
      url: link,
    });
  }
}
