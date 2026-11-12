import { CONFIG } from './config.mjs';

const BASE_URL = `https://api.telegram.org/bot${CONFIG.telegramToken}`;
const FILE_BASE_URL = `https://api.telegram.org/file/bot${CONFIG.telegramToken}`;

/**
 * Esegue una chiamata HTTP all'API di Telegram
 */
async function callApi(method, payload = {}) {
  const url = `${BASE_URL}/${method}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!data.ok) {
    const errorMsg = data.description || 'Errore sconosciuto da Telegram API';
    console.error(`[Telegram] Errore su ${method}:`, errorMsg);
    throw new Error(`Telegram API Error: ${errorMsg}`);
  }
  return data.result;
}

/**
 * Invia un messaggio di testo formattato in HTML
 */
export async function sendMessage(chatId, text, options = {}) {
  try {
    return await callApi('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: options.parse_mode ?? 'HTML',
      disable_web_page_preview: options.disable_web_page_preview ?? true,
      reply_markup: options.reply_markup,
    });
  } catch (err) {
    console.error('[Telegram] Impossibile inviare messaggio:', err.message);
    // Fallback senza formattazione se fallisce il parser HTML
    if (options.parse_mode === 'HTML') {
      try {
        return await callApi('sendMessage', {
          chat_id: chatId,
          text: stripHtml(text),
          disable_web_page_preview: true,
        });
      } catch {}
    }
    throw err;
  }
}

/**
 * Invia un'azione di stato (es. 'typing', 'upload_document')
 */
export async function sendChatAction(chatId, action = 'typing') {
  try {
    return await callApi('sendChatAction', {
      chat_id: chatId,
      action,
    });
  } catch {
    // Non critico
  }
}

/**
 * Ottiene le informazioni del file da Telegram
 */
export async function getFile(fileId) {
  return await callApi('getFile', { file_id: fileId });
}

/**
 * Scarica il file binario (Buffer) da Telegram dato il fileId
 */
export async function downloadFile(fileId) {
  const fileInfo = await getFile(fileId);
  if (!fileInfo.file_path) {
    throw new Error('file_path mancante nelle info del file Telegram');
  }

  const downloadUrl = `${FILE_BASE_URL}/${fileInfo.file_path}`;
  const res = await fetch(downloadUrl);
  if (!res.ok) {
    throw new Error(`Errore download file da Telegram (${res.status} ${res.statusText})`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    filePath: fileInfo.file_path,
    fileSize: fileInfo.file_size,
  };
}

/**
 * Riceve aggiornamenti in long-polling
 */
export async function getUpdates(offset = 0, timeout = 30) {
  return await callApi('getUpdates', {
    offset,
    timeout,
    allowed_updates: ['message', 'callback_query'],
  });
}

/**
 * Configura la lista dei comandi visibili nel menu del Bot
 */
export async function registerCommands() {
  try {
    await callApi('setMyCommands', {
      commands: [
        { command: 'fix', description: 'Avvia un hotfix dal testo' },
        { command: 'status', description: 'Stato versione, build e ambienti' },
        { command: 'merge', description: 'Merga la PR di hotfix su main' },
        { command: 'discard', description: 'Chiude la PR ed elimina il branch hotfix' },
        { command: 'myid', description: 'Mostra il tuo Chat ID' },
        { command: 'help', description: 'Guida all\'uso del bot' },
      ],
    });
    console.log('[Telegram] Comandi del bot registrati con successo');
  } catch (err) {
    console.warn('[Telegram] Registrazione comandi fallita:', err.message);
  }
}

/**
 * Rimuove tag HTML da una stringa
 */
function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, '');
}

/**
 * Escape dei caratteri riservati HTML
 */
export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

