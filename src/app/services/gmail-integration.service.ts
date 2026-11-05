import { Injectable, signal, computed } from '@angular/core';
import { environment } from 'src/environments/environment';

export interface GmailInviteOptions {
  matchId: string;
  dataStr?: string;
  luogo?: string;
  orario?: string;
  deepLink: string;
  recipientEmails?: string[];
  totalConvocati?: number;
}

export interface GmailEmailPayload {
  to: string;
  subject: string;
  body: string;
}

/**
 * Servizio di integrazione Gmail per Calcetto Abbuffo (v2.0).
 *
 * Specifiche di Sicurezza & Hardening:
 * 1. Least Privilege: Lo scope OAuth richiesto è limitato esclusivamente a `https://www.googleapis.com/auth/gmail.send`
 *    (nessun permesso di lettura casella di posta o eliminazione messaggi).
 * 2. Zero Hardcoded Secrets: Nessun Client Secret privato o Refresh Token esposto nel bundle client.
 * 3. Sanitizzazione Input: Prevenzione Header Injection (CRLF \r\n) su oggetto e destinatari,
 *    e validazione rigorosa dei parametri URL.
 * 4. Feature Flag: Il controllo UI è governato da `environment.features.gmailIntegration.showUiToggle`
 *    (visibile in DEV, completamente rimosso dal DOM in PROD).
 */
@Injectable({
  providedIn: 'root',
})
export class GmailIntegrationService {
  /** Scope OAuth minimo indispensabile (Principio del Least Privilege) */
  readonly GMAIL_OAUTH_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

  /** Configurazione della feature flag dall'environment corrente */
  private readonly config = (environment as any).features?.gmailIntegration || {
    enabled: false,
    showUiToggle: false,
  };

  /**
   * Flag di visibilità del toggle/pulsante nella UI (controllato dalla build: true in dev, false in prod).
   * Su prod questo valore è false e la direttiva `@if` non renderizza l'elemento nel DOM.
   */
  readonly showUiToggle = signal<boolean>(Boolean(this.config.showUiToggle));

  /**
   * Stato attivo/disattivo dell'integrazione Gmail (default true in dev, default false in prod).
   */
  readonly isFeatureEnabled = signal<boolean>(
    this.initEnabledState(Boolean(this.config.enabled))
  );

  private initEnabledState(defaultVal: boolean): boolean {
    if (typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem('calcetto_gmail_integration_enabled');
        if (stored !== null) {
          return stored === 'true';
        }
      } catch {
        // Fallback su default
      }
    }
    return defaultVal;
  }

  /**
   * Abilita o disabilita la funzionalità Gmail con persistenza locale.
   */
  toggleFeature(forcedValue?: boolean): boolean {
    const nextVal = forcedValue !== undefined ? forcedValue : !this.isFeatureEnabled();
    this.isFeatureEnabled.set(nextVal);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('calcetto_gmail_integration_enabled', String(nextVal));
      } catch {
        // Storage non disponibile
      }
    }
    return nextVal;
  }

  /**
   * Sanitizza un campo di intestazione email (es. Subject, To) rimuovendo caratteri CRLF (\r, \n)
   * per prevenire Email Header Injection.
   */
  sanitizeHeaderField(value?: string | null): string {
    if (!value) return '';
    return value.replace(/[\r\n]+/g, ' ').trim();
  }

  /**
   * Sanitizza il corpo dell'email rimuovendo caratteri di controllo potenzialmente malevoli.
   */
  sanitizeBody(body?: string | null): string {
    if (!body) return '';
    // Rimuove caratteri di controllo non stampabili (escluso \n, \r, \t)
    return body.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  }

  /**
   * Sanitizza e valida un URL deep link assicurandosi che appartenga ai protocolli sicuri http o https.
   */
  sanitizeUrl(url?: string | null): string {
    if (!url) return '';
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      return '';
    }
    return trimmed;
  }

  /**
   * Genera il messaggio email strutturato per l'invito alle convocazioni.
   */
  buildInvitePayload(options: GmailInviteOptions): GmailEmailPayload {
    const safeDataStr = this.sanitizeHeaderField(options.dataStr) || 'Prossima Partita';
    const safeLuogo = this.sanitizeHeaderField(options.luogo);
    const safeOrario = this.sanitizeHeaderField(options.orario);
    const safeLink = this.sanitizeUrl(options.deepLink);

    const subject = `⚽ Convocazioni Calcetto Abbuffo: ${safeDataStr}${
      safeOrario ? ' ore ' + safeOrario : ''
    }`;

    const lines: string[] = [
      'Ciao!',
      '',
      `Le convocazioni per la partita di calcetto di ${safeDataStr} sono aperte!`,
    ];

    if (safeLuogo || safeOrario) {
      lines.push('');
      if (safeLuogo) lines.push(`📍 Luogo: ${safeLuogo}`);
      if (safeOrario) lines.push(`⏰ Orario: Ore ${safeOrario}`);
    }

    if (options.totalConvocati && options.totalConvocati > 0) {
      lines.push(`👥 Convocati attualmente confermati: ${options.totalConvocati}`);
    }

    lines.push('');
    lines.push(
      '👉 Clicca sul link seguente per confermare la tua presenza (Partecipo / Forse / Non partecipo):'
    );
    lines.push(safeLink);
    lines.push('');
    lines.push('A presto in campo,');
    lines.push('Calcetto Abbuffo Staff');

    const cleanRecipients = (options.recipientEmails || [])
      .map((e) => this.sanitizeHeaderField(e))
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
      .join(',');

    return {
      to: cleanRecipients,
      subject: this.sanitizeHeaderField(subject),
      body: this.sanitizeBody(lines.join('\n')),
    };
  }

  /**
   * Apre la schermata di composizione Gmail con parametri URL sicuri (percent-encoded)
   * o attiva il fallback mailto.
   */
  openGmailComposer(options: GmailInviteOptions): boolean {
    const payload = this.buildInvitePayload(options);

    const params = new URLSearchParams({
      view: 'cm',
      fs: '1',
      to: payload.to,
      su: payload.subject,
      body: payload.body,
    });

    const gmailWebUrl = `https://mail.google.com/mail/?${params.toString()}`;

    try {
      if (typeof window !== 'undefined') {
        const opened = window.open(gmailWebUrl, '_blank', 'noopener,noreferrer');
        if (!opened) {
          // Fallback popup bloccato: usa mailto:
          this.triggerMailtoFallback(payload);
        }
        return true;
      }
    } catch (err) {
      console.warn('Impossibile aprire Gmail Web composer, fallback mailto:', err);
      this.triggerMailtoFallback(payload);
    }
    return false;
  }

  /**
   * Fallback mailto: RFC 6068 standard con parametri codificati.
   */
  private triggerMailtoFallback(payload: GmailEmailPayload): void {
    if (typeof window === 'undefined') return;
    const mailtoUrl = `mailto:${encodeURIComponent(payload.to)}?subject=${encodeURIComponent(
      payload.subject
    )}&body=${encodeURIComponent(payload.body)}`;
    window.location.href = mailtoUrl;
  }
}

