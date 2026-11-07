import { Injectable, inject, signal } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Observable, from, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { CampoDaGioco, CAMPI_STORICI_SEED } from '../models/campo.model';

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

  readonly campiPool = signal<CampoDaGioco[]>(CAMPI_STORICI_SEED);
  readonly campiStorici = this.campiPool;
  private isSearching = signal<boolean>(false);

  constructor() {
    this.loadFromLocal();
    this.syncFromFirestore();
  }

  /**
   * Genera il link ufficiale a Google Maps per il navigatore mobile e desktop.
   */
  static buildGoogleMapsUrl(nome: string, indirizzo?: string): string {
    const query = [nome, indirizzo || 'Roma'].filter(Boolean).join(' ');
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }

  getGoogleMapsUrl(nome: string, indirizzo?: string): string {
    return CampiService.buildGoogleMapsUrl(nome, indirizzo);
  }

  /**
   * Ricerca dinamica online (Observable)
   */
  cercaCampiOnline(query: string): Observable<CampoDaGioco[]> {
    return from(this.searchOnlinePlaces(query)).pipe(
      map((places: PlaceSearchResult[]) =>
        places.map((p) => ({
          id: p.nome.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          nome: p.nome,
          indirizzo: p.indirizzo,
          googleMapsUrl: p.googleMapsUrl,
        }))
      ),
      catchError(() => of([] as CampoDaGioco[]))
    );
  }

  /**
   * Ricerca dinamica online mentre l'utente digita.
   * Utilizza il servizio geocoding open Photon/OSM focalizzato sull'area di Roma,
   * 100% gratuito, zero chiavi API.
   */
  async searchOnlinePlaces(query: string): Promise<PlaceSearchResult[]> {
    const q = query.trim();
    if (q.length < 3) return [];

    try {
      this.isSearching.set(true);
      // Ricerca centrata sulle coordinate di Roma (lat 41.89, lon 12.51)
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q + ' Roma')}&lat=41.8919&lon=12.5113&lang=it&limit=5`;
      const res = await fetch(url);
      if (!res.ok) return [];

      const data = await res.json();
      const features = data.features || [];

      return features.map((f: any) => {
        const p = f.properties || {};
        const nome = p.name || q;
        const street = p.street ? `${p.street}${p.housenumber ? ' ' + p.housenumber : ''}` : '';
        const city = p.city || 'Roma';
        const indirizzo = [street, city].filter(Boolean).join(', ') || 'Roma';
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

    const updatedItem: CampoDaGioco = {
      id,
      nome: nomeClean,
      indirizzo: campo.indirizzo || 'Roma',
      googleMapsUrl: mapsUrl,
      usatoCount: existingIndex >= 0 ? (this.campiPool()[existingIndex].usatoCount || 0) + 1 : 1,
      ultimoUso: new Date().toISOString(),
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
          this.campiPool.set(parsed);
        }
      }
    } catch {
      // ignore
    }
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
      if (snap.exists() && snap.data()?.['campi']) {
        const cloudCampi = snap.data()?.['campi'] as CampoDaGioco[];
        if (Array.isArray(cloudCampi) && cloudCampi.length > 0) {
          this.campiPool.set(cloudCampi);
          this.saveToLocal(cloudCampi);
          return;
        }
      }
      // Se non esiste ancora su Firestore, esegui il seed iniziale dei 4 campi storici
      await this.persistToFirestore(CAMPI_STORICI_SEED);
    } catch {
      // ignore
    }
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

