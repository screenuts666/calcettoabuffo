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
    tags.push(`Ruolo: ${ruolo}`);
    if (eta !== null) tags.push(`Età: ${eta} anni (classe ${p.annoNascita})`);
    if (peso) tags.push(`Peso: ${peso}`);
    if (altezza) tags.push(`Altezza: ${altezza}`);

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

    const teamABios = (partita.teamA || [])
      .map((p) => `  • ${this.formatPlayerBio(p)}`)
      .join('\n');
    const teamBBios = (partita.teamB || [])
      .map((p) => `  • ${this.formatPlayerBio(p)}`)
      .join('\n');

    const aggA = this.getTeamAggregates(partita.teamA || []);
    const aggB = this.getTeamAggregates(partita.teamB || []);

    const metaFisica: string[] = [];
    if (aggA.etaMedia !== null && aggB.etaMedia !== null) {
      const diffEta = Math.round(Math.abs(aggA.etaMedia - aggB.etaMedia) * 10) / 10;
      metaFisica.push(
        `- Divario Età: Bianchi media ${aggA.etaMedia} anni vs Neri media ${aggB.etaMedia} anni (Differenza: ${diffEta} anni — ${aggA.etaMedia > aggB.etaMedia ? 'Bianchi più anziani/bolliti' : 'Neri più anziani/bolliti'})`
      );
    }
    if (aggA.pesoTotale > 0 && aggB.pesoTotale > 0) {
      metaFisica.push(
        `- Confronto Stazza: Bianchi ${aggA.pesoTotale}kg (media ${aggA.pesoMedio}kg) vs Neri ${aggB.pesoTotale}kg (media ${aggB.pesoMedio}kg)`
      );
    }

    const probA = odds?.probAPercent ?? 50;
    const probB = odds?.probBPercent ?? 50;
    const fav =
      odds?.favoriteTeam === 'A'
        ? `Bianchi favoriti al ${probA}% (+${odds.favoriteMargin}%)`
        : odds?.favoriteTeam === 'B'
          ? `Neri favoriti al ${probB}% (+${odds.favoriteMargin}%)`
          : 'Partita in perfetto equilibrio 50-50';

    const systemPrompt = `Sei l'unico telecronista che commenta il pre-partita di questa partita di calcetto tra amici a Roma. Il tuo stile unisce il commento tecnico dei vecchi FIFA (stile Caputi/Bulgarelli), la satira romana di Ceppaflex e il cinismo tagliente di Grok.

REGOLE FONDAMENTALI:
- PARLA SOLO TU: Sei una singola voce narrante in prima persona. Parla direttamente all'ascoltatore. Niente dialoghi a due voci, niente copioni teatrali.
- NESSUN EFFETTO O DIDASCALIA: Non scrivere effetti sonori, rumori, didascalie o parentesi registiche (vietato scrivere "Effetto...", "Grafica...", ecc.). Scrivi solo ed esclusivamente le parole che pronunci al microfono.
- INIZIA SUBITO: Parti direttamente con la prima parola, senza titoli ("Pronostico:") né formule introduttive.
- TONO E GERGO: Romanesco di borgata asciutto, cinico e tagliente. Usa età, peso e quote come dati tecnici impietosi per prendere in giro le due squadre ("pippa ar sugo", "paracarro", "a cazzo de cane", "s'è fatto mette sotto"). Volgare e pungente al punto giusto, zero battute da bambini, zero cringe.

STRUTTURA (2 brevi paragrafi):
1. Analisi cinica delle due formazioni e delle quote, evidenziando chi parte già battuto nella dignità.
2. Il tuo verdetto spietato su come finirà e chi farà la figura peggiore.`;

    const userPrompt = `Fai il pronostico pre-partita a voce sola per questo match:
- Formazione BIANCHI:
${teamABios || '  • Nessun giocatore registrato'}
- Formazione NERI:
${teamBBios || '  • Nessun giocatore registrato'}
${metaFisica.length > 0 ? metaFisica.join('\n') + '\n' : ''}- Quote algoritmo MMR: ${fav}
- Campo: ${partita.luogo || 'Campo'} alle ${partita.orario || '21:00'}

Dacci la disamina pre-partita al microfono con cinismo romano vintage e la sentenza su chi vince!`;

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

    const scoreA = partita.scoreA ?? 0;
    const scoreB = partita.scoreB ?? 0;
    const risultato = `Bianchi ${scoreA} - ${scoreB} Neri`;

    // Marcatori & Assist-man con bio completa
    const allMatchPlayers = [...(partita.teamA || []), ...(partita.teamB || [])];
    const playerMap = new Map<string, any>();
    for (const pl of allMatchPlayers) {
      if (pl.id) playerMap.set(pl.id, pl);
      if (pl.nome) playerMap.set(pl.nome.toLowerCase().trim(), pl);
    }

    const eventi = partita.eventiGol || [];
    const marcatori = eventi
      .map((eg: any) => {
        const pObj = eg.giocatoreId ? playerMap.get(eg.giocatoreId) : playerMap.get((eg.nome || '').toLowerCase().trim());
        const bio = pObj ? ` (${this.formatPlayerBio(pObj)})` : '';
        if (eg.isAutogoal) {
          return `${eg.nome || 'Giocatore'}${bio} [CLAMOROSO AUTOGOL]`;
        }
        if (eg.assistNome) {
          return `${eg.nome || 'Giocatore'}${bio} (GOL, assist al bacio di ${eg.assistNome})`;
        }
        return `${eg.nome || 'Giocatore'}${bio} (GOL, azione solitaria)`;
      })
      .join('\n• ');

    // Riepilogo assist-men della serata
    const assistMap = new Map<string, number>();
    for (const eg of eventi) {
      if (!eg.isAutogoal && eg.assistNome) {
        assistMap.set(eg.assistNome, (assistMap.get(eg.assistNome) || 0) + 1);
      }
    }
    const assistMenList = Array.from(assistMap.entries())
      .map(([nome, count]) => `${nome} (${count} assist 👟)`)
      .join(', ');

    // MVP & Peggiore con bio fisica
    const mvpStr = reportData?.mvp
      ? `🏆 MVP della serata: ${this.formatPlayerBio(reportData.mvp)} (Voto ${reportData.mvp.voto} - "${reportData.mvp.note || 'Prestazione sontuosa'}")`
      : 'Nessun MVP assegnato';

    const worstStr = reportData?.worst
      ? `🩴 Bidone d'oro / Peggiore in campo: ${this.formatPlayerBio(reportData.worst)} (Voto ${reportData.worst.voto} - "${reportData.worst.note || 'Piedi a ferro da stiro e fiato corto'}")`
      : '';

    const upsetStr = reportData?.isUpset
      ? `CLAMOROSO UPSET: ${reportData.upsetDescription}`
      : 'Vittoria secondo pronostico';

    // Commenti delle pagelle più saporiti con bio
    const commenti = allMatchPlayers
      .filter((p) => p.note && p.note.trim().length > 0)
      .map((p) => `• ${this.formatPlayerBio(p)} [Voto ${p.voto}]: "${p.note}"`)
      .slice(0, 8)
      .join('\n');

    const systemPrompt = `Sei l'unico telecronista di questa partita di calcetto tra amici a Roma. Il tuo stile unisce le vecchie telecronache di FIFA (stile Caputi/Bulgarelli), la comicità cult romana di Ceppaflex e il cinismo tagliente di Grok.

REGOLE FONDAMENTALI:
- PARLA SOLO TU: Sei una singola voce narrante in prima persona. Parla direttamente all'ascoltatore. Niente dialoghi a due voci, niente copioni teatrali, niente personaggi alternati.
- NESSUN EFFETTO O DIDASCALIA: Non scrivere effetti sonori, rumori, didascalie o parentesi registiche (vietato scrivere "Effetto...", "Grafica...", ecc.). Scrivi solo ed esclusivamente le parole esatte che dici al microfono.
- INIZIA SUBITO: Parti direttamente con la prima frase della telecronaca, senza titoli ("Cronaca:"), saluti o preamboli.
- TONO E GERGO: Romanesco di borgata asciutto, cinico e deadpan. Contrasto comico micidiale tra serietà formale da grande evento e degrado tecnico del campetto ("s'è fatto 'na passeggiata", "ciabattata immonda", "paracarro", "annamo bene", "a zappà la terra", "gol sventrato"). Volgare e pungente al punto giusto, zero cringe, niente battute boomer.

STRUTTURA DEL COMMENTO:
1. Il racconto crudo della partita e del risultato finale, con i momenti salienti (gol, lisci clamorosi, autogol comici).
2. L'esaltazione dell'MVP della serata (l'unico che si salva in mezzo a questa banda).
3. Il massacro del peggiore in campo / bidone d'oro, umiliato senza pietà basandoti sulle pagelle e commenti dei compagni.`;

    const userPrompt = `Fai la telecronaca post-partita a voce sola per questo match:
- Risultato finale: ${risultato}
- Scenario Upset: ${upsetStr}
- Tabellino Gol & Marcatori:
${marcatori ? '• ' + marcatori : 'Nessun gol registrato'}
${assistMenList ? `- Assist-man della serata: ${assistMenList}` : ''}
- ${mvpStr}
- ${worstStr}
- Pagelle e commenti dei compagni:
${commenti || 'Nessun commento particolare registrato'}

Commenta la partita al microfono a voce sola con cinismo romano vintage e zero pietà!`;

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
    const bianchiBios = (proposal.teamA || [])
      .map((p) => `  • ${this.formatPlayerBio(p)}`)
      .join('\n');
    const neriBios = (proposal.teamB || [])
      .map((p) => `  • ${this.formatPlayerBio(p)}`)
      .join('\n');

    const aggA = this.getTeamAggregates(proposal.teamA || []);
    const aggB = this.getTeamAggregates(proposal.teamB || []);

    const metaFisica: string[] = [];
    if (aggA.etaMedia !== null && aggB.etaMedia !== null) {
      const diffEta = Math.round(Math.abs(aggA.etaMedia - aggB.etaMedia) * 10) / 10;
      metaFisica.push(
        `- Divario Età: Bianchi media ${aggA.etaMedia} anni vs Neri media ${aggB.etaMedia} anni (Diff: ${diffEta} anni — ${aggA.etaMedia > aggB.etaMedia ? 'Bianchi vecchi da rottamare' : 'Neri vecchi da rottamare'})`
      );
    }
    if (aggA.pesoTotale > 0 && aggB.pesoTotale > 0) {
      metaFisica.push(
        `- Bilancia e Stazza: Bianchi ${aggA.pesoTotale}kg (media ${aggA.pesoMedio}kg) vs Neri ${aggB.pesoTotale}kg (media ${aggB.pesoMedio}kg)`
      );
    }

    const systemPrompt = `Sei l'analista tattico da studio televisivo di fine anni '90 (stile telecronache FIFA vintage e Ceppaflex), con la disillusione e l'ironia spietata di un trentenne di borgata romana.
STILE E TONO:
- Consegna una disamina tattica in 3-4 frasi secche, taglienti e senza fronzoli sulla proposta di squadre appena formulata.
- Deadpan puro: analizza l'indice di equilibrio dell'algoritmo con apparente serietà per poi smontarlo con cinismo romano ("Sulla carta equilibrio perfetto, nella realtà prevediamo lanci lunghi nel vuoto cosmico e gente che chiama il cambio dopo sei minuti").
- CEPPAFLEX VIBE: Riferimenti vintage da videogioco ("modulo a farfalla impazzita", "diagonale difensiva che fa entrare pure i motorini"), conditi con gergo romano verace ("scappati de casa", "paracarri", "s'è capito subito che aria tira").
- ZERO CRINGE: Niente luoghi comuni triti, niente retorica. Solo fredda constatazione del divario atletico e dei buchi neri tattici di entrambi gli schieramenti.`;

    const userPrompt = `Disamina tattica in stile Ceppaflex / studio FIFA retro per questa proposta di squadre:
- Proposta: "${proposal.title}" (${proposal.badge})
- Indice di Equilibrio Algoritmo: ${proposal.balanceScore}% (${proposal.balancePercentageText})
- Team BIANCHI (MMR medio ${proposal.avgMmrA}):
${bianchiBios || '  • Nessun giocatore'}
- Team NERI (MMR medio ${proposal.avgMmrB}):
${neriBios || '  • Nessun giocatore'}
${metaFisica.length > 0 ? metaFisica.join('\n') + '\n' : ''}- Sinergie evidenziate: ${proposal.synergies.map((s) => s.description || `${s.player1Name} e ${s.player2Name} (${s.winRateTogether}%)`).join('; ') || 'Nessuna sinergia'}

Dacci la lavagna tattica del match, freddando entrambe le squadre sui loro punti deboli!`;

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

    const pA = comp.playerA;
    const pB = comp.playerB;
    const scontri = comp.scontriContro;
    const intesa = comp.intesaInsieme;

    const etaA = this.calcolaEta(pA.annoNascita);
    const etaB = this.calcolaEta(pB.annoNascita);
    let diffEtaStr = '';
    if (etaA !== null && etaB !== null) {
      const diff = Math.abs(etaA - etaB);
      if (diff === 0) {
        diffEtaStr = `Coetanei (${etaA} anni, stessa data di scadenza)`;
      } else if (etaA > etaB) {
        diffEtaStr = `${pA.nome} è più vecchio di ${diff} anni (${etaA} vs ${etaB} anni — il nonno bollito contro il pischello)`;
      } else {
        diffEtaStr = `${pB.nome} è più vecchio di ${diff} anni (${etaB} vs ${etaA} anni — il nonno bollito contro il pischello)`;
      }
    }

    const pesoA = pA.peso ? parseFloat(pA.peso) : null;
    const pesoB = pB.peso ? parseFloat(pB.peso) : null;
    let diffPesoStr = '';
    if (pesoA && pesoB) {
      const diffP = Math.round(Math.abs(pesoA - pesoB) * 10) / 10;
      if (diffP > 3) {
        diffPesoStr = `Differenza stazza: ${diffP}kg (${pesoA > pesoB ? `${pA.nome} pesa ${pesoA}kg vs ${pB.nome} ${pesoB}kg — il cinghiale contro il fuscellino` : `${pB.nome} pesa ${pesoB}kg vs ${pA.nome} ${pesoA}kg — il cinghiale contro il fuscellino`})`;
      } else {
        diffPesoStr = `Stessa categoria di peso (~${pesoA}kg)`;
      }
    }

    const bioA = this.formatPlayerBio(pA);
    const bioB = this.formatPlayerBio(pB);

    const systemPrompt = `Sei l'unico giudice supremo e telecronista delle rivalità storiche al campetto (stile confronto FIFA retro condito dalla comicità romana di Ceppaflex e cinismo tagliente).
REGOLE:
- PARLA SOLO TU: Singola voce narrante in prima persona. Nessun dialogo né copione teatrale.
- NESSUN EFFETTO: Solo testo parlato direttamente al microfono, senza titoli né preamboli.
- Distruggi chi sta sotto nei numeri (scontri diretti, MMR, gol, media voto) ed eleggi il padrone assoluto della sfida con un verdetto secco e mortificante ("qui non c'è partita: siamo di fronte a una vera e propria paternità calcistica", "quando lo vede in campo gli tremano i parastinchi", "bestia nera certificata dall'ufficio sinistri").
- ZERO CRINGE: Volgare e pungente al punto giusto ("s'è fatto mette sotto", "pippa ar sugo", "annamo a raccoglie i cocci"), ma con eleganza cinica e intelligenza satirica.
- STRUTTURA IN 2 PARAGRAFI:
  1° Paragrafo: Il massacro numerico impietoso (scontri diretti, bestia nera, divario di rendimento e intesa quando giocano insieme).
  2° Paragrafo: La sentenza definitiva senza appello su chi comanda e chi deve portare le borracce e stare muto.`;

    const userPrompt = `Emetti il verdetto definitivo al vetriolo in stile Ceppaflex / confronto FIFA retro su questa rivalità 1v1:
- Giocatore 1: ${bioA}
  [MMR ${pA.currentMmr} ${pA.tier.badge}, Peak ${pA.peakMmr}, Gol: ${pA.golTotali}, Media Voto: ${pA.mediaVoto > 0 ? pA.mediaVoto.toFixed(2) : '-'}, MVP: ${pA.mvpCount}]
- Giocatore 2: ${bioB}
  [MMR ${pB.currentMmr} ${pB.tier.badge}, Peak ${pB.peakMmr}, Gol: ${pB.golTotali}, Media Voto: ${pB.mediaVoto > 0 ? pB.mediaVoto.toFixed(2) : '-'}, MVP: ${pB.mvpCount}]
${diffEtaStr ? `- Divario Anagrafico: ${diffEtaStr}\n` : ''}${diffPesoStr ? `- Bilancia: ${diffPesoStr}\n` : ''}- Scontri Diretti da avversari (${scontri.totalePartite} match): ${pA.nome} ${scontri.vittorieA}V - ${scontri.pareggi}P - ${scontri.vittorieB}V ${pB.nome}. Bestia Nera: "${scontri.bestiaNeraText}".
- Rendimento quando giocano insieme (${intesa.totalePartite} match): ${intesa.affinitaEmoji} "${intesa.affinitaLabel}" (${intesa.winRate}% vittorie).

Spara il verdetto definitivo senza filtri e sancisci chi è il padrone del campetto e chi è la vittima sacrificale designata!`;

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

    const mmr = profile?.currentMmr ?? 1000;
    const tier = profile?.tier?.badge ?? 'Argento';
    const streak = profile?.form?.statusLabel ?? 'Costante';
    const gol = profile?.golTotali ?? giocatore.gol ?? 0;
    const partite = profile?.partiteGiocate ?? giocatore.partiteGiocate ?? 0;
    const mediaVoto =
      profile?.mediaVoto > 0
        ? profile.mediaVoto.toFixed(2)
        : (giocatore.mediaVoto || 0).toFixed(2);
    const winRate = profile?.winRate ?? 50;
    const gemello = profile?.chemistry?.bestTeammate
      ? `${profile.chemistry.bestTeammate.teammateNome} (${profile.chemistry.bestTeammate.winRateTogether}% vittorie)`
      : 'Nessuno fisso';
    const bestiaNera = profile?.chemistry?.worstNemesis
      ? `${profile.chemistry.worstNemesis.opponentNome} (${profile.chemistry.worstNemesis.lossesAgainst} sconfitte subite)`
      : 'Nessuna bestia nera';

    const eta = this.calcolaEta(giocatore.annoNascita);
    const etaStr = eta !== null ? `${eta} anni (classe ${giocatore.annoNascita})` : (giocatore.annoNascita || 'Sconosciuta');
    const pesoStr = giocatore.peso ? `${giocatore.peso} kg` : 'N.D.';
    const altezzaStr = giocatore.altezza ? `${giocatore.altezza} cm` : 'N.D.';

    const systemPrompt = `Sei l'osservatore e commentatore più cinico del calcio di periferia (un mix tra talent scout disilluso di FIFA vintage, Ceppaflex e Grok in modalità scatenata).
STILE E REGOLE:
- Redigi la scheda confidenziale di questo giocatore di calcetto di borgata con distacco professionale e ferocia comica naturale.
- ROMANESCO ASCIUTTO & PUNGENTE: Nessun cliché da macchietta, solo verità taglienti su stile di gioco, limiti atletici (trattati con ironia tecnica, non battute da asilo) e fissazioni tattiche ridicole.
- FORMATO OBBLIGATORIO (esattamente 2 righe):
SOPRANNOME: [Un soprannome calcistico romano, tagliente, ironico o beffardo in perfetto stile Ceppaflex / spogliatoio verace, max 3-4 parole]
SCOUTING: [3-4 frasi da telecronista d'epoca disilluso: stile di gioco improbabile, colpo tipico fallimentare, tenuta atletica reale e un avvertimento spassionato ai compagni di squadra che dovranno giocarci insieme]`;

    const userPrompt = `Crea lo scouting report e soprannome in stile Ceppaflex / osservatore disilluso per:
- Nome: ${giocatore.nome} (Soprannome attuale: "${giocatore.soprannome || 'Nessuno'}")
- Ruolo: ${giocatore.ruoloPreferito || 'Jolly'} | Piede: ${giocatore.piedePreferito || 'Destro'}
- Età: ${etaStr} | Peso: ${pesoStr} | Altezza: ${altezzaStr}
- Rating MMR: ${mmr} (${tier}) | Stato di Forma: ${streak}
- Statistiche: ${partite} partite disputate, ${gol} gol fatti, ${mediaVoto} media voto, ${winRate}% win rate
- Gemello del Gol: ${gemello}
- Bestia Nera: ${bestiaNera}
- Note e commenti ricevuti dai compagni:
${recentNotes.length > 0 ? recentNotes.map((n) => `• "${n}"`).join('\n') : 'Nessuna nota registrata'}

Segui rigorosamente il formato:
SOPRANNOME: ...
SCOUTING: ...`;

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
