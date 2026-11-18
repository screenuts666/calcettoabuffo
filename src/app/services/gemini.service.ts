import { Injectable, inject } from '@angular/core';
import {
  // Firestore imported from @angular/fire/firestore
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { Firestore } from '@angular/fire/firestore';
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
import { AuthService } from './auth.service';
import { StatsEngineService } from './stats-engine.service';
import { CURRENT_SEASON } from '../utils/season-utils';

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
  private auth = inject(AuthService, { optional: true });
  private statsEngine = inject(StatsEngineService, { optional: true });

  // Cache in-memory della configurazione AI e della chiave API per evitare letture ripetute su Firestore
  private cachedApiKey: string | null = null;
  private cachedConfig: AiConfig | null = null;

  // Modelli supportati con fallback automatico a cascata
  // Priorità a gemini-2.5-flash per massima qualità, completezza e ricchezza narrativa
  private readonly MODELS = [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
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
        const geminiApiKey = (data?.['geminiApiKey'] || data?.['apiKey'] || '').trim();
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
        const modelBody = {
          ...body,
          generationConfig: {
            ...body.generationConfig,
            ...(model.includes('2.5') || model.includes('flash-lite-latest')
              ? { thinkingConfig: { thinkingBudget: 0 } }
              : {}),
          },
        };
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(modelBody),
        });

        if (response.ok) {
          const rawText = await response.text();
          const lowerRaw = rawText.toLowerCase();
          if (
            lowerRaw.includes('zscaler') ||
            lowerRaw.includes('not permitted to visit this site') ||
            lowerRaw.includes('category: gen ai') ||
            lowerRaw.trim().startsWith('<!doctype html')
          ) {
            throw new Error('ZSCALER_CORPORATE_PROXY_BLOCK');
          }
          const json = JSON.parse(rawText);
          const candidate = json.candidates?.[0];
          const parts = Array.isArray(candidate?.content?.parts)
            ? candidate.content.parts
            : [];
          const text = parts
            .filter((p: any) => !p?.thought && typeof p?.text === 'string')
            .map((p: any) => p.text)
            .join('');
          const finishReason = candidate?.finishReason;

          // Se il modello ha interrotto la risposta (MAX_TOKENS, SAFETY, ecc.), tenta il fallback
          if (finishReason && finishReason !== 'STOP') {
            console.warn(
              `Modello ${model} ha interrotto la risposta (${finishReason}). Tento modello successivo...`,
            );
            lastError = new Error(
              `Risposta interrotta (${finishReason}) da ${model}`,
            );
            continue;
          }

          if (text && text.trim().length > 0) {
            const cleaned = this.cleanAiOutput(text.trim());
            // Verifica che il testo non sia stato troncato a metà frase/parola
            if (!this.isTextComplete(cleaned)) {
              console.warn(
                `Modello ${model} ha restituito un testo troncato o troppo breve (${cleaned.length} char). Tento modello successivo...`,
              );
              lastError = new Error(
                `Risposta incompleta/troncata da ${model}`,
              );
              continue;
            }
            return cleaned;
          }
        } else {
          const errTxt = await response.text();
          const lowerErr = errTxt.toLowerCase();
          if (
            lowerErr.includes('zscaler') ||
            lowerErr.includes('not permitted to visit this site') ||
            lowerErr.includes('category: gen ai')
          ) {
            throw new Error('ZSCALER_CORPORATE_PROXY_BLOCK');
          }
          // Se la chiave API non è valida, invalida la cache in memoria
          if (lowerErr.includes('api_key_invalid')) {
            this.cachedApiKey = null;
            this.cachedConfig = null;
          }
          console.info(`Modello ${model} non disponibile (${response.status}), passaggio al fallback...`);
          lastError = new Error(`Errore API Gemini (${response.status}): ${errTxt}`);
        }
      } catch (err: any) {
        if (err?.message === 'ZSCALER_CORPORATE_PROXY_BLOCK') {
          throw err;
        }
        console.info(`Tentativo chiamata modello ${model} fallito, passaggio al fallback:`, err?.message || err);
        lastError = err;
      }
    }

    throw lastError || new Error('Nessun modello Gemini ha risposto con successo.');
  }

  /**
   * Verifica che il testo generato non sia troncato a metà parola o frase
   */
  private isTextComplete(text: string): boolean {
    if (!text) return false;
    const trimmed = text.trim();
    if (trimmed.length < 350) return false;
    // Deve terminare con punteggiatura di fine frase, virgolette, parentesi, asterisco o emoji
    return /[.!?…"'\*)\]⚽🔥🍻💪🏆⚡]$/.test(trimmed);
  }

  /**
   * Pulisce l'output AI da eventuali titoli o preamboli introduttivi isolati sulla prima riga
   */
  cleanAiOutput(rawText: string): string {
    if (!rawText) return '';
    return rawText
      .replace(
        /^[\s\*#]*(?:ecco\s+[^:\n]+|telecronaca[^:\n]*|pronostico[^:\n]*|cronaca[^:\n]*|disamina[^:\n]*|verdetto[^:\n]*)[:\s]*\n+/i,
        '',
      )
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
   * Risolve il profilo completo e le statistiche live di un giocatore dal motore StatsEngine
   */
  private resolveLivePlayerInfo(p: any): {
    raw: any;
    mmr: number;
    partite: number;
    winRate: number | null;
    gol: number;
    assist: number;
    mediaVoto: number | null;
    ruolo: string;
    piede: string;
  } {
    const rawList = this.statsEngine?.giocatoriRaw() || [];
    const matchedRaw =
      rawList.find(
        (g) =>
          (p?.id && g.id === p.id) ||
          (p?.nome &&
            g.nome?.toLowerCase().trim() === p.nome.toLowerCase().trim()),
      ) || {};
    const merged = { ...matchedRaw, ...p };

    const statsRes = this.statsEngine?.statsResult();
    const pid = merged.id;
    const seasonStats =
      pid && statsRes ? statsRes.bySeason.get(CURRENT_SEASON)?.get(pid) : null;
    const allTimeStats =
      pid && statsRes ? statsRes.allTime.get(pid) : null;
    const activeStats =
      seasonStats && seasonStats.partiteGiocate > 0
        ? seasonStats
        : allTimeStats;

    const mmr =
      p?.mmr ||
      (activeStats
        ? activeStats.partiteGiocate > 0
          ? activeStats.currentMmr
          : (activeStats.seasonStartMmr ?? 1000)
        : 1000);
    const partite = activeStats?.partiteGiocate ?? merged.partiteGiocate ?? 0;
    const winRate =
      activeStats && activeStats.partiteGiocate > 0
        ? Math.round(activeStats.winRate)
        : null;
    const gol = merged.gol ?? 0;
    const assist = merged.assist ?? 0;
    const mediaVoto =
      merged.mediaVoto && merged.mediaVoto > 0
        ? Math.round(merged.mediaVoto * 100) / 100
        : null;
    const ruolo = (
      merged.ruoloPreferito ||
      merged.ruolo ||
      'Jolly'
    ).trim();
    const piede = (merged.piedePreferito || 'Destro').trim();

    return {
      raw: merged,
      mmr,
      partite,
      winRate,
      gol,
      assist,
      mediaVoto,
      ruolo,
      piede,
    };
  }

  /**
   * Formatta la bio tecnica + anagrafica del giocatore (MMR, ruolo, piede, stats, bio)
   * per fornire massimo contesto tattico e goliardico all'AI.
   */
  formatPlayerBio(p: any): string {
    if (!p) return 'Sconosciuto';
    const info = this.resolveLivePlayerInfo(p);
    const merged = info.raw;
    const nome = (merged.nome || 'Giocatore').trim();
    const eta = this.calcolaEta(merged.annoNascita);
    const peso = merged.peso ? `${merged.peso}kg` : '';
    const altezza = merged.altezza ? `${merged.altezza}cm` : '';

    const tags: string[] = [];
    if (merged.soprannome) {
      tags.push(`soprannome: "${merged.soprannome}"`);
    }
    tags.push(
      `MMR: ${info.mmr}${info.partite < 3 ? ' (IN PIAZZAMENTO/INCOGNITA)' : ''}`,
    );
    tags.push(`Ruolo: ${info.ruolo}`);
    tags.push(`Piede: ${info.piede}`);
    if (info.partite > 0) {
      const statsParts = [`${info.partite} gare`];
      if (info.winRate !== null) statsParts.push(`WinRate ${info.winRate}%`);
      statsParts.push(`${info.gol} gol`);
      if (info.assist > 0) statsParts.push(`${info.assist} assist`);
      if (info.mediaVoto !== null) statsParts.push(`MV ${info.mediaVoto}`);
      tags.push(`Stats: ${statsParts.join(', ')}`);
    } else {
      tags.push(`Stats: Esordiente assoluto (0 gare)`);
    }
    if (eta !== null) tags.push(`Età: ${eta} anni (classe ${merged.annoNascita})`);
    if (peso) tags.push(`Peso: ${peso}`);
    if (altezza) tags.push(`Altezza: ${altezza}`);
    if (merged.professione?.trim()) tags.push(`Mestiere: ${merged.professione.trim()}`);
    if (merged.origini?.trim()) tags.push(`Origini: ${merged.origini.trim()}`);
    if (merged.statoCivile?.trim()) tags.push(`Stato civile: ${merged.statoCivile.trim()}`);
    if (merged.vizi?.trim()) tags.push(`Vizi/Abitudini: ${merged.vizi.trim()}`);

    return `${nome} [${tags.join(' | ')}]`;
  }

  /**
   * Calcola statistiche aggregate tattiche e fisiche della squadra
   */
  getTeamAggregates(players: any[]): {
    etaMedia: number | null;
    pesoTotale: number;
    pesoMedio: number | null;
    mmrMedio: number;
    totaleGol: number;
    totaleAssist: number;
    mediaVotoSquadra: number | null;
    esordientiCount: number;
    ruoliBreakdown: string;
    manciniCount: number;
  } {
    let sumEta = 0;
    let countEta = 0;
    let sumPeso = 0;
    let countPeso = 0;
    let sumMmr = 0;
    let totaleGol = 0;
    let totaleAssist = 0;
    let sumMv = 0;
    let countMv = 0;
    let esordientiCount = 0;
    let manciniCount = 0;
    const ruoliCount: Record<string, number> = {
      Portiere: 0,
      Difensore: 0,
      Fascia: 0,
      Attaccante: 0,
    };

    for (const p of players) {
      const info = this.resolveLivePlayerInfo(p);
      const merged = info.raw;
      sumMmr += info.mmr;
      totaleGol += info.gol;
      totaleAssist += info.assist;
      if (info.mediaVoto !== null) {
        sumMv += info.mediaVoto;
        countMv++;
      }
      if (info.partite < 3) {
        esordientiCount++;
      }
      if (
        info.piede.toLowerCase().includes('sinistr') ||
        info.piede.toLowerCase().includes('ambidestr')
      ) {
        manciniCount++;
      }
      const rKey = Object.keys(ruoliCount).find((k) =>
        info.ruolo.toLowerCase().startsWith(k.slice(0, 3).toLowerCase()),
      );
      if (rKey) {
        ruoliCount[rKey]++;
      }

      const eta = this.calcolaEta(merged.annoNascita);
      if (eta !== null) {
        sumEta += eta;
        countEta++;
      }
      if (merged.peso) {
        const w = parseFloat(merged.peso.toString().replace(/[^0-9.]/g, ''));
        if (!isNaN(w) && w > 40 && w < 200) {
          sumPeso += w;
          countPeso++;
        }
      }
    }

    const ruoliBreakdown = `${ruoliCount['Portiere']} POR, ${ruoliCount['Difensore']} DIF, ${ruoliCount['Fascia']} FAS, ${ruoliCount['Attaccante']} ATT`;

    return {
      etaMedia: countEta > 0 ? Math.round((sumEta / countEta) * 10) / 10 : null,
      pesoTotale: Math.round(sumPeso),
      pesoMedio: countPeso > 0 ? Math.round((sumPeso / countPeso) * 10) / 10 : null,
      mmrMedio: players.length > 0 ? Math.round(sumMmr / players.length) : 1000,
      totaleGol,
      totaleAssist,
      mediaVotoSquadra:
        countMv > 0 ? Math.round((sumMv / countMv) * 100) / 100 : null,
      esordientiCount,
      ruoliBreakdown,
      manciniCount,
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
    if (
      !forceRegenerate &&
      partita.pronosticoAi &&
      this.isTextComplete(partita.pronosticoAi)
    ) {
      return partita.pronosticoAi;
    }
    if (this.auth && !this.auth.isSuperUser()) {
      return partita.pronosticoAi || 'Pronostico riservato al Mister.';
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
    if (this.auth && !this.auth.isSuperUser()) {
      return partita.cronacaAi || 'Cronaca post-partita riservata al Mister.';
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

    if (this.auth && !this.auth.isSuperUser()) {
      return 'Verdetto AI riservato alla consultazione. Solo Mister o Presidente possono generare o rigenerare verdetti.';
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
   * Genera o recupera dalla cache Firestore lo Scouting Report per un giocatore.
   * Caching intelligente su `giocatori/{id}` con il campo `scoutingReportAi`.
   */
  async getOrGeneratePlayerScouting(
    giocatore: Giocatore,
    profile: any,
    recentNotes: string[] = [],
    forceRegenerate = false,
  ): Promise<{ scouting: string }> {
    if (
      !forceRegenerate &&
      giocatore.scoutingReportAi &&
      giocatore.scoutingReportAi.trim().length > 0
    ) {
      return {
        scouting: giocatore.scoutingReportAi,
      };
    }

    if (this.auth && !this.auth.isSuperUser()) {
      return {
        scouting: giocatore.scoutingReportAi || 'Nessuna scheda scouting redatta per questo giocatore.',
      };
    }

    const { systemPrompt, userPrompt } = buildPlayerScoutingPrompts(
      giocatore,
      profile,
      recentNotes,
      (anno) => this.calcolaEta(anno),
    );

    const rawResult = await this.callGemini(userPrompt, systemPrompt);

    let scouting = rawResult.trim();
    const scoutMatch = rawResult.match(/SCOUTING:\s*([\s\S]+)/i);
    if (scoutMatch && scoutMatch[1]) {
      scouting = scoutMatch[1].trim();
    }
    // Rimuove eventuali etichette o virgolette residue
    scouting = scouting.replace(/^(SCOUTING:\s*|["'])/i, '').replace(/["']$/g, '').trim();

    // Caching intelligente su Firestore (documento giocatore)
    if (giocatore.id) {
      try {
        await updateDoc(doc(this.firestore, `giocatori/${giocatore.id}`), {
          scoutingReportAi: scouting,
          aiUpdatedAt: new Date().toISOString(),
        });
        giocatore.scoutingReportAi = scouting;
      } catch (e) {
        console.warn('Errore salvataggio scouting su Firestore:', e);
      }
    }

    return {
      scouting,
    };
  }
}
