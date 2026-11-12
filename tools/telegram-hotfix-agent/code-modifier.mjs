import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { CONFIG } from './config.mjs';

const backupDir = path.join(CONFIG.agentDir, '.backup');

/**
 * Scansiona l'albero di directory 'src/' e restituisce l'elenco dei file .ts, .html, .scss
 */
export function scanSrcFiles() {
  const srcRoot = path.join(CONFIG.rootDir, 'src');
  const results = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.ts', '.html', '.scss', '.json'].includes(ext)) {
          const relPath = path.relative(CONFIG.rootDir, fullPath).replace(/\\/g, '/');
          results.push(relPath);
        }
      }
    }
  }

  if (fs.existsSync(srcRoot)) {
    walk(srcRoot);
  }
  return results;
}

/**
 * Cerca file rilevanti per parole chiave nel nome del file o nel percorso
 */
export function findRelevantFiles(keywords = []) {
  const allFiles = scanSrcFiles();
  if (!keywords || keywords.length === 0) return allFiles;

  const lowerKeywords = keywords.map((k) => k.toLowerCase());
  return allFiles.filter((file) => {
    const lower = file.toLowerCase();
    return lowerKeywords.some((k) => lower.includes(k));
  });
}

/**
 * Legge il contenuto di un file relativo alla root del progetto
 */
export function readFile(relPath) {
  const absPath = path.join(CONFIG.rootDir, relPath);
  if (!fs.existsSync(absPath)) return null;
  return fs.readFileSync(absPath, 'utf-8');
}

/**
 * Crea un backup dei file prima di applicare le modifiche
 */
export function createBackup(filesToBackup) {
  if (fs.existsSync(backupDir)) {
    fs.rmSync(backupDir, { recursive: true, force: true });
  }
  fs.mkdirSync(backupDir, { recursive: true });

  const backupManifest = {};
  for (const relPath of filesToBackup) {
    const absPath = path.join(CONFIG.rootDir, relPath);
    if (fs.existsSync(absPath)) {
      const destPath = path.join(backupDir, relPath);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(absPath, destPath);
      backupManifest[relPath] = true;
    }
  }
  fs.writeFileSync(
    path.join(backupDir, 'manifest.json'),
    JSON.stringify(backupManifest, null, 2),
    'utf-8',
  );
}

/**
 * Ripristina i file modificati dallo stato di backup in caso di fallimento build irreversibile
 */
export function rollbackBackup() {
  const manifestPath = path.join(backupDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return false;

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    for (const relPath of Object.keys(manifest)) {
      const srcPath = path.join(backupDir, relPath);
      const destPath = path.join(CONFIG.rootDir, relPath);
      if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, destPath);
      }
    }
    clearBackup();
    return true;
  } catch (err) {
    console.error('[Backup] Errore durante il rollback:', err);
    return false;
  }
}

/**
 * Rimuove la cartella di backup
 */
export function clearBackup() {
  if (fs.existsSync(backupDir)) {
    fs.rmSync(backupDir, { recursive: true, force: true });
  }
}

/**
 * Applica una patch di file al progetto
 * patches: Array di { path: string, content: string }
 */
export function applyPatches(patches = []) {
  const touchedFiles = [];
  for (const patch of patches) {
    const absPath = path.join(CONFIG.rootDir, patch.path);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, patch.content, 'utf-8');
    touchedFiles.push(patch.path);
  }
  return touchedFiles;
}

/**
 * Aggiunge la Release Note e incrementa la versione tramite scripts/bump-version.mjs
 */
export function updateReleaseNotesAndBump({ title, userChanges, superUserChanges }) {
  const releaseNotesPath = path.join(CONFIG.rootDir, 'public', 'release-notes.json');
  let releaseNotes = [];
  if (fs.existsSync(releaseNotesPath)) {
    try {
      releaseNotes = JSON.parse(fs.readFileSync(releaseNotesPath, 'utf-8'));
    } catch {
      releaseNotes = [];
    }
  }

  const shortDate = new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date());

  const newEntry = {
    version: 'NEXT',
    date: shortDate,
    title: title || 'Hotfix Rapido via Telegram Agent',
    isMajor: false,
    target: 'all',
    userChanges: Array.isArray(userChanges) && userChanges.length > 0
      ? userChanges
      : ['Miglioramento e correzione automatica applicata via Telegram Hotfix Bot.'],
    superUserChanges: Array.isArray(superUserChanges) && superUserChanges.length > 0
      ? superUserChanges
      : ['Patch generata e verificata con self-healing build da CalcettoHotfixBot.'],
  };

  releaseNotes.unshift(newEntry);
  fs.writeFileSync(releaseNotesPath, JSON.stringify(releaseNotes, null, 2) + '\n', 'utf-8');

  // Esegui scripts/bump-version.mjs per calcolare il nuovo numero e rigenerare i modelli
  const bumpOutput = execSync('node scripts/bump-version.mjs', {
    cwd: CONFIG.rootDir,
    encoding: 'utf-8',
  });
  console.log('[BumpVersion]', bumpOutput);

  // Leggi la versione appena prodotta da package.json
  const pkgPath = path.join(CONFIG.rootDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  return pkg.version;
}

