import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const pkgPath = path.join(rootDir, 'package.json');
const publicVersionPath = path.join(rootDir, 'public', 'version.json');
const publicReleaseNotesPath = path.join(rootDir, 'public', 'release-notes.json');
const envVersionPath = path.join(rootDir, 'src', 'environments', 'version.ts');
const releaseNotesModelPath = path.join(
  rootDir,
  'src',
  'app',
  'models',
  'release-notes.model.ts'
);

const args = process.argv.slice(2);
const noBump = args.includes('--no-bump');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
const currentVersion = pkg.version || '1.0.0';

let nextVersion = currentVersion;
if (!noBump) {
  const parts = currentVersion.split('.').map((n) => parseInt(n, 10) || 0);
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

const shortDate = new Intl.DateTimeFormat('it-IT', {
  timeZone: 'Europe/Rome',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
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

// ─── GESTIONE AUTOMATICA RELEASE NOTES DA public/release-notes.json ───────
let releaseNotes = [];
if (fs.existsSync(publicReleaseNotesPath)) {
  try {
    releaseNotes = JSON.parse(fs.readFileSync(publicReleaseNotesPath, 'utf-8'));
  } catch {
    releaseNotes = [];
  }
}

if (Array.isArray(releaseNotes) && releaseNotes.length > 0) {
  const top = releaseNotes[0];

  // Se la prima voce è marcata come "NEXT" o "DRAFT", oppure se siamo nella stessa giornata,
  // allinea automaticamente la versione a `nextVersion` e la data a `shortDate`.
  if (
    top.version === 'NEXT' ||
    top.version === 'DRAFT' ||
    top.version === currentVersion
  ) {
    top.version = nextVersion;
    top.date = shortDate;
  } else if (!noBump && top.version !== nextVersion) {
    // Fallback automatico da git log se si lancia il deploy da terminale senza aver preparato "NEXT"
    try {
      const gitSubject = execSync('git log -1 --pretty=%s', {
        cwd: rootDir,
        encoding: 'utf-8',
      }).trim();
      releaseNotes.unshift({
        version: nextVersion,
        date: shortDate,
        title: 'Aggiornamento Rapido & Ottimizzazioni',
        userChanges: [
          'Miglioramenti di stabilità, velocità e interfaccia grafica.',
        ],
        superUserChanges: gitSubject
          ? [`Ultimo commit: ${gitSubject}`]
          : ['Ottimizzazioni tecniche e di sincronizzazione.'],
      });
    } catch {
      top.version = nextVersion;
      top.date = shortDate;
    }
  }

  fs.writeFileSync(
    publicReleaseNotesPath,
    JSON.stringify(releaseNotes, null, 2) + '\n',
    'utf-8'
  );

  const modelFileContent = `// FILE SINCRONIZZATO AUTOMATICAMENTE DA public/release-notes.json TRAMITE scripts/bump-version.mjs
export interface ReleaseNoteEntry {
  version: string;
  date: string;
  title: string;
  /** Novità visibili a tutti gli utenti dell'app */
  userChanges: string[];
  /** Novità visibili solo in modalità Super User / Admin */
  superUserChanges: string[];
}

export const RELEASE_NOTES_HISTORY: ReleaseNoteEntry[] = ${JSON.stringify(
    releaseNotes,
    null,
    2
  )};

/**
 * Confronta due stringhe semver "x.y.z" (ritorna >0 se a > b, <0 se a < b, 0 se uguali).
 */
export function compareSemver(a: string, b: string): number {
  const pa = (a || '0.0.0').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = (b || '0.0.0').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Restituisce tutte le note di rilascio comprese tra \`fromVersion\` (esclusa, se inferiore a \`toVersion\`)
 * e \`toVersion\` (inclusa). Se \`fromVersion\` non è specificata o coincide con \`toVersion\`,
 * restituisce almeno l'ultima release disponibile.
 */
export function getReleaseNotesDelta(
  fromVersion: string | null,
  toVersion: string
): ReleaseNoteEntry[] {
  if (!fromVersion || compareSemver(fromVersion, toVersion) >= 0) {
    return RELEASE_NOTES_HISTORY.slice(0, 1);
  }

  const delta = RELEASE_NOTES_HISTORY.filter(
    (entry) =>
      compareSemver(entry.version, fromVersion) > 0 &&
      compareSemver(entry.version, toVersion) <= 0
  );

  return delta.length > 0 ? delta : RELEASE_NOTES_HISTORY.slice(0, 1);
}
`;

  fs.writeFileSync(releaseNotesModelPath, modelFileContent, 'utf-8');
}

console.log(
  `\n🚀 [Calcetto Abbuffo] Versione App aggiornata: v${nextVersion} (buildId: ${buildId} | ${buildDate})\n`
);
