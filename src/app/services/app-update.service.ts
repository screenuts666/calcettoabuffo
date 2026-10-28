import { Injectable, inject, signal, isDevMode } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { ToastController } from '@ionic/angular/standalone';
import { APP_VERSION_INFO } from 'src/environments/version';

export interface ServerVersionPayload {
  version: string;
  buildId: string;
  timestamp: number;
  buildDate?: string;
}

const STORAGE_BUILD_ID_KEY = 'calcetto_app_build_id';
const STORAGE_VERSION_KEY = 'calcetto_app_version';
const STORAGE_RELOAD_GUARD_KEY = 'calcetto_reloaded_for_build';
const STORAGE_JUST_UPDATED_KEY = 'calcetto_just_updated_to';

// Chiavi localStorage da preservare durante il purge di versione
const PRESERVED_LOCAL_STORAGE_PREFIXES = [
  'calcetto_theme_preference',
  'calcettoabbuffo_active_match',
  'calcetto_active_match_backup_v1',
  'firebase:authUser:',
  'firebase:host:',
];

@Injectable({
  providedIn: 'root',
})
export class AppUpdateService {
  private swUpdate = inject(SwUpdate);
  private toastCtrl = inject(ToastController);

  readonly version: string = APP_VERSION_INFO.version;
  readonly buildId: string = APP_VERSION_INFO.buildId;
  readonly buildDate: string = APP_VERSION_INFO.buildDate;

  isChecking = signal<boolean>(false);
  isUpdating = signal<boolean>(false);

  private initialized = false;
  private checkIntervalId: ReturnType<typeof setInterval> | null = null;

