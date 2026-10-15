import { Partita } from '../models/partita.model';
import { PlayerPerformance } from '../models/player-performance.model';

export interface WhatsAppShareOptions {
  includeRisultato: boolean;
  includeMarcatori: boolean;
  includePagelle: boolean;
  includeLink: boolean;
  includeFoto: boolean;
}

/**
 * Restituisce l'URL deep link della partita basandosi dinamicamente su window.location.origin
 * con fallback di sicurezza sull'ambiente di produzione.
 */
export function getMatchDeepLink(matchId?: string): string {
  if (!matchId) return '';
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://calcettoabuffone-prod.web.app';
  return `${origin}/partite/${matchId}`;
}

/**
 * Formatta la data in formato leggibile italiano (es. Mercoledì 15 Ottobre 2026)
 */
function formatDataItaliana(dataIso?: string): string {
  if (!dataIso) return '';
  try {
    const d = new Date(dataIso + 'T00:00:00');
    if (isNaN(d.getTime())) return dataIso;
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    };
    const formattata = new Intl.DateTimeFormat('it-IT', options).format(d);
    return formattata.charAt(0).toUpperCase() + formattata.slice(1);
  } catch {
    return dataIso;
  }
}

/**
 * Formatta i giocatori di una squadra con presenze ed eventuali gol/autogol
 */
function formatTeamRoster(
  giocatori: PlayerPerformance[] = [],
  includeMarcatori: boolean,
): string {
  if (!giocatori || giocatori.length === 0)
    return '_Nessun convocato registrato_';

  return giocatori
    .map((g) => {
      let nome = (g.nome || 'Sconosciuto').trim();
      if (includeMarcatori) {
        const gol = g.gol || 0;
        const autogol = g.autogol || 0;
        const indicatori: string[] = [];

        if (gol > 0) {
          indicatori.push(gol === 1 ? '⚽' : `⚽ x${gol}`);
        }
        if (autogol > 0) {
          indicatori.push(autogol === 1 ? '(AG)' : `(AG x${autogol})`);
        }

        if (indicatori.length > 0) {
          nome += ` ${indicatori.join(' ')}`;
        }
      }
      return nome;
    })
    .join(', ');
}

/**
 * Genera il testo WhatsApp completo e formattato secondo le opzioni selezionate
 */
export function formatMatchForWhatsApp(
  partita: Partita,
  options: WhatsAppShareOptions = {
    includeRisultato: true,
    includeMarcatori: true,
    includePagelle: true,
    includeLink: true,
    includeFoto: true,
  },
): string {
  const parts: string[] = [];

  // Intestazione
  parts.push('⚽ *REPORT MATCH* ⚽');

  const dataFmt = formatDataItaliana(partita.dataPartita);
  if (dataFmt) {
    parts.push(`📅 *${dataFmt}*`);
  }
  const luogo = (partita.luogo || '').trim();
  const orario = (partita.orario || '').trim();
  if (luogo || orario) {
    const dettagli: string[] = [];
    if (luogo) dettagli.push(`📍 *${luogo}*`);
    if (orario) dettagli.push(`⏰ *${orario}*`);
    parts.push(dettagli.join(' | '));
  }

  // Risultato e Presenze
  if (options.includeRisultato) {
    parts.push('');
    if (partita.status === 'conclusa') {
      parts.push('🔥 *RISULTATO FINALE*');
      parts.push(
        `🔵 *Bianchi*  ${partita.scoreA ?? 0} - ${partita.scoreB ?? 0}  *Neri* 🔴`,
      );
    } else if (partita.status === 'in_corso') {
      parts.push('⚡ *PARZIALE LIVE*');
      parts.push(
        `🔵 *Bianchi*  ${partita.scoreA ?? 0} - ${partita.scoreB ?? 0}  *Neri* 🔴`,
      );
    } else {
      parts.push('📋 *IN PROGRAMMA*');
      parts.push('🔵 *Bianchi* vs *Neri* 🔴');
    }

    parts.push('');
    parts.push('👥 *PRESENZE E FORMAZIONI*');
    parts.push(
      `*Bianchi:* ${formatTeamRoster(partita.teamA, options.includeMarcatori)}`,
    );
    parts.push(
      `*Neri:* ${formatTeamRoster(partita.teamB, options.includeMarcatori)}`,
    );
  }

  // Pagelle, MVP e Commenti
  if (options.includePagelle) {
    const tuttiGiocatori: PlayerPerformance[] = [
      ...(partita.teamA || []),
      ...(partita.teamB || []),
    ];

    const giocatoriConVoto = tuttiGiocatori
      .filter(
        (g) =>
          g.voto !== undefined &&
          g.voto !== null &&
          !isNaN(Number(g.voto)) &&
          Number(g.voto) > 0,
      )
      .sort((a, b) => {
        const diff = Number(b.voto) - Number(a.voto);
        if (diff !== 0) return diff;
        return (a.nome || '').localeCompare(b.nome || '');
      });

    if (giocatoriConVoto.length > 0) {
      // Calcolo MVP (voto massimo)
      const maxVoto = Number(giocatoriConVoto[0].voto);
      const mvpList = giocatoriConVoto.filter(
        (g) => Number(g.voto) === maxVoto,
      );

      parts.push('');
      if (mvpList.length === 1) {
        const nomeMvp = (mvpList[0].nome || '').trim();
        parts.push(`🏆 *MVP:* *${nomeMvp}* (${maxVoto})`);
      } else {
        const nomiMvp = mvpList.map((m) => (m.nome || '').trim()).join(', ');
        parts.push(`🏆 *MVP (pari merito - voto ${maxVoto}):* ${nomiMvp}`);
      }

      parts.push('');
      parts.push('📊 *PAGELLE E COMMENTI*');
      for (const g of giocatoriConVoto) {
        const nome = (g.nome || 'Sconosciuto').trim();
        let riga = `• *${nome}*: *${g.voto}*`;
        if (g.note && g.note.trim().length > 0) {
          riga += ` — _"${g.note.trim()}"_`;
        }
        parts.push(riga);
      }
    } else {
      parts.push('');
      parts.push('📊 *PAGELLE:* _Non ancora inserite_');
    }
  }

  // Link diretto alla partita
  if (options.includeLink && partita.id) {
    const link = getMatchDeepLink(partita.id);
    parts.push('');
    parts.push("🔗 *Vedi tabellino, foto e pagelle sull'app:*");
    parts.push(link);
  }

  return parts.join('\n');
}
