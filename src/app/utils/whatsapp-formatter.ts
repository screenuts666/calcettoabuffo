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
    return '_Nessun giocatore schierato_';

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
 * Genera l'elenco formattato dei convocati confermati e in dubbio per la fase 'convocazioni'
 */
function formatConvocatiSection(partita: Partita): string[] {
  const lines: string[] = [];
  const rsvpMap = partita.rsvp || {};
  const rsvpEntries = Object.values(rsvpMap);

  const confirmedMap = new Map<string, { nome: string; self: boolean }>();
  for (const c of partita.convocati || []) {
    if (c && (c.id || c.nome)) {
      const key = c.id || c.nome;
      confirmedMap.set(key, {
        nome: (c.nome || 'Giocatore').trim(),
        self: Boolean(c.selfRegistered || c.source === 'self'),
      });
    }
  }

  const maybeNames: string[] = [];
  for (const entry of rsvpEntries) {
    if (!entry?.playerId && !entry?.playerName) continue;
    const key = entry.playerId || entry.playerName;
    const norm = normalizeRsvpStatus(entry.status);
    if (norm === 'yes') {
      if (!confirmedMap.has(key)) {
        confirmedMap.set(key, {
          nome: (entry.playerName || 'Giocatore').trim(),
          self: entry.selfRegistered !== false,
        });
      } else {
        const curr = confirmedMap.get(key)!;
        curr.self = curr.self || entry.selfRegistered !== false;
      }
    } else if (norm === 'maybe') {
      confirmedMap.delete(key);
      if (entry.playerName) {
        maybeNames.push(entry.playerName.trim());
      }
    } else if (norm === 'no') {
      confirmedMap.delete(key);
    }
  }

  const confirmedList = Array.from(confirmedMap.values());
  lines.push(`👥 *CONVOCATI CONFERMATI (${confirmedList.length}):*`);
  if (confirmedList.length === 0) {
    lines.push('_Ancora nessun confermato, rompi il ghiaccio!_');
  } else {
    confirmedList.forEach((p, idx) => {
      lines.push(`${idx + 1}. ${p.nome}${p.self ? ' ✅' : ''}`);
    });
  }

  if (maybeNames.length > 0) {
    lines.push('');
    lines.push(`🤔 *IN DUBBIO (${maybeNames.length}):* ${maybeNames.join(', ')}`);
  }

  return lines;
}

