import { CONFIG } from './config';

const BASE_URL = `https://api.telegram.org/bot${CONFIG.telegramToken}`;
const FILE_BASE_URL = `https://api.telegram.org/file/bot${CONFIG.telegramToken}`;

export async function callApi(method: string, payload: Record<string, unknown> = {}): Promise<any> {
  const url = `${BASE_URL}/${method}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as any;
  if (!data.ok) {
    const errorMsg = data.description || 'Errore sconosciuto da Telegram API';
    console.error(`[Telegram] Errore su ${method}:`, errorMsg);
    throw new Error(`Telegram API Error: ${errorMsg}`);
  }
  return data.result;
}

export async function sendMessage(chatId: string | number, text: string, options: Record<string, any> = {}): Promise<any> {
  try {
    return await callApi('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: options.parse_mode ?? 'HTML',
      disable_web_page_preview: options.disable_web_page_preview ?? true,
      reply_markup: options.reply_markup,
    });
  } catch (err: any) {
    console.error('[Telegram] Impossibile inviare messaggio HTML, provo testo semplice:', err.message);
    try {
      return await callApi('sendMessage', {
        chat_id: chatId,
        text: stripHtml(text),
        disable_web_page_preview: true,
      });
    } catch {
      throw err;
    }
  }
}

export async function editMessageText(
  chatId: string | number,
  messageId: number,
  text: string,
  options: Record<string, any> = {}
): Promise<any> {
  try {
    return await callApi('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: options.parse_mode ?? 'HTML',
      disable_web_page_preview: options.disable_web_page_preview ?? true,
      reply_markup: options.reply_markup,
    });
  } catch (err: any) {
    if (err.message && err.message.includes('message is not modified')) {
      return null;
    }
    console.warn('[Telegram] editMessageText HTML fallito, provo testo semplice:', err.message);
    try {
      return await callApi('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: stripHtml(text),
        disable_web_page_preview: true,
      });
    } catch {
      return null;
    }
  }
}

export async function sendChatAction(chatId: string | number, action = 'typing'): Promise<void> {
  try {
    await callApi('sendChatAction', { chat_id: chatId, action });
  } catch {}
}

export async function getFile(fileId: string): Promise<any> {
  return await callApi('getFile', { file_id: fileId });
}

export async function downloadFile(fileId: string): Promise<{ buffer: Buffer; filePath: string }> {
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
  };
}

export async function setWebhook(webhookUrl: string): Promise<any> {
  return await callApi('setWebhook', {
    url: webhookUrl,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: false,
  });
}

export function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function stripHtml(html: string): string {
  return (html || '').replace(/<[^>]*>/g, '');
}

