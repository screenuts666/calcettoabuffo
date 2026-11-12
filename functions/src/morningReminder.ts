import { onSchedule } from 'firebase-functions/v2/scheduler';
import { CONFIG } from './config';
import { listOpenHotfixPrs } from './githubService';
import { sendMessage, escapeHtml } from './telegramService';

export const morningReminder = onSchedule(
  {
    schedule: '30 8 * * *',
    timeZone: 'Europe/Rome',
    region: 'europe-west1',
  },
  async () => {
    console.log('[morningReminder] Controllo hotfix aperti alle 08:30 (Europe/Rome)...');
    const chatId = CONFIG.allowedChatId;
    if (!chatId) {
      console.log('[morningReminder] Nessun Chat ID configurato. Salto invio.');
      return;
    }

    try {
      const openPrs = await listOpenHotfixPrs();
      if (!openPrs || openPrs.length === 0) {
        console.log('[morningReminder] Nessun hotfix aperto. Tutto allineato su main.');
        return;
      }

      let text = `☀️ <b>Buongiorno Mister!</b>\n\n`;
      text += `Hai ${openPrs.length === 1 ? "un'hotfix aperta" : `${openPrs.length} hotfix aperte`} dalla sera prima su GitHub:\n\n`;

      for (const pr of openPrs) {
        text += `📌 <b>${escapeHtml(pr.title)}</b>\n`;
        text += `🌿 <b>Branch:</b> <code>${escapeHtml(pr.headRefName)}</code>\n`;
        if (pr.url) {
          text += `🔗 <b>PR:</b> <a href="${pr.url}">${pr.url}</a>\n`;
        }
        text += `\n`;
      }

      text += `💡 <i>Ricordati di revisionare il codice dal PC e fare il merge definitivo su main di PROD.</i>\n\n`;
      text += `Oppure rispondi direttamente qui con:\n`;
      text += `• <code>/merge</code> per mergiare subito su main\n`;
      text += `• <code>/discard</code> per chiudere la PR ed eliminare il branch\n`;

      const inlineKeyboard = openPrs.map((pr) => [
        { text: `✅ Merge #${pr.number}`, callback_data: `merge:${pr.headRefName}` },
        { text: `🗑 Scarta #${pr.number}`, callback_data: `discard:${pr.headRefName}` },
      ]);

      await sendMessage(chatId, text, {
        reply_markup: {
          inline_keyboard: inlineKeyboard,
        },
      });
      console.log('[morningReminder] Promemoria mattutino inviato con successo.');
    } catch (err: any) {
      console.error('[morningReminder] Errore:', err);
    }
  }
);

