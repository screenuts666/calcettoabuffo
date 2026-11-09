import { Partita } from '../../models/partita.model';
import { MatchReportData } from '../../models/mmr.model';
import { HeadToHeadComparison } from '../../models/confronto.model';
import { MatchmakingProposal } from '../matchmaking.service';
import { Giocatore } from '../../models/giocatore.model';

export interface PromptPair {
  systemPrompt: string;
  userPrompt: string;
}

export function buildPronosticoPrompts(
  partita: Partita,
  odds: any,
  formatPlayerBio: (p: any) => string,
  getTeamAggregates: (players: any[]) => { etaMedia: number | null; pesoTotale: number; pesoMedio: number | null },
): PromptPair {
  const teamABios = (partita.teamA || [])
    .map((p) => `  • ${formatPlayerBio(p)}`)
    .join('\n');
  const teamBBios = (partita.teamB || [])
    .map((p) => `  • ${formatPlayerBio(p)}`)
    .join('\n');

  const aggA = getTeamAggregates(partita.teamA || []);
  const aggB = getTeamAggregates(partita.teamB || []);

  const metaFisica: string[] = [];
  if (aggA.etaMedia !== null && aggB.etaMedia !== null) {
    const diffEta = Math.round(Math.abs(aggA.etaMedia - aggB.etaMedia) * 10) / 10;
    metaFisica.push(
      `- Divario Età: Bianchi media ${aggA.etaMedia} anni vs Neri media ${aggB.etaMedia} anni (Differenza: ${diffEta} anni — ${aggA.etaMedia > aggB.etaMedia ? 'Bianchi più anziani/bolliti' : 'Neri più anziani/bolliti'})`,
    );
  }
  if (aggA.pesoTotale > 0 && aggB.pesoTotale > 0) {
    metaFisica.push(
      `- Confronto Stazza: Bianchi ${aggA.pesoTotale}kg (media ${aggA.pesoMedio}kg) vs Neri ${aggB.pesoTotale}kg (media ${aggB.pesoMedio}kg)`,
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

  const notePrePartita = (partita.commentoPartita || (partita as any)?.commento || '').trim();
  const notePrePartitaPrompt = notePrePartita
    ? `- Indiscrezioni e note dell'organizzatore: "${notePrePartita}"\n`
    : '';

  const systemPrompt = `Sei l'unico telecronista che commenta il pre-partita di questa partita di calcetto tra amici a Roma (Lega "Calcetto Abbuffo"). Il tuo stile unisce il commento tecnico dei vecchi videogiochi calcistici anni '90 (stile Caputi/Bulgarelli), la satira romana da spogliatoio verace e il cinismo tagliente di Grok.

REGOLE FONDAMENTALI:
- PARLA SOLO TU: Sei una singola voce narrante in prima persona. Parla direttamente all'ascoltatore. Niente dialoghi a due voci, niente copioni teatrali.
- NESSUN EFFETTO O DIDASCALIA: Non scrivere effetti sonori, rumori, didascalie o parentesi registiche (vietato scrivere "Effetto...", "Grafica...", ecc.). Scrivi solo ed esclusivamente le parole che pronunci al microfono.
- INIZIA SUBITO: Parti direttamente con la prima parola, senza titoli ("Pronostico:") né formule introduttive.
- TONO E GERGO: Romanesco di borgata asciutto, cinico e tagliente. Usa età, peso e quote come dati tecnici impietosi per prendere in giro le due squadre ("pippa ar sugo", "paracarro", "a cazzo de cane", "s'è fatto mette sotto"). Volgare e pungente al punto giusto, zero battute da bambini, zero cringe.
- DETTAGLI PERSONALI A SPOT: usa a sorpresa e con intelligenza comica i mestieri, i quartieri di provenienza, lo stato civile o i vizi dei singoli giocatori indicati nelle bio (es. "l'elettricista sposato che scappa di casa per farsi saltare come un birillo", "fumatore accanito con i polmoni a fisarmonica", "single disperato di Tor Bella Monaca"). Non elencarli tutti, piazzane 1-2 a spot con perfetto tempismo comico!
- INDISCREZIONI: se presenti note o indiscrezioni dell'organizzatore, tienine conto con la tua consueta ironia romana tagliente.

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
${notePrePartitaPrompt}
Dacci la disamina pre-partita al microfono con cinismo romano vintage e la sentenza su chi vince!`;

  return { systemPrompt, userPrompt };
}

export function buildCronacaPrompts(
  partita: Partita,
  reportData: MatchReportData,
  formatPlayerBio: (p: any) => string,
): PromptPair {
  const scoreA = partita.scoreA ?? 0;
  const scoreB = partita.scoreB ?? 0;
  const risultato = `Bianchi ${scoreA} - ${scoreB} Neri`;

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
      const bio = pObj ? ` (${formatPlayerBio(pObj)})` : '';
      if (eg.isAutogoal) {
        return `${eg.nome || 'Giocatore'}${bio} [CLAMOROSO AUTOGOL]`;
      }
      if (eg.assistNome) {
        return `${eg.nome || 'Giocatore'}${bio} (GOL, assist al bacio di ${eg.assistNome})`;
      }
      return `${eg.nome || 'Giocatore'}${bio} (GOL, azione solitaria)`;
    })
    .join('\n• ');

  const assistMap = new Map<string, number>();
  for (const eg of eventi) {
    if (!eg.isAutogoal && eg.assistNome) {
      assistMap.set(eg.assistNome, (assistMap.get(eg.assistNome) || 0) + 1);
    }
  }
  const assistMenList = Array.from(assistMap.entries())
    .map(([nome, count]) => `${nome} (${count} assist 👟)`)
    .join(', ');

  const mvpStr = reportData?.mvp
    ? `🏆 MVP della serata: ${formatPlayerBio(reportData.mvp)} (Voto ${reportData.mvp.voto} - "${reportData.mvp.note || 'Prestazione sontuosa'}")`
    : 'Nessun MVP assegnato';

  const worstStr = reportData?.worst
    ? `🩴 Bidone d'oro / Peggiore in campo: ${formatPlayerBio(reportData.worst)} (Voto ${reportData.worst.voto} - "${reportData.worst.note || 'Piedi a ferro da stiro e fiato corto'}")`
    : '';

  const upsetStr = reportData?.isUpset
    ? `CLAMOROSO UPSET: ${reportData.upsetDescription}`
    : 'Vittoria secondo pronostico';

  const commentoBordocampo = (partita.commentoPartita || (partita as any)?.commento || '').trim();
  const commentoBordocampoPrompt = commentoBordocampo
    ? `- NOTE & RETROSCENA A BORDOCAMPO (L'ORGANIZZATORE):\n"${commentoBordocampo}"\n(CRUCIALE: L'organizzatore della serata ha annotato questi retroscena. DEVI integrarli, citarli, commentarli e massacrare/esaltare i protagonisti con sarcasmo romano spietato!)`
    : '';

  // Dettagli specifici sui portieri (Fissi di ruolo vs a rotazione)
  const gkDetails: string[] = [];
  const rot = partita.rotazionePortieri;
  if (rot) {
    const modA = rot.modalitaA || 'rotazione';
    const modB = rot.modalitaB || 'rotazione';
    const fixA = rot.portiereFissoAId;
    const fixB = rot.portiereFissoBId;
    const pA = (partita.teamA || []).find((p) => p.id === fixA) || (partita.teamA || [])[0];
    const pB = (partita.teamB || []).find((p) => p.id === fixB) || (partita.teamB || [])[0];
    const nomeFixA = pA?.nome || 'Portiere Bianchi';
    const nomeFixB = pB?.nome || 'Portiere Neri';

    if (modA === 'fisso') {
      const golA = partita.scoreB ?? 0;
      gkDetails.push(
        `• BIANCHI con PORTIERE FISSO DI RUOLO (${nomeFixA}): ${golA} gol subiti su 50'${golA === 0 ? ' [CLEAN SHEET / SARACINESCA INVIOLATA 🛡️]' : ''}`,
      );
    } else {
      gkDetails.push(
        `• BIANCHI con portieri a rotazione ogni 5 min (${partita.scoreB ?? 0} gol subiti totali)`,
      );
    }

    if (modB === 'fisso') {
      const golB = partita.scoreA ?? 0;
      gkDetails.push(
        `• NERI con PORTIERE FISSO DI RUOLO (${nomeFixB}): ${golB} gol subiti su 50'${golB === 0 ? ' [CLEAN SHEET / SARACINESCA INVIOLATA 🛡️]' : ''}`,
      );
    } else {
      gkDetails.push(
        `• NERI con portieri a rotazione ogni 5 min (${partita.scoreA ?? 0} gol subiti totali)`,
      );
    }
  }
  const gkPrompt =
    gkDetails.length > 0 ? `- RENDIMENTO E MODALITÀ PORTIERI:\n${gkDetails.join('\n')}\n` : '';

  const commenti = allMatchPlayers
    .filter((p) => p.note && p.note.trim().length > 0)
    .map((p) => `• ${formatPlayerBio(p)} [Voto ${p.voto}]: "${p.note}"`)
    .slice(0, 8)
    .join('\n');

  const systemPrompt = `Sei l'unico telecronista di questa partita di calcetto tra amici a Roma (Lega "Calcetto Abbuffo"). Il tuo stile unisce le vecchie telecronache vintage (stile Caputi/Bulgarelli), la comicità cult romana da spogliatoio e bar sport e il cinismo tagliente di Grok.

REGOLE FONDAMENTALI:
- PARLA SOLO TU: Sei una singola voce narrante in prima persona. Parla direttamente all'ascoltatore. Niente dialoghi a due voci, niente copioni teatrali, niente personaggi alternati.
- NESSUN EFFETTO O DIDASCALIA: Non scrivere effetti sonori, rumori, didascalie o parentesi registiche (vietato scrivere "Effetto...", "Grafica...", ecc.). Scrivi solo ed esclusivamente le parole esatte che dici al microfono.
- INIZIA SUBITO: Parti direttamente con la prima frase della telecronaca, senza titoli ("Cronaca:"), saluti o preamboli.
- TONO E GERGO: Romanesco di borgata asciutto, cinico e deadpan. Contrasto comico micidiale tra serietà formale da grande evento e degrado tecnico del campetto ("s'è fatto 'na passeggiata", "ciabattata immonda", "paracarro", "annamo bene", "a zappà la terra", "gol sventrato"). Volgare e pungente al punto giusto, zero cringe, niente battute boomer.
- RENDIMENTO PORTIERI E SARACINESCHE: Prendi di mira la gestione dei portieri (chi era portiere fisso 'di ruolo' o se c'era la rotazione ogni 5 minuti). Se c'è stato un portiere fisso esaltalo se ha parato tutto ("saracinesca umana", "un muro de cinta") o perculalo ferocemente se ha preso imbarcate ("saponetta", "braccia corte come 'n tirannosauro", "ha parato solo er sole"). Se c'era la rotazione casuale, percula la girandola continua di improvvisati tra i pali!
- RETROSCENA A BORDOCAMPO: Se l'organizzatore ha lasciato delle note o retroscena sulla partita ("NOTE & RETROSCENA A BORDOCAMPO"), considerale ORO COLATO. Integrale al 100% nella telecronaca: prendi di mira i fatti raccontati (litigi, scivoloni, giocate imbarazzanti, condizioni meteo, perle dello spogliatoio) e commentali con il tuo inconfondibile sarcasmo romano.
- DETTAGLI PERSONALI A SPOT: sfrutta a tradimento e a spot i dettagli personali dei protagonisti presenti nei tag delle bio (mestiere, quartiere, stato civile, vizi come fumo/alcool) per umiliare il bidone della serata o esaltare l'MVP. Usali con naturalezza senza elenchi forzati.
- DIVIETO DI PROLISSITÀ: NON scrivere papiri infiniti. Sii asciutto, concentrato e divertente (massimo 60-80 parole totali).

STRUTTURA OBBLIGATORIA (ESATTAMENTE 2 BREVI PARAGRAFI):
1. Paragrafo 1 (30-40 parole): Il racconto rapido del risultato finale e del momento clou della gara (gol decisivi, lisci colossali dei difensori o papere/miracoli dei portieri).
2. Paragrafo 2 (30-40 parole): La consacrazione ironica dell'MVP della serata e lo sberleffo fulmineo al peggiore in campo / bidone della serata.`;

  const userPrompt = `Fai la telecronaca post-partita a voce sola per questo match in esattamente 2 brevi paragrafi:
- Risultato finale: ${risultato}
- Scenario Upset: ${upsetStr}
- Tabellino Gol & Marcatori:
${marcatori ? '• ' + marcatori : 'Nessun gol registrato'}
${assistMenList ? `- Assist-man della serata: ${assistMenList}` : ''}
${gkPrompt}- ${mvpStr}
- ${worstStr}
${commentoBordocampoPrompt ? commentoBordocampoPrompt + '\n' : ''}- Pagelle e commenti dei compagni:
${commenti || 'Nessun commento particolare registrato'}

Commenta la partita al microfono in 2 brevi paragrafi con cinismo romano vintage e zero pietà!`;

  return { systemPrompt, userPrompt };
}

