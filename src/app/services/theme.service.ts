import { Injectable, signal } from '@angular/core';

export type AppThemeMode = 'light' | 'dark' | 'auto';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private readonly THEME_STORAGE_KEY = 'calcetto_theme_preference';

  /** Modalità scelta dall'utente: 'light' | 'dark' | 'auto' */
  mode = signal<AppThemeMode>('auto');

  /** True se il tema attualmente attivo ed applicato è scuro */
  isDarkEffective = signal<boolean>(false);

  private mediaQuery?: MediaQueryList;
  private mediaListener = (e: MediaQueryListEvent) => {
    if (this.mode() === 'auto') {
      this.applyTheme('auto', e.matches);
    }
  };

  constructor() {
    this.initTheme();
  }

  private initTheme() {
    let savedMode: AppThemeMode = 'auto';
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem(this.THEME_STORAGE_KEY);
        if (stored === 'light' || stored === 'dark' || stored === 'auto') {
          savedMode = stored;
        }
      }
    } catch (e) {
      console.warn('Accesso a localStorage non consentito in questa modalità:', e);
    }

    if (typeof window !== 'undefined' && window.matchMedia) {
      this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      if (this.mediaQuery.addEventListener) {
        this.mediaQuery.addEventListener('change', this.mediaListener);
      } else if ((this.mediaQuery as any).addListener) {
        (this.mediaQuery as any).addListener(this.mediaListener);
      }
    }

    this.setMode(savedMode);
  }

  setMode(newMode: AppThemeMode) {
    this.mode.set(newMode);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(this.THEME_STORAGE_KEY, newMode);
      }
    } catch (e) {
      console.warn('Errore salvataggio tema in localStorage:', e);
    }

    const systemIsDark = this.mediaQuery ? this.mediaQuery.matches : false;
    this.applyTheme(newMode, systemIsDark);
  }

  private applyTheme(mode: AppThemeMode, systemIsDark: boolean) {
    const isDark = mode === 'dark' || (mode === 'auto' && systemIsDark);
    this.isDarkEffective.set(isDark);

    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      const body = document.body;

      if (isDark) {
        root.classList.add('ion-palette-dark');
        root.classList.add('dark');
        body.classList.add('ion-palette-dark');
        body.classList.add('dark');

        root.classList.remove('ion-palette-light');
        root.classList.remove('light');
        body.classList.remove('light');

        root.setAttribute('data-theme', 'dark');
        root.style.colorScheme = 'dark';
      } else {
        root.classList.remove('ion-palette-dark');
        root.classList.remove('dark');
        body.classList.remove('ion-palette-dark');
        body.classList.remove('dark');

        root.classList.add('ion-palette-light');
        root.classList.add('light');
        body.classList.add('light');

        root.setAttribute('data-theme', 'light');
        root.style.colorScheme = 'light';
      }
    }
  }
}
