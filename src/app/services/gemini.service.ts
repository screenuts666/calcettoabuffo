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

@Injectable({
  providedIn: 'root',
})
export class GeminiService {
  private firestore = inject(Firestore);

  // Cache in-memory della chiave API per evitare letture ripetute su Firestore
  private cachedApiKey: string | null = null;
  private readonly GEMINI_MODEL = 'gemini-2.5-flash';

  /**
   * Recupera a runtime la chiave API da Firestore dal nodo sicuro `_config/ai`.
   * Mai hardcodata nel codice sorgente.
   */
  async getApiKey(): Promise<string> {
    if (this.cachedApiKey) {
      return this.cachedApiKey;
    }

    try {
      const configRef = doc(this.firestore, '_config/ai');
      const snap = await getDoc(configRef);
      if (snap.exists()) {
        const data = snap.data();
        const key = data?.['geminiApiKey'] || data?.['apiKey'] || '';
        if (key) {
          this.cachedApiKey = key;
          return key;
        }
      }
    } catch (err) {
      console.error('Errore nel recupero della chiave API da Firestore:', err);
    }

    throw new Error(
      'Chiave API Gemini non trovata nel nodo sicuro Firestore _config/ai. Configura la chiave per utilizzare le funzioni AI.',
    );
  }

  /**
   * Chiamata generica alle REST API di Gemini 2.5 Flash
   */
  async callGemini(prompt: string, systemPrompt?: string): Promise<string> {
    const key = await this.getApiKey();
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.GEMINI_MODEL}:generateContent?key=${key}`;

    const body: any = {
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.85,
        maxOutputTokens: 2500,
        thinkingConfig: {
          thinkingBudget: 0,
        },
      },
    };

    if (systemPrompt) {
      body.systemInstruction = {
        parts: [{ text: systemPrompt }],
      };
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errTxt = await response.text();
      console.error('Errore chiamata Gemini API:', response.status, errTxt);
      throw new Error(`Errore API Gemini (${response.status}): ${errTxt}`);
    }

    const json = await response.json();
    const candidate = json.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('Nessun testo generato da Gemini.');
    }

    return text.trim();
  }

  // =========================================================================
  // 1. REPORT PARTITA: PRONOSTICO DEL MISTER (PRE-MATCH)
  // =========================================================================

  /**
   * Genera o recupera dalla cache Firestore il Pronostico del Mister pre-partita.
   * Basato su Squadra Favorita MMR, Streak di Forma e Chimica.
   */
  async getOrGeneratePronostico(
    partita: Partita,
    odds: any,
    forceRegenerate = false,
  ): Promise<string> {
    if (!forceRegenerate && partita.pronosticoAi) {
      return partita.pronosticoAi;
    }

    const teamANomi = (partita.teamA || [])
      .map((p) => p.nome || 'Giocatore')
      .join(', ');
    const teamBNomi = (partita.teamB || [])
      .map((p) => p.nome || 'Giocatore')
      .join(', ');

    const probA = odds?.probAPercent ?? 50;
    const probB = odds?.probBPercent ?? 50;
    const fav =
      odds?.favoriteTeam === 'A'
        ? `Bianchi favoriti al ${probA}% (+${odds.favoriteMargin}%)`
        : odds?.favoriteTeam === 'B'
          ? `Neri favoriti al ${probB}% (+${odds.favoriteMargin}%)`
          : 'Partita in perfetto equilibrio 50-50';

    const systemPrompt = `Sei il "Mister Saggio del Calcetto Abbuffo", allenatore veterano e brillante da spogliatoio. 
Parli con un tono sportivo, appassionato, ironico e schietto da calcetto del giovedì sera tra amici (gergo calcistico italiano, battute da bar sport, emoji a tema).
Non fare liste noiose. Scrivi 1 o 2 brevi paragrafi accattivanti con un pronostico pepato su chi vincerà e la chiave tattica o goliardica della sfida.`;

    const userPrompt = `Fai il pronostico pre-partita per questo match:
- Squadra Bianchi: ${teamANomi || 'Formazione da definire'}
- Squadra Neri: ${teamBNomi || 'Formazione da definire'}
- Quote algoritmo MMR: ${fav}
- Luogo: ${partita.luogo || 'Campo'} alle ${partita.orario || '21:00'}

Dai il tuo verdetto da Mister: chi rischia la disfatta, chi trascinerà la squadra e un consiglio spassionato a chi giocherà coi piedi quadrati!`;

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

    // Marcatori
    const eventi = partita.eventiGol || [];
    const marcatori = eventi
      .map(
        (eg: any) =>
          `${eg.nome || 'Giocatore'} ${eg.isAutogoal ? '(AUTOGOL)' : '(GOL)'}`,
      )
      .join(', ');

    // MVP & Peggiore
    const mvpStr = reportData?.mvp
      ? `MVP della serata: ${reportData.mvp.nome} (Voto ${reportData.mvp.voto} - "${reportData.mvp.note || 'Prestazione sontuosa'}")`
      : 'Nessun MVP assegnato';

    const worstStr = reportData?.worst
      ? `Bidone d'oro / Peggiore: ${reportData.worst.nome} (Voto ${reportData.worst.voto} - "${reportData.worst.note || 'Piedi a ferro da stiro'}")`
      : '';

    const upsetStr = reportData?.isUpset
      ? `CLAMOROSO UPSET: ${reportData.upsetDescription}`
      : 'Vittoria secondo pronostico';

    // Commenti delle pagelle più saporiti
    const allPlayers = [...(partita.teamA || []), ...(partita.teamB || [])];
    const commenti = allPlayers
      .filter((p) => p.note && p.note.trim().length > 0)
      .map((p) => `• ${p.nome} (Voto ${p.voto}): "${p.note}"`)
      .slice(0, 6)
      .join('\n');

