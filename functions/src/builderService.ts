import { execSync } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CONFIG } from './config';
import { prepareWorkspace, commitAndPush, createPullRequest } from './githubService';
import { planAndGeneratePatch, selfHealBuildErrors, HotfixPlan, PatchItem } from './geminiEngine';
import { sendMessage, editMessageText, sendChatAction, escapeHtml } from './telegramService';

export function scanSrcFiles(targetDir: string): string[] {
  const srcRoot = path.join(targetDir, 'src');
  const results: string[] = [];

  function walk(currentDir: string) {
    if (!fs.existsSync(currentDir)) return;
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.ts', '.html', '.scss', '.json'].includes(ext)) {
          const relPath = path.relative(targetDir, fullPath).replace(/\\/g, '/');
          results.push(relPath);
        }
      }
    }
  }

  walk(srcRoot);
  return results;
}

export function findRelevantFiles(targetDir: string, keywords: string[]): string[] {
  const allFiles = scanSrcFiles(targetDir);
  if (!keywords || keywords.length === 0) return allFiles;
  const lowerKeywords = keywords.map((k) => k.toLowerCase());
  return allFiles.filter((file) => {
    const lower = file.toLowerCase();
    return lowerKeywords.some((k) => lower.includes(k));
  });
}

export function applyPatches(targetDir: string, patches: PatchItem[]): string[] {
  const touched: string[] = [];
  for (const patch of patches) {
    const absPath = path.join(targetDir, patch.path);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, patch.content, 'utf-8');
    touched.push(patch.path);
  }
  return touched;
}

export function updateReleaseNotesAndBump(targetDir: string, plan: HotfixPlan): string {
  const releaseNotesPath = path.join(targetDir, 'public', 'release-notes.json');
  let releaseNotes: any[] = [];
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
    title: plan.title || 'Hotfix Rapido via Firebase Cloud Functions',
    isMajor: false,
    target: 'all',
    userChanges:
      Array.isArray(plan.userChanges) && plan.userChanges.length > 0
        ? plan.userChanges
        : ['Miglioramento e correzione automatica applicata via CalcettoHotfixBot su Firebase.'],
    superUserChanges:
      Array.isArray(plan.superUserChanges) && plan.superUserChanges.length > 0
        ? plan.superUserChanges
        : ['Patch generata con Gemini 3.8 Flash High Thinking e verificata con self-healing build.'],
  };

  releaseNotes.unshift(newEntry);
  fs.writeFileSync(releaseNotesPath, JSON.stringify(releaseNotes, null, 2) + '\n', 'utf-8');

  // Esegue scripts/bump-version.mjs
  execSync('node scripts/bump-version.mjs', {
    cwd: targetDir,
    encoding: 'utf-8',
    stdio: 'pipe',
  });

  const pkg = JSON.parse(fs.readFileSync(path.join(targetDir, 'package.json'), 'utf-8'));
  return pkg.version;
}

export function ensureDependencies(targetDir: string): void {
  const nodeModulesPath = path.join(targetDir, 'node_modules');
  const lockFilePath = path.join(targetDir, 'package-lock.json');
  const hashFilePath = path.join(targetDir, '.node_modules_lock_hash');

  const currentLockContent = fs.existsSync(lockFilePath) ? fs.readFileSync(lockFilePath) : Buffer.from('');
  const currentLockHash = crypto.createHash('md5').update(currentLockContent).digest('hex');
  const previousLockHash = fs.existsSync(hashFilePath) ? fs.readFileSync(hashFilePath, 'utf-8').trim() : '';

  const hasNodeModules = fs.existsSync(nodeModulesPath);
  const isLockUnchanged = hasNodeModules && previousLockHash === currentLockHash;

  if (isLockUnchanged) {
    console.log('[Builder] node_modules intatto e package-lock.json invariato. Skip npm ci!');
    return;
  }

  console.log('[Builder] Installazione dipendenze ultra-veloce (npm ci con cache /tmp/.npm-cache)...');
  const npmCacheDir = '/tmp/.npm-cache';
  fs.mkdirSync(npmCacheDir, { recursive: true });

  execSync(
    `npm ci --prefer-offline --no-audit --no-fund --progress=false --cache=${npmCacheDir}`,
    {
      cwd: targetDir,
      stdio: 'pipe',
      env: {
        ...process.env,
        npm_config_cache: npmCacheDir,
      },
    }
  );

  fs.writeFileSync(hashFilePath, currentLockHash, 'utf-8');
  console.log('[Builder] Dipendenze installate con successo.');
}

