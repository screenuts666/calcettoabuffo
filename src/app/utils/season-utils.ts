/**
 * Utility per la gestione dinamica delle stagioni calcistiche.
 * In Italia e a livello sportivo la stagione calcistica inizia il 1° Settembre
 * e si conclude il 31 Agosto dell'anno solare successivo.
 */

export const ALL_SEASONS = 'all';

/**
 * Converte qualsiasi input (stringa ISO, formato italiano DD/MM/YYYY, Timestamp Firestore, Date o millisecondi)
 * in un oggetto Date nativo valido.
 */
export function parseDate(input: any): Date | null {
  if (!input) return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  if (typeof input?.toDate === 'function') {
    return input.toDate();
  }
  if (typeof input?.seconds === 'number') {
    return new Date(input.seconds * 1000);
  }
  if (typeof input === 'number') {
    const d = new Date(input);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return null;
    if (trimmed.includes('/')) {
      const parts = trimmed.split('/');
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        const d = new Date(year, month, day);
        return isNaN(d.getTime()) ? null : d;
      }
    }
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Calcola l'anno di inizio della stagione per una determinata data.
 * Se mese >= Settembre (indice 8), la stagione inizia nell'anno solare corrente.
 * Se mese < Settembre (da Gennaio ad Agosto), la stagione è iniziata nell'anno precedente.
 */
export function getSeasonStartYear(d: Date = new Date()): number {
  const year = d.getFullYear();
  const month = d.getMonth();
  return month >= 8 ? year : year - 1;
}

/**
 * Restituisce la stringa della stagione corrente calcolata dinamicamente (es. "2026/2027").
 */
export function getCurrentSeason(now: Date = new Date()): string {
  const start = getSeasonStartYear(now);
  return `${start}/${start + 1}`;
}

/**
 * Restituisce la stringa della stagione precedente calcolata dinamicamente (es. "2025/2026").
 */
export function getPreviousSeason(now: Date = new Date()): string {
  const start = getSeasonStartYear(now) - 1;
  return `${start}/${start + 1}`;
}

/**
 * Restituisce la data minima consentita (1° settembre dell'anno di inizio della stagione corrente)
 * in formato 'YYYY-MM-DD'.
 */
export function getMinCurrentSeasonDate(now: Date = new Date()): string {
  const start = getSeasonStartYear(now);
  return `${start}-09-01`;
}

/**
 * Formatta un identificativo di stagione nel formato breve a 2 cifre (es. "2026/2027" -> "26/27").
 */
export function formatShortSeason(season: string): string {
  if (!season) return '';
  const parts = season.split('/');
  return parts.length === 2 ? `${parts[0].slice(-2)}/${parts[1].slice(-2)}` : season;
}

/**
 * Calcola la stagione di appartenenza di una qualsiasi data o partita.
 */
export function calculateSeasonForDate(input: any): string {
  const d = parseDate(input);
  if (!d) return getCurrentSeason();
  const start = getSeasonStartYear(d);
  return `${start}/${start + 1}`;
}

/**
 * Determina la stagione di una partita, dando priorità alla data effettiva giocata.
 */
export function getStagionePartita(partita: any): string {
  if (partita?.dataPartita) {
    return calculateSeasonForDate(partita.dataPartita);
  }
  if (partita?.dataOra) {
    return calculateSeasonForDate(partita.dataOra);
  }
  if (partita?.stagione) {
    return partita.stagione;
  }
  return getPreviousSeason();
}

/**
 * Verifica se una partita appartiene alla stagione corrente.
 */
export function isStagioneCorrente(partita: any): boolean {
  return getStagionePartita(partita) === getCurrentSeason();
}

export interface StagioneOption {
  id: string;
  label: string;
  shortLabel: string;
  icon: string;
  badge?: string;
}

/**
 * Genera dinamicamente la lista delle opzioni di selezione stagione.
 * Se viene passata la lista delle partite, estrae dinamicamente tutte le stagioni presenti nel database.
 */
export function getStagioniDisponibili(partite?: any[]): StagioneOption[] {
  const curr = getCurrentSeason();
  const prev = getPreviousSeason();

  const seasonSet = new Set<string>();
  seasonSet.add(curr);
  seasonSet.add(prev);

  if (partite && partite.length > 0) {
    for (const p of partite) {
      const s = getStagionePartita(p);
      if (s && s !== ALL_SEASONS) {
        seasonSet.add(s);
      }
    }
  }

  // Ordina in ordine decrescente (più recente prima)
  const sorted = Array.from(seasonSet).sort().reverse();

  const options: StagioneOption[] = sorted.map((s) => {
    const isCurr = s === curr;
    return {
      id: s,
      label: `Stagione ${s}`,
      shortLabel: formatShortSeason(s),
      icon: isCurr ? 'sparkles' : 'time-outline',
      badge: isCurr ? 'Nuova' : 'Vecchia',
    };
  });

  options.push({
    id: ALL_SEASONS,
    label: 'Tutte le Stagioni',
    shortLabel: 'Tutte',
    icon: 'globe-outline',
  });

  return options;
}

// Esportazioni dinamiche compatibili per chi importa costanti
export const CURRENT_SEASON: string = getCurrentSeason();
export const PREVIOUS_SEASON: string = getPreviousSeason();
export const MIN_CURRENT_SEASON_DATE: string = getMinCurrentSeasonDate();
export const STAGIONI: StagioneOption[] = getStagioniDisponibili();
