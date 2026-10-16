export const DEFAULT_AVATAR = 'assets/default-avatar.svg';

/**
 * Restituisce un URL valido per l'avatar del giocatore.
 * Se fotoUrl è assente, vuoto o punta alla demo obsoleta di Ionic (che risponde con 403 Forbidden),
 * restituisce l'avatar predefinito locale SVG.
 */
export function getAvatarUrl(fotoUrl?: string | null): string {
  if (!fotoUrl || typeof fotoUrl !== 'string') {
    return DEFAULT_AVATAR;
  }
  const clean = fotoUrl.trim();
  if (
    !clean ||
    clean === 'null' ||
    clean === 'undefined' ||
    clean.includes('ionicframework.com/docs/img/demos/avatar.svg') ||
    clean.includes('ionicframework.com')
  ) {
    return DEFAULT_AVATAR;
  }
  return clean;
}

/**
 * Gestore dell'evento (error) per i tag <img> degli avatar.
 * Se l'immagine remota fallisce (es. 404, connessione caduta, link rimosso),
 * imposta istantaneamente l'avatar predefinito locale.
 */
export function handleAvatarError(event: Event, fallback = DEFAULT_AVATAR): void {
  const target = event.target as HTMLImageElement;
  if (target && target.src && !target.src.endsWith(fallback)) {
    target.src = fallback;
  }
}
