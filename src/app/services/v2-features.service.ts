import { Injectable, signal } from '@angular/core';

/**
 * Servizio unico e centralizzato per la gestione della Feature Flag v2.0 (Account & Gmail).
 * Ora ATTIVO al 100% sia in DEV che in PROD.
 */
@Injectable({
  providedIn: 'root',
})
export class V2FeaturesService {
  /**
   * Switch manuale rimosso dalla UI delle impostazioni.
   */
  readonly showUiToggle = signal<boolean>(false);

  /**
   * Stato reattivo unico per le funzioni v2.0 (Account Google, Invio Convocati Gmail, Bacheca Terzo Tempo).
   * Attivo al 100% in tutti gli ambienti (DEV e PROD).
   */
  readonly isEnabled = signal<boolean>(true);

  toggle(forcedValue?: boolean): boolean {
    const nextVal = forcedValue !== undefined ? forcedValue : !this.isEnabled();
    this.isEnabled.set(nextVal);
    return nextVal;
  }
}
