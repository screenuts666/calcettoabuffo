import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from '@angular/fire/firestore';
import { Partita } from '../models/partita.model';
import { Giocatore } from '../models/giocatore.model';
import { MatchReportData } from '../models/mmr.model';
import { HeadToHeadComparison } from '../models/confronto.model';
import { MatchmakingProposal } from './matchmaking.service';
import {
  buildPronosticoPrompts,
  buildCronacaPrompts,
  buildTacticalAnalysisPrompts,
  buildConfrontoVerdettoPrompts,
  buildPlayerScoutingPrompts,
} from './ai/gemini-prompts';

export interface AiConfig {
  geminiApiKey: string;
  elevenLabsApiKey: string;
  elevenLabsVoiceId: string;
}

@Injectable({
  providedIn: 'root',
})
export class GeminiService {
  private firestore = inject(Firestore);

  // Cache in-memory della configurazione AI e della chiave API per evitare letture ripetute su Firestore
  private cachedApiKey: string | null = null;
  private cachedConfig: AiConfig | null = null;

  // Modelli supportati con fallback automatico a cascata
  // Se un modello raggiunge il rate-limit (429 Quota Exceeded), viene tentato il successivo
  private readonly MODELS = [
    'gemini-flash-lite-latest',
    'gemini-3.5-flash-lite',
    'gemini-3-flash-preview',
    'gemini-3.5-flash',
    'gemini-2.5-flash',
  ];

  /**
   * Recupera a runtime la configurazione AI completa dal nodo sicuro Firestore `_config/ai`.
   * Include supporto per ElevenLabs API key, ElevenLabs Voice ID e Gemini API key.
   */
  async getAiConfig(): Promise<AiConfig> {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    try {
      const configRef = doc(this.firestore, '_config/ai');
      const snap = await getDoc(configRef);
      if (snap.exists()) {
        const data = snap.data();
        const geminiApiKey = data?.['geminiApiKey'] || data?.['apiKey'] || '';
        const rawElevenKey = (data?.['elevenLabsApiKey'] || '').trim();
        const elevenLabsVoiceId = (data?.['elevenLabsVoiceId'] || 'pNInz6obpgDQGcFmaJgB').trim();

        this.cachedApiKey = geminiApiKey;
        this.cachedConfig = {
          geminiApiKey,
          elevenLabsApiKey: rawElevenKey,
          elevenLabsVoiceId,
        };
        return this.cachedConfig;
      }
    } catch (err) {
      console.error('Errore nel recupero della configurazione AI da Firestore:', err);
    }

    return {
      geminiApiKey: this.cachedApiKey || '',
      elevenLabsApiKey: '',
      elevenLabsVoiceId: 'pNInz6obpgDQGcFmaJgB',
    };
  }

  /**
   * Recupera a runtime la chiave API da Firestore dal nodo sicuro `_config/ai`.
   * Mai hardcodata nel codice sorgente.
   */
  async getApiKey(): Promise<string> {
    if (this.cachedApiKey) {
      return this.cachedApiKey;
    }
    const config = await this.getAiConfig();
    if (config.geminiApiKey) {
      return config.geminiApiKey;
    }

    throw new Error(
      'Chiave API Gemini non trovata nel nodo sicuro Firestore _config/ai. Configura la chiave per utilizzare le funzioni AI.',
    );
  }

