import { Injectable, signal } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

export interface DailyWeatherForecast {
  date: string; // "YYYY-MM-DD"
  tempMax: number;
  tempMin: number;
  rainProbability: number; // 0-100%
  conditionDescription: string;
  iconEmoji: string;
}

export interface DayWeather {
  date: string;
  tempMax: number;
  tempMin: number;
  rainProbability: number;
  conditionLabel: string;
  conditionIcon: string;
}

const CACHE_KEY = 'calcetto_weather_rome_cache_v2';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 ora

@Injectable({
  providedIn: 'root',
})
export class WeatherService {
  // Posizione fissa per le partite di Calcetto Abbuffo: Roma
  private readonly LAT = 41.8919;
  private readonly LON = 12.5113;

  private weatherCache = signal<Record<string, DailyWeatherForecast>>({});
  private isLoading = signal<boolean>(false);

  constructor() {
    this.loadCacheFromStorage();
  }

  /**
   * Restituisce le previsioni per Roma per i prossimi 14 giorni come Observable
   */
  getRomeForecast(): Observable<DailyWeatherForecast[]> {
    const cached = Object.values(this.weatherCache());
    if (cached.length >= 7) {
      return of(cached);
    }

    return from(this.fetchRomeForecast()).pipe(
      catchError(() => of(cached))
    );
  }

  /**
   * Chiamata ad Open-Meteo (100% gratuita, nessun token necessario)
   */
  async fetchRomeForecast(): Promise<DailyWeatherForecast[]> {
    if (this.isLoading()) {
      return Object.values(this.weatherCache());
    }

    try {
      this.isLoading.set(true);
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${this.LAT}&longitude=${this.LON}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Europe%2FRome&forecast_days=14`;
      const res = await fetch(url);
      if (!res.ok) {
        return Object.values(this.weatherCache());
      }
      const data = await res.json();
      const daily = data.daily;
      if (!daily || !daily.time) {
        return Object.values(this.weatherCache());
      }

      const list: DailyWeatherForecast[] = [];
      const map: Record<string, DailyWeatherForecast> = {};

      for (let i = 0; i < daily.time.length; i++) {
        const dStr = daily.time[i];
        const code = daily.weathercode?.[i] ?? 0;
        const max = Math.round(daily.temperature_2m_max?.[i] ?? 18);
        const min = Math.round(daily.temperature_2m_min?.[i] ?? 12);
        const rain = Math.round(daily.precipitation_probability_max?.[i] ?? 0);

        const { label, icon } = this.interpretWmoCode(code);

        const forecastItem: DailyWeatherForecast = {
          date: dStr,
          tempMax: max,
          tempMin: min,
          rainProbability: rain,
          conditionDescription: label,
          iconEmoji: icon,
        };

        list.push(forecastItem);
        map[dStr] = forecastItem;
      }

      this.weatherCache.set(map);
      this.saveCacheToStorage(map);
      return list;
    } catch {
      return Object.values(this.weatherCache());
    } finally {
      this.isLoading.set(false);
    }
  }

  private interpretWmoCode(code: number): { label: string; icon: string } {
    if (code === 0) return { label: 'Sereno', icon: '☀️' };
    if (code === 1 || code === 2) return { label: 'Poco nuvoloso', icon: '🌤️' };
    if (code === 3) return { label: 'Nuvoloso', icon: '☁️' };
    if (code >= 45 && code <= 48) return { label: 'Nebbia', icon: '🌁' };
    if (code >= 51 && code <= 55) return { label: 'Pioggerella', icon: '🌦️' };
    if (code >= 61 && code <= 65) return { label: 'Pioggia', icon: '🌧️' };
    if (code >= 71 && code <= 77) return { label: 'Neve', icon: '❄️' };
    if (code >= 80 && code <= 82) return { label: 'Rovescio', icon: '🌧️' };
    if (code >= 95 && code <= 99) return { label: 'Temporale', icon: '⛈️' };
    return { label: 'Variabile', icon: '⛅' };
  }

  private loadCacheFromStorage(): void {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed.timestamp && Date.now() - parsed.timestamp < CACHE_TTL_MS && parsed.data) {
        this.weatherCache.set(parsed.data);
      }
    } catch {
      // ignore
    }
  }

  private saveCacheToStorage(data: Record<string, DailyWeatherForecast>): void {
    try {
      sessionStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ timestamp: Date.now(), data })
      );
    } catch {
      // ignore
    }
  }
}