/**
 * Genera il testo WhatsApp completo e formattato dinamicamente in base allo stato della partita
 * ('convocazioni' | 'pre_match' | 'in_corso' | 'conclusa_senza_pagelle' | 'conclusa_con_pagelle')
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
  const phase = getMatchSharePhase(partita);
  const parts: string[] = [];

  // 1. INTESTAZIONE CONTESTUALE ALLO STATO (MODERNA E PULITA)
  switch (phase) {
    case 'convocazioni':
      parts.push('*CONVOCAZIONI APERTE · CALCETTO ABBUFFO*');
      break;
    case 'pre_match':
      parts.push('*FORMAZIONI UFFICIALI · CALCETTO ABBUFFO*');
      break;
    case 'in_corso':
      parts.push('*MATCH LIVE IN CORSO · CALCETTO ABBUFFO*');
      break;
    case 'conclusa_senza_pagelle':
      parts.push('*RISULTATO FINALE · CALCETTO ABBUFFO*');
      break;
    case 'conclusa_con_pagelle':
      parts.push('*REPORT PARTITA & PAGELLE · CALCETTO ABBUFFO*');
      break;
  }

  const dataFmt = formatDataItaliana(partita.dataPartita);
  const luogo = (partita.luogo || '').trim();
  const orario = (partita.orario || '').trim();
  const metaLine: string[] = [];
  if (dataFmt) metaLine.push(`📅 ${dataFmt}`);
  if (luogo) metaLine.push(`📍 ${luogo}`);
  if (orario) metaLine.push(`⏰ ${orario}`);
  if (metaLine.length > 0) {
    parts.push(metaLine.join(' · '));
  }

  // =========================================================
  // FASE 1: CONVOCAZIONI APERTE (STEP CONVOCATI / DA DEFINIRE)
  // =========================================================
  if (phase === 'convocazioni') {
    if (options.includeRisultato) {
      parts.push('');
      parts.push(...formatConvocatiSection(partita));
    }

    const commentoConv = (
      partita.commentoPartita ||
      (partita as any)?.commento ||
      reportData?.commentoPartita
    )?.trim();
    if (options.includeCommentoPartita !== false && commentoConv) {
      parts.push('');
      parts.push('📝 *NOTE DEL MISTER:*');
      parts.push(`"${commentoConv}"`);
    }

    if (options.includeLink && partita.id) {
      const inviteLink = getMatchInviteDeepLink(partita.id);
      parts.push('');
      parts.push(
        '👉 *Tocca il link per rispondere (Partecipo / Forse / Non partecipo) e auto-inserirti nei convocati:*',
      );
      parts.push(inviteLink);
    }

    return parts.join('\n');
  }

  // =========================================================
  // FASE 2: PRE-MATCH (SQUADRE PRONTE PRIMA DEL FISCHIO D'INIZIO)
  // =========================================================
  if (phase === 'pre_match') {
    if (
      reportData?.odds &&
      (reportData.odds.probAPercent > 0 || reportData.odds.probBPercent > 0)
    ) {
      parts.push(
        `⚖️ *Quote Pre-Match:* Bianchi ${reportData.odds.probAPercent}% vs ${reportData.odds.probBPercent}% Neri`,
      );
    }

    if (options.includeRisultato) {
      parts.push('');
      parts.push('👥 *FORMAZIONI IN CAMPO*');
      parts.push(
        `⚪ *Bianchi (${partita.teamA?.length || 0}):* ${formatTeamRoster(partita.teamA, false)}`,
      );
      parts.push(
        `⚫ *Neri (${partita.teamB?.length || 0}):* ${formatTeamRoster(partita.teamB, false)}`,
      );
    }

    const commentoPre = (
      partita.commentoPartita ||
      (partita as any)?.commento ||
      reportData?.commentoPartita
    )?.trim();
    if (options.includeCommentoPartita !== false && commentoPre) {
      parts.push('');
      parts.push('📝 *NOTE A BORDOCAMPO:*');
      parts.push(`"${commentoPre}"`);
    }

    if (
      options.includePronosticoAi &&
      (partita.pronosticoAi || reportData?.pronosticoAi)
    ) {
      const pronostico = (
        partita.pronosticoAi || reportData?.pronosticoAi
      )!.trim();
      parts.push('');
      parts.push('🔮 *IL PRONOSTICO DEL MISTER (by Gemini AI)*');
      parts.push(`"${pronostico}"`);
    }

    if (options.includeLink && partita.id) {
      const link = getMatchDeepLink(partita.id);
      parts.push('');
      parts.push("🔗 *Vedi schieramento tattico, quote e chimica sull'app:*");
      parts.push(link);
    }

    return parts.join('\n');
  }

  // =========================================================
  // FASE 3, 4, 5: IN CORSO O CONCLUSA (CON O SENZA PAGELLE)
  // =========================================================
  if (reportData?.isUpset && phase !== 'in_corso') {
    parts.push('');
    parts.push(`*CLAMOROSO UPSET:* ${reportData.upsetDescription}`);
  }

  // Risultato e Presenze
  if (options.includeRisultato) {
    parts.push('');
    if (phase === 'in_corso') {
      parts.push('*PARZIALE LIVE*');
      parts.push(
        `⚪ *Bianchi*  ${partita.scoreA ?? 0} - ${partita.scoreB ?? 0}  *Neri* ⚫`,
      );
    } else {
      parts.push('*RISULTATO FINALE*');
      parts.push(
        `⚪ *Bianchi*  ${partita.scoreA ?? 0} - ${partita.scoreB ?? 0}  *Neri* ⚫`,
      );
      if (
        reportData &&
        (reportData.teamAvgMmrDeltaA !== 0 ||
          reportData.teamAvgMmrDeltaB !== 0)
      ) {
        const signA = reportData.teamAvgMmrDeltaA >= 0 ? '+' : '';
        const signB = reportData.teamAvgMmrDeltaB >= 0 ? '+' : '';
        parts.push(
          `📈 Spostamento MMR: Bianchi ${signA}${reportData.teamAvgMmrDeltaA} | Neri ${signB}${reportData.teamAvgMmrDeltaB}`,
        );
      }
    }

    parts.push('');
    parts.push('*FORMAZIONI E MARCATORI*');
    parts.push(
      `⚪ *Bianchi:* ${formatTeamRoster(partita.teamA, options.includeMarcatori, partita.eventiGol)}`,
    );
    parts.push(
      `⚫ *Neri:* ${formatTeamRoster(partita.teamB, options.includeMarcatori, partita.eventiGol)}`,
    );

    const eventiConAssist = (partita.eventiGol || []).filter(
      (e) => !e.isAutogoal && e.assistNome,
    );
    if (options.includeMarcatori && eventiConAssist.length > 0) {
      parts.push('');
      parts.push('👟 *Assist Vincenti:*');
      for (const eg of eventiConAssist) {
        parts.push(`• ⚽ ${eg.nome} _(assist di ${eg.assistNome})_`);
      }
    }
  }

  // Note a bordocampo dell'organizzatore
  const commentoPartita = (
    partita.commentoPartita ||
    (partita as any)?.commento ||
    reportData?.commentoPartita
  )?.trim();
  if (options.includeCommentoPartita !== false && commentoPartita) {
    parts.push('');
    parts.push('📝 *Note a Bordocampo:*');
    parts.push(`"${commentoPartita}"`);
  }

  // Cronaca Sportiva AI (solo per partite concluse se richiesta)
  if (
    phase !== 'in_corso' &&
    options.includeCronacaAi &&
    (partita.cronacaAi || reportData?.cronacaAi)
  ) {
    const cronaca = (partita.cronacaAi || reportData?.cronacaAi)!.trim();
    parts.push('');
    parts.push('🎙️ *Il Commento del Match (by Gemini AI):*');
    parts.push(`"${cronaca}"`);
  }

  // MVP e Pagelle (quando la partita è conclusa con pagelle)
  if (phase === 'conclusa_con_pagelle' && options.includePagelle) {
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
      parts.push('');
      if (reportData?.mvp) {
        const mvpNote = reportData.mvp.note
          ? ` — _"${reportData.mvp.note}"_`
          : '';
        parts.push(
          `🏆 *Migliore in Campo (MVP):* *${reportData.mvp.nome}* (${reportData.mvp.voto})${mvpNote}`,
        );
      } else {
        const maxVoto = Number(giocatoriConVoto[0].voto);
        const mvpList = giocatoriConVoto.filter(
          (g) => Number(g.voto) === maxVoto,
        );
        if (mvpList.length === 1) {
          const nomeMvp = (mvpList[0].nome || '').trim();
          parts.push(`🏆 *Migliore in Campo (MVP):* *${nomeMvp}* (${maxVoto})`);
        } else {
          const nomiMvp = mvpList.map((m) => (m.nome || '').trim()).join(', ');
          parts.push(`🏆 *MVP (pari merito - voto ${maxVoto}):* ${nomiMvp}`);
        }
      }

      if (reportData?.worst) {
        const worstNote = reportData.worst.note
          ? ` — _"${reportData.worst.note}"_`
          : '';
        parts.push(
          `🩴 *Premio Bidone della Serata:* *${reportData.worst.nome}* (${reportData.worst.voto})${worstNote}`,
        );
      }

      parts.push('');
      parts.push('📊 *Pagelle:*');
      for (const g of giocatoriConVoto) {
        const nome = (g.nome || 'Sconosciuto').trim();
        let riga = `• *${nome}*: *${g.voto}*`;
        if (g.note && g.note.trim().length > 0) {
          riga += ` — _"${g.note.trim()}"_`;
        }
        parts.push(riga);
      }
    }
  } else if (phase === 'conclusa_senza_pagelle') {
    parts.push('');
    parts.push('⏳ _Pagelle e voti del Mister in arrivo a breve!_');
  }

  // Link diretto alla partita (CTA principale)
  if (options.includeLink && partita.id) {
    const link = getMatchDeepLink(partita.id);
    parts.push('');
    if (phase === 'in_corso') {
      parts.push("👉 *Segui il match in tempo reale sull'app:*");
    } else if (phase === 'conclusa_senza_pagelle') {
      parts.push("👉 *Vedi tabellino e campetto tattico sull'app:*");
    } else {
      parts.push("👉 *Pagelle, campetto interattivo e commenti Terzo Tempo sull'app:*");
    }
    parts.push(link);
  }

  return parts.join('\n');
}

/**
 * Formatta il messaggio WhatsApp di disponibilità settimanale in modo sobrio,
 * professionale e senza emoji ridondanti.
 */