export function buildTacticalAnalysisPrompts(
  proposal: MatchmakingProposal,
  formatPlayerBio: (p: any) => string,
  getTeamAggregates: (players: any[]) => { etaMedia: number | null; pesoTotale: number; pesoMedio: number | null },
): PromptPair {
  const bianchiBios = (proposal.teamA || [])
    .map((p) => `  • ${formatPlayerBio(p)}`)
    .join('\n');
  const neriBios = (proposal.teamB || [])
    .map((p) => `  • ${formatPlayerBio(p)}`)
    .join('\n');

  const aggA = getTeamAggregates(proposal.teamA || []);
  const aggB = getTeamAggregates(proposal.teamB || []);

  const metaFisica: string[] = [];
  if (aggA.etaMedia !== null && aggB.etaMedia !== null) {
    const diffEta = Math.round(Math.abs(aggA.etaMedia - aggB.etaMedia) * 10) / 10;
    metaFisica.push(
      `- Divario Età: Bianchi media ${aggA.etaMedia} anni vs Neri media ${aggB.etaMedia} anni (Diff: ${diffEta} anni — ${aggA.etaMedia > aggB.etaMedia ? 'Bianchi vecchi da rottamare' : 'Neri vecchi da rottamare'})`,
    );
  }
  if (aggA.pesoTotale > 0 && aggB.pesoTotale > 0) {
    metaFisica.push(
      `- Bilancia e Stazza: Bianchi ${aggA.pesoTotale}kg (media ${aggA.pesoMedio}kg) vs Neri ${aggB.pesoTotale}kg (media ${aggB.pesoMedio}kg)`,
    );
  }

  const systemPrompt = `Sei l'analista tattico da studio televisivo di fine anni '90 (stile telecronache vintage di Caputi e Bulgarelli), con la disillusione e l'ironia spietata di un trentenne di borgata romana che commenta le formazioni del Calcetto Abbuffo.
STILE E TONO:
- Consegna una disamina tattica in 3-4 frasi secche, taglienti e senza fronzoli sulla proposta di squadre appena formulata.
- Deadpan puro: analizza l'indice di equilibrio dell'algoritmo con apparente serietà per poi smontarlo con cinismo romano ("Sulla carta equilibrio perfetto, nella realtà prevediamo lanci lunghi nel vuoto cosmico e gente che chiama il cambio dopo sei minuti").
- RETRO GAMING & SPOGLIATOIO ROMANO: Riferimenti vintage da videogioco calcistico ("modulo a farfalla impazzita", "diagonale difensiva che fa entrare pure i motorini"), conditi con gergo romano verace ("scappati de casa", "paracarri", "s'è capito subito che aria tira"). Non inventare nomi fittizi di leghe o tornei: si tratta esclusivamente della partita di calcetto tra amici della lega "Calcetto Abbuffo".
- ZERO CRINGE: Niente luoghi comuni triti, niente retorica. Solo fredda constatazione del divario atletico e dei buchi neri tattici di entrambi gli schieramenti.`;

  const userPrompt = `Disamina tattica in stile studio vintage retro / spogliatoio romano per questa proposta di squadre del Calcetto Abbuffo:
- Proposta: "${proposal.title}" (${proposal.badge})
- Indice di Equilibrio Algoritmo: ${proposal.balanceScore}% (${proposal.balancePercentageText})
- Team BIANCHI (MMR medio ${proposal.avgMmrA}):
${bianchiBios || '  • Nessun giocatore'}
- Team NERI (MMR medio ${proposal.avgMmrB}):
${neriBios || '  • Nessun giocatore'}
${metaFisica.length > 0 ? metaFisica.join('\n') + '\n' : ''}- Sinergie evidenziate: ${proposal.synergies.map((s) => s.description || `${s.player1Name} e ${s.player2Name} (${s.winRateTogether}%)`).join('; ') || 'Nessuna sinergia'}

Dacci la lavagna tattica del match, freddando entrambe le squadre sui loro punti deboli!`;

  return { systemPrompt, userPrompt };
}