  init(): void {
    if (this.initialized || typeof window === 'undefined') {
      return;
    }
    this.initialized = true;

    // 1. Pulisce eventuale parametro ?_v=... usato per il cache-busting dell'URL
    this.cleanCacheBusterFromUrl();

    // 2. Allinea il buildId corrente in localStorage e mostra notifica se appena aggiornato
    this.syncCurrentBuildInStorage();

    // 3. Intercetta errori di caricamento chunk lazy (es. dopo un nuovo deploy mentre l'app era aperta)
    this.installChunkErrorAutoRecovery();

    // 4. Configura listener sul Service Worker Angular (SwUpdate)
    if (this.swUpdate.isEnabled) {
      this.swUpdate.versionUpdates.subscribe((evt) => {
        if (evt.type === 'VERSION_READY') {
          this.swUpdate
            .activateUpdate()
            .catch(() => {})
            .finally(() => {
              this.forcePurgeAndReload(undefined, undefined, false);
            });
        } else if (evt.type === 'VERSION_INSTALLATION_FAILED') {
          console.warn(
            '[AppUpdate] Installazione SW fallita, avvio pulizia profonda cache...'
          );
          this.forcePurgeAndReload(undefined, undefined, false);
        }
      });

      this.swUpdate.unrecoverable.subscribe(() => {
        console.warn(
          '[AppUpdate] Stato Service Worker irrecuperabile, avvio pulizia profonda...'
        );
        this.forcePurgeAndReload(undefined, undefined, false);
      });
    }

    // 5. In modalità produzione/staging (non localhost dev-server), controlla subito e periodicamente /version.json
    if (!isDevMode()) {
      this.checkForNewVersion(false);

      // Controlla ogni 2 minuti
      this.checkIntervalId = setInterval(() => {
        this.checkForNewVersion(false);
      }, 2 * 60 * 1000);

      // Controlla ogni volta che la PWA o il tab di Chrome torna visibile o in focus
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.checkForNewVersion(false);
        }
      });

      window.addEventListener('focus', () => {
        this.checkForNewVersion(false);
      });

      window.addEventListener('online', () => {
        this.checkForNewVersion(false);
      });

      // Gestisce il ripristino dalla Back/Forward Cache (bfcache) di Chrome / iOS Safari
      window.addEventListener('pageshow', (event: PageTransitionEvent) => {
        if (event.persisted) {
          this.checkForNewVersion(false);
        }
      });
    }
  }

  /**
   * Controlla sul server `/version.json` (bypassando qualsiasi cache HTTP/SW)
   * se è stata rilasciata una versione più recente rispetto a quella in esecuzione.
   */
  async checkForNewVersion(manual = false): Promise<boolean> {
    if (typeof window === 'undefined' || this.isUpdating()) {
      return false;
    }

    this.isChecking.set(true);
    try {
      if (this.swUpdate.isEnabled) {
        this.swUpdate.checkForUpdate().catch(() => {});
      }

      const url = `/version.json?_t=${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 8)}`;
      const res = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
          Pragma: 'no-cache',
          Expires: '0',
        },
      });

      if (!res.ok) {
        return false;
      }

      const remote: ServerVersionPayload = await res.json();
      if (!remote || !remote.buildId) {
        return false;
      }

      if (remote.buildId !== this.buildId) {
        console.log(
          `[AppUpdate] Nuova versione rilevata sul server: ${remote.version} (${remote.buildId}) vs locale ${this.version} (${this.buildId})`
        );
        await this.forcePurgeAndReload(remote.buildId, remote.version, manual);
        return true;
      }

      if (manual) {
        const toast = await this.toastCtrl.create({
          message: `✅ Sei già all'ultima versione (v${this.version}) · Riavvio e pulizia cache in corso...`,
          duration: 1200,
          position: 'top',
          color: 'success',
          mode: 'ios',
        });
        await toast.present();
        await this.forcePurgeAndReload(remote.buildId, remote.version, true);
      }

      return false;
    } catch (err) {
      if (manual) {
        await this.forcePurgeAndReload(this.buildId, this.version, true);
      }
      return false;
    } finally {
      this.isChecking.set(false);
    }
  }

  /**
   * Esegue la cancellazione completa di:
   * - Cookie del dominio
   * - CacheStorage (tutte le cache PWA / Service Worker / asset)
   * - Service Worker registrati
   * - SessionStorage e chiavi non essenziali di LocalStorage
   * e forza un riavvio con cache-busting sull'URL.
   */
  async forcePurgeAndReload(
    targetBuildId: string = this.buildId,
    targetVersion: string = this.version,
    manual = false
  ): Promise<void> {
    if (typeof window === 'undefined' || this.isUpdating()) {
      return;
    }

    // Guardia anti-loop per gli aggiornamenti automatici:
    // se abbiamo già tentato un reload per questo stesso buildId negli ultimi 60 secondi, ci fermiamo.
    if (!manual && this.hasRecentlyReloadedFor(targetBuildId)) {
      console.warn(
        `[AppUpdate] Reload già eseguito di recente per ${targetBuildId}, salto per sicurezza anti-loop.`
      );
      return;
    }

    this.isUpdating.set(true);

    try {
      const toast = await this.toastCtrl.create({
        message: manual
          ? `🧹 Pulizia cookie & cache in corso (v${targetVersion})...`
          : `🚀 Nuova versione v${targetVersion} disponibile! Aggiornamento automatico...`,
        duration: 2500,
        position: 'top',
        color: 'primary',
        mode: 'ios',
      });
      await toast.present();
    } catch {
      // Ignora errori UI toast
    }

    try {
      // 1. Cancella tutti i cookie non-HttpOnly del sito
      this.clearAllCookies();

      // 2. Disinstalla tutti i Service Worker attivi/in attesa
      await this.unregisterAllServiceWorkers();

      // 3. Svuota interamente il CacheStorage del browser/PWA
      await this.clearAllCacheStorage();

      // 4. Pulisce sessionStorage e localStorage (preservando tema, backup partita live e auth)
      this.cleanWebStorage(targetBuildId, targetVersion);
    } catch (e) {
      console.warn('[AppUpdate] Errore parziale durante la pulizia cache:', e);
    }

    // 5. Piccolo delay per permettere al browser di finalizzare la deregistrazione SW e mostrare il feedback
    await new Promise((resolve) => setTimeout(resolve, 450));

    // 6. Ricarica forzata con parametro di cache-busting sull'URL
    const cleanUrl = this.getCleanUrlWithoutCacheBuster();
    const separator = cleanUrl.includes('?') ? '&' : '?';
    const bustedUrl = `${cleanUrl}${separator}_v=${encodeURIComponent(
      targetBuildId
    )}_${Date.now()}`;

    window.location.replace(bustedUrl);
  }

  private clearAllCookies(): void {
    if (typeof document === 'undefined' || !document.cookie) {
      return;
    }
    const cookies = document.cookie.split(';');
    const hostname = window.location.hostname;
    const domainParts = hostname.split('.');
    const domains = [
      '',
      hostname,
      `.${hostname}`,
      domainParts.length >= 2
        ? `.${domainParts.slice(-2).join('.')}`
        : '',
    ].filter(Boolean);

    for (const cookie of cookies) {
      const eqPos = cookie.indexOf('=');
      const name = (eqPos > -1 ? cookie.substring(0, eqPos) : cookie).trim();
      if (!name) continue;

      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax`;
      for (const domain of domains) {
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${domain}`;
      }
    }
  }

  private async unregisterAllServiceWorkers(): Promise<void> {
    if (
      typeof navigator === 'undefined' ||
      !('serviceWorker' in navigator)
    ) {
      return;
    }
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations.map((reg) => reg.unregister().catch(() => false))
      );
    } catch {
      // Ignora
    }
  }

  private async clearAllCacheStorage(): Promise<void> {
    if (typeof window === 'undefined' || !('caches' in window)) {
      return;
    }
    try {
      const keys = await window.caches.keys();
      await Promise.all(
        keys.map((key) => window.caches.delete(key).catch(() => false))
      );
    } catch {
      // Ignora
    }
  }

  private cleanWebStorage(targetBuildId: string, targetVersion: string): void {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.clear();
      }
    } catch {
      // Ignora
    }

    try {
      if (typeof localStorage !== 'undefined') {
        const preservedEntries: Array<[string, string]> = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key) continue;
          const shouldKeep = PRESERVED_LOCAL_STORAGE_PREFIXES.some((prefix) =>
            key.startsWith(prefix)
          );
          if (shouldKeep) {
            const val = localStorage.getItem(key);
            if (val !== null) {
              preservedEntries.push([key, val]);
            }
          }
        }

        localStorage.clear();

        for (const [k, v] of preservedEntries) {
          localStorage.setItem(k, v);
        }

        localStorage.setItem(STORAGE_BUILD_ID_KEY, targetBuildId);
        localStorage.setItem(STORAGE_VERSION_KEY, targetVersion);
        localStorage.setItem(
          STORAGE_RELOAD_GUARD_KEY,
          `${targetBuildId}|${Date.now()}`
        );
        localStorage.setItem(STORAGE_JUST_UPDATED_KEY, targetVersion);
      }
    } catch {
      // Ignora
    }
  }

  private hasRecentlyReloadedFor(targetBuildId: string): boolean {
    try {
      if (typeof localStorage === 'undefined') return false;
      const raw = localStorage.getItem(STORAGE_RELOAD_GUARD_KEY);
      if (!raw) return false;
      const [guardedBuildId, tsStr] = raw.split('|');
      const ts = parseInt(tsStr || '0', 10);
      if (guardedBuildId === targetBuildId && Date.now() - ts < 60_000) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  private syncCurrentBuildInStorage(): void {
    try {
      if (typeof localStorage === 'undefined') return;

      const justUpdatedTo = localStorage.getItem(STORAGE_JUST_UPDATED_KEY);
      if (justUpdatedTo) {
        localStorage.removeItem(STORAGE_JUST_UPDATED_KEY);
        setTimeout(async () => {
          try {
            const toast = await this.toastCtrl.create({
              message: `✨ App aggiornata alla v${this.version} (Cache e cookie puliti)`,
              duration: 2800,
              position: 'bottom',
              color: 'success',
              mode: 'ios',
            });
            await toast.present();
          } catch {
            // Ignora
          }
        }, 600);
      }

      localStorage.setItem(STORAGE_BUILD_ID_KEY, this.buildId);
      localStorage.setItem(STORAGE_VERSION_KEY, this.version);
    } catch {
      // Ignora
    }
  }

  private installChunkErrorAutoRecovery(): void {
    if (typeof window === 'undefined') return;

    const isChunkLoadFailure = (msg: string): boolean => {
      const m = msg.toLowerCase();
      return (
        m.includes('failed to fetch dynamically imported module') ||
        m.includes('loading chunk') ||
        m.includes('chunkloaderror') ||
        m.includes('importing a module script failed')
      );
    };

    window.addEventListener('error', (event) => {
      const msg = event?.message || '';
      if (isChunkLoadFailure(msg)) {
        console.warn(
          '[AppUpdate] Chunk JS obsoleto rilevato, forzo aggiornamento app...'
        );
        this.forcePurgeAndReload(undefined, undefined, false);
      }
    });

    window.addEventListener('unhandledrejection', (event) => {
      const reason =
        typeof event?.reason === 'string'
          ? event.reason
          : event?.reason?.message || '';
      if (isChunkLoadFailure(reason)) {
        console.warn(
          '[AppUpdate] Promise Chunk JS obsoleto rilevata, forzo aggiornamento app...'
        );
        this.forcePurgeAndReload(undefined, undefined, false);
      }
    });
  }

  private getCleanUrlWithoutCacheBuster(): string {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('_v');
      return url.pathname + url.search + url.hash;
    } catch {
      return window.location.pathname || '/';
    }
  }

  private cleanCacheBusterFromUrl(): void {
    try {
      if (
        typeof window !== 'undefined' &&
        window.location.search.includes('_v=')
      ) {
        const clean = this.getCleanUrlWithoutCacheBuster();
        window.history.replaceState({}, document.title, clean);
      }
    } catch {
      // Ignora
    }
  }
}

