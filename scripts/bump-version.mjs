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
const forceBump = args.includes('--force-bump') || args.includes('--bump');
const alignOnly = args.includes('--align') || args.includes('--sync');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
const currentVersion = pkg.version || '2.0.0-dev';

// Leggi release-notes.json
let releaseNotes = [];
if (fs.existsSync(publicReleaseNotesPath)) {
  try {
    releaseNotes = JSON.parse(fs.readFileSync(publicReleaseNotesPath, 'utf-8'));
  } catch {
    releaseNotes = [];
  }
}

const top = Array.isArray(releaseNotes) && releaseNotes.length > 0 ? releaseNotes[0] : null;
const hasNextDraft = Boolean(top && (top.version === 'NEXT' || top.version === 'DRAFT'));

function computeBumpedVersion(ver) {
  const [coreVersion, preReleaseSuffix] = (ver || '2.0.0').split('-');
  const parts = coreVersion.split('.').map((n) => parseInt(n, 10) || 0);
  if (parts[0] === 0 && parts[1] === 0) {
    parts[0] = 2;
    parts[1] = 0;
    parts[2] = (parts[2] || 0) + 1;
  } else {
    parts[2] = (parts[2] || 0) + 1;
  }
  const bumpedCore = `${parts[0]}.${parts[1]}.${parts[2]}`;
  return preReleaseSuffix ? `${bumpedCore}-${preReleaseSuffix}` : bumpedCore;
}

// Decisione intelligente di incremento versione:
// 1. --no-bump o --align: mai incrementare.
// 2. --force-bump: forza incremento sempre.
// 3. hasNextDraft: incremento voluto (c'è una bozza NEXT pronta per il rilascio).
// 4. Se top.version === currentVersion: la versione corrente è già sincronizzata con l'ultima nota,
//    quindi NON incrementare ulteriormente (garantisce DEV e PROD allineati se deployati in sequenza).
// 5. Default: se non c'è bozza e non c'è force-bump, mantieni la versione corrente per evitare doppi incrementi accidentali.
let shouldBump = false;
if (noBump || alignOnly) {
  shouldBump = false;
} else if (forceBump) {
  shouldBump = true;
} else if (hasNextDraft) {
  shouldBump = true;
} else if (top && top.version === currentVersion) {
  shouldBump = false;
} else {
  shouldBump = false;
}

let targetVersion = currentVersion;
if (shouldBump) {
  targetVersion = computeBumpedVersion(currentVersion);
  pkg.version = targetVersion;
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

const buildId = `${targetVersion}-${timestamp}`;

const versionPayload = {
  version: targetVersion,
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
  version: '${targetVersion}',
  buildId: '${buildId}',
  timestamp: ${timestamp},
  buildDate: '${buildDate}',
} as const;
`;

fs.mkdirSync(path.dirname(envVersionPath), { recursive: true });
fs.writeFileSync(envVersionPath, tsContent, 'utf-8');

// ─── AGGIORNAMENTO RELEASE NOTES ──────────────────────────────────────────
if (Array.isArray(releaseNotes) && releaseNotes.length > 0) {
  if (top && (top.version === 'NEXT' || top.version === 'DRAFT')) {
    top.version = targetVersion;
    top.date = shortDate;
  } else if (forceBump && top && top.version !== targetVersion) {
    try {
      const gitSubject = execSync('git log -1 --pretty=%s', {
        cwd: rootDir,
        encoding: 'utf-8',
      }).trim();
      releaseNotes.unshift({
        version: targetVersion,
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
      top.version = targetVersion;
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
 * Confronta due stringhe semver "x.y.z" o "x.y.z-dev" (ritorna >0 se a > b, <0 se a < b, 0 se uguali).
 */
export function compareSemver(a: string, b: string): number {
  const cleanA = (a || '0.0.0').split('-')[0];
  const cleanB = (b || '0.0.0').split('-')[0];
  const pa = cleanA.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = cleanB.split('.').map((n) => parseInt(n, 10) || 0);
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

if (shouldBump) {
  console.log(
    `\n🚀 [Calcetto Abbuffo] Nuova Versione Rilasciata: v${targetVersion} (buildId: ${buildId} | ${buildDate})\n`
  );
} else {
  console.log(
    `\n⚡ [Calcetto Abbuffo] Versione Sincronizzata & Allineata: v${targetVersion} (buildId: ${buildId} | ${buildDate})\n`
  );
}
