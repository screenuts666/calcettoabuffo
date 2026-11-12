import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const agentDir = __dirname;
const rootDir = path.resolve(agentDir, '../..');

/**
 * Carica variabili d'ambiente da file .env senza dipendenze esterne
 */
function loadEnv() {
  const envPaths = [
    path.join(agentDir, '.env'),
    path.join(rootDir, '.env'),
  ];

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf-8');
        const lines = content.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            // Rimuovi apici se presenti
            if (
              (val.startsWith('"') && val.endsWith('"')) ||
              (val.startsWith("'") && val.endsWith("'"))
            ) {
              val = val.slice(1, -1);
            }
            if (!process.env[key] || process.env[key] === '') {
              process.env[key] = val;
            }
          }
        }
      } catch (err) {
        console.warn(`[Config] Errore lettura ${envPath}:`, err.message);
      }
    }
  }
}

loadEnv();

export const CONFIG = {
  rootDir,
  agentDir,
  telegramToken:
    process.env.TELEGRAM_BOT_TOKEN ||
    'YOUR_TELEGRAM_BOT_TOKEN_HERE',
  allowedChatId: process.env.TELEGRAM_ALLOWED_CHAT_ID?.trim() || '',
  geminiApiKey: process.env.GEMINI_API_KEY?.trim() || '',
  geminiModel: process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash',
  geminiThinkingLevel: process.env.GEMINI_THINKING_LEVEL?.trim() || 'HIGH',
  githubRepo: process.env.GITHUB_REPO?.trim() || 'screenuts666/calcettoabuffo',
  firebaseDev: process.env.FIREBASE_PROJECT_DEV?.trim() || 'calcettoabuffone',
  firebaseProd:
    process.env.FIREBASE_PROJECT_PROD?.trim() || 'calcettoabuffone-prod',
  urlDev: process.env.URL_DEV?.trim() || 'https://calcettoabuffone.web.app',
  urlProd:
    process.env.URL_PROD?.trim() || 'https://calcettoabuffone-prod.web.app',
  morningCheckTime: process.env.MORNING_CHECK_TIME?.trim() || '08:30',
};

/**
 * Salva una chiave nel file .env locale dell'agente
 */
export function updateEnvKey(key, value) {
  const envPath = path.join(agentDir, '.env');
  let content = '';
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, 'utf-8');
  }

  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content += (content.endsWith('\n') ? '' : '\n') + `${key}=${value}\n`;
  }

  fs.writeFileSync(envPath, content, 'utf-8');
  process.env[key] = value;
  if (key === 'TELEGRAM_ALLOWED_CHAT_ID') CONFIG.allowedChatId = value;
  if (key === 'GEMINI_API_KEY') CONFIG.geminiApiKey = value;
}
