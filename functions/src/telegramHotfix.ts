import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { CONFIG } from './config';
import {
  sendMessage,
  editMessageText,
  answerCallbackQuery,
  sendChatAction,
  downloadFile,
  escapeHtml,
} from './telegramService';
import {
  mergeHotfixPr,
  discardHotfix,
  listOpenHotfixPrs,
  dispatchHotfixWorkflow,
} from './githubService';
import {
  savePendingHotfix,
  getPendingHotfix,
  deletePendingHotfix,
} from './pendingHotfixService';
import { callGemini } from './geminiEngine';

// Set per deduplicare update webhook in caso di retry Telegram
const processedUpdates = new Set<number>();
let isHotfixRunning = false;

/**
 * Funzione bridge ("Passa-Carte"):
 * Scarica eventuali file, trascrive vocali con Gemini Flash in 1s,
 * e inoltra il task a GitHub Actions (Cloud Runner a PC Spento).
 */
async function dispatchToCloudRunner({
  promptText,
  photoFileId,
  voiceFileId,
  chatId,
  progressMessageId,
  deployTarget,
}: {
  promptText: string;
  photoFileId: string | null;
  voiceFileId: string | null;
  chatId: number;
  progressMessageId?: number;
  deployTarget: 'dev' | 'both';
}): Promise<void> {
  const taskId = `hotfix-${Date.now().toString().slice(-6)}`;
  let finalPrompt = promptText || '';
  let imageUrl: string | null = null;

  let imgBuf: Buffer | null = null;
  let audBuf: Buffer | null = null;

  if (photoFileId) {
    try {
      const fileData = await downloadFile(photoFileId);
      imgBuf = fileData.buffer;
    } catch (err: any) {
      console.warn('[telegramHotfix] Errore download foto:', err.message);
    }
  }

  if (voiceFileId) {
    try {
      const fileData = await downloadFile(voiceFileId);
      audBuf = fileData.buffer;
    } catch (err: any) {
      console.warn('[telegramHotfix] Errore download audio:', err.message);
    }
  }

  // 1. Trascrizione vocale ultra-rapida con Gemini (1s)
  if (audBuf) {
    try {
      if (progressMessageId) {
        await editMessageText(
          chatId,
          progressMessageId,
          '🎙 <i>Trascrizione messaggio vocale con Gemini in corso...</i>'
        );
      }
      const transcription = await callGemini({
        parts: [
          {
            inlineData: {
              mimeType: 'audio/ogg',
              data: audBuf.toString('base64'),
            },
          },
          {
            text: 'Trascrivi fedelmente e in italiano questo messaggio vocale di richiesta bugfix/modifica dal campo di calcetto:',
          },
        ],
      });
      finalPrompt = `${finalPrompt}\n\n[Trascrizione vocale]:\n${transcription}`.trim();
    } catch (err: any) {
      console.warn('[telegramHotfix] Errore trascrizione vocale:', err.message);
      finalPrompt = `${finalPrompt}\n[Nota: Audio vocale allegato non trascritto]`.trim();
    }
  }

  // 2. Gestione Screenshot: salvataggio su Firebase Storage o analisi visiva
  if (imgBuf) {
    try {
      const bucket = admin.storage().bucket();
      const file = bucket.file(`hotfix-screenshots/${taskId}.jpg`);
      await file.save(imgBuf, { contentType: 'image/jpeg' });
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 1000 * 60 * 60 * 2, // Valido 2 ore
      });
      imageUrl = signedUrl;
    } catch (storageErr: any) {
      console.warn(
        '[telegramHotfix] Storage bucket non disponibile per immagine, uso analisi inline:',
        storageErr.message
      );
      try {
        const visualDesc = await callGemini({
          parts: [
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: imgBuf.toString('base64'),
              },
            },
            {
              text: "Analizza questo screenshot dell'app di calcetto. Descrivi componenti visibili, errori e bottoni:",
            },
          ],
        });
        finalPrompt = `${finalPrompt}\n\n[Dettagli visivi screenshot]:\n${visualDesc}`.trim();
      } catch (gemErr: any) {
        console.warn('[telegramHotfix] Analisi screenshot fallita:', gemErr.message);
      }
    }
  }

  // 3. Dispatch verso GitHub Actions
  if (progressMessageId) {
    await editMessageText(
      chatId,
      progressMessageId,
      '🚀 <i>Inoltro del task al Cloud Runner di GitHub Actions...</i>'
    );
  }

  await dispatchHotfixWorkflow({
    taskId,
    prompt: finalPrompt,
    chatId,
    progressMessageId,
    deployTarget,
    imageUrl,
  });

  const targetLabel = deployTarget === 'both' ? 'DEV e PROD' : 'Solo DEV';
  const confirmationMsg =
    `⚡ <b>Hotfix Inoltrato al Cloud Runner (GitHub Actions)!</b>\n\n` +
    `🆔 <b>Task:</b> <code>${taskId}</code>\n` +
    `🎯 <b>Target:</b> <code>${targetLabel}</code>\n` +
    `💻 <b>Modalità:</b> 100% Cloud (PC Spento)\n\n` +
    `⏳ Il runner su GitHub Actions ha avviato la compilazione Angular e l'applicazione dei fix.\n` +
    `Riceverai qui il resoconto completo con il link alla Pull Request non appena completato!`;

  if (progressMessageId) {
    await editMessageText(chatId, progressMessageId, confirmationMsg);
  } else {
    await sendMessage(chatId, confirmationMsg);
  }
}