    const systemPrompt = `Sei un telecronista sportivo ignorante e brillante stile "Calciatori Brutti" e spogliatoio calcetto abbuffo.
Usa gergo calcistico tipico da calcetto all'italiana (trivelle, liscio, ciabattata, ginocchia sbucciate, polmoni lasciati al bar, birra post-partita, pizza).
Scrivi una cronaca esilarante, ritmata e goliardica della partita (circa 150-250 parole) con tante emoji sportive.
Cita i momenti clou, i marcatori, celebra l'MVP e prendi amichevolmente in giro il peggiore e i commenti delle pagelle.`;

    const userPrompt = `Scrivi la cronaca ignorante di questo match:
- Risultato finale: ${risultato}
- Stato Upset: ${upsetStr}
- Marcatori: ${marcatori || 'Nessun gol registrato'}
- ${mvpStr}
- ${worstStr}
- Commenti e perle dalle pagelle:
${commenti || 'Nessun commento particolare registrato'}

Fai impazzire lo spogliatoio con una cronaca degna della prima pagina della Gazzetta dello Spuntino!`;

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
    const bianchiNomi = (proposal.teamA || []).map((p) => p.nome).join(', ');
    const neriNomi = (proposal.teamB || []).map((p) => p.nome).join(', ');

    const systemPrompt = `Sei l'analista tattico satirico del Calcetto Abbuffo, un mix tra un tattico di Coverciano e un commentatore da bar dello sport.
Scrivi una breve disamina tattica (3-4 frasi concise e incisive) per queste due formazioni proposte: punti di forza, scontro chiave e previsione sull'equilibrio in campo con tono simpatico e sportivo.`;

    const userPrompt = `Analizza questa proposta di squadre:
- Proposta: "${proposal.title}" (${proposal.badge})
- Indice di Equilibrio Algoritmo: ${proposal.balanceScore}% (${proposal.balancePercentageText})
- Team Bianchi (MMR medio ${proposal.avgMmrA}): ${bianchiNomi}
  (Ruoli: ${proposal.rolesA.portieri} Portieri, ${proposal.rolesA.difensori} Difensori, ${proposal.rolesA.fasce} Fasce, ${proposal.rolesA.attaccanti} Attaccanti)
- Team Neri (MMR medio ${proposal.avgMmrB}): ${neriNomi}
  (Ruoli: ${proposal.rolesB.portieri} Portieri, ${proposal.rolesB.difensori} Difensori, ${proposal.rolesB.fasce} Fasce, ${proposal.rolesB.attaccanti} Attaccanti)
- Sinergie evidenziate: ${proposal.synergies.map((s) => s.description || `${s.player1Name} e ${s.player2Name} (${s.winRateTogether}%)`).join('; ') || 'Nessuna sinergia forte'}

Dacci la lavagna tattica del Mister!`;

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

    const systemPrompt = `Sei il Giudice Supremo del Calcetto Abbuffo, il commentatore imparziale e piccante delle grandi rivalità da baracca.
Hai uno stile frizzante, sportivo e da spogliatoio.
Scrivi un "Verdetto 1v1" (1-2 paragrafi brevi ed energici con emoji) che incorona chi comanda davvero tra i due, commenta la loro chimica quando giocano assieme e lancia una frecciatina sportiva a chi sta sotto nei numeri.`;

    const userPrompt = `Emetti il verdetto sul confronto 1v1 tra questi due rivali storici:
- Giocatore 1: ${pA.nome} (MMR ${pA.currentMmr} ${pA.tier.badge}, Peak ${pA.peakMmr}, Gol: ${pA.golTotali}, Media Voto: ${pA.mediaVoto > 0 ? pA.mediaVoto.toFixed(2) : '-'}, MVP: ${pA.mvpCount})
- Giocatore 2: ${pB.nome} (MMR ${pB.currentMmr} ${pB.tier.badge}, Peak ${pB.peakMmr}, Gol: ${pB.golTotali}, Media Voto: ${pB.mediaVoto > 0 ? pB.mediaVoto.toFixed(2) : '-'}, MVP: ${pB.mvpCount})
- Scontri Diretti da avversari (${scontri.totalePartite} match): ${pA.nome} ${scontri.vittorieA}V - ${scontri.pareggi}P - ${scontri.vittorieB}V ${pB.nome}. Verdetto Bestia Nera: "${scontri.bestiaNeraText}".
- Rendimento quando giocano insieme (${intesa.totalePartite} match): ${intesa.affinitaEmoji} "${intesa.affinitaLabel}" (${intesa.winRate}% vittorie).

Spara il verdetto definitivo con tanto di frecciatine e verdetto finale!`;

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

    const systemPrompt = `Sei il Capo Scout satirico del Calcetto Abbuffo, incaricato di redigere le schede segrete dei calciatori amatoriali.
Hai uno stile ironico, acuto, calcistico da spogliatoio e divertente.
Devi restituire ESCLUSIVAMENTE un formato strutturato in 2 righe così:
SOPRANNOME: [Un soprannome calcistico epico o comico per il giocatore, max 3-4 parole]
SCOUTING: [Un mini-scouting report brillante di 3-4 frasi sul suo modo di giocare, il suo punto di forza, la sua debolezza goliardica e un avvertimento agli avversari]`;

    const userPrompt = `Crea lo scouting report e soprannome per:
- Nome: ${giocatore.nome} (Soprannome attuale: "${giocatore.soprannome || 'Nessuno'}")
- Ruolo Preferito: ${giocatore.ruoloPreferito || 'Jolly'} | Piede: ${giocatore.piedePreferito || 'Destro'}
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