  /**
   * Chiamata generica alle REST API di Gemini con fallback automatico tra modelli
   */
  async callGemini(prompt: string, systemPrompt?: string): Promise<string> {
    const key = await this.getApiKey();

    const body: any = {
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.92,
        maxOutputTokens: 8192,
      },
      safetySettings: [
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_NONE',
        },
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_NONE',
        },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: 'BLOCK_NONE',
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_NONE',
        },
      ],
    };

    if (systemPrompt) {
      body.systemInstruction = {
        parts: [{ text: systemPrompt }],
      };
    }

    let lastError: any = null;

    // Tentativo sequenziale sui modelli con fallback automatico su 429 / 503
    for (const model of this.MODELS) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        if (response.ok) {
          const json = await response.json();
          const candidate = json.candidates?.[0];
          const text = candidate?.content?.parts?.[0]?.text;
          const finishReason = candidate?.finishReason;

          // Se il modello ha interrotto la risposta per limite token, tenta il fallback
          if (finishReason === 'MAX_TOKENS') {
            console.warn(`Modello ${model} ha troncato la risposta per MAX_TOKENS. Tento modello successivo...`);
            lastError = new Error(`Risposta troncata per MAX_TOKENS da ${model}`);
            continue;
          }

          if (text && text.trim().length > 0) {
            return this.cleanAiOutput(text.trim());
          }
        } else {
          const errTxt = await response.text();
          console.info(`Modello ${model} non disponibile (${response.status}), passaggio al fallback...`);
          lastError = new Error(`Errore API Gemini (${response.status}): ${errTxt}`);
          // Continua il loop e tenta il modello successivo di fallback
        }
      } catch (err: any) {
        console.info(`Tentativo chiamata modello ${model} fallito, passaggio al fallback:`, err?.message || err);
        lastError = err;
      }
    }

    throw lastError || new Error('Nessun modello Gemini ha risposto con successo.');
  }

  /**
   * Pulisce l'output AI da eventuali titoli o preamboli introduttivi isolati
   */
  cleanAiOutput(rawText: string): string {
    if (!rawText) return '';
    return rawText
      .replace(/^(?:\*\*|#{1,4}\s*)?(?:ecco\s+[^:\n]+|telecronaca[^:\n]+|pronostico[^:\n]+|cronaca[^:\n]+|disamina[^:\n]+|verdetto[^:\n]+)[:\n]+/im, '')
      .trim();
  }

  /**
   * Calcola l'età anagrafica a partire dall'anno di nascita.
   */
  calcolaEta(annoNascita?: string | number): number | null {
    if (!annoNascita) return null;
    const anno = parseInt(annoNascita.toString().trim(), 10);
    const annoCorrente = new Date().getFullYear();
    if (isNaN(anno) || anno < 1940 || anno > annoCorrente) return null;
    return annoCorrente - anno;
  }

  /**
   * Formatta la bio sintetica del giocatore (soprannome, ruolo, età, peso, altezza)
   * per fornire massimo contesto goliardico all'AI.
   */
  formatPlayerBio(p: any): string {
    if (!p) return 'Sconosciuto';
    const nome = (p.nome || 'Giocatore').trim();
    const soprannome = (p.soprannome || p.soprannomeAi || '').trim();
    const ruolo = (p.ruoloPreferito || p.ruolo || 'Jolly').trim();
    const eta = this.calcolaEta(p.annoNascita);
    const peso = p.peso ? `${p.peso}kg` : '';
    const altezza = p.altezza ? `${p.altezza}cm` : '';

    const tags: string[] = [];
    if (soprannome) tags.push(`detto "${soprannome}"`);
    if (p.mmr) tags.push(`MMR: ${p.mmr}`);
    tags.push(`Ruolo: ${ruolo}`);
    if (eta !== null) tags.push(`Età: ${eta} anni (classe ${p.annoNascita})`);
    if (peso) tags.push(`Peso: ${peso}`);
    if (altezza) tags.push(`Altezza: ${altezza}`);
    if (p.professione?.trim()) tags.push(`Mestiere: ${p.professione.trim()}`);
    if (p.origini?.trim()) tags.push(`Origini: ${p.origini.trim()}`);
    if (p.statoCivile?.trim()) tags.push(`Stato civile: ${p.statoCivile.trim()}`);
    if (p.vizi?.trim()) tags.push(`Vizi/Abitudini: ${p.vizi.trim()}`);

    return `${nome} [${tags.join(' | ')}]`;
  }

  /**
   * Calcola statistiche aggregate della squadra (età media, peso complessivo)
   */
  getTeamAggregates(players: any[]): { etaMedia: number | null; pesoTotale: number; pesoMedio: number | null } {
    let sumEta = 0;
    let countEta = 0;
    let sumPeso = 0;
    let countPeso = 0;

    for (const p of players) {
      const eta = this.calcolaEta(p.annoNascita);
      if (eta !== null) {
        sumEta += eta;
        countEta++;
      }
      if (p.peso) {
        const w = parseFloat(p.peso.toString().replace(/[^0-9.]/g, ''));
        if (!isNaN(w) && w > 40 && w < 200) {
          sumPeso += w;
          countPeso++;
        }
      }
    }

    return {
      etaMedia: countEta > 0 ? Math.round((sumEta / countEta) * 10) / 10 : null,
      pesoTotale: Math.round(sumPeso),
      pesoMedio: countPeso > 0 ? Math.round((sumPeso / countPeso) * 10) / 10 : null,
    };
  }

  /**
   * Pulisce e trasforma gli errori tecnici (es. 429 Quota Exceeded) in messaggi chiari
   */
  formatUserError(err: any): string {
    const msg = (err?.message || String(err)).toLowerCase();
    if (
      msg.includes('429') ||
      msg.includes('quota') ||
      msg.includes('resource_exhausted')
    ) {
      return '⚠️ Limite richieste AI raggiunto per oggi. Il Mister sta ricaricando le pile, riprova tra qualche ora!';
    }
    if (
      msg.includes('503') ||
      msg.includes('high demand') ||
      msg.includes('overloaded')
    ) {
      return '⚠️ I server Google AI sono al momento occupati. Riprova tra un minuto!';
    }
    return '⚠️ Errore temporaneo durante la generazione AI. Riprova tra poco!';
  }

  // =========================================
  // 1. REPORT PARTITA: PRONOSTICO DEL MISTER (PRE-MATCH)
  // =========================================================================

  /**
   * Genera o recupera dalla cache Firestore il Pronostico del Mister pre-partita.
   * Basato su Squadra Favorita MMR, Streak di Forma, Chimica e Dati Fisici/Anagrafici.
   */
  async getOrGeneratePronostico(
    partita: Partita,
    odds: any,
    forceRegenerate = false,
  ): Promise<string> {
    if (!forceRegenerate && partita.pronosticoAi) {
      return partita.pronosticoAi;
    }

    const { systemPrompt, userPrompt } = buildPronosticoPrompts(
      partita,
      odds,
      (p) => this.formatPlayerBio(p),
      (players) => this.getTeamAggregates(players),
    );

    const pronostico = await this.callGemini(userPrompt, systemPrompt);

    // Caching intelligente sul documento Firestore della partita
    if (partita.id) {
      try {
        await updateDoc(doc(this.firestore, `partite/${partita.id}`), {
          pronosticoAi: pronostico,
        });
        partita.pronosticoAi = pronostico;
      } catch (e) {
        console.warn('Errore salvataggio pronostico su Firestore:', e);
      }
    }

    return pronostico;
  }

  // =========================================================================
  // 2. REPORT PARTITA: CRONACA SPORTIVA IGNORANTE (POST-MATCH)
  // =========================================================================

  /**
   * Genera o recupera dalla cache Firestore la Cronaca Sportiva Ignorante post-partita.
   * Basata su risultato, eventuale Upset, marcatori, voti e commenti pagelle.
   */
  async getOrGenerateCronaca(
    partita: Partita,
    reportData: MatchReportData,
    forceRegenerate = false,
  ): Promise<string> {
    if (!forceRegenerate && partita.cronacaAi) {
      return partita.cronacaAi;
    }

    const { systemPrompt, userPrompt } = buildCronacaPrompts(
      partita,
      reportData,
      (p) => this.formatPlayerBio(p),
    );

    const cronaca = await this.callGemini(userPrompt, systemPrompt);

    // Caching intelligente su Firestore
    if (partita.id) {
      try {
        await updateDoc(doc(this.firestore, `partite/${partita.id}`), {
          cronacaAi: cronaca,
        });
        partita.cronacaAi = cronaca;
      } catch (e) {
        console.warn('Errore salvataggio cronaca su Firestore:', e);
      }
    }

    return cronaca;
  }

  // =========================================================================
  // 3. SUGGERITORE SQUADRE: DISAMINA TATTICA AI
  // =========================================================================

  /**
   * Genera una breve disamina tattica brillante per la proposta di squadre generata dal matchmaking.
   */
  async generateTacticalAnalysis(
    proposal: MatchmakingProposal,
  ): Promise<string> {
    const { systemPrompt, userPrompt } = buildTacticalAnalysisPrompts(
      proposal,
      (p) => this.formatPlayerBio(p),
      (players) => this.getTeamAggregates(players),
    );

    return await this.callGemini(userPrompt, systemPrompt);
  }

  /**
   * Recupera solo dalla cache Firestore il Verdetto AI se già presente (senza chiamare Gemini)
   */
  async getCachedConfrontoVerdetto(
    playerAId: string,
    playerBId: string,
  ): Promise<string | null> {
    const pairKey = [playerAId, playerBId].sort().join('_');
    const docRef = doc(this.firestore, `confronti/${pairKey}`);
    try {
      const snap = await getDoc(docRef);
      if (snap.exists() && snap.data()?.['verdettoAi']) {
        return snap.data()['verdettoAi'];
      }
    } catch (err) {
      console.warn('Errore lettura cache verdetto 1v1 da Firestore:', err);
    }
    return null;
  }

  // =========================================================================
  // 4. CONFRONTO DIRETTO 1V1: VERDETTO RIVALITÀ
  // =========================================================================

  /**
   * Genera o recupera il Verdetto AI sulla rivalità diretta tra Giocatore A e Giocatore B.
   * Caching intelligente sul documento Firestore `confronti/{pairKey}`.
   */
  async getOrGenerateConfrontoVerdetto(
    playerAId: string,
    playerBId: string,
    comp: HeadToHeadComparison,
    forceRegenerate = false,
  ): Promise<string> {
    const pairKey = [playerAId, playerBId].sort().join('_');
    const docRef = doc(this.firestore, `confronti/${pairKey}`);

    if (!forceRegenerate) {
      try {
        const snap = await getDoc(docRef);
        if (snap.exists() && snap.data()?.['verdettoAi']) {
          return snap.data()['verdettoAi'];
        }
      } catch (err) {
        console.warn('Errore lettura cache verdetto 1v1 da Firestore:', err);
      }
    }

    const { systemPrompt, userPrompt } = buildConfrontoVerdettoPrompts(
      comp.playerA,
      comp.playerB,
      comp.scontriContro,
      comp.intesaInsieme,
      (anno) => this.calcolaEta(anno),
      (p) => this.formatPlayerBio(p),
    );

    const verdetto = await this.callGemini(userPrompt, systemPrompt);

    // Caching intelligente su Firestore
    try {
      await setDoc(
        docRef,
        {
          playerAId,
          playerBId,
          verdettoAi: verdetto,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
    } catch (e) {
      console.warn('Errore salvataggio verdetto 1v1 su Firestore:', e);
    }

    return verdetto;
  }

  // =========================================================================
  // 5. PROFILO GIOCATORE / CLASSIFICA: SCOUTING REPORT & SOPRANNOME AI
  // =========================================================================

  /**
   * Genera o recupera dalla cache Firestore lo Scouting Report e Soprannome AI per un giocatore.
   * Caching intelligente su `giocatori/{id}` con i campi `soprannomeAi` e `scoutingReportAi`.
   */
  async getOrGeneratePlayerScouting(
    giocatore: Giocatore,
    profile: any,
    recentNotes: string[] = [],
    forceRegenerate = false,
  ): Promise<{ nickname: string; scouting: string }> {
    if (
      !forceRegenerate &&
      giocatore.scoutingReportAi &&
      giocatore.scoutingReportAi.trim().length > 0
    ) {
      return {
        nickname: giocatore.soprannomeAi || giocatore.soprannome || '',
        scouting: giocatore.scoutingReportAi,
      };
    }

    const { systemPrompt, userPrompt } = buildPlayerScoutingPrompts(
      giocatore,
      profile,
      recentNotes,
      (anno) => this.calcolaEta(anno),
    );

    const rawResult = await this.callGemini(userPrompt, systemPrompt);

    let nickname = giocatore.soprannome || '';
    let scouting = rawResult;

    const nickMatch = rawResult.match(/SOPRANNOME:\s*(.+)/i);
    const scoutMatch = rawResult.match(/SCOUTING:\s*([\s\S]+)/i);

    if (nickMatch && nickMatch[1]) {
      nickname = nickMatch[1].replace(/["']/g, '').trim();
    }
    if (scoutMatch && scoutMatch[1]) {
      scouting = scoutMatch[1].trim();
    }

    // Caching intelligente su Firestore (documento giocatore)
    if (giocatore.id) {
      try {
        await updateDoc(doc(this.firestore, `giocatori/${giocatore.id}`), {
          soprannomeAi: nickname,
          scoutingReportAi: scouting,
          aiUpdatedAt: new Date().toISOString(),
        });
        giocatore.soprannomeAi = nickname;
        giocatore.scoutingReportAi = scouting;
      } catch (e) {
        console.warn('Errore salvataggio scouting su Firestore:', e);
      }
    }

    return { nickname, scouting };
  }
}
