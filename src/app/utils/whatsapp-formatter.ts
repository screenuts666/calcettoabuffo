import { Partita, normalizeRsvpStatus } from '../models/partita.model';
import { PlayerPerformance } from '../models/player-performance.model';
import { MatchReportData } from '../models/mmr.model';
import { environment } from 'src/environments/environment';

export type MatchSharePhase =
  | 'convocazioni'
  | 'pre_match'
  | 'in_corso'
  | 'conclusa_senza_pagelle'
  | 'conclusa_con_pagelle';

export interface WhatsAppShareOptions {
  includeRisultato?: boolean;
  includeMarcatori?: boolean;
  includePagelle?: boolean;
  includeLink?: boolean;
  includeFoto?: boolean;
  includeCronacaAi?: boolean;
  includePronosticoAi?: boolean;
  includeCommentoPartita?: boolean;
}

/**
 * Restituisce l'URL base dell'ambiente corrente:
 * - DEV / Staging: https://calcettoabuffone.web.app
 * - PROD: https://calcettoabuffone-prod.web.app
 */
export function getAppBaseUrl(): string {
  return (
    environment.appUrl ||
    (environment.production
      ? 'https://calcettoabuffone-prod.web.app'
      : 'https://calcettoabuffone.web.app')
  );
}

/**
 * Restituisce l'URL deep link della partita per l'ambiente attivo (DEV o PROD).
 */
export function getMatchDeepLink(matchId?: string): string {
  if (!matchId) return '';
  return `${getAppBaseUrl()}/partite/${matchId}`;
}

/**
 * Restituisce l'URL deep link di invito alla partita (con query param ?invite=true)
 * per l'auto-RSVP nello step Giocatori Convocati (usa il dominio DEV in dev e PROD in prod).
 */
export function getMatchInviteDeepLink(matchId?: string): string {
  if (!matchId) return '';
  return `${getMatchDeepLink(matchId)}?invite=true`;
}

/**
 * Determina la fase/stato corrente della partita per adattare la condivisione WhatsApp
 */
export function getMatchSharePhase(partita?: Partita | null): MatchSharePhase {
  if (!partita) return 'convocazioni';

  const isConclusa = partita.status === 'conclusa' || Boolean(partita.matchConcluso);
  if (isConclusa) {
    const hasVoti =
      Boolean(partita.pagelleInserite) ||
      [...(partita.teamA || []), ...(partita.teamB || [])].some(
        (g) =>
          g.voto !== undefined &&
          g.voto !== null &&
          !isNaN(Number(g.voto)) &&
          Number(g.voto) > 0,
      );
    return hasVoti ? 'conclusa_con_pagelle' : 'conclusa_senza_pagelle';
  }

  if (partita.status === 'in_corso') {
    return 'in_corso';
  }

  const hasTeams =
    (partita.teamA?.length || 0) > 0 && (partita.teamB?.length || 0) > 0;

  if (partita.step === 'convocati' || partita.step === 'dettagli') {
    return 'convocazioni';
  }

  if (partita.status === 'pronta' || hasTeams) {
    return 'pre_match';
  }

  return 'convocazioni';
}

/**
 * Formatta un numero di telefono per il protocollo tel: (chiamata telefonica diretta)
 */
export function formatPhoneForTel(phone?: string | null): string {
  if (!phone) return '';
  const cleaned = phone.trim().replace(/[^\d+]/g, '');
  return cleaned ? `tel:${cleaned}` : '';
}

/**
 * Formatta un numero di telefono per l'apertura diretta della chat WhatsApp (https://wa.me/...)
 * Aggiunge automaticamente il prefisso internazionale italiano (39) se il numero è un cellulare italiano a 9-10 cifre senza prefisso.
 */
export function formatPhoneForWhatsAppUrl(phone?: string | null): string {
  if (!phone) return '';
  let digits = phone.trim().replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }
  if (digits.length === 10 && digits.startsWith('3')) {
    digits = `39${digits}`;
  }
  return `https://wa.me/${digits}`;
}

/**
 * Formatta la data in formato breve italiano (es. Mer 11 Nov)
 */
export function formatDataBreveItaliana(dataIso?: string): string {
  if (!dataIso) return '';
  try {
    const cleanDate = dataIso.split('T')[0];
    const [y, m, d] = cleanDate.split('-').map(Number);
    const dObj = new Date(y, m - 1, d);
    if (isNaN(dObj.getTime())) return dataIso;
    const weekday = dObj.toLocaleDateString('it-IT', { weekday: 'short' });
    const month = dObj.toLocaleDateString('it-IT', { month: 'short' }).replace('.', '');
    const capW = weekday.charAt(0).toUpperCase() + weekday.slice(1).replace('.', '');
    const capM = month.charAt(0).toUpperCase() + month.slice(1);
    return `${capW} ${d} ${capM}`;
  } catch {
    return dataIso;
  }
}

/**
 * Genera il testo WhatsApp ultra-compatto (max 2-3 righe) in base allo stato della partita:
 * - Caso B (Creata / Convocazioni):
 *   ⚽ *Partita Mer 11 Nov (ore 21:00)* • 10/10 convocati (o "Mancano 2!")
 *   👉 <LINK_PARTITA>
 * - Caso C (Risultato / Pagelle Post-Partita):
 *   🏆 *Finale: Squadra A 6 - 4 Squadra B* • Voti e classifica:
 *   👉 <LINK_PARTITA>
 */
export function formatMatchForWhatsApp(
  partita: Partita,
  _options?: WhatsAppShareOptions,
  _reportData?: MatchReportData,
): string {
  if (!partita) return '';

  const isConclusa =
    partita.status === 'conclusa' || Boolean(partita.matchConcluso);

  if (isConclusa) {
    // Caso C — Risultato / Pagelle Post-Partita
    const scoreA = partita.scoreA ?? 0;
    const scoreB = partita.scoreB ?? 0;
    const teamAName = ((partita as any).teamAName || 'Bianchi').trim();
    const teamBName = ((partita as any).teamBName || 'Neri').trim();
    const link = getMatchDeepLink(partita.id);
    return `🏆 *Finale: ${teamAName} ${scoreA} - ${scoreB} ${teamBName}* • Voti e classifica:\n👉 ${link}`;
  }

  // Caso B — Convocazioni / In programma
  const dateStr = formatDataBreveItaliana(partita.dataPartita);
  const orarioStr = partita.orario ? ` (ore ${partita.orario})` : '';
  const count = (partita.convocati || []).length;
  const statusPosti =
    count >= 10 ? '10/10 convocati' : `Mancano ${10 - count}!`;

  const link = (partita.step === 'convocati' || !partita.teamA || partita.teamA.length === 0)
    ? getMatchInviteDeepLink(partita.id)
    : getMatchDeepLink(partita.id);

  const matchLabel = dateStr ? `Partita ${dateStr}${orarioStr}` : 'Partita Calcetto';
  return `⚽ *${matchLabel}* • ${statusPosti}\n👉 ${link}`;
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
export function formatWeeklyAvailabilityForWhatsApp(
  topDay?: { label?: string; dayName?: string; count?: number; voterCount?: number } | null
): string {
  const link = `${getAppBaseUrl()}/calendario`;
  const count = topDay?.count ?? topDay?.voterCount ?? 0;
  const label = topDay?.label || topDay?.dayName || '';

  if (count > 0 && label) {
    return `⚽ *Calcetto* • Votate le disponibilità! (Top: *${label}* con ${count} presenti)\n👉 ${link}`;
  }
  return `⚽ *Calcetto* • Quando giochiamo questa settimana? Votate qui:\n👉 ${link}`;
}
