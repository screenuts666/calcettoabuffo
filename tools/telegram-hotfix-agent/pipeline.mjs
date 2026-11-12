import { CONFIG } from './config.mjs';
import {
  scanSrcFiles,
  findRelevantFiles,
  readFile,
  createBackup,
  rollbackBackup,
  clearBackup,
  applyPatches,
  updateReleaseNotesAndBump,
  runBuild,
  gitHotfixCommitAndPush,
  deployDev,
  deployProd,
} from './code-modifier.mjs';
import { planAndGeneratePatch, selfHealBuildErrors } from './gemini.mjs';
import { sendMessage, sendChatAction, escapeHtml } from './telegram.mjs';

/**
 * Esegue la pipeline completa di hotfix richiesta via Telegram
 */
export async function executeHotfixPipeline({
  userText = '',
  imageBuffer = null,
  audioBuffer = null,
  chatId,
}) {
  let statusMsgId = null;

  async function updateProgress(text) {
    console.log(`[Pipeline] ${text}`);
    if (chatId) {
      await sendChatAction(chatId, 'typing');
      try {
        if (!statusMsgId) {
          const sent = await sendMessage(chatId, text);
          statusMsgId = sent?.message_id;
        } else {
          // Invia nuovo aggiornamento progressivo
          await sendMessage(chatId, text);
        }
      } catch (err) {
        console.warn('[Pipeline] Errore invio progresso Telegram:', err.message);
      }
    }
  }

  try {
    // ─── 1. CONTEXT DISCOVERY & SCANSIONE FILE ──────────────────────────────
    await updateProgress('🔍 <b>1/6 Scansione e individuazione file coinvolti...</b>');
    const allFiles = scanSrcFiles();

    // Raccogli parole chiave dal testo per trovare file prioritari
    const words = (userText || '')
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.replace(/[^a-z0-9]/g, ''))
      .filter((w) => w.length >= 3);

    const relevantFiles = findRelevantFiles(words);
    const filesToRead = relevantFiles.slice(0, 15);

    const filesContext = {};
    for (const relPath of filesToRead) {
      const content = readFile(relPath);
      if (content && content.length < 40000) {
        filesContext[relPath] = content;
      }
    }

    // ─── 2. PIANIFICAZIONE & GENERAZIONE PATCH (MULTIMODALE) ────────────────
    await updateProgress('🧠 <b>2/6 Elaborazione multimodale Gemini 3.8 Flash (High Thinking) & generazione patch...</b>');
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

    // Backup di sicurezza prima di toccare il disco
    const targetPaths = plan.patches.map((p) => p.path);
    createBackup(targetPaths);

    // Applica le modifiche generate
    const touchedFiles = applyPatches(plan.patches);

    // ─── 3. BUMP VERSIONE & RELEASE NOTES ───────────────────────────────────
    await updateProgress('🚀 <b>3/6 Incremento versione & allineamento Release Notes...</b>');
    const newVersion = updateReleaseNotesAndBump({
      title: plan.title,
      userChanges: plan.userChanges,
      superUserChanges: plan.superUserChanges,
    });

    // ─── 4. TEST DI COMPILAZIONE & AUTO-FIX (SELF-HEALING) ─────────────────
    await updateProgress('⚙️ <b>4/6 Verifica compilazione Angular (npm run build)...</b>');
    let buildResult = runBuild();
    let attempt = 1;
    const maxAttempts = 3;

    while (!buildResult.success && attempt <= maxAttempts) {
      await updateProgress(
        `🩹 <b>Auto-correzione codice (Self-Healing attempt ${attempt}/${maxAttempts})...</b>`,
      );
      try {
        const fixedPatches = await selfHealBuildErrors({
          errorOutput: buildResult.output,
          appliedPatches: plan.patches,
          attempt,
        });

        if (Array.isArray(fixedPatches) && fixedPatches.length > 0) {
          applyPatches(fixedPatches);
          buildResult = runBuild();
        } else {
          break;
        }
      } catch (err) {
        console.error(`[SelfHealing] Errore al tentativo ${attempt}:`, err);
        break;
      }
      attempt++;
    }

    if (!buildResult.success) {
      await updateProgress(
        '❌ <b>Compilazione fallita dopo tentativi di auto-correzione. Eseguo rollback di sicurezza...</b>',
      );
      rollbackBackup();
      throw new Error(
        `Build Angular non superata:\n${buildResult.output.slice(-500)}`,
      );
    }

    clearBackup();

    // ─── 5. GIT & DEPLOY DOPPIO (DEV + PROD BRANCH) ────────────────────────
    await updateProgress('🌐 <b>5/6 Deploy su ambiente DEV...</b>');
    let devDeploySuccess = true;
    try {
      deployDev();
    } catch (err) {
      console.warn('[Deploy DEV] Warning:', err.message);
      devDeploySuccess = false;
    }

    await updateProgress('🌿 <b>Git: Creazione branch hotfix, commit e push...</b>');
    const { branchName, prUrl } = gitHotfixCommitAndPush({
      version: newVersion,
      slug: plan.slug,
      summary: plan.title,
    });

    await updateProgress('⚡ <b>Deploy su ambiente PROD (immediato per il campo)...</b>');
    let prodDeploySuccess = true;
    try {
      deployProd();
    } catch (err) {
      console.warn('[Deploy PROD] Warning:', err.message);
      prodDeploySuccess = false;
    }

    // ─── 6. NOTIFICA FINALE & RIEPILOGO TELEGRAM ────────────────────────────
    const userNotesList = (plan.userChanges || [])
      .map((c) => `  • ${escapeHtml(c)}`)
      .join('\n');
    const superUserNotesList = (plan.superUserChanges || [])
      .map((c) => `  • ${escapeHtml(c)}`)
      .join('\n');
    const filesList = touchedFiles
      .map((f) => `  <code>${escapeHtml(f)}</code>`)
      .join('\n');

    let finalMessage = `🎉 <b>HOTFIX COMPLETATO CON SUCCESSO!</b>\n\n`;
    finalMessage += `🔖 <b>Versione:</b> v${newVersion}\n`;
    finalMessage += `📝 <b>Titolo:</b> ${escapeHtml(plan.title)}\n\n`;

    if (userNotesList) {
      finalMessage += `👥 <b>Novità Giocatori:</b>\n${userNotesList}\n\n`;
    }
    if (superUserNotesList) {
      finalMessage += `🛠 <b>Dettagli Tecnici SuperUser:</b>\n${superUserNotesList}\n\n`;
    }

    finalMessage += `📂 <b>File Modificati:</b>\n${filesList}\n\n`;
    finalMessage += `🌍 <b>Ambienti Live:</b>\n`;
    finalMessage += `• <b>PROD:</b> <a href="${CONFIG.urlProd}">${CONFIG.urlProd}</a>\n`;
    finalMessage += `• <b>DEV:</b> <a href="${CONFIG.urlDev}">${CONFIG.urlDev}</a>\n\n`;

    finalMessage += `🌿 <b>Branch Git:</b> <code>${branchName}</code>\n`;
    if (prUrl) {
      finalMessage += `🔗 <b>Pull Request:</b> <a href="${prUrl}">${prUrl}</a>\n\n`;
    }

    finalMessage += `<b>Comandi Rapidi:</b>\n`;
    finalMessage += `• <code>/merge</code> per mergiare subito su main\n`;
    finalMessage += `• <code>/discard</code> per annullare e cancellare il branch\n`;

    if (chatId) {
      await sendMessage(chatId, finalMessage, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Merge su Main', callback_data: `merge:${branchName}` },
              { text: '🗑 Scarta Hotfix', callback_data: `discard:${branchName}` },
            ],
            [
              { text: '🌐 Apri App PROD', url: CONFIG.urlProd },
              ...(prUrl ? [{ text: '🔗 Visualizza PR', url: prUrl }] : []),
            ],
          ],
        },
      });
    }

    return {
      success: true,
      version: newVersion,
      branchName,
      prUrl,
      title: plan.title,
    };
  } catch (err) {
    console.error('[Pipeline] Errore critico:', err);
    if (chatId) {
      const errorMsg = `❌ <b>Errore durante l'Hotfix:</b>\n<code>${escapeHtml(err.message)}</code>`;
      await sendMessage(chatId, errorMsg);
    }
    throw err;
  }
}
