import fs from 'node:fs';
import path from 'node:path';
import { CONFIG, updateEnvKey } from './config.mjs';
import {
  getUpdates,
  sendMessage,
  sendChatAction,
  downloadFile,
  registerCommands,
  escapeHtml,
} from './telegram.mjs';
import { executeHotfixPipeline } from './pipeline.mjs';
import {
  mergeHotfixPr,
  discardHotfix,
  listOpenHotfixPrs,
} from './code-modifier.mjs';
import { checkMorningPendingHotfixes } from './morning-check.mjs';

let isRunning = true;
let isPipelineBusy = false;
let lastUpdateId = 0;
let lastMorningCheckDate = '';

/**
 * Gestione sicurezza: autorizzazione dell'utente
 */
function isAuthorized(chatId) {
  if (!CONFIG.allowedChatId) {
    return true; // Al primo avvio prima che l'ID sia configurato
  }
  return String(chatId) === String(CONFIG.allowedChatId);
}

/**
 * Elabora un singolo messaggio in arrivo da Telegram
 */
async function handleMessage(message) {
  const chatId = message.chat?.id;
  if (!chatId) return;

  const text = (message.text || message.caption || '').trim();
  const userId = message.from?.id;
  const username = message.from?.username || message.from?.first_name || 'Mister';

  // ─── COMANDO /myid (accessibile sempre per recuperare il proprio chat ID) ───
  if (text.startsWith('/myid')) {
    if (!CONFIG.allowedChatId) {
      updateEnvKey('TELEGRAM_ALLOWED_CHAT_ID', String(chatId));
      await sendMessage(
        chatId,
        `🎉 <b>Chat ID Rilevato e Memorizzato!</b>\n\nIl tuo ID: <code>${chatId}</code>\n\nIl file <code>.env</code> è stato aggiornato automaticamente. Ora questo bot risponderà esclusivamente ai tuoi comandi!`,
      );
      return;
    }
    await sendMessage(
      chatId,
      `🆔 <b>Il tuo Telegram Chat ID:</b> <code>${chatId}</code>\n<b>ID Autorizzato:</b> <code>${CONFIG.allowedChatId}</code>`,
    );
    return;
  }

  // Verifica autorizzazione
  if (!isAuthorized(chatId)) {
    console.warn(`[Security] Tentativo di accesso non autorizzato da Chat ID ${chatId} (@${username})`);
    await sendMessage(
      chatId,
      '⛔ <b>Accesso Negato</b>\nQuesto bot è privato ed è collegato in modalità Hotfix al progetto <b>Calcetto Abbuffo</b>.\n\nSe sei il proprietario, invia <code>/myid</code> per verificare il tuo Chat ID.',
    );
    return;
  }

  // ─── COMANDO /start ───────────────────────────────────────────────────────
  if (text === '/start') {
    const welcome = `⚽ <b>Calcetto Abbuffo - Remote Hotfix Agent</b>\n\n` +
      `Ciao <b>${escapeHtml(username)}</b>! Sono il tuo assistente di hotfixing remoto collegato a Antigravity.\n\n` +
      `<b>Cosa puoi fare direttamente dal campo:</b>\n` +
      `• 📝 <b>Testo:</b> scrivi il problema o usa <code>/fix &lt;descrizione&gt;</code>\n` +
      `• 📸 <b>Screenshot:</b> invia una foto dal telefono con o senza commento\n` +
      `• 🎙 <b>Vocale:</b> mandami un messaggio vocale parlando in italiano\n\n` +
      `<b>Comandi disponibili:</b>\n` +
      `• <code>/status</code> - Verifica versione attuale e PR aperte\n` +
      `• <code>/merge</code> - Mergia l'ultimo hotfix su main di PROD\n` +
      `• <code>/discard</code> - Annulla e cancella il branch di hotfix\n` +
      `• <code>/help</code> - Mostra la guida completa\n\n` +
      `<i>Tutto il ciclo (Fix -> Release Notes -> Build verde -> Deploy DEV & PROD) viene eseguito in autonomia!</i>`;
    await sendMessage(chatId, welcome);
    return;
  }

  // ─── COMANDO /help ────────────────────────────────────────────────────────
  if (text === '/help') {
    const helpText = `📖 <b>Guida all'uso di @CalcettoHotfixBot</b>\n\n` +
      `<b>1. Inviare un Hotfix:</b>\n` +
      `- Invia un messaggio di testo con la descrizione del problema (es. <i>"Il pulsante Fischio d'inizio è troppo piccolo su mobile"</i>).\n` +
      `- Oppure invia uno screenshot dal telefono.\n` +
      `- Oppure invia un messaggio vocale dal campo: ascolterò l'audio e applicherò la patch sul codice.\n\n` +
      `<b>2. Pipeline Automatica:</b>\n` +
      `L'agente scansiona <code>src/</code>, corregge il codice, compila con <code>npm run build</code> (con self-healing fino a 3 tentativi se ci sono errori TypeScript), incrementa la versione, compila le Release Notes e fa il deploy su DEV e PROD.\n\n` +
      `<b>3. Comandi Gestione:</b>\n` +
      `• <code>/status</code> - Mostra lo stato attuale del progetto\n` +
      `• <code>/merge</code> - Esegue il merge della PR di hotfix su main\n` +
      `• <code>/discard</code> - Chiude la PR e cancella il branch\n` +
      `• <code>/myid</code> - Mostra il tuo ID Telegram`;
    await sendMessage(chatId, helpText);
    return;
  }

  // ─── COMANDO /status ──────────────────────────────────────────────────────
  if (text === '/status') {
    try {
      const pkgPath = path.join(CONFIG.rootDir, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const openPrs = listOpenHotfixPrs();

      let statusMsg = `📊 <b>Stato Progetto Calcetto Abbuffo</b>\n\n`;
      statusMsg += `🔖 <b>Versione Corrente:</b> <code>v${pkg.version}</code>\n`;
      statusMsg += `🧠 <b>AI Engine:</b> <code>${CONFIG.geminiModel}</code> (Thinking: <code>${CONFIG.geminiThinkingLevel}</code>)\n`;
      statusMsg += `🌐 <b>URL PROD:</b> <a href="${CONFIG.urlProd}">${CONFIG.urlProd}</a>\n`;
      statusMsg += `🧪 <b>URL DEV:</b> <a href="${CONFIG.urlDev}">${CONFIG.urlDev}</a>\n\n`;

      if (openPrs.length > 0) {
        statusMsg += `🌿 <b>Hotfix Aperti (${openPrs.length}):</b>\n`;
        for (const pr of openPrs) {
          statusMsg += `• <b>#${pr.number}:</b> ${escapeHtml(pr.title)} (<code>${escapeHtml(pr.headRefName)}</code>)\n`;
          if (pr.url) statusMsg += `  <a href="${pr.url}">Vedi PR su GitHub</a>\n`;
        }
        statusMsg += `\nUsa <code>/merge</code> per mergiare su main o <code>/discard</code> per annullare.`;
      } else {
        statusMsg += `✅ <b>Nessun hotfix pendente.</b> Tutto allineato su <code>main</code>.`;
      }

      await sendMessage(chatId, statusMsg);
    } catch (err) {
      await sendMessage(chatId, `Errore recupero status: ${escapeHtml(err.message)}`);
    }
    return;
  }

  // ─── COMANDO /merge ───────────────────────────────────────────────────────
  if (text.startsWith('/merge')) {
    const parts = text.split(/\s+/);
    const targetPr = parts[1] || null;
    await sendChatAction(chatId, 'typing');
    try {
      await sendMessage(chatId, '🔄 <b>Esecuzione merge su main in corso...</b>');
      mergeHotfixPr(targetPr);
      await sendMessage(
        chatId,
        '✅ <b>Merge completato con successo!</b>\nIl branch hotfix è stato unito su <code>main</code> e riallineato sul repository.',
      );
    } catch (err) {
      await sendMessage(chatId, `❌ Errore durante il merge: ${escapeHtml(err.message)}`);
    }
    return;
  }

  // ─── COMANDO /discard ─────────────────────────────────────────────────────
  if (text.startsWith('/discard')) {
    const parts = text.split(/\s+/);
    const targetBranch = parts[1] || null;
    await sendChatAction(chatId, 'typing');
    try {
      await sendMessage(chatId, '🗑 <b>Chiusura PR e rimozione branch hotfix...</b>');
      discardHotfix(targetBranch);
      await sendMessage(
        chatId,
        '🗑 <b>Hotfix scartato!</b>\nIl branch è stato eliminato e il repository locale è tornato su <code>main</code> pulito.',
      );
    } catch (err) {
      await sendMessage(chatId, `❌ Errore durante lo scarto dell'hotfix: ${escapeHtml(err.message)}`);
    }
    return;
  }

  // Se la pipeline è già impegnata
  if (isPipelineBusy) {
    await sendMessage(
      chatId,
      '⏳ <b>Agente Occupato:</b> c\'è già un hotfix in compilazione/deploy. Attendi il completamento prima di inviarne un altro.',
    );
    return;
  }

  // ─── INPUT MULTIMODALE ────────────────────────────────────────────────────
  let imageBuffer = null;
  let audioBuffer = null;
  let promptText = text;

  // 1. Screenshot / Foto
  if (Array.isArray(message.photo) && message.photo.length > 0) {
    const bestPhoto = message.photo[message.photo.length - 1];
    await sendChatAction(chatId, 'upload_document');
    await sendMessage(chatId, '📥 <b>Screenshot ricevuto. Download e analisi immagine in corso...</b>');
    try {
      const fileData = await downloadFile(bestPhoto.file_id);
      imageBuffer = fileData.buffer;
    } catch (err) {
      await sendMessage(chatId, `❌ Impossibile scaricare l'immagine: ${err.message}`);
      return;
    }
  }

  // 2. Messaggio Vocale (.ogg Opus)
  if (message.voice) {
    await sendChatAction(chatId, 'record_voice');
    await sendMessage(chatId, '🎙 <b>Messaggio vocale ricevuto. Download e trascrizione audio in corso...</b>');
    try {
      const fileData = await downloadFile(message.voice.file_id);
      audioBuffer = fileData.buffer;
      if (!promptText) promptText = 'Messaggio vocale dal campo da gioco';
    } catch (err) {
      await sendMessage(chatId, `❌ Impossibile scaricare il file vocale: ${err.message}`);
      return;
    }
  }

  // Pulisci eventuale prefisso /fix
  if (promptText.startsWith('/fix')) {
    promptText = promptText.replace(/^\/fix\s*/, '').trim();
  }

  // Se non c'è né testo, né immagine, né vocale
  if (!promptText && !imageBuffer && !audioBuffer) {
    await sendMessage(
      chatId,
      '❓ Non ho capito la richiesta. Scrivi una descrizione del problema, invia uno screenshot o registra un vocale!',
    );
    return;
  }

  // Verifica presenza GEMINI_API_KEY prima di avviare
  if (!CONFIG.geminiApiKey) {
    await sendMessage(
      chatId,
      '⚠️ <b>GEMINI_API_KEY non configurata!</b>\n\nInserisci la tua chiave gratuita di Google Gemini in <code>tools/telegram-hotfix-agent/.env</code>:\n<code>GEMINI_API_KEY=tuo_token_qui</code>\n\nPuoi ottenerla in 30 secondi su https://aistudio.google.com.',
    );
    return;
  }

  // Avvia la pipeline
  isPipelineBusy = true;
  try {
    await executeHotfixPipeline({
      userText: promptText,
      imageBuffer,
      audioBuffer,
      chatId,
    });
  } catch (err) {
    console.error('[Agent] Errore pipeline:', err);
  } finally {
    isPipelineBusy = false;
  }
}

/**
 * Gestione callback da inline keyboard
 */
async function handleCallbackQuery(cbQuery) {
  const chatId = cbQuery.message?.chat?.id;
  const data = cbQuery.data || '';

  if (!isAuthorized(chatId)) return;

  if (data.startsWith('merge:')) {
    const branch = data.replace('merge:', '');
    await sendMessage(chatId, `🔄 Esecuzione merge per <code>${escapeHtml(branch)}</code>...`);
    try {
      mergeHotfixPr(branch);
      await sendMessage(chatId, `✅ <b>Branch ${escapeHtml(branch)} unito con successo su main!</b>`);
    } catch (err) {
      await sendMessage(chatId, `❌ Errore merge: ${escapeHtml(err.message)}`);
    }
  } else if (data.startsWith('discard:')) {
    const branch = data.replace('discard:', '');
    await sendMessage(chatId, `🗑 Chiusura e scarto per <code>${escapeHtml(branch)}</code>...`);
    try {
      discardHotfix(branch);
      await sendMessage(chatId, `🗑 <b>Branch ${escapeHtml(branch)} scartato ed eliminato!</b>`);
    } catch (err) {
      await sendMessage(chatId, `❌ Errore scarto: ${escapeHtml(err.message)}`);
    }
  }
}

/**
 * Controllo orario per il promemoria mattutino (TASK 4: Ore 08:30 Europe/Rome)
 */
async function checkMorningScheduler() {
  const now = new Date();
  const timeFormatter = new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    hour: '2-digit',
    minute: '2-digit',
  });
  const dateFormatter = new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const currentTime = timeFormatter.format(now);
  const currentDate = dateFormatter.format(now);

  const targetTime = CONFIG.morningCheckTime || '08:30';

  if (currentTime === targetTime && lastMorningCheckDate !== currentDate) {
    lastMorningCheckDate = currentDate;
    console.log(`[Scheduler] Ore ${targetTime} Europe/Rome: avvio controllo promemoria mattutino...`);
    try {
      await checkMorningPendingHotfixes();
    } catch (err) {
      console.error('[Scheduler] Errore esecuzione morning check:', err);
    }
  }
}

