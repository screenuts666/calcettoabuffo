import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { Observable, from, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { CampoDaGioco, CAMPI_STORICI_SEED } from '../models/campo.model';
import { Partita } from '../models/partita.model';
import { AuthService } from './auth.service';
import { StatsEngineService } from './stats-engine.service';

const STORAGE_KEY = 'calcetto_campi_pool_v1';

export interface PlaceSearchResult {
  nome: string;
  indirizzo: string;
  googleMapsUrl: string;
}

@Injectable({
  providedIn: 'root',
})
export class CampiService {
  private firestore = inject(Firestore, { optional: true });
  private auth = inject(AuthService, { optional: true });
  private statsEngine = inject(StatsEngineService, { optional: true });

  readonly campiPool = signal<CampoDaGioco[]>(CAMPI_STORICI_SEED);
  // Campi preset rapidi ufficiali del club (esclusivamente Roma 6 e Montesacro Calcio)
  readonly campiStorici = computed(() =>
    CAMPI_STORICI_SEED.map(
      (seed) => this.campiPool().find((c) => c.id === seed.id) || seed
    )
  );
  private isSearching = signal<boolean>(false);
  private hasNormalizedMatches = false;

  constructor() {
    this.loadFromLocal();
    this.syncFromFirestore();

    // Auto-allineamento dei campi delle partite storiche (es. 'Montesacro' -> 'Montesacro Calcio' con Maps URL)
    effect(() => {
      const isSuper = this.auth?.isSuperUser?.() || false;
      const partite = this.statsEngine?.partiteRaw?.() || [];
      if (isSuper && partite.length > 0 && !this.hasNormalizedMatches) {
        this.hasNormalizedMatches = true;
        this.normalizzaCampiPartite(partite);
      }
    });
  }

  /**
   * Genera il link ufficiale a Google Maps per il navigatore mobile e desktop.
   */
  static buildGoogleMapsUrl(nome: string, indirizzo?: string): string {
    const query = [nome, indirizzo || 'Roma'].filter(Boolean).join(' ');
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }

  /**
   * Cerca un campo registrato tramite nome o alias (es. "Montesacro" -> Montesacro Calcio, "Roma 6" -> Centro Sportivo Roma 6).
   */
  getCampoByNome(nome?: string | null): CampoDaGioco | undefined {
    if (!nome) return undefined;
    const rawClean = nome.trim().toLowerCase();
    const clean = rawClean.replace(/[\(\)\[\]\-]/g, ' ').replace(/\s+/g, ' ').trim();
    const pool = this.campiPool();

    // 1. Corrispondenza esatta per nome o id
    const exact = pool.find(
      (c) => c.nome.toLowerCase() === rawClean || c.id.toLowerCase() === rawClean
    );
    if (exact) return exact;

    // 2. Corrispondenza per alias canonici storici specifici (evita falsi positivi con atac, uffici postali, vinerie, ecc.)
    const isMontesacro =
      clean === 'montesacro' ||
      clean === 'montesacro calcio' ||
      clean === 'montesacro calcio campi da calcetto' ||
      clean === 'campo montesacro' ||
      clean === 'c s montesacro' ||
      clean === 'centro sportivo montesacro';
    if (isMontesacro) {
      return (
        pool.find((c) => c.id === 'montesacro') ||
        CAMPI_STORICI_SEED.find((s) => s.id === 'montesacro')
      );
    }

    const isRoma6 =
      clean === 'roma 6' ||
      clean === 'roma6' ||
      clean === 'centro sportivo roma 6' ||
      clean === 'c s roma 6' ||
      clean === 'campo roma 6';
    if (isRoma6) {
      return (
        pool.find((c) => c.id === 'roma-6') ||
        CAMPI_STORICI_SEED.find((s) => s.id === 'roma-6')
      );
    }

    const isVigor =
      clean === 'vigor' ||
      clean === 'vigor perconti' ||
      clean === 'vigor perconti calcio' ||
      clean === 'perconti' ||
      clean === 'c s vigor perconti' ||
      clean === 'centro sportivo vigor perconti';
    if (isVigor) {
      return (
        pool.find((c) => c.id === 'vigor') ||
        CAMPI_STORICI_SEED.find((s) => s.id === 'vigor')
      );
    }

    const isProRoma =
      clean === 'pro roma' ||
      clean === 'proroma' ||
      clean === 'pro roma calcio' ||
      clean === 'c s pro roma' ||
      clean === 'centro sportivo pro roma';
    if (isProRoma) {
      return (
        pool.find((c) => c.id === 'pro-roma') ||
        CAMPI_STORICI_SEED.find((s) => s.id === 'pro-roma')
      );
    }

    return undefined;
  }

  /**
   * Restituisce la label corretta e standardizzata del campo (es. "Montesacro" -> "Montesacro Calcio").
   */
  normalizzaNomeCampo(nome?: string | null): string {
    if (!nome) return 'Campo Calcetto';
    const canonical = this.getCampoByNome(nome);
    return canonical?.nome || nome.trim();
  }

  /**
   * Restituisce l'URL di Google Maps preciso per il campo specificato.
   */
  getGoogleMapsUrl(nome: string, indirizzo?: string): string {
    const found = this.getCampoByNome(nome);
    if (found?.googleMapsUrl) {
      return found.googleMapsUrl;
    }
    return CampiService.buildGoogleMapsUrl(nome, indirizzo);
  }

  /**
   * Ricerca dinamica online (Observable)
   * Restituisce prima i campi verificati del club e poi i luoghi trovati online a Roma.
   */
  cercaCampiOnline(query: string): Observable<CampoDaGioco[]> {
    const q = (query || '').trim().toLowerCase();
    if (q.length < 2) {
      return of([]);
    }

    // 1. Campi verificati del club / pool locale (contrassegnati esplicitamente con isStorico)
    const localMatches = this.campiPool()
      .filter((c) => {
        const nomeMatch = c.nome.toLowerCase().includes(q);
        const indMatch = (c.indirizzo || '').toLowerCase().includes(q);
        const idMatch = c.id.toLowerCase().includes(q);
        return nomeMatch || indMatch || idMatch;
      })
      .map((c) => ({
        ...c,
        isStorico: c.isStorico ?? CAMPI_STORICI_SEED.some((s) => s.id === c.id),
      }));

    return from(this.searchOnlinePlaces(query)).pipe(
      map((places: PlaceSearchResult[]) => {
        const onlineResults: CampoDaGioco[] = places
          .filter(
            (p) =>
              !localMatches.some(
                (l) =>
                  l.nome.toLowerCase() === p.nome.toLowerCase() ||
                  l.id === p.nome.toLowerCase().replace(/[^a-z0-9]+/g, '-')
              )
          )
          .map((p) => ({
            id: p.nome.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            nome: p.nome,
            indirizzo: p.indirizzo,
            googleMapsUrl: p.googleMapsUrl,
            isStorico: false,
          }));
        return [...localMatches, ...onlineResults];
      }),
      catchError(() => of(localMatches))
    );
  }

  /**
   * Ricerca dinamica online mentre l'utente digita.
   * Utilizza il servizio geocoding open Photon/OSM focalizzato sull'area di Roma,
   * filtrando prioritariamente per impianti sportivi, calcetto e centri sportivi.
   */
  async searchOnlinePlaces(query: string): Promise<PlaceSearchResult[]> {
    const q = query.trim();
    if (q.length < 2) return [];

    try {
      this.isSearching.set(true);
      // Ricerca prioritaria per impianti sportivi e ricreativi (leisure & sport) su Roma
      const urlSports = `https://photon.komoot.io/api/?q=${encodeURIComponent(q + ' Roma')}&lat=41.8919&lon=12.5113&osm_tag=leisure&osm_tag=sport&limit=6`;
      let res = await fetch(urlSports);
      let data = res.ok ? await res.json() : null;
      let features = data?.features || [];

      // Fallback: se la ricerca con tag sport non trova nulla (es. ricerca per via o indirizzo), cerca generico escludendo POI non pertinenti (poste, depositi atac, supermercati, bar)
      if (features.length === 0) {
        const urlFallback = `https://photon.komoot.io/api/?q=${encodeURIComponent(q + ' Roma')}&lat=41.8919&lon=12.5113&limit=6`;
        res = await fetch(urlFallback);
        data = res.ok ? await res.json() : null;
        const rawFeatures = data?.features || [];

        const blacklistedKeys = ['shop', 'highway'];
        const blacklistedValues = ['post_office', 'bank', 'bar', 'restaurant', 'supermarket', 'convenience', 'pharmacy', 'bus_stop'];

        features = rawFeatures.filter((f: any) => {
          const k = f.properties?.osm_key || '';
          const v = f.properties?.osm_value || '';
          if (blacklistedKeys.includes(k)) return false;
          if (blacklistedValues.includes(v)) return false;
          return true;
        });
      }

      return features.map((f: any) => {
        const p = f.properties || {};
        const nome = p.name || q;
        const street = p.street ? `${p.street}${p.housenumber ? ' ' + p.housenumber : ''}` : '';
        const district = p.district || p.locality || '';
        const city = p.city || 'Roma';
        const indirizzo = [street, district, city].filter(Boolean).join(', ') || 'Roma';
        const mapsUrl = CampiService.buildGoogleMapsUrl(nome, indirizzo);

        return {
          nome,
          indirizzo,
          googleMapsUrl: mapsUrl,
        };
      });
    } catch {
      return [];
    } finally {
      this.isSearching.set(false);
    }
  }

  /**
   * Salva o aggiorna un campo nel pool comune del club.
   */
  async saveCampo(campo: Partial<CampoDaGioco> & { nome: string }): Promise<CampoDaGioco> {
    const nomeClean = campo.nome.trim();
    const id = campo.id || nomeClean.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const mapsUrl = campo.googleMapsUrl || CampiService.buildGoogleMapsUrl(nomeClean, campo.indirizzo);

    const existingIndex = this.campiPool().findIndex((c) => c.id === id || c.nome.toLowerCase() === nomeClean.toLowerCase());

    const isSeed = CAMPI_STORICI_SEED.some((s) => s.id === id);
    const updatedItem: CampoDaGioco = {
      id,
      nome: nomeClean,
      indirizzo: campo.indirizzo || 'Roma',
      googleMapsUrl: mapsUrl,
      usatoCount: existingIndex >= 0 ? (this.campiPool()[existingIndex].usatoCount || 0) + 1 : 1,
      ultimoUso: new Date().toISOString(),
      isStorico: isSeed || campo.isStorico || false,
    };

    let nextPool: CampoDaGioco[];
    if (existingIndex >= 0) {
      nextPool = [...this.campiPool()];
      nextPool[existingIndex] = updatedItem;
    } else {
      nextPool = [updatedItem, ...this.campiPool()];
    }

    // Ordina per campi più usati
    nextPool.sort((a, b) => (b.usatoCount || 0) - (a.usatoCount || 0));

    this.campiPool.set(nextPool);
    this.saveToLocal(nextPool);
    await this.persistToFirestore(nextPool);

    return updatedItem;
  }

  private loadFromLocal(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const merged: CampoDaGioco[] = parsed.map((c: any) => {
            const isSeed = CAMPI_STORICI_SEED.some((s) => s.id === c.id);
            const canonical = this.getCampoByNome(c.nome || c.id);
            if (canonical) {
              return {
                ...c,
                id: canonical.id,
                nome: canonical.nome,
                indirizzo: canonical.indirizzo,
                googleMapsUrl: canonical.googleMapsUrl,
                isStorico: true,
              };
            }
            return {
              ...c,
              isStorico: isSeed || c.isStorico || false,
            };
          });
          for (const s of CAMPI_STORICI_SEED) {
            if (!merged.some((c: any) => c.id === s.id)) {
              merged.push(s);
            }
          }
          this.campiPool.set(merged);
          return;
        }
      }
    } catch {
      // ignore
    }
    this.campiPool.set(CAMPI_STORICI_SEED);
  }

  private saveToLocal(pool: CampoDaGioco[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pool));
    } catch {
      // ignore
    }
  }

  private async syncFromFirestore(): Promise<void> {
    if (!this.firestore) return;
    try {
      const docRef = doc(this.firestore, 'config_stagioni/campi_da_gioco');
      const snap = await getDoc(docRef);
      let pool = [...CAMPI_STORICI_SEED];
      if (snap.exists() && snap.data()?.['campi']) {
        const cloudCampi = snap.data()?.['campi'] as CampoDaGioco[];
        if (Array.isArray(cloudCampi) && cloudCampi.length > 0) {
          pool = cloudCampi;
        }
      }

      // Aggiorna sempre i campi canonici con gli indirizzi e Google Maps URL esatti verificati
      const merged: CampoDaGioco[] = pool.map((c) => {
        const isSeed = CAMPI_STORICI_SEED.some((s) => s.id === c.id);
        const canonical = this.getCampoByNome(c.nome || c.id) || CAMPI_STORICI_SEED.find((s) => s.id === c.id);
        if (canonical) {
          return {
            ...c,
            id: canonical.id,
            nome: canonical.nome,
            indirizzo: canonical.indirizzo,
            googleMapsUrl: canonical.googleMapsUrl,
            isStorico: true,
          };
        }
        return {
          ...c,
          isStorico: isSeed || c.isStorico || false,
        };
      });

      // Assicurati che tutti i CAMPI_STORICI_SEED siano inclusi nel pool
      for (const s of CAMPI_STORICI_SEED) {
        if (!merged.some((c) => c.id === s.id)) {
          merged.push(s);
        }
      }

      this.campiPool.set(merged);
      this.saveToLocal(merged);
      await this.persistToFirestore(merged);
    } catch {
      // ignore
    }
  }

  /**
   * Normalizza le partite esistenti aggiornando il campo a quello esatto e inserendo il Google Maps URL
   */
  async normalizzaCampiPartite(partite: Partita[]): Promise<number> {
    if (!this.firestore || !partite || partite.length === 0) return 0;
    let count = 0;
    for (const p of partite) {
      if (!p.id || !p.luogo) continue;
      const canonical = this.getCampoByNome(p.luogo);
      if (!canonical) continue;

      const needsNome = p.luogo !== canonical.nome;
      const needsUrl = !p.campoGoogleMapsUrl || p.campoGoogleMapsUrl !== canonical.googleMapsUrl;

      if (needsNome || needsUrl) {
        try {
          const matchRef = doc(this.firestore, `partite/${p.id}`);
          await updateDoc(matchRef, {
            luogo: canonical.nome,
            campoGoogleMapsUrl: canonical.googleMapsUrl,
          });
          count++;
        } catch {
          // ignore
        }
      }
    }
    return count;
  }

  private async persistToFirestore(pool: CampoDaGioco[]): Promise<void> {
    if (!this.firestore) return;
    try {
      const docRef = doc(this.firestore, 'config_stagioni/campi_da_gioco');
      await setDoc(docRef, { campi: pool, updatedAt: new Date().toISOString() }, { merge: true });
    } catch {
      // ignore
    }
  }
}

