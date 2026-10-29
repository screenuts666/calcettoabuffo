import { Partita } from '../models/partita.model';
import { PlayerPerformance } from '../models/player-performance.model';
import { MatchReportData } from '../models/mmr.model';

export interface WhatsAppShareOptions {
  includeRisultato: boolean;
  includeMarcatori: boolean;
  includePagelle: boolean;
  includeLink: boolean;
  includeFoto: boolean;
  includeCronacaAi?: boolean;
  includePronosticoAi?: boolean;
  includeCommentoPartita?: boolean;
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
  eventiGol: any[] = [],
): string {
  if (!giocatori || giocatori.length === 0)
    return '_Nessun convocato registrato_';

  return giocatori
    .map((g) => {
      let nome = (g.nome || 'Sconosciuto').trim();
      if (includeMarcatori) {
        const gol = g.gol || 0;
        const autogol = g.autogol || 0;
        const assist =
          g.assist ??
          eventiGol.filter(
            (e) =>
              e.assistId === g.id ||
              (!e.assistId && e.assistNome && e.assistNome === g.nome),
          ).length;

        const indicatori: string[] = [];

        if (gol > 0) {
          indicatori.push(gol === 1 ? '⚽' : `⚽ x${gol}`);
        }
        if (assist > 0) {
          indicatori.push(assist === 1 ? '👟' : `👟 x${assist}`);
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
  reportData?: MatchReportData,
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

  // Upset & Odds se presenti
  if (reportData?.isUpset) {
    parts.push('');
    parts.push(`🔥 *UPSET!* ${reportData.upsetDescription}`);
  } else if (reportData?.odds && (reportData.odds.probAPercent > 0 || reportData.odds.probBPercent > 0)) {
    parts.push(`⚖️ *Quote Pre-Match:* Bianchi ${reportData.odds.probAPercent}% vs ${reportData.odds.probBPercent}% Neri`);
  }

  // Risultato e Presenze
  if (options.includeRisultato) {
    parts.push('');
    if (partita.status === 'conclusa' || partita.matchConcluso) {
      parts.push('🔥 *RISULTATO FINALE*');
      parts.push(
        `🔵 *Bianchi*  ${partita.scoreA ?? 0} - ${partita.scoreB ?? 0}  *Neri* 🔴`,
      );
      if (reportData && (reportData.teamAvgMmrDeltaA !== 0 || reportData.teamAvgMmrDeltaB !== 0)) {
        const signA = reportData.teamAvgMmrDeltaA >= 0 ? '+' : '';
        const signB = reportData.teamAvgMmrDeltaB >= 0 ? '+' : '';
        parts.push(`📈 *Spostamento MMR:* Bianchi ${signA}${reportData.teamAvgMmrDeltaA} | Neri ${signB}${reportData.teamAvgMmrDeltaB}`);
      }
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
      `*Bianchi:* ${formatTeamRoster(partita.teamA, options.includeMarcatori, partita.eventiGol)}`,
    );
    parts.push(
      `*Neri:* ${formatTeamRoster(partita.teamB, options.includeMarcatori, partita.eventiGol)}`,
    );

    // Se ci sono gol con assist registrati nel tabellino
    const eventiConAssist = (partita.eventiGol || []).filter(
      (e) => !e.isAutogoal && e.assistNome,
    );
    if (options.includeMarcatori && eventiConAssist.length > 0) {
      parts.push('');
      parts.push('👟 *ASSIST VINCENTI:*');
      for (const eg of eventiConAssist) {
        parts.push(`• ⚽ ${eg.nome} _(assist di ${eg.assistNome})_`);
      }
    }
  }

  // Note a bordocampo dell'organizzatore
  const commentoPartita = (partita.commentoPartita || (partita as any)?.commento || reportData?.commentoPartita)?.trim();
  if (options.includeCommentoPartita !== false && commentoPartita) {
    parts.push('');
    parts.push('📝 *NOTE A BORDOCAMPO:*');
    parts.push(`"${commentoPartita}"`);
  }

  // Pronostico del Mister (Gemini AI)
  if (options.includePronosticoAi && (partita.pronosticoAi || reportData?.pronosticoAi)) {
    const pronostico = (partita.pronosticoAi || reportData?.pronosticoAi)!.trim();
    parts.push("");
    parts.push("🔮 *IL PRONOSTICO DEL MISTER (by Gemini AI)*");
    parts.push(`"${pronostico}"`);
  }

  // Cronaca Sportiva Ignorante (Gemini AI)
  if (options.includeCronacaAi && (partita.cronacaAi || reportData?.cronacaAi)) {
    const cronaca = (partita.cronacaAi || reportData?.cronacaAi)!.trim();
    parts.push('');
    parts.push('🎙️ *CRONACA IGNORANTE DEL MATCH (by Gemini AI)*');
    parts.push(`"${cronaca}"`);
  }

  // MVP, Goliardico e Pagelle
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
      // Calcolo MVP
      parts.push('');
      if (reportData?.mvp) {
        const mvpNote = reportData.mvp.note ? ` — _"${reportData.mvp.note}"_` : '';
        parts.push(`🏆 *MVP DELLA SERATA:* *${reportData.mvp.nome}* (${reportData.mvp.voto})${mvpNote}`);
      } else {
        const maxVoto = Number(giocatoriConVoto[0].voto);
        const mvpList = giocatoriConVoto.filter(
          (g) => Number(g.voto) === maxVoto,
        );
        if (mvpList.length === 1) {
          const nomeMvp = (mvpList[0].nome || '').trim();
          parts.push(`🏆 *MVP:* *${nomeMvp}* (${maxVoto})`);
        } else {
          const nomiMvp = mvpList.map((m) => (m.nome || '').trim()).join(', ');
          parts.push(`🏆 *MVP (pari merito - voto ${maxVoto}):* ${nomiMvp}`);
        }
      }

      // Peggiore Goliardico
      if (reportData?.worst) {
        const worstNote = reportData.worst.note ? ` — _"${reportData.worst.note}"_` : '';
        parts.push(`🩴 *Premio "Bidone d'Oro":* *${reportData.worst.nome}* (${reportData.worst.voto})${worstNote} 🍕`);
      }

      // Movimenti On Fire
      if (reportData?.onFireEntered && reportData.onFireEntered.length > 0) {
        parts.push(`🔥 *Entrati On Fire:* ${reportData.onFireEntered.map((p) => p.nome).join(', ')}`);
      }
      if (reportData?.onFireExited && reportData.onFireExited.length > 0) {
        parts.push(`❄️ *Striscia Interrotta:* ${reportData.onFireExited.map((p) => p.nome).join(', ')}`);
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
    parts.push("🔗 *Vedi tabellino completo, foto e chimica sull'app:*");
    parts.push(link);
  }

  return parts.join('\n');
}