export const telegramHotfix = onRequest(
  {
    region: 'europe-west1',
    memory: '512MiB',
    cpu: 1,
    timeoutSeconds: 60,
    concurrency: 1,
    cors: false,
  },
  async (req, res) => {
    // Rispondi a richieste non POST
    if (req.method !== 'POST') {
      res
        .status(200)
        .send('Telegram Hotfix Webhook attivo e funzionante su Firebase Cloud Functions v2!');
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
        const cbMsgId = callbackQuery.message?.message_id;
        const cbId = callbackQuery.id;
        const cbData = callbackQuery.data || '';

        if (String(cbChatId) !== String(CONFIG.allowedChatId)) {
          await answerCallbackQuery(cbId, '⛔ Accesso Negato');
          res.status(200).send({ ok: true });
          return;
        }

        await answerCallbackQuery(cbId);

        // ─── Scelta Ambiente Deploy (Solo DEV vs DEV + PROD) ───────────
        if (cbData.startsWith('target:')) {
          if (cbData === 'target:cancel') {
            await deletePendingHotfix(cbChatId);
            await editMessageText(
              cbChatId,
              cbMsgId,
              '❌ <b>Richiesta hotfix annullata.</b> Nessuna operazione eseguita.'
            );
            res.status(200).send({ ok: true });
            return;
          }

          if (isHotfixRunning) {
            await sendMessage(
              cbChatId,
              "⏳ <b>Hotfix già in corso!</b>\nC'è già un task in esecuzione nel runner cloud. Attendi il completamento prima di inviare una nuova richiesta."
            );
            res.status(200).send({ ok: true, busy: true });
            return;
          }

          const pending = await getPendingHotfix(cbChatId);
          if (!pending) {
            await editMessageText(
              cbChatId,
              cbMsgId,
              '⚠️ <b>Richiesta scaduta o non trovata.</b> Invia nuovamente la richiesta dal campo da gioco.'
            );
            res.status(200).send({ ok: true });
            return;
          }

          await deletePendingHotfix(cbChatId);
          isHotfixRunning = true;

          const isOnlyDev = cbData === 'target:dev';
          const deployTarget: 'dev' | 'both' = isOnlyDev ? 'dev' : 'both';

          try {
            await dispatchToCloudRunner({
              promptText: pending.promptText,
              photoFileId: pending.photoFileId,
              voiceFileId: pending.voiceFileId,
              chatId: cbChatId,
              progressMessageId: cbMsgId,
              deployTarget,
            });
          } catch (err: any) {
            console.error('[telegramHotfix] Errore dispatch cloud runner:', err);
            await editMessageText(
              cbChatId,
              cbMsgId,
              `❌ <b>Errore avvio runner cloud:</b> ${escapeHtml(err.message)}`
            );
          } finally {
            isHotfixRunning = false;
          }

          if (!res.headersSent) {
            res.status(200).send({ ok: true, status: 'dispatched' });
          }
          return;
        }

        if (cbData.startsWith('merge:')) {
          const branch = cbData.replace('merge:', '');
          await sendMessage(
            cbChatId,
            `🔄 Esecuzione merge su main per <code>${escapeHtml(branch)}</code>...`
          );
          try {
            await mergeHotfixPr(branch);
            await sendMessage(
              cbChatId,
              `✅ <b>Branch ${escapeHtml(branch)} unito con successo su main di PROD!</b>`
            );
          } catch (err: any) {
            await sendMessage(cbChatId, `❌ Errore merge: ${escapeHtml(err.message)}`);
          }
        } else if (cbData.startsWith('discard:')) {
          const branch = cbData.replace('discard:', '');
          await sendMessage(
            cbChatId,
            `🗑 Chiusura e scarto per <code>${escapeHtml(branch)}</code>...`
          );
          try {
            await discardHotfix(branch);
            await sendMessage(
              cbChatId,
              `🗑 <b>Branch ${escapeHtml(branch)} scartato ed eliminato!</b>`
            );
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
          `🔥 <b>Calcetto Abbuffo - Remote Hotfix Bot (Cloud Edition)</b>\n\n` +
          `Operativo al 100% in Cloud a <b>PC Spento</b> (Firebase + GitHub Actions Runner) con <b>Gemini 2.5 Flash</b>!\n\n` +
          `<b>Come interagire dal campo:</b>\n` +
          `• 📝 Scrivi qualsiasi problema o usa <code>/fix &lt;testo&gt;</code>\n` +
          `• 📸 Invia uno screenshot con o senza testo\n` +
          `• 🎙 Registra un messaggio vocale in italiano\n` +
          `• 🎯 <b>Deploy a scelta:</b> il bot ti chiederà se deployare su <b>Solo DEV</b> o <b>DEV e PROD</b> (o usa <code>/fix dev ...</code> / <code>/fix prod ...</code>)\n\n` +
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
          `📖 <b>Guida In-Cloud Hotfixing (A PC Spento):</b>\n\n` +
            `Ogni volta che invii un problema, uno screenshot o un vocale:\n` +
            `1. La Cloud Function fa da passa-carte immediato (1s) e inoltra il task a GitHub Actions\n` +
            `2. Un runner cloud effimero avvia la sessione con Gemini 2.5 Flash\n` +
            `3. Genera patch chirurgiche senza rischio di troncamento (Zero-Truncation Guarantee)\n` +
            `4. Aggiorna Release Notes e versione\n` +
            `5. Esegue <code>npm run build</code> con auto-healing fino a 2 tentativi\n` +
            `6. Pusha il branch, apre la Pull Request e ti invia su Telegram il diff compatto con i pulsanti per il merge!`
        );
        res.status(200).send({ ok: true });
        return;
      }

      if (text === '/status') {
        const openPrs = await listOpenHotfixPrs();
        let statusMsg = `📊 <b>Stato Hotfix in Cloud (PC Spento Ready)</b>\n\n`;
        statusMsg += `🧠 <b>AI Engine:</b> <code>gemini-2.5-flash</code>\n`;
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
      let promptText = text;
      let photoFileId: string | null = null;
      let voiceFileId: string | null = null;

      if (Array.isArray(message.photo) && message.photo.length > 0) {
        const bestPhoto = message.photo[message.photo.length - 1];
        photoFileId = bestPhoto.file_id;
      }

      if (message.voice) {
        voiceFileId = message.voice.file_id;
        if (!promptText) promptText = 'Messaggio vocale dal campo da gioco';
      }

      // Riconoscimento shortcut rapido ("dev ...", "prod ...", "/fix dev ...")
      let explicitTarget: 'dev' | 'both' | null = null;
      const targetMatch = promptText.match(/^(\/fix\s+)?(dev|prod|all|both)\b\s*/i);
      if (targetMatch) {
        const flag = targetMatch[2].toLowerCase();
        explicitTarget = flag === 'prod' || flag === 'all' || flag === 'both' ? 'both' : 'dev';
        promptText = promptText.slice(targetMatch[0].length).trim();
      } else if (promptText.startsWith('/fix')) {
        promptText = promptText.replace(/^\/fix\s*/, '').trim();
      }

      if (!promptText && !photoFileId && !voiceFileId) {
        await sendMessage(
          chatId,
          '❓ Non ho capito la richiesta. Scrivi una descrizione, invia uno screenshot o manda un messaggio vocale!'
        );
        res.status(200).send({ ok: true });
        return;
      }

      // ─── BLOCCO ANTI-CONCORRENZA ─────────────────
      if (isHotfixRunning) {
        await sendMessage(
          chatId,
          "⏳ <b>Hotfix già in corso!</b>\nC'è già un task in esecuzione nel runner cloud. Attendi il completamento prima di inviare una nuova richiesta."
        );
        res.status(200).send({ ok: true, busy: true });
        return;
      }

      // Se l'utente ha specificato esplicitamente il target nel comando
      if (explicitTarget !== null) {
        isHotfixRunning = true;
        const initMsg = await sendMessage(
          chatId,
          explicitTarget === 'dev'
            ? '⚡ <b>Ricevuto! Avvio hotfix in Cloud con deploy su SOLO DEV...</b>'
            : '⚡ <b>Ricevuto! Avvio hotfix in Cloud con deploy su DEV e PROD...</b>'
        );

        try {
          await dispatchToCloudRunner({
            promptText,
            photoFileId,
            voiceFileId,
            chatId,
            progressMessageId: initMsg?.message_id,
            deployTarget: explicitTarget,
          });
        } catch (err: any) {
          console.error('[telegramHotfix] Errore dispatch cloud runner:', err);
          await editMessageText(
            chatId,
            initMsg?.message_id,
            `❌ <b>Errore avvio runner cloud:</b> ${escapeHtml(err.message)}`
          );
        } finally {
          isHotfixRunning = false;
        }

        if (!res.headersSent) {
          res.status(200).send({ ok: true, status: 'dispatched' });
        }
        return;
      }

      // ─── RICHIESTA SCELTA TARGET DEPLOY (SOLO DEV vs DEV E PROD) ───────────
      await savePendingHotfix(chatId, {
        promptText,
        photoFileId,
        voiceFileId,
      });

      const summary = promptText
        ? `📝 <i>"${escapeHtml(promptText.length > 140 ? promptText.slice(0, 137) + '...' : promptText)}"</i>\n`
        : '';
      const attachmentInfo = photoFileId
        ? '📸 <i>Screenshot allegato</i>\n'
        : voiceFileId
        ? '🎙 <i>Messaggio vocale allegato</i>\n'
        : '';

      const askMsg =
        `🎯 <b>Richiesta Hotfix Ricevuta!</b>\n\n` +
        summary +
        attachmentInfo +
        `\n<b>Dove desideri effettuare il deploy una volta verificata la build?</b>\n` +
        `• <b>Solo DEV:</b> per verificare subito l'anteprima senza toccare la produzione\n` +
        `• <b>DEV + PROD:</b> per aggiornare entrambi gli ambienti in contemporanea`;

      await sendMessage(chatId, askMsg, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🧪 Solo DEV', callback_data: 'target:dev' },
              { text: '🚀 DEV + PROD', callback_data: 'target:all' },
            ],
            [{ text: '❌ Annulla', callback_data: 'target:cancel' }],
          ],
        },
      });

      res.status(200).send({ ok: true, status: 'awaiting_target' });
    } catch (err: any) {
      console.error('[telegramHotfix] Errore unhandled:', err);
      if (!res.headersSent) {
        res.status(200).send({ ok: false, error: err.message });
      }
    }
  }
);