/**
 * Esegue il test di compilazione Angular del progetto
 */
export function runBuild() {
  try {
    const output = execSync('npm run build', {
      cwd: CONFIG.rootDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { success: true, output };
  } catch (error) {
    const errorOutput = (error.stdout || '') + '\n' + (error.stderr || '') + '\n' + (error.message || '');
    return { success: false, output: errorOutput };
  }
}

/**
 * Operazioni Git: crea branch hotfix, commit, push e crea PR con GitHub CLI
 */
export function gitHotfixCommitAndPush({ version, slug, summary }) {
  const safeSlug = (slug || 'fix')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 30);
  const branchName = `hotfix/v${version}-${safeSlug}`;

  // Crea branch
  execSync(`git checkout -b ${branchName}`, { cwd: CONFIG.rootDir, stdio: 'pipe' });

  // Add all
  execSync('git add -A', { cwd: CONFIG.rootDir, stdio: 'pipe' });

  // Commit
  const commitMsg = `fix(hotfix): ${summary || 'remote hotfix'} v${version}`;
  execSync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, {
    cwd: CONFIG.rootDir,
    stdio: 'pipe',
  });

  // Push
  execSync(`git push -u origin ${branchName}`, {
    cwd: CONFIG.rootDir,
    stdio: 'pipe',
  });

  // Crea Pull Request tramite gh CLI
  let prUrl = '';
  try {
    const prTitle = `Hotfix v${version}: ${summary || 'Intervento da remoto'}`;
    const prBody = `Automated Hotfix generato dal bot Telegram @CalcettoHotfixBot.\n\n- **Versione:** v${version}\n- **Dettagli:** ${summary}\n- **Verifica build:** PASS (100% verde)`;
    prUrl = execSync(
      `gh pr create --base main --head ${branchName} --title "${prTitle.replace(/"/g, '\\"')}" --body "${prBody.replace(/"/g, '\\"')}"`,
      { cwd: CONFIG.rootDir, encoding: 'utf-8' },
    ).trim();
  } catch (err) {
    console.warn('[Git] Creazione PR fallita:', err.message);
  }

  return { branchName, prUrl };
}

/**
 * Esegue il deploy su Firebase DEV
 */
export function deployDev() {
  console.log('[Deploy] Avvio deploy su DEV...');
  const output = execSync(
    `firebase deploy --only hosting,storage,firestore:rules --project ${CONFIG.firebaseDev}`,
    { cwd: CONFIG.rootDir, encoding: 'utf-8' },
  );
  return output;
}

/**
 * Esegue il deploy su Firebase PROD
 */
export function deployProd() {
  console.log('[Deploy] Avvio deploy su PROD...');
  const output = execSync(
    `firebase deploy --only hosting,storage,firestore:rules --project ${CONFIG.firebaseProd}`,
    { cwd: CONFIG.rootDir, encoding: 'utf-8' },
  );
  return output;
}

/**
 * Esegue il merge della PR di hotfix su main e ritorna su main pulito
 */
export function mergeHotfixPr(prNumberOrBranch) {
  try {
    if (prNumberOrBranch) {
      execSync(`gh pr merge ${prNumberOrBranch} --merge --delete-branch`, {
        cwd: CONFIG.rootDir,
        encoding: 'utf-8',
      });
    } else {
      execSync('gh pr merge --merge --delete-branch', {
        cwd: CONFIG.rootDir,
        encoding: 'utf-8',
      });
    }
  } catch {
    // Fallback manuale via git
    execSync('git checkout main', { cwd: CONFIG.rootDir, stdio: 'pipe' });
    execSync('git pull origin main', { cwd: CONFIG.rootDir, stdio: 'pipe' });
  }

  // Torna su main e riallinea
  execSync('git checkout main', { cwd: CONFIG.rootDir, stdio: 'pipe' });
  execSync('git pull origin main', { cwd: CONFIG.rootDir, stdio: 'pipe' });
  return true;
}

/**
 * Chiude la PR ed elimina il branch di hotfix scartando le modifiche
 */
export function discardHotfix(branchName) {
  try {
    if (branchName) {
      execSync(`gh pr close ${branchName} --delete-branch`, {
        cwd: CONFIG.rootDir,
        stdio: 'pipe',
      });
    }
  } catch {}

  execSync('git checkout main', { cwd: CONFIG.rootDir, stdio: 'pipe' });
  execSync('git pull origin main', { cwd: CONFIG.rootDir, stdio: 'pipe' });
  if (branchName) {
    try {
      execSync(`git branch -D ${branchName}`, { cwd: CONFIG.rootDir, stdio: 'pipe' });
    } catch {}
  }
  return true;
}

/**
 * Controlla se ci sono branch o PR hotfix aperte
 */
export function listOpenHotfixPrs() {
  try {
    const output = execSync(
      `gh pr list --repo ${CONFIG.githubRepo} --state open --json number,title,headRefName,url`,
      { cwd: CONFIG.rootDir, encoding: 'utf-8' },
    );
    const prs = JSON.parse(output);
    return prs.filter((p) => p.headRefName?.startsWith('hotfix/'));
  } catch (err) {
    console.warn('[Git] Verifica PR aperte fallita:', err.message);
    return [];
  }
}