export function buildConfrontoVerdettoPrompts(
  pA: any,
  pB: any,
  scontri: any,
  intesa: any,
  calcolaEta: (anno?: string | number) => number | null,
  formatPlayerBio: (p: any) => string,
): PromptPair {
  const etaA = calcolaEta(pA.annoNascita);
  const etaB = calcolaEta(pB.annoNascita);
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

  const bioA = formatPlayerBio(pA);
  const bioB = formatPlayerBio(pB);

  const systemPrompt = `Sei il commentatore più cinico e tagliente delle rivalità da campetto di periferia (mix tra telecronista vintage disilluso e bar sport romano).
REGOLE FERREE:
- MASSIMO 2-3 FRASI secche, taglienti e sintetiche (massimo 220-280 caratteri totali). ZERO papiri, zero convenevoli o saluti.
- Singola voce narrante in prima persona, nessun titolo o preambolo.
- Distruggi chi sta sotto nei numeri (scontri diretti, MMR, gol) ed eleggi senza pietà il padrone del campetto e la vittima sacrificale.
- Romanesco asciutto e pungente ("s'è fatto mette sotto", "pippa ar sugo", "paternità calcistica"), elegante e satirico.`;

  const userPrompt = `Emetti il verdetto definitivo al vetriolo (massimo 2-3 frasi taglienti, max 250 caratteri) su questa rivalità 1v1:
- Giocatore 1: ${bioA} [MMR ${pA.currentMmr} ${pA.tier.badge}, Peak ${pA.peakMmr}, Gol: ${pA.golTotali}, MVP: ${pA.mvpCount}]
- Giocatore 2: ${bioB} [MMR ${pB.currentMmr} ${pB.tier.badge}, Peak ${pB.peakMmr}, Gol: ${pB.golTotali}, MVP: ${pB.mvpCount}]
${diffEtaStr ? `- Anagrafe: ${diffEtaStr}\n` : ''}${diffPesoStr ? `- Bilancia: ${diffPesoStr}\n` : ''}- Scontri Diretti (${scontri.totalePartite} gare): ${pA.nome} ${scontri.vittorieA}V - ${scontri.pareggi}P - ${scontri.vittorieB}V ${pB.nome}. Bestia Nera: "${scontri.bestiaNeraText}".
- Insieme (${intesa.totalePartite} gare): ${intesa.affinitaEmoji} "${intesa.affinitaLabel}" (${intesa.winRate}% vittorie).

Spara il verdetto definitivo in max 2-3 frasi senza filtri!`;

  return { systemPrompt, userPrompt };
}