export function runBuild(targetDir: string): { success: boolean; output: string } {
  try {
    const output = execSync('npm run build', {
      cwd: targetDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NG_PERSISTENT_BUILD_CACHE: '1',
        NG_CLI_ANALYTICS: 'false',
        NODE_OPTIONS: '--max-old-space-size=3584',
      },
    });
    return { success: true, output };
  } catch (error: any) {
    const errorOutput =
      (error.stdout || '') + '\n' + (error.stderr || '') + '\n' + (error.message || '');
    return { success: false, output: errorOutput };
  }
}

export function deployHosting(targetDir: string, project: string): string {
  console.log(`[Deploy] Deploying Hosting su ${project}...`);
  return execSync(
    `npx firebase deploy --only hosting --project ${project}`,
    { cwd: targetDir, encoding: 'utf-8' }
  );
}

export async function executeInCloudHotfix({
  userText = '',
  imageBuffer = null,
  audioBuffer = null,
  chatId,
  progressMessageId,
  deployTarget = 'both',
}: {
  userText?: string;
  imageBuffer?: Buffer | null;
  audioBuffer?: Buffer | null;
  chatId: string | number;
  progressMessageId?: number;
  deployTarget?: 'dev' | 'both';
}): Promise<void> {
  const targetDir = CONFIG.tmpWorkspace;

  async function updateProgress(msg: string) {
    console.log(`[CloudHotfix] ${msg}`);
    await sendChatAction(chatId, 'typing');
    if (progressMessageId) {
      try {
        await editMessageText(chatId, progressMessageId, msg);
        return;
      } catch (err: any) {
        console.warn('[CloudHotfix] editMessageText fallito:', err.message);
      }
    }
    await sendMessage(chatId, msg);
  }

  try {
    // 0. Preparazione o ripristino veloce workspace (Warm Instance: reset 1s)
    const { isWarm } = await prepareWorkspace(targetDir);
    console.log(`[CloudHotfix] Workspace pronto (isWarm: ${isWarm})`);

    // 1/4 Analisi e generazione patch con Gemini 3.8 Flash High
    await updateProgress('1/4 🧠 <b>Analisi e generazione patch con Gemini 3.8 Flash High...</b>');
    const allFiles = scanSrcFiles(targetDir);
    const words = (userText || '')
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.replace(/[^a-z0-9]/g, ''))
      .filter((w) => w.length >= 3);

    const relevantFiles = findRelevantFiles(targetDir, words).slice(0, 15);
    const filesContext: Record<string, string> = {};
    for (const relPath of relevantFiles) {
      const full = path.join(targetDir, relPath);
      if (fs.existsSync(full)) {
        const text = fs.readFileSync(full, 'utf-8');
        if (text.length < 40000) filesContext[relPath] = text;
      }
    }

    const plan = await planAndGeneratePatch({
      userText,
      imageBuffer,
      audioBuffer,
      filesContext,
      availableFilePaths: allFiles,
    });

    if (!plan.patches || plan.patches.length === 0) {
      throw new Error('Nessuna patch generata da Gemini per questa richiesta.');
    }

    // Applica patch
    const touchedFiles = applyPatches(targetDir, plan.patches);

    // Release notes & bump versione
    const newVersion = updateReleaseNotesAndBump(targetDir, plan);

    // 2/4 Build Angular in corso (con cache /tmp)
    await updateProgress('2/4 🔨 <b>Build Angular in corso (con cache /tmp)...</b>');
    ensureDependencies(targetDir);

    let buildResult = runBuild(targetDir);
    let attempt = 1;
    const maxAttempts = 3;

    while (!buildResult.success && attempt <= maxAttempts) {
      await updateProgress(
        `2/4 🩹 <b>Auto-correzione codice con Gemini (Tentativo ${attempt}/${maxAttempts})...</b>`
      );
      try {
        const fixedPatches = await selfHealBuildErrors({
          errorOutput: buildResult.output,
          appliedPatches: plan.patches,
          attempt,
        });

        if (Array.isArray(fixedPatches) && fixedPatches.length > 0) {
          applyPatches(targetDir, fixedPatches);
          buildResult = runBuild(targetDir);
        } else {
          break;
        }
      } catch (err: any) {
        console.error(`[SelfHealing] Errore al tentativo ${attempt}:`, err);
        break;
      }
      attempt++;
    }

    if (!buildResult.success) {
      throw new Error(`Build Angular fallita dopo tentativi di auto-correzione:\n${buildResult.output.slice(-500)}`);
    }

    // 3/4 Deploy su hosting e branch Git
    const isOnlyDev = deployTarget === 'dev';
    await updateProgress(
      isOnlyDev
        ? '3/4 🚀 <b>Deploy su DEV (PROD escluso da tua scelta)...</b>'
        : '3/4 🚀 <b>Deploy su DEV e PROD...</b>'
    );
    const safeSlug = (plan.slug || 'fix')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 30);
    const branchName = `hotfix/v${newVersion}-${safeSlug}`;

    commitAndPush(targetDir, branchName, `fix(hotfix): ${plan.title} v${newVersion}`);

    const prResult = await createPullRequest(
      branchName,
      `Hotfix v${newVersion}: ${plan.title}`,
      `Automated In-Cloud Hotfix generato da Firebase Cloud Functions v2 (@CalcettoHotfixBot).\n\n- **Versione:** v${newVersion}\n- **Deploy:** ${isOnlyDev ? 'Solo DEV' : 'DEV + PROD'}\n- **Verifica build:** PASS (100% verde)`
    );

    // Deploy Hosting su DEV
    try {
      deployHosting(targetDir, CONFIG.firebaseDev);
    } catch (err: any) {
      console.warn('[Deploy DEV] Warning:', err.message);
    }

    // Deploy Hosting su PROD solo se richiesto
    if (!isOnlyDev) {
      try {
        deployHosting(targetDir, CONFIG.firebaseProd);
      } catch (err: any) {
        console.warn('[Deploy PROD] Warning:', err.message);
      }
    }

    // 4/4 Completato! Ecco i link
    await updateProgress('4/4 ✅ <b>Completato! Invio link e resoconto...</b>');

    // Notifica Telegram finale
    const userNotesList = (plan.userChanges || [])
      .map((c) => `  • ${escapeHtml(c)}`)
      .join('\n');
    const superUserNotesList = (plan.superUserChanges || [])
      .map((c) => `  • ${escapeHtml(c)}`)
      .join('\n');
    const filesList = touchedFiles
      .map((f) => `  <code>${escapeHtml(f)}</code>`)
      .join('\n');

    let finalMsg = `🎉 <b>HOTFIX IN-CLOUD COMPLETATO CON SUCCESSO!</b>\n\n`;
    finalMsg += `🔖 <b>Versione:</b> v${newVersion}\n`;
    finalMsg += `📝 <b>Titolo:</b> ${escapeHtml(plan.title)}\n\n`;

    if (userNotesList) finalMsg += `👥 <b>Novità Giocatori:</b>\n${userNotesList}\n\n`;
    if (superUserNotesList) finalMsg += `🛠 <b>Dettagli Tecnici SuperUser:</b>\n${superUserNotesList}\n\n`;

    finalMsg += `📂 <b>File Modificati:</b>\n${filesList}\n\n`;
    finalMsg += `🌍 <b>Ambienti Live:</b>\n`;
    finalMsg += `• 🧪 <b>DEV (Aggiornato):</b> <a href="${CONFIG.urlDev}">${CONFIG.urlDev}</a>\n`;
    if (!isOnlyDev) {
      finalMsg += `• 🌐 <b>PROD (Aggiornato):</b> <a href="${CONFIG.urlProd}">${CONFIG.urlProd}</a>\n\n`;
    } else {
      finalMsg += `• 🌐 <b>PROD:</b> Invariato (testa su DEV, poi usa /merge su main quando vuoi)\n\n`;
    }

    finalMsg += `🌿 <b>Branch Git:</b> <code>${branchName}</code>\n`;
    if (prResult.prUrl) {
      finalMsg += `🔗 <b>Pull Request:</b> <a href="${prResult.prUrl}">${prResult.prUrl}</a>\n\n`;
    }

    finalMsg += `<b>Comandi Rapidi:</b>\n`;
    finalMsg += `• <code>/merge</code> per unire su main e aggiornare PROD\n`;
    finalMsg += `• <code>/discard</code> per annullare e cancellare il branch\n`;

    const inlineKeyboard: any[][] = [
      [
        { text: isOnlyDev ? '✅ Merge su Main (PROD)' : '✅ Merge su Main', callback_data: `merge:${branchName}` },
        { text: '🗑 Scarta Hotfix', callback_data: `discard:${branchName}` },
      ],
      [
        { text: '🧪 Apri App DEV', url: CONFIG.urlDev },
        ...(!isOnlyDev ? [{ text: '🌐 Apri App PROD', url: CONFIG.urlProd }] : []),
      ],
    ];

    if (prResult.prUrl) {
      inlineKeyboard.push([{ text: '🔗 Visualizza PR', url: prResult.prUrl }]);
    }

    await sendMessage(chatId, finalMsg, {
      reply_markup: {
        inline_keyboard: inlineKeyboard,
      },
    });
  } catch (err: any) {
    console.error('[CloudHotfix] Errore critico:', err);
    await sendMessage(
      chatId,
      `❌ <b>Errore durante l'Hotfix in Cloud:</b>\n<code>${escapeHtml(err.message)}</code>`
    );
  }
}

