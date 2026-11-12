import { CONFIG } from './config.mjs';
import { listOpenHotfixPrs } from './code-modifier.mjs';
import { sendMessage, escapeHtml } from './telegram.mjs';

/**
 * Controlla se ci sono branch o PR di hotfix aperte e invia la notifica del mattino alle 08:30
 */
export async function checkMorningPendingHotfixes(targetChatId = null) {
  const chatId = targetChatId || CONFIG.allowedChatId;
  if (!chatId) {
    console.log('[MorningCheck] Nessun Chat ID configurato. Salto invio promemoria.');
    return;
  }

  console.log('[MorningCheck] Verifica PR e branch hotfix aperti su GitHub...');
  const openPrs = listOpenHotfixPrs();

  if (!openPrs || openPrs.length === 0) {
    console.log('[MorningCheck] Nessun hotfix pendente. Tutto allineato su main.');
    return;
  }

  let text = `☀️ <b>Buongiorno Mister!</b>\n\n`;
  text += `Hai ${openPrs.length === 1 ? 'un hotfix aperto' : `${openPrs.length} hotfix aperti`} dalla sera prima:\n\n`;

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
  console.log('[MorningCheck] Promemoria mattutino inviato con successo.');
}

// Esecuzione diretta via riga di comando
if (process.argv[1] && process.argv[1].endsWith('morning-check.mjs')) {
  checkMorningPendingHotfixes().catch((err) => {
    console.error('[MorningCheck] Errore:', err);
    process.exit(1);
  });
}