export function formatWeeklyAvailabilityForWhatsApp(
  daySummaries: { dayName: string; voterCount: number; hasQuorum: boolean }[],
  missingAthletes: string[]
): string {
  const parts: string[] = [];
  const fullDayNames: Record<string, string> = {
    Lun: 'Lunedì',
    Mar: 'Martedì',
    Mer: 'Mercoledì',
    Gio: 'Giovedì',
    Ven: 'Venerdì',
    Sab: 'Sabato',
    Dom: 'Domenica',
  };

  parts.push('*CALCETTO ABBUFFO — DISPONIBILITÀ SETTIMANA*');
  parts.push('');
  parts.push('Ragazzi, votate i giorni in cui potete giocare:');
  parts.push('');

  for (const d of daySummaries) {
    const nome = fullDayNames[d.dayName] || d.dayName;
    const nota = d.hasQuorum
      ? ' (quorum raggiunto)'
      : d.voterCount >= 8
        ? ' (quorum quasi raggiunto)'
        : '';
    parts.push(`• ${nome}: ${d.voterCount} atleti${nota}`);
  }

  parts.push('');
  parts.push('Vota qui le tue date (puoi sceglierne più di una):');
  parts.push(`${getAppBaseUrl()}/calendario`);

  if (missingAthletes.length > 0) {
    parts.push('');
    const preview = missingAthletes.slice(0, 5).join(', ');
    const extra = missingAthletes.length > 5 ? ` e altri ${missingAthletes.length - 5}` : '';
    parts.push(`Mancano all'appello: ${preview}${extra}`);
  }

  return parts.join('\n');
}
