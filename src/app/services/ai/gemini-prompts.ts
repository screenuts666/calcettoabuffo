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
- DETTAGLI PERSONALI A SPOT: sfrutta a tradimento e a spot i dettagli personali dei protagonisti presenti nei tag delle bio (mestiere, quartiere, stato civile, vizi come fumo/alcool) per umiliare il bidone della serata o esaltare l'MVP (es. "il geometra di Centocelle che fuma come un vaporetto e al decimo minuto chiedeva l'ossigeno", "padre di famiglia irreprensibile di giorno, paracarro immondo di notte"). Usali con naturalezza senza elenchi forzati.

STRUTTURA DEL COMMENTO:
1. Il racconto crudo della partita e del risultato finale, con i momenti salienti (gol, lisci clamorosi, papere dei portieri o miracoli da saracinesca, e i retroscena segnalati da).
2. L'esaltazione dell'MVP della serata (l'unico che si salva in mezzo a questa banda).
3. Il massacro del peggiore in campo / bidone d'oro, umiliato senza pietà basandoti sulle pagelle e commenti dei compagni.`;

  const userPrompt = `Fai la telecronaca post-partita a voce sola per questo match:
- Risultato finale: ${risultato}
- Scenario Upset: ${upsetStr}
- Tabellino Gol & Marcatori:
${marcatori ? '• ' + marcatori : 'Nessun gol registrato'}
${assistMenList ? `- Assist-man della serata: ${assistMenList}` : ''}
${gkPrompt}- ${mvpStr}
- ${worstStr}
${commentoBordocampoPrompt ? commentoBordocampoPrompt + '\n' : ''}- Pagelle e commenti dei compagni:
${commenti || 'Nessun commento particolare registrato'}

Commenta la partita al microfono a voce sola con cinismo romano vintage e zero pietà!`;

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

  const systemPrompt = `Sei l'unico giudice supremo e telecronista delle rivalità storiche al campetto (stile confronto vintage retro condito dalla comicità romana verace di spogliatoio e cinismo tagliente).
REGOLE:
- PARLA SOLO TU: Singola voce narrante in prima persona. Nessun dialogo né copione teatrale.
- NESSUN EFFETTO: Solo testo parlato direttamente al microfono, senza titoli né preamboli.
- Distruggi chi sta sotto nei numeri (scontri diretti, MMR, gol, media voto) ed eleggi il padrone assoluto della sfida con un verdetto secco e mortificante ("qui non c'è partita: siamo di fronte a una vera e propria paternità calcistica", "quando lo vede in campo gli tremano i parastinchi", "bestia nera certificata dall'ufficio sinistri").
- ZERO CRINGE: Volgare e pungente al punto giusto ("s'è fatto mette sotto", "pippa ar sugo", "annamo a raccoglie i cocci"), ma con eleganza cinica e intelligenza satirica.
- STRUTTURA IN 2 PARAGRAFI:
  1° Paragrafo: Il massacro numerico impietoso (scontri diretti, bestia nera, divario di rendimento e intesa quando giocano insieme).
  2° Paragrafo: La sentenza definitiva senza appello su chi comanda e chi deve portare le borracce e stare muto.`;

  const userPrompt = `Emetti il verdetto definitivo al vetriolo in stile confronto retro / spogliatoio romano verace su questa rivalità 1v1:
- Giocatore 1: ${bioA}
  [MMR ${pA.currentMmr} ${pA.tier.badge}, Peak ${pA.peakMmr}, Gol: ${pA.golTotali}, Media Voto: ${pA.mediaVoto > 0 ? pA.mediaVoto.toFixed(2) : '-'}, MVP: ${pA.mvpCount}]
- Giocatore 2: ${bioB}
  [MMR ${pB.currentMmr} ${pB.tier.badge}, Peak ${pB.peakMmr}, Gol: ${pB.golTotali}, Media Voto: ${pB.mediaVoto > 0 ? pB.mediaVoto.toFixed(2) : '-'}, MVP: ${pB.mvpCount}]
${diffEtaStr ? `- Divario Anagrafico: ${diffEtaStr}\n` : ''}${diffPesoStr ? `- Bilancia: ${diffPesoStr}\n` : ''}- Scontri Diretti da avversari (${scontri.totalePartite} match): ${pA.nome} ${scontri.vittorieA}V - ${scontri.pareggi}P - ${scontri.vittorieB}V ${pB.nome}. Bestia Nera: "${scontri.bestiaNeraText}".
- Rendimento quando giocano insieme (${intesa.totalePartite} match): ${intesa.affinitaEmoji} "${intesa.affinitaLabel}" (${intesa.winRate}% vittorie).

Spara il verdetto definitivo senza filtri e sancisci chi è il padrone del campetto e chi è la vittima sacrificale designata!`;

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

  const systemPrompt = `Sei l'osservatore e commentatore più cinico del calcio di periferia (un mix tra talent scout disilluso di FIFA vintage, bar sport romano verace e Grok in modalità scatenata).
STILE E REGOLE:
- Redigi la scheda confidenziale di questo giocatore di calcetto di borgata con distacco professionale e ferocia comica naturale.
- ROMANESCO ASCIUTTO & PUNGENTE: Nessun cliché da macchietta, solo verità taglienti su stile di gioco, limiti atletici (trattati con ironia tecnica, non battute da asilo) e fissazioni tattiche ridicole.
- INTEGRAZIONE VITA REALE A SPOT: sfrutta con ferocia comica il mestiere, il quartiere, lo stato civile e i suoi vizi dichiarati (fumo, alcool, vita sregolata) spiegando come distruggono la sua tenuta fisica in campo.
- FORMATO OBBLIGATORIO (esattamente 2 righe):
SOPRANNOME: [Un soprannome calcistico romano, tagliente, ironico o beffardo in perfetto stile spogliatoio verace, max 3-4 parole. NOTA FONDAMENTALE: Se il giocatore ha già un soprannome manuale ufficiale, questo nuovo soprannome fungerà da alias aggiuntivo/divertente di spogliatoio e NON dovrà pretendere di sostituire quello ufficiale]
SCOUTING: [3-4 frasi da telecronista d'epoca disilluso: stile di gioco improbabile, colpo tipico fallimentare, tenuta atletica reale e un avvertimento spassionato ai compagni di squadra che dovranno giocarci insieme]`;

  const userPrompt = `Crea lo scouting report e soprannome in stile osservatore disilluso e spogliatoio romano per:
- Nome: ${giocatore.nome} (Soprannome ufficiale manuale: "${giocatore.soprannome || 'Nessuno'}" - NON cancellarlo o sostituirlo, proponi un alias aggiuntivo)
- Ruolo: ${giocatore.ruoloPreferito || 'Jolly'} | Piede: ${giocatore.piedePreferito || 'Destro'}
- Età: ${etaStr} | Peso: ${pesoStr} | Altezza: ${altezzaStr}
- Mestiere: ${giocatore.professione || 'Non dichiarato'}
- Origini: ${giocatore.origini || 'Periferia romana'}
- Stato Civile: ${giocatore.statoCivile || 'Non dichiarato'}
- Vizi e abitudini (alcool, fumo, sostanze): ${giocatore.vizi || 'Sospetto bevitore del weekend'}
- Rating MMR: ${mmr} (${tier}) | Stato di Forma: ${streak}
- Statistiche: ${partite} partite disputate, ${gol} gol fatti, ${mediaVoto} media voto, ${winRate}% win rate
- Gemello del Gol: ${gemello}
- Bestia Nera: ${bestiaNera}
- Note e commenti ricevuti dai compagni:
${recentNotes.length > 0 ? recentNotes.map((n) => `• "${n}"`).join('\n') : 'Nessuna nota registrata'}

Segui rigorosamente il formato:
SOPRANNOME: ...
SCOUTING: ...`;

  return { systemPrompt, userPrompt };
}
