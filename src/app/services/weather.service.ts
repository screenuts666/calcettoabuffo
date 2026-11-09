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
  ionIcon?: string;
}

export interface DayWeather {
  date: string;
  tempMax: number;
  tempMin: number;
  rainProbability: number;
  conditionLabel: string;
  conditionIcon: string;
}

const CACHE_KEY = 'calcetto_weather_rome_cache_v3';
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
   * Restituisce le condizioni meteo per una data specifica.
   * 1. Usa `customMeteo` se già salvato sulla partita.
   * 2. Usa le previsioni Open-Meteo se la data è coperta dalla cache a 14 giorni.
   * 3. Genera un meteo stagionale deterministico accurato per Roma (stabile e realistico per ogni data).
   */
  getWeatherForDate(dateStr: string, customMeteo?: any): DailyWeatherForecast {
    if (customMeteo) {
      const emoji = (customMeteo.iconEmoji && !customMeteo.iconEmoji.includes('🌫')) ? customMeteo.iconEmoji : '🌁';
      return {
        date: dateStr,
        tempMax: customMeteo.temp ?? customMeteo.tempMax ?? 18,
        tempMin: customMeteo.tempMin ?? 12,
        rainProbability: customMeteo.rainProbability ?? 0,
        conditionDescription: customMeteo.conditionDescription || 'Sereno',
        iconEmoji: emoji,
        ionIcon: customMeteo.ionIcon || 'sunny-outline',
      };
    }

    const cleanDate = (dateStr || '').split('T')[0];
    if (cleanDate && this.weatherCache()[cleanDate]) {
      return this.weatherCache()[cleanDate];
    }

    return this.generateSeasonalRomeWeather(cleanDate);
  }

  /**
   * Modello climatico stagionale realistico per Roma:
   * Genera dati coerenti e stabili per la stessa data (hash deterministico).
   */
  private generateSeasonalRomeWeather(dateStr: string): DailyWeatherForecast {
    if (!dateStr || dateStr.length < 10) {
      return {
        date: dateStr,
        tempMax: 20,
        tempMin: 14,
        rainProbability: 10,
        conditionDescription: 'Sereno',
        iconEmoji: '☀️',
        ionIcon: 'sunny-outline',
      };
    }

    const parts = dateStr.split('-');
    const m = parseInt(parts[1], 10) || 5;

    let hash = 0;
    for (let i = 0; i < dateStr.length; i++) {
      hash = (hash << 5) - hash + dateStr.charCodeAt(i);
      hash |= 0;
    }
    const seed = Math.abs(hash);

    let tempMax = 20;
    let tempMin = 13;
    let condition = 'Sereno';
    let icon = '☀️';
    let ionIcon = 'sunny-outline';
    let rain = 10;

    if (m === 12 || m === 1 || m === 2) {
      tempMax = 11 + (seed % 5);
      tempMin = 4 + (seed % 4);
      const mod = seed % 10;
      if (mod < 3) {
        condition = 'Pioggia';
        icon = '🌧️';
        ionIcon = 'rainy-outline';
        rain = 75;
      } else if (mod < 6) {
        condition = 'Nuvoloso';
        icon = '☁️';
        ionIcon = 'cloudy-outline';
        rain = 30;
      } else {
        condition = 'Sereno';
        icon = '☀️';
        ionIcon = 'sunny-outline';
        rain = 5;
      }
    } else if (m === 3 || m === 4) {
      tempMax = 16 + (seed % 6);
      tempMin = 8 + (seed % 4);
      const mod = seed % 10;
      if (mod < 3) {
        condition = 'Pioggia';
        icon = '🌧️';
        ionIcon = 'rainy-outline';
        rain = 65;
      } else if (mod < 6) {
        condition = 'Poco nuvoloso';
        icon = '🌤️';
        ionIcon = 'partly-sunny-outline';
        rain = 20;
      } else {
        condition = 'Sereno';
        icon = '☀️';
        ionIcon = 'sunny-outline';
        rain = 5;
      }
    } else if (m === 5 || m === 6) {
      tempMax = 23 + (seed % 6);
      tempMin = 15 + (seed % 4);
      const mod = seed % 10;
      if (mod < 2) {
        condition = 'Temporale';
        icon = '⛈️';
        ionIcon = 'thunderstorm-outline';
        rain = 60;
      } else if (mod < 4) {
        condition = 'Poco nuvoloso';
        icon = '🌤️';
        ionIcon = 'partly-sunny-outline';
        rain = 15;
      } else {
        condition = 'Sereno';
        icon = '☀️';
        ionIcon = 'sunny-outline';
        rain = 0;
      }
    } else if (m === 7 || m === 8) {
      tempMax = 29 + (seed % 6);
      tempMin = 20 + (seed % 3);
      const mod = seed % 10;
      if (mod === 0) {
        condition = 'Temporale estivo';
        icon = '⛈️';
        ionIcon = 'thunderstorm-outline';
        rain = 50;
      } else {
        condition = 'Sereno';
        icon = '☀️';
        ionIcon = 'sunny-outline';
        rain = 0;
      }
    } else if (m === 9 || m === 10) {
      tempMax = 22 + (seed % 6);
      tempMin = 14 + (seed % 4);
      const mod = seed % 10;
      if (mod < 3) {
        condition = 'Pioggia';
        icon = '🌧️';
        ionIcon = 'rainy-outline';
        rain = 70;
      } else if (mod < 6) {
        condition = 'Nuvoloso';
        icon = '☁️';
        ionIcon = 'cloudy-outline';
        rain = 25;
      } else {
        condition = 'Sereno';
        icon = '☀️';
        ionIcon = 'sunny-outline';
        rain = 5;
      }
    } else {
      // Novembre
      tempMax = 16 + (seed % 5);
      tempMin = 9 + (seed % 4);
      const mod = seed % 10;
      if (mod < 4) {
        condition = 'Pioggia';
        icon = '🌧️';
        ionIcon = 'rainy-outline';
        rain = 80;
      } else if (mod < 7) {
        condition = 'Nuvoloso';
        icon = '☁️';
        ionIcon = 'cloudy-outline';
        rain = 35;
      } else {
        condition = 'Poco nuvoloso';
        icon = '🌤️';
        ionIcon = 'partly-sunny-outline';
        rain = 10;
      }
    }

    return {
      date: dateStr,
      tempMax,
      tempMin,
      rainProbability: rain,
      conditionDescription: condition,
      iconEmoji: icon,
      ionIcon,
    };
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

        const { label, icon, ionIcon } = this.interpretWmoCode(code);

        const forecastItem: DailyWeatherForecast = {
          date: dStr,
          tempMax: max,
          tempMin: min,
          rainProbability: rain,
          conditionDescription: label,
          iconEmoji: icon,
          ionIcon,
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

  private interpretWmoCode(code: number): { label: string; icon: string; ionIcon: string } {
    if (code === 0) return { label: 'Sereno', icon: '☀️', ionIcon: 'sunny-outline' };
    if (code === 1 || code === 2) return { label: 'Poco nuvoloso', icon: '🌤️', ionIcon: 'partly-sunny-outline' };
    if (code === 3) return { label: 'Nuvoloso', icon: '☁️', ionIcon: 'cloudy-outline' };
    if (code >= 45 && code <= 48) return { label: 'Nebbia', icon: '🌁', ionIcon: 'cloud-outline' };
    if (code >= 51 && code <= 57) return { label: 'Pioggerella', icon: '🌦️', ionIcon: 'rainy-outline' };
    if (code >= 61 && code <= 67) return { label: 'Pioggia', icon: '🌧️', ionIcon: 'rainy-outline' };
    if (code >= 71 && code <= 77) return { label: 'Neve', icon: '❄️', ionIcon: 'snow-outline' };
    if (code >= 80 && code <= 82) return { label: 'Rovescio', icon: '🌧️', ionIcon: 'thunderstorm-outline' };
    if (code >= 85 && code <= 86) return { label: 'Neve', icon: '❄️', ionIcon: 'snow-outline' };
    if (code >= 95 && code <= 99) return { label: 'Temporale', icon: '⛈️', ionIcon: 'thunderstorm-outline' };
    return { label: 'Variabile', icon: '⛅', ionIcon: 'partly-sunny-outline' };
  }

  private loadCacheFromStorage(): void {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed.timestamp && Date.now() - parsed.timestamp < CACHE_TTL_MS && parsed.data) {
        for (const k of Object.keys(parsed.data)) {
          if (parsed.data[k]?.iconEmoji?.includes('🌫')) {
            parsed.data[k].iconEmoji = '🌁';
          }
        }
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
