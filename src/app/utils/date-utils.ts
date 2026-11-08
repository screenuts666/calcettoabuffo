/**
 * Calcola l'età esatta partendo da una data di nascita in formato:
 * - Italiano: 'GG/MM/AAAA' (es. '24/03/1996')
 * - ISO: 'YYYY-MM-DD' (es. '1996-03-24')
 * - Solo anno: '1996'
 * 
 * Permette di passare una data di riferimento (es. data visualizzata a calendario)
 * per calcolare l'età precisa in quel giorno (es. quanti anni compie nel 2027).
 */
export function calcolaEta(
  dataStr?: string | number | null,
  referenceDate: Date = new Date()
): number | null {
  if (!dataStr) return null;
  const str = String(dataStr).trim();
  if (!str) return null;

  const target =
    referenceDate instanceof Date && !isNaN(referenceDate.getTime())
      ? referenceDate
      : new Date();

  // Formato GG/MM/AAAA
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length >= 2) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const year = parts.length === 3 ? parseInt(parts[2], 10) : null;
      if (year && !isNaN(year) && year > 1900 && year <= target.getFullYear()) {
        let age = target.getFullYear() - year;
        const m = target.getMonth() + 1 - month;
        if (m < 0 || (m === 0 && target.getDate() < day)) {
          age--;
        }
        return age >= 0 ? age : null;
      }
    }
  }

  // Formato YYYY-MM-DD
  if (str.includes('-')) {
    const parts = str.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);
      if (!isNaN(year) && year > 1900 && year <= target.getFullYear()) {
        let age = target.getFullYear() - year;
        const m = target.getMonth() + 1 - month;
        if (m < 0 || (m === 0 && target.getDate() < day)) {
          age--;
        }
        return age >= 0 ? age : null;
      }
    }
  }

  // Formato solo anno (es. '1996')
  const soloAnno = parseInt(str, 10);
  if (!isNaN(soloAnno) && soloAnno > 1920 && soloAnno <= target.getFullYear()) {
    const age = target.getFullYear() - soloAnno;
    return age >= 0 ? age : null;
  }

  return null;
}

/**
 * Restituisce la stringa formattata con data di nascita ed età calcolata.
 * Es: "24/03/1996 (30 anni)" oppure "1996 (30 anni)" oppure "N.D."
 */
export function formatDataNascitaEdEta(
  g?: { dataNascita?: string | null; annoNascita?: string | number | null } | null
): string {
  if (!g) return 'N.D.';
  const data = g.dataNascita?.trim();
  const anno = g.annoNascita ? String(g.annoNascita).trim() : '';

  if (data) {
    const eta = calcolaEta(data);
    return eta !== null ? `${data} (${eta} anni)` : data;
  }

  if (anno) {
    const eta = calcolaEta(anno);
    return eta !== null ? `${anno} (${eta} anni)` : anno;
  }

  return 'N.D.';
}