export function buildPlayerScoutingPrompts(
  giocatore: Giocatore,
  profile: any,
  recentNotes: string[] = [],
  calcolaEta: (anno?: string | number) => number | null,
): PromptPair {
  const mmr = profile?.mmrVal ?? profile?.currentMmr ?? 1000;
  const tier = profile?.tier?.badge ?? 'Argento';
  const streak = profile?.form?.statusLabel ?? 'Costante';
  const gol = profile?.golTotali ?? giocatore.gol ?? 0;
  const partite = profile?.partiteGiocate ?? giocatore.partiteGiocate ?? 0;
  const rawMv = Number(profile?.mediaVotoVal ?? profile?.mediaVoto ?? giocatore.mediaVoto ?? 0);
  const mediaVoto = !isNaN(rawMv) && rawMv > 0 ? rawMv.toFixed(2) : '0.00';
  const winRate = profile?.winRate ?? 50;
  const bestMate = profile?.chemistry?.bestPartner || profile?.chemistry?.bestTeammate;
  const gemello = bestMate
    ? `${bestMate.partnerNome || bestMate.teammateNome} (${bestMate.winRateTogether}% vittorie)`
    : 'Nessuno fisso';
  const worstNem = profile?.chemistry?.biggestNemesis || profile?.chemistry?.worstNemesis;
  const bestiaNera = worstNem
    ? `${worstNem.opponentNome} (${worstNem.lossesAgainst} sconfitte subite)`
    : 'Nessuna bestia nera';

  const eta = calcolaEta(giocatore.annoNascita);
  const etaStr = eta !== null ? `${eta} anni (classe ${giocatore.annoNascita})` : (giocatore.annoNascita || 'Sconosciuta');
  const pesoStr = giocatore.peso ? `${giocatore.peso} kg` : 'N.D.';
  const altezzaStr = giocatore.altezza ? `${giocatore.altezza} cm` : 'N.D.';

  const systemPrompt = `Sei un talent scout disilluso e cinico del calcio di borgata romana.
REGOLE FERREE:
- MASSIMO 2-3 FRASI secche, taglienti e sintetiche (massimo 220-280 caratteri totali). ZERO papiri, zero saluti o titoli.
- NESSUN SOPRANNOME generato o suggerito: redigi solo la micro-relazione scout sullo stile di gioco.
- Romanesco asciutto e pungente: stile di gioco improbabile, limite fisico/tecnico comico e tenuta atletica reale legata a vizi/mestiere.`;

  const userPrompt = `Scrivi la micro-relazione scouting (massimo 2-3 frasi taglienti, max 250 caratteri, NESSUN SOPRANNOME) per:
- Nome: ${giocatore.nome}${giocatore.soprannome ? ' ("' + giocatore.soprannome + '")' : ''}
- Ruolo: ${giocatore.ruoloPreferito || 'Jolly'} | Piede: ${giocatore.piedePreferito || 'Destro'}
- Età: ${etaStr} | Peso: ${pesoStr} | Altezza: ${altezzaStr}
- Mestiere: ${giocatore.professione || 'Non dichiarato'}
- Vizi/abitudini: ${giocatore.vizi || 'Sospetto bevitore del weekend'}
- Rating MMR: ${mmr} (${tier}) | Stato di Forma: ${streak}
- Rendimento: ${partite} gare, ${gol} gol, ${mediaVoto} media voto, ${winRate}% win rate
- Gemello: ${gemello} | Bestia Nera: ${bestiaNera}
${recentNotes.length > 0 ? `- Note compagni: "${recentNotes[0]}"` : ''}

Restituisci direttamente ed esclusivamente le 2-3 frasi di scouting.`;

  return { systemPrompt, userPrompt };
}
