/**
 * Utility di formattazione temporale per tempi di gioco e presenze in campo/porta.
 */

/**
 * Converte i secondi totali giocati in formato leggibile:
 * - Se < 3600s: "50' 15\""
 * - Se >= 3600s (>= 1 ora): "18h 20' 00\""
 */
export function formatTempoTotale(secondiTotali: number | null | undefined): string {
  if (!secondiTotali || secondiTotali <= 0) return "0' 00\"";
  const secTot = Math.floor(secondiTotali);
  const ore = Math.floor(secTot / 3600);
  const min = Math.floor((secTot % 3600) / 60);
  const sec = secTot % 60;
  const secStr = sec.toString().padStart(2, '0');

  if (ore > 0) {
    const minStr = min.toString().padStart(2, '0');
    return `${ore}h ${minStr}' ${secStr}"`;
  }
  return `${min}' ${secStr}"`;
}

/**
 * Converte i minuti interi in formato leggibile:
 * - Se < 60m: "45'"
 * - Se >= 60m: "1h 30'" o "2h" (se senza minuti residui)
 */
export function formatMinuti(minutiTotali: number | null | undefined): string {
  if (!minutiTotali || minutiTotali <= 0) return "0'";
  const minTot = Math.floor(minutiTotali);
  const ore = Math.floor(minTot / 60);
  const min = minTot % 60;

  if (ore > 0) {
    if (min === 0) return `${ore}h`;
    const minStr = min.toString().padStart(2, '0');
    return `${ore}h ${minStr}'`;
  }
  return `${minTot}'`;
}
