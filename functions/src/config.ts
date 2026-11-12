import * as path from 'node:path';

export const CONFIG = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
  allowedChatId: process.env.TELEGRAM_ALLOWED_CHAT_ID || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  githubPat: process.env.GITHUB_PAT || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  geminiThinkingLevel: process.env.GEMINI_THINKING_LEVEL || 'HIGH',
  githubRepo: process.env.GITHUB_REPO || 'screenuts666/calcettoabuffo',
  firebaseDev: process.env.APP_PROJECT_DEV || process.env.PROJECT_DEV || 'calcettoabuffone',
  firebaseProd: process.env.APP_PROJECT_PROD || process.env.PROJECT_PROD || 'calcettoabuffone-prod',
  urlDev: process.env.URL_DEV || 'https://calcettoabuffone.web.app',
  urlProd: process.env.URL_PROD || 'https://calcettoabuffone-prod.web.app',
  tmpWorkspace: path.join('/tmp', 'workspace'),
  tmpCache: path.join('/tmp', 'cache'),
};

