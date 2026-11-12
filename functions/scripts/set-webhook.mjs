import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

function getEnvValue(key) {
  const envPaths = [
    path.join(__dirname, '..', '.env'),
    path.join(rootDir, '.env'),
  ];
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith(`${key}=`)) {
          return trimmed.split('=')[1].trim().replace(/^['"]|['"]$/g, '');
        }
      }
    }
  }
  return process.env[key] || '';
}

const token = getEnvValue('TELEGRAM_BOT_TOKEN');
if (!token) {
  console.error('ERRORE: TELEGRAM_BOT_TOKEN non trovato nell\'ambiente o nei file .env.');
  process.exit(1);
}
let webhookUrl = process.argv[2];
const project = process.argv[3] || getEnvValue('PROJECT_PROD') || getEnvValue('FIREBASE_PROJECT_PROD') || 'calcettoabuffone-prod';

if (!webhookUrl || webhookUrl.startsWith('--')) {
  try {
    const listOutput = execSync(`npx firebase functions:list --project ${project} --json`, {
      encoding: 'utf-8',
    });
    const parsed = JSON.parse(listOutput);
    const hotfixFunc = (parsed.result || []).find(
      (f) => f.id === 'telegramHotfix' || f.name?.includes('telegramHotfix')
    );
    if (hotfixFunc && hotfixFunc.uri) {
      webhookUrl = hotfixFunc.uri;
    }
  } catch (err) {
    console.warn('Rilevamento dinamico URL fallito, uso URL canonico:', err.message);
  }
}

if (!webhookUrl || webhookUrl.startsWith('--')) {
  webhookUrl = `https://europe-west1-${project}.cloudfunctions.net/telegramHotfix`;
}

console.log(`\n======================================================`);
console.log(`📡 Registrazione Webhook Ufficiale Telegram`);
console.log(`Bot: @CalcettoHotfixBot`);
console.log(`Project: ${project}`);
console.log(`URL Webhook: ${webhookUrl}`);
console.log(`======================================================\n`);

async function register() {
  const setUrl = `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(
    webhookUrl
  )}&allowed_updates=${encodeURIComponent(JSON.stringify(['message', 'callback_query']))}`;
  const res = await fetch(setUrl);
  const data = await res.json();
  console.log('Esito setWebhook:', data);

  // Verifica con getWebhookInfo
  const infoUrl = `https://api.telegram.org/bot${token}/getWebhookInfo`;
  const infoRes = await fetch(infoUrl);
  const infoData = await infoRes.json();
  console.log('\nInformazioni Webhook attive su Telegram:');
  console.log(infoData.result);
}

register().catch((err) => {
  console.error('Errore registrazione webhook:', err);
  process.exit(1);
});
