import { Injectable, signal, computed } from '@angular/core';
import { environment } from 'src/environments/environment';

export const V2_FEATURES_STORAGE_KEY = 'calcetto_v2_features_enabled';

/**
 * Servizio unico e centralizzato per la gestione della Feature Flag v2.0 (Account & Gmail).
 * - In PROD: Sia la visibilità nel DOM (showUiToggle) che l'abilitazione (isEnabled) sono TASSATIVAMENTE false.
 * - In DEV: Abilitato di default (true), con controllo visibile nelle Impostazioni per test e collaudo.
 */
@Injectable({
  providedIn: 'root',
})
export class V2FeaturesService {
  private readonly config = (environment as any).features?.v2Features || {
    enabled: false,
    showUiToggle: false,
  };

  /** True solo in DEV quando la configurazione d'ambiente permette il toggle UI */
  readonly showUiToggle = signal<boolean>(
    !environment.production && Boolean(this.config.showUiToggle)
  );

  /** Segnale interno per lo stato in DEV */
  private readonly _enabled = signal<boolean>(this.initEnabledState());

  /**
   * Stato reattivo unico per le funzioni v2.0 (Pulsante Account nell'header + Invio Convocati Gmail).
   * In PROD è GARANTITO al 100% false; in DEV rispecchia il toggle impostato dall'utente (default: true).
   */
  readonly isEnabled = computed<boolean>(() => {
    if (environment.production || !this.showUiToggle()) {
      return false;
    }
    return this._enabled();
  });

  private initEnabledState(): boolean {
    if (environment.production || !this.config.showUiToggle) {
      return false;
    }
    if (typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem(V2_FEATURES_STORAGE_KEY);
        if (stored !== null) {
          return stored === 'true';
        }
      } catch {}
    }
    return Boolean(this.config.enabled);
  }

  /**
   * Alterna lo stato delle feature v2.0 (Account + Gmail).
   * Inibito completamente in ambiente di produzione.
   */
  toggle(forcedValue?: boolean): boolean {
    if (environment.production || !this.showUiToggle()) {
      return false;
    }
    const nextVal = forcedValue !== undefined ? forcedValue : !this._enabled();
    this._enabled.set(nextVal);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(V2_FEATURES_STORAGE_KEY, String(nextVal));
      } catch {}
    }
    return nextVal;
  }
}

