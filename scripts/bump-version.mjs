import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const pkgPath = path.join(rootDir, 'package.json');
const publicVersionPath = path.join(rootDir, 'public', 'version.json');
const envVersionPath = path.join(rootDir, 'src', 'environments', 'version.ts');

const args = process.argv.slice(2);
const noBump = args.includes('--no-bump');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
const currentVersion = pkg.version || '1.0.0';

let nextVersion = currentVersion;
if (!noBump) {
  const parts = currentVersion.split('.').map((n) => parseInt(n, 10) || 0);
  // Se siamo ancora a 0.0.x, passiamo a 1.0.x per avere un versionamento chiaro
  if (parts[0] === 0 && parts[1] === 0) {
    parts[0] = 1;
    parts[1] = 0;
    parts[2] = (parts[2] || 0) + 1;
  } else {
    parts[2] = (parts[2] || 0) + 1;
  }
  nextVersion = `${parts[0]}.${parts[1]}.${parts[2]}`;
  pkg.version = nextVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
}

const timestamp = Date.now();
const buildDate = new Intl.DateTimeFormat('it-IT', {
  timeZone: 'Europe/Rome',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
}).format(new Date(timestamp));

const buildId = `${nextVersion}-${timestamp}`;

const versionPayload = {
  version: nextVersion,
  buildId,
  timestamp,
  buildDate,
};

fs.mkdirSync(path.dirname(publicVersionPath), { recursive: true });
fs.writeFileSync(
  publicVersionPath,
  JSON.stringify(versionPayload, null, 2) + '\n',
  'utf-8'
);

const tsContent = `// FILE GENERATO AUTOMATICAMENTE DA scripts/bump-version.mjs
// NON MODIFICARE MANUALMENTE
export const APP_VERSION_INFO = {
  version: '${nextVersion}',
  buildId: '${buildId}',
  timestamp: ${timestamp},
  buildDate: '${buildDate}',
} as const;
`;

fs.mkdirSync(path.dirname(envVersionPath), { recursive: true });
fs.writeFileSync(envVersionPath, tsContent, 'utf-8');

console.log(
  `\n🚀 [Calcetto Abbuffo] Versione App aggiornata: v${nextVersion} (buildId: ${buildId} | ${buildDate})\n`
);

