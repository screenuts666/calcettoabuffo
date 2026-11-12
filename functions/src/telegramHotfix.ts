import { onRequest } from 'firebase-functions/v2/https';
import { CONFIG } from './config';
import { sendMessage, sendChatAction, downloadFile, escapeHtml } from './telegramService';
import { executeInCloudHotfix } from './builderService';
import { mergeHotfixPr, discardHotfix, listOpenHotfixPrs } from './githubService';

// Set per deduplicare update webhook in caso di retry Telegram
const processedUpdates = new Set<number>();
let isHotfixRunning = false;

export const telegramHotfix = onRequest(
  {
    region: 'europe-west1',
    memory: '4GiB',
    cpu: 2,
    timeoutSeconds: 540,
    concurrency: 1,
    cors: false,
  },
  async (req, res) => {
    // Rispondi a richieste non POST
    if (req.method !== 'POST') {
      res.status(200).send('Telegram Hotfix Webhook attivo e funzionante su Firebase Cloud Functions v2!');
      return;
    }

    const update = req.body;
    if (!update || typeof update !== 'object') {
      res.status(400).send('Bad Request');
      return;
    }

    // Deduplica update_id
    if (update.update_id) {
      if (processedUpdates.has(update.update_id)) {
        res.status(200).send({ ok: true, deduplicated: true });
        return;
      }
      processedUpdates.add(update.update_id);
      // Mantieni solo gli ultimi 1000 ID
      if (processedUpdates.size > 1000) {
        const first = processedUpdates.values().next().value;
        if (first !== undefined) processedUpdates.delete(first);
      }
    }

    const message = update.message;
    const callbackQuery = update.callback_query;

    try {
      // ─── GESTIONE CALLBACK QUERY (Pulsanti Inline) ──────────────────────────
      if (callbackQuery) {
        const cbChatId = callbackQuery.message?.chat?.id;
        const cbData = callbackQuery.data || '';

        if (String(cbChatId) !== String(CONFIG.allowedChatId)) {
          res.status(200).send({ ok: true });
          return;
        }

        if (cbData.startsWith('merge:')) {
          const branch = cbData.replace('merge:', '');
          await sendMessage(cbChatId, `🔄 Esecuzione merge su main per <code>${escapeHtml(branch)}</code>...`);
          try {
            await mergeHotfixPr(branch);
            await sendMessage(cbChatId, `✅ <b>Branch ${escapeHtml(branch)} unito con successo su main di PROD!</b>`);
          } catch (err: any) {
            await sendMessage(cbChatId, `❌ Errore merge: ${escapeHtml(err.message)}`);
          }
        } else if (cbData.startsWith('discard:')) {
          const branch = cbData.replace('discard:', '');
          await sendMessage(cbChatId, `🗑 Chiusura e scarto per <code>${escapeHtml(branch)}</code>...`);
          try {
            await discardHotfix(branch);
            await sendMessage(cbChatId, `🗑 <b>Branch ${escapeHtml(branch)} scartato ed eliminato!</b>`);
          } catch (err: any) {
            await sendMessage(cbChatId, `❌ Errore scarto: ${escapeHtml(err.message)}`);
          }
        }

        res.status(200).send({ ok: true });
        return;
      }

      if (!message) {
        res.status(200).send({ ok: true });
        return;
      }

      const chatId = message.chat?.id;
      const text = (message.text || message.caption || '').trim();

      // ─── COMANDO /myid ──────────────────────────────────────────────────────
      if (text.startsWith('/myid')) {
        await sendMessage(
          chatId,
          `🆔 <b>Il tuo Telegram Chat ID:</b> <code>${chatId}</code>\n<b>ID Autorizzato:</b> <code>${CONFIG.allowedChatId}</code>`
        );
        res.status(200).send({ ok: true });
        return;
      }

      // ─── VERIFICA SICUREZZA ─────────────────────────────────────────────────
      if (CONFIG.allowedChatId && String(chatId) !== String(CONFIG.allowedChatId)) {
        await sendMessage(
          chatId,
          '⛔ <b>Accesso Negato</b>\nQuesto bot è collegato a Firebase Cloud Functions per Calcetto Abbuffo ed è privato.'
        );
        res.status(200).send({ ok: true });
        return;
      }

      // ─── COMANDI RAPIDI ─────────────────────────────────────────────────────
      if (text === '/start') {
        const welcome =
          `🔥 <b>Calcetto Abbuffo - Remote Hotfix Bot (Firebase Cloud Functions v2)</b>\n\n` +
          `Sono attivo al 100% su Firebase in Cloud (zero dipendenza dal tuo PC locale) con <b>Gemini 3.8 Flash (High Thinking)</b>!\n\n` +
          `<b>Come interagire dal campo:</b>\n` +
          `• 📝 Scrivi qualsiasi problema o usa <code>/fix &lt;testo&gt;</code>\n` +
          `• 📸 Invia uno screenshot con o senza testo\n` +
          `• 🎙 Registra un messaggio vocale in italiano\n\n` +
          `<b>Comandi gestione:</b>\n` +
          `• <code>/status</code> - Mostra hotfix e PR aperte su GitHub\n` +
          `• <code>/merge</code> - Mergia l'ultimo hotfix su main di PROD\n` +
          `• <code>/discard</code> - Chiude e cancella il branch di hotfix\n` +
          `• <code>/help</code> - Mostra questa guida`;
        await sendMessage(chatId, welcome);
        res.status(200).send({ ok: true });
        return;
      }

      if (text === '/help') {
        await sendMessage(
          chatId,
          `📖 <b>Guida In-Cloud Hotfixing:</b>\n\n` +
            `Ogni volta che invii un problema, uno screenshot o un vocale, la Cloud Function esegue:\n` +
            `1. Download del codice sorgente da GitHub in <code>/tmp/workspace</code>\n` +
            `2. Patch con Gemini 3.8 Flash in modalità High Thinking\n` +
            `3. Aggiornamento Release Notes e versione\n` +
            `4. Build Angular con Self-Healing fino a 3 tentativi\n` +
            `5. Push branch hotfix su GitHub, PR e Deploy su Firebase Hosting (DEV e PROD)!`
        );
        res.status(200).send({ ok: true });
        return;
      }

      if (text === '/status') {
        const openPrs = await listOpenHotfixPrs();
        let statusMsg = `📊 <b>Stato Hotfix in Cloud (Firebase v2)</b>\n\n`;
        statusMsg += `🧠 <b>AI Engine:</b> <code>${CONFIG.geminiModel}</code> (Thinking: <code>${CONFIG.geminiThinkingLevel}</code>)\n`;
        statusMsg += `🌐 <b>URL PROD:</b> <a href="${CONFIG.urlProd}">${CONFIG.urlProd}</a>\n`;
        statusMsg += `🧪 <b>URL DEV:</b> <a href="${CONFIG.urlDev}">${CONFIG.urlDev}</a>\n\n`;

        if (openPrs.length > 0) {
          statusMsg += `🌿 <b>Hotfix Aperti (${openPrs.length}):</b>\n`;
          for (const pr of openPrs) {
            statusMsg += `• <b>#${pr.number}:</b> ${escapeHtml(pr.title)} (<code>${escapeHtml(pr.headRefName)}</code>)\n`;
            if (pr.url) statusMsg += `  <a href="${pr.url}">Vedi PR su GitHub</a>\n`;
          }
          statusMsg += `\nUsa <code>/merge</code> per unire su main o <code>/discard</code> per cancellare.`;
        } else {
          statusMsg += `✅ <b>Nessun hotfix pendente.</b> Tutto allineato su <code>main</code>.`;
        }

        await sendMessage(chatId, statusMsg);
        res.status(200).send({ ok: true });
        return;
      }

      if (text.startsWith('/merge')) {
        const parts = text.split(/\s+/);
        const target = parts[1];
        await sendChatAction(chatId, 'typing');
        await sendMessage(chatId, '🔄 <b>Esecuzione merge su main di PROD in corso...</b>');
        try {
          await mergeHotfixPr(target);
          await sendMessage(chatId, '✅ <b>Merge completato con successo su main di PROD!</b>');
        } catch (err: any) {
          await sendMessage(chatId, `❌ Errore merge: ${escapeHtml(err.message)}`);
        }
        res.status(200).send({ ok: true });
        return;
      }

      if (text.startsWith('/discard')) {
        const parts = text.split(/\s+/);
        const target = parts[1];
        await sendChatAction(chatId, 'typing');
        await sendMessage(chatId, '🗑 <b>Chiusura PR e rimozione branch hotfix...</b>');
        try {
          await discardHotfix(target);
          await sendMessage(chatId, '🗑 <b>Hotfix scartato ed eliminato con successo!</b>');
        } catch (err: any) {
          await sendMessage(chatId, `❌ Errore scarto: ${escapeHtml(err.message)}`);
        }
        res.status(200).send({ ok: true });
        return;
      }

      // ─── GESTIONE HOTFIX MULTIMODALE (TESTO, FOTO, VOCALE) ───────────────────
      let imageBuffer: Buffer | null = null;
      let audioBuffer: Buffer | null = null;
      let promptText = text;

      if (Array.isArray(message.photo) && message.photo.length > 0) {
        const bestPhoto = message.photo[message.photo.length - 1];
        const fileData = await downloadFile(bestPhoto.file_id);
        imageBuffer = fileData.buffer;
      }

      if (message.voice) {
        const fileData = await downloadFile(message.voice.file_id);
        audioBuffer = fileData.buffer;
        if (!promptText) promptText = 'Messaggio vocale dal campo da gioco';
      }

      if (promptText.startsWith('/fix')) {
        promptText = promptText.replace(/^\/fix\s*/, '').trim();
      }

      if (!promptText && !imageBuffer && !audioBuffer) {
        await sendMessage(
          chatId,
          '❓ Non ho capito la richiesta. Scrivi una descrizione, invia uno screenshot o manda un messaggio vocale!'
        );
        res.status(200).send({ ok: true });
        return;
      }

      // ─── BLOCCO ANTI-CONCORRENZA: UN SOLO HOTFIX ALLA VOLTA ─────────────────
      if (isHotfixRunning) {
        await sendMessage(
          chatId,
          '⏳ <b>Hotfix già in corso!</b>\nC\'è già una compilazione e deploy attivo in Cloud. Attendi il completamento prima di inviare una nuova richiesta.'
        );
        res.status(200).send({ ok: true, busy: true });
        return;
      }

      isHotfixRunning = true;

      // Risposta iniziale live su Telegram (il message_id verrà aggiornato con editMessageText ad ogni step)
      const initMsg = await sendMessage(
        chatId,
        '⚡ <b>Ricevuto! Inizializzo workspace...</b>'
      );

      // Risposta HTTP 200 IMMEDIATA a Telegram (evita qualsiasi timeout o loop di chiamate retry)
      res.status(200).send({ ok: true, status: 'processing' });

      // Esecuzione in background con CPU dedicata (--no-cpu-throttling & 4GiB / 2 vCPU)
      executeInCloudHotfix({
        userText: promptText,
        imageBuffer,
        audioBuffer,
        chatId,
        progressMessageId: initMsg?.message_id,
      })
        .catch((err) => {
          console.error('[telegramHotfix] Errore esecuzione background hotfix:', err);
        })
        .finally(() => {
          isHotfixRunning = false;
        });
    } catch (err: any) {
      console.error('[telegramHotfix] Errore unhandled:', err);
      if (!res.headersSent) {
        res.status(200).send({ ok: false, error: err.message });
      }
    }
  }
);

