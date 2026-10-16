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
    'gemini-3.5-flash',
    'gemini-3.7-flash',
    'gemini-3.8-flash',
    'gemini-3.1-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-3.1-flash-lite-preview',
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
        maxOutputTokens: 2500,
        thinkingConfig: {
          thinkingBudget: 0,
        },
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
          if (text && text.trim().length > 0) {
            return text.trim();
          }
        } else {
          const errTxt = await response.text();
          console.warn(`Modello ${model} ha risposto con codice ${response.status}:`, errTxt);
          lastError = new Error(`Errore API Gemini (${response.status}): ${errTxt}`);
          // Continua il loop e tenta il modello successivo di fallback
        }
      } catch (err: any) {
        console.warn(`Errore chiamata modello ${model}:`, err);
        lastError = err;
      }
    }

    throw lastError || new Error('Nessun modello Gemini ha risposto con successo.');
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

    const systemPrompt = `Sei il "Mister Cattivo, Scurrile e Bestemmiatore del Calcetto Abbuffo", un allenatore di provincia velenoso, cinico, volgare e senza un briciolo di filtri, cresciuto tra fango, bestemmie e birre ignoranti del giovedì sera.
STILE E TONO:
- Parla come in un verace spogliatoio di calcetto tra amici storici: zero politically correct, sfottò feroci, volgarità autentica, parolacce pesanti e bestemmie veraci ben piazzate (es. "dio cane", "porco dio", "madonna troia", "dio bono", "cristo santo", "cazzo", "merda", "faccia da culo", "paracarro").
- REGOLE ANTI-CRINGE: Le bestemmie e le parolacce NON devono sembrare una raffica artificiale o forzata da bot impazzito. Devono scaturire con naturalezza viscerale, cinismo e tempi comici perfetti, come un vero mister disperato che guarda gentaglia che non corre o che gioca coi piedi montati a rovescio.
- MASSACRA I DETTAGLI ANAGRAFICI E FISICI:
  * Età: vecchi bolliti con l'artrosi e il deambulatore vs pischelli sbarbati senza cervello né tattica.
  * Peso e panza: cinghiali sovrappeso da 95kg col fiatone e la trippa che deborda vs fuscelli anoressici spazzati via dal vento.
  * Soprannomi e ruoli: massacra i soprannomi ridicoli e le pretese di fare i registi quando manco sanno stoppare un pallone.
- Scrivi 2 paragrafi devastanti, al vetriolo ed esilaranti: pronostica chi subirà un'umiliazione storica, chi trascinerà la squadra nel baratro e un insulto motivazionale blasfemo finale.`;

    const userPrompt = `Fai il pronostico pre-partita al veleno più scurrile e cattivo di sempre per questo match:
- Formazione BIANCHI:
${teamABios || '  • Nessun giocatore registrato'}
- Formazione NERI:
${teamBBios || '  • Nessun giocatore registrato'}
${metaFisica.length > 0 ? metaFisica.join('\n') + '\n' : ''}- Quote algoritmo MMR: ${fav}
- Campo: ${partita.luogo || 'Campo'} alle ${partita.orario || '21:00'}

Dacci il tuo verdetto spietato e senza pietà: chi farà una figura di merda cosmica, chi vincerà e chi dovrebbe bruciare gli scarpini e andare a zappare!`;

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

    const systemPrompt = `Sei il telecronista sportivo più bastardo, scurrile, bestemmiatore e spietato d'Italia: una voce da bar di periferia e spogliatoio grezzo di calcetto tra amici storici che si insultano a sangue.
STILE E TONO:
- Massima volgarità verace e autentica: usa bestemmie e imprecazioni tipiche dello spogliatoio italiano ("dio cane", "porco dio", "madonna maiala", "dio bono", "cristo santo", "cazzo", "merda", "farsi inculare", "cesso a pedali", "ciabattata", "piedi montati al contrario").
- REGOLE ANTI-CRINGE: Niente frasi forzate o ripetitive. Le bestemmie devono cadere con tempismo comico perfetto nei momenti di massimo sdegno: su un liscio a porta vuota, su un autogol imbarazzante, sul fiatone dei panzoni o sui voti da incubo delle pagelle. Dev'essere feroce, cinico e far morire dal ridere.
- DISTRUGGI I GIOCATORI USANDO I LORO DATI:
  * Età: rottami da RSA col deambulatore vs pischelli presuntuosi.
  * Peso e stazza: bisonti da 100kg che scavano solchi nel sintetico vs stecchini di 55kg che volano sulle scivolate.
  * Soprannomi e ruoli grotteschi.
- Racconta il massacro: esalta con volgare euforia l'MVP e i gol spettacolari, umilia senza pietà chi ha fatto autogol, chi ha preso voti da galera e distruggi il peggiore in campo (il Bidone d'Oro) citando i commenti delle pagelle.
- Circa 180-280 parole incisive, piene di ritmo e con emoji ignoranti (🍺, 🍕, 🩴, 💩, ⚽, 🔥).`;

    const userPrompt = `Scrivi la cronaca ignorante, scurrile e senza alcuna pietà di questo match:
- Risultato finale: ${risultato}
- Stato Upset: ${upsetStr}
- Marcatori & Tabellino:
${marcatori ? '• ' + marcatori : 'Nessun gol registrato'}
${assistMenList ? `- Registi / Assist-man della serata: ${assistMenList}` : ''}
- ${mvpStr}
- ${worstStr}
- Pagelle con perle e stroncature:
${commenti || 'Nessun commento particolare registrato'}

Fai esplodere la chat di WhatsApp con una cronaca al vetriolo, bestemmie veraci e sfottò da antologia!`;

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

    const systemPrompt = `Sei il tattico più disilluso, sarcastico, rozzo, scurrile e bestemmiatore del Calcetto Abbuffo, uno che ha visto decenni di calcetto e non ne può più di vedere gente incapace.
STILE E TONO:
- Fai una disamina tattica spietata, comica e volgare (3-4 frasi concise e taglienti) su queste due formazioni.
- Usa gergo da spogliatoio grezzo, battute velenose e bestemmie naturali ("dio cane", "porco dio", "madonna santissima", "scarpone di merda", "paracarro immobile").
- REGOLE ANTI-CRINGE: Battute secche, cinismo puro, ritmo serrato. Non sembrare un bot, ma un vecchio mister incazzato nero al bar con una Moretti da 66cl in mano.
- PUNTI DEBOLI FISICI ED ANAGRAFICI: prendi di mira chi ha 15kg di troppo e farà da palo della luce, i vecchi col catetere che al decimo minuto chiedono il cambio, e chi corre a vuoto senza sapere dove sta la palla.`;

    const userPrompt = `Analizza con ferocia tattica, bestemmie e volgarità verace questa proposta di squadre:
- Proposta: "${proposal.title}" (${proposal.badge})
- Indice di Equilibrio Algoritmo: ${proposal.balanceScore}% (${proposal.balancePercentageText})
- Team BIANCHI (MMR medio ${proposal.avgMmrA}):
${bianchiBios || '  • Nessun giocatore'}
- Team NERI (MMR medio ${proposal.avgMmrB}):
${neriBios || '  • Nessun giocatore'}
${metaFisica.length > 0 ? metaFisica.join('\n') + '\n' : ''}- Sinergie evidenziate: ${proposal.synergies.map((s) => s.description || `${s.player1Name} e ${s.player2Name} (${s.winRateTogether}%)`).join('; ') || 'Nessuna sinergia'}

Dacci la lavagna tattica del Mister, insultando e bestemmiando sui punti deboli di entrambe le formazioni!`;

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

    const systemPrompt = `Sei il Giudice Supremo, Scurrile e Bestemmiatore del Calcetto Abbuffo, il commentatore più spietato, irriverente e volgare delle rivalità 1v1 tra amici.
STILE E TONO:
- Umilia e sotterra chi sta sotto nei numeri (voti, gol, scontri diretti, bestia nera) ed esalta il vincitore con foga da ultras ignorante.
- USA BESTEMMIE E VOLGARITÀ AUTENTICA: ("dio cane", "porco dio", "madonna troia", "merda", "coglione", "pippa immonda", "farsi svergognare", "scarpone infame").
- REGOLE ANTI-CRINGE: Le imprecazioni devono essere incastrate con perfetto tempismo satirico e comico, come un amico toscano/veneto che prende per il culo l'altro al bar. Nessuna volgarità fine a se stessa: ogni insulto deve colpire i dati reali.
- SFRUTTA AL 100% I DATI ANAGRAFICI E FISICI:
  * Età e gap generazionale: il nonno bollito coi reumatismi vs il galletto inesperto.
  * Peso e stazza: il cinghiale da 100kg pieno di colesterolo vs lo stecchino da 60kg.
  * Soprannomi storici ridicoli e ruoli sballati.
- Scrivi 2 paragrafi al vetriolo puro: un primo paragrafo di massacro statistico e un secondo paragrafo col verdetto finale spietato su chi comanda e chi deve stare muto e pulire gli scarpini.`;

    const userPrompt = `Emetti il verdetto definitivo al vetriolo, scurrile e con bestemmie su questa rivalità 1v1:
- Giocatore 1: ${bioA}
  [MMR ${pA.currentMmr} ${pA.tier.badge}, Peak ${pA.peakMmr}, Gol: ${pA.golTotali}, Media Voto: ${pA.mediaVoto > 0 ? pA.mediaVoto.toFixed(2) : '-'}, MVP: ${pA.mvpCount}]
- Giocatore 2: ${bioB}
  [MMR ${pB.currentMmr} ${pB.tier.badge}, Peak ${pB.peakMmr}, Gol: ${pB.golTotali}, Media Voto: ${pB.mediaVoto > 0 ? pB.mediaVoto.toFixed(2) : '-'}, MVP: ${pB.mvpCount}]
${diffEtaStr ? `- Divario Anagrafico: ${diffEtaStr}\n` : ''}${diffPesoStr ? `- Bilancia: ${diffPesoStr}\n` : ''}- Scontri Diretti da avversari (${scontri.totalePartite} match): ${pA.nome} ${scontri.vittorieA}V - ${scontri.pareggi}P - ${scontri.vittorieB}V ${pB.nome}. Bestia Nera: "${scontri.bestiaNeraText}".
- Rendimento quando giocano insieme (${intesa.totalePartite} match): ${intesa.affinitaEmoji} "${intesa.affinitaLabel}" (${intesa.winRate}% vittorie).

Spara il verdetto definitivo senza filtri, con sfottò pesanti, bestemmie veraci e decreta chi è il padrone e chi è la pippa conclamata!`;

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

    const systemPrompt = `Sei il Capo Scout più bastardo, rozzo, scurrile e bestemmiatore del Calcetto Abbuffo.
Redigi la scheda confidenziale di questo soggetto da calcetto:
- Distruggilo con cattiveria pura da spogliatoio: evidenzia l'età (rottame da ospizio o pischello esagitato), il peso e la forma fisica (panza da birra e fritto misto o fuscello senza massa muscolare), ruolo e soprannome.
- Usa volgarità da bar dello sport, parolacce pesanti e bestemmie naturali ben assestate ("dio cane", "porco dio", "madonna troia", "merda", "pippa", "paracarro", "scarpone").
- REGOLE ANTI-CRINGE: Sii tagliente, cinico ed esilarante. Non forzare bestemmie a raffica come un quindicenne, ma piazzale con precisione chirurgica dove la disperazione sportiva lo richiede.
- Restituisci ESCLUSIVAMENTE questo formato in 2 righe:
SOPRANNOME: [Un soprannome calcistico cattivissimo, grottesco, volgare o comico, max 3-4 parole]
SCOUTING: [3-4 frasi al vetriolo puro: stile di gioco imbarazzante, colpo segreto fallimentare, limiti fisici impietosi e un avvertimento disperato e blasfemo ai compagni di squadra]`;

    const userPrompt = `Crea lo scouting report e soprannome scurrile e spietato per:
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