/**
 * Loop principale di polling
 */
async function pollUpdates() {
  await registerCommands();
  console.log(`\n======================================================`);
  console.log(`🤖 Calcetto Abbuffo Remote Hotfix Agent avviato!`);
  console.log(`Bot: @CalcettoHotfixBot`);
  console.log(`AI Engine: ${CONFIG.geminiModel} (Thinking: ${CONFIG.geminiThinkingLevel})`);
  console.log(`Allowed Chat ID: ${CONFIG.allowedChatId || 'In attesa di primo /myid'}`);
  console.log(`Repository: ${CONFIG.githubRepo}`);
  console.log(`Morning Check: ore ${CONFIG.morningCheckTime} (Europe/Rome)`);
  console.log(`======================================================\n`);

  // Timer per il controllo schedulato ogni 30 secondi
  setInterval(() => {
    checkMorningScheduler().catch(() => {});
  }, 30000);

  while (isRunning) {
    try {
      const updates = await getUpdates(lastUpdateId + 1, 25);
      if (Array.isArray(updates) && updates.length > 0) {
        for (const update of updates) {
          lastUpdateId = Math.max(lastUpdateId, update.update_id);
          if (update.message) {
            await handleMessage(update.message);
          } else if (update.callback_query) {
            await handleCallbackQuery(update.callback_query);
          }
        }
      }
    } catch (err) {
      console.warn('[Polling] Errore connessione o timeout Telegram:', err.message);
      // Pausa prima di riprovare in caso di disconnessione di rete
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
}

// Avvio processo
pollUpdates().catch((err) => {
  console.error('[Fatal] Errore fatale avvio agenzia:', err);
  process.exit(1);
});
