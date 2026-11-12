import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

// Environment & Configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPOSITORY =
  process.env.GITHUB_REPOSITORY || "screenuts666/calcettoabuffo";
const RAW_PAYLOAD = process.env.CLIENT_PAYLOAD || "{}";

let payload = {};
try {
  payload = JSON.parse(RAW_PAYLOAD);
} catch {
  console.warn("[Runner] Impossibile parsare CLIENT_PAYLOAD come JSON");
}

const {
  taskId = `hotfix-${Date.now()}`,
  prompt: userPrompt = "",
  chatId,
  progressMessageId,
  deployTarget = "dev",
  imageUrl,
} = payload;

// ─── TELEGRAM HELPERS ────────────────────────────────────────────────────────
async function editOrSendMessage(text, inlineKeyboard = null) {
  if (!TELEGRAM_BOT_TOKEN || !chatId) {
    console.log("[Telegram Mock]:\n", text);
    return;
  }

  const payloadData = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  if (inlineKeyboard) {
    payloadData.reply_markup = { inline_keyboard: inlineKeyboard };
  }

  if (progressMessageId) {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payloadData,
            message_id: progressMessageId,
          }),
        },
      );
      if (res.ok) return;
    } catch (err) {
      console.warn(
        "[Telegram] editMessageText fallito, invio nuovo messaggio:",
        err.message,
      );
    }
  }

  try {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadData),
      },
    );
  } catch (err) {
    console.warn("[Telegram] sendMessage fallito:", err.message);
  }
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ─── GEMINI CLIENT (DIRECT REST API WITH AUTOMATIC MULTI-MODEL FALLBACK) ────
const CANDIDATE_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.8-pro",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
];

async function callGemini({
  parts,
  systemInstruction = "",
  jsonMode = false,
  model = null,
}) {
  if (!GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY non configurata nei secrets di GitHub Actions!",
    );
  }

  const modelsToTry = model ? [model] : CANDIDATE_MODELS;
  let lastError = null;

  for (const currentModel of modelsToTry) {
    try {
      console.log(`[Gemini] Invio richiesta al modello: ${currentModel}...`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${GEMINI_API_KEY}`;

      const body = {
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
        },
      };

      if (systemInstruction) {
        body.systemInstruction = {
          parts: [{ text: systemInstruction }],
        };
      }

      if (jsonMode) {
        body.generationConfig.responseMimeType = "application/json";
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorText = await res.text();
        // Se è modello non trovato (404), quota superata (429) o sovraccarico (503), prova il successivo
        if (res.status === 404 || res.status === 429 || res.status === 503) {
          console.warn(
            `[Gemini] Modello ${currentModel} ha restituito ${res.status}. Tento fallback su modello alternativo...`,
          );
          lastError = new Error(
            `Gemini API Error (${res.status}) su ${currentModel}: ${errorText}`,
          );
          continue;
        }
        throw new Error(
          `Gemini API Error (${res.status}) su ${currentModel}: ${errorText}`,
        );
      }

      const data = await res.json();
      const candidate = data.candidates?.[0];
      if (!candidate) {
        throw new Error(`Nessuna risposta generata da Gemini (${currentModel})`);
      }

      const finishReason = candidate.finishReason;
      if (finishReason && finishReason !== "STOP") {
        console.warn(
          `[Gemini] Attenzione: finishReason è ${finishReason} su modello ${currentModel}`,
        );
      }

      const textPart = candidate.content?.parts?.[0]?.text || "";
      console.log(`[Gemini] Risposta ottenuta con successo da ${currentModel}!`);
      return textPart.trim();
    } catch (err) {
      lastError = err;
      if (
        err.message &&
        (err.message.includes("404") ||
          err.message.includes("429") ||
          err.message.includes("503"))
      ) {
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}

// ─── FILE SCANNER ───────────────────────────────────────────────────────────
function scanFiles(dir) {
  const fileList = [];
  function walk(current) {
    if (!fs.existsSync(current)) return;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!["node_modules", ".git", "www", ".nx", ".angular"].includes(entry.name)) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if ([".ts", ".html", ".scss", ".json"].includes(ext)) {
          fileList.push(
            path.relative(rootDir, fullPath).replace(/\\/g, "/"),
          );
        }
      }
    }
  }
  walk(dir);
  return fileList;
}

// ─── SNIPPET REPLACEMENT (ZERO TRUNCATION) ──────────────────────────────────
function applyPatches(patches) {
  const modifiedFiles = [];

  for (const patch of patches) {
    const filePath = path.resolve(rootDir, patch.path);
    const relPath = path.relative(rootDir, filePath).replace(/\\/g, "/");

    if (!patch.search) {
      // Creazione o sovrascrittura totale
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, patch.replace, "utf-8");
      modifiedFiles.push(relPath);
      continue;
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`File target non trovato: ${relPath}`);
    }

    let content = fs.readFileSync(filePath, "utf-8");

    // Tentativo match esatto
    if (content.includes(patch.search)) {
      content = content.replace(patch.search, patch.replace);
      fs.writeFileSync(filePath, content, "utf-8");
      modifiedFiles.push(relPath);
      continue;
    }

    // Normalizzazione \r\n -> \n
    const normContent = content.replace(/\r\n/g, "\n");
    const normSearch = patch.search.replace(/\r\n/g, "\n");
    const normReplace = patch.replace.replace(/\r\n/g, "\n");

    if (normContent.includes(normSearch)) {
      const updated = normContent.replace(normSearch, normReplace);
      fs.writeFileSync(filePath, updated, "utf-8");
      modifiedFiles.push(relPath);
      continue;
    }

    throw new Error(
      `Snippet 'search' non trovato nel file ${relPath}!\nSnippet cercato:\n${patch.search.slice(0, 150)}...`,
    );
  }

  return [...new Set(modifiedFiles)];
}

// ─── AGGIORNAMENTO RELEASE NOTES BOZZA (NEXT) ────────────────────────────────
function injectNextReleaseNotes(title, userChanges, superUserChanges) {
  const relNotesPath = path.join(rootDir, "public", "release-notes.json");
  let notes = [];
  if (fs.existsSync(relNotesPath)) {
    try {
      notes = JSON.parse(fs.readFileSync(relNotesPath, "utf-8"));
    } catch {
      notes = [];
    }
  }

  const nextEntry = {
    version: "NEXT",
    date: new Date().toISOString().split("T")[0],
    title: title || "Hotfix da remoto",
    userChanges: Array.isArray(userChanges) ? userChanges : [userChanges].filter(Boolean),
    superUserChanges: Array.isArray(superUserChanges)
      ? superUserChanges
      : [superUserChanges].filter(Boolean),
  };

  if (notes.length > 0 && notes[0].version === "NEXT") {
    notes[0] = nextEntry;
  } else {
    notes.unshift(nextEntry);
  }

  fs.writeFileSync(relNotesPath, JSON.stringify(notes, null, 2), "utf-8");
  console.log("[Runner] Aggiornato public/release-notes.json con bozza NEXT.");
}

// ─── VERIFICA COMPILAZIONE ──────────────────────────────────────────────────
function verifyBuild() {
  try {
    console.log("[Runner] Esecuzione verifica build Angular...");
    execSync("npm run build", { cwd: rootDir, stdio: "pipe" });
    return { success: true, error: "" };
  } catch (err) {
    const stdout = err.stdout ? err.stdout.toString() : "";
    const stderr = err.stderr ? err.stderr.toString() : "";
    const combined = `${stdout}\n${stderr}`;
    // Estrai le righe più significative di errore
    const errorLines = combined
      .split("\n")
      .filter((line) => /error|TS\d+|NG\d+|failed/i.test(line))
      .slice(0, 20)
      .join("\n");
    return {
      success: false,
      error: errorLines || combined.slice(-1500),
    };
  }
}

// ─── MAIN ORCHESTRATION ─────────────────────────────────────────────────────
async function main() {
  console.log(`[Runner] Avvio hotfix task ${taskId}...`);
  await editOrSendMessage(
    `⚡ <b>[1/4] Runner Cloud Attivo su GitHub Actions!</b>\n` +
      `🆔 Task: <code>${taskId}</code>\n` +
      `🔍 Scansione repository e selezione file rilevanti in corso...`,
  );

  const allFiles = scanFiles(path.join(rootDir, "src"));
  console.log(`[Runner] Indicizzati ${allFiles.length} file in src/.`);

  // Scarica eventuale immagine se fornita
  let imagePart = null;
  if (imageUrl) {
    try {
      const imgRes = await fetch(imageUrl);
      if (imgRes.ok) {
        const arrBuf = await imgRes.arrayBuffer();
        const b64 = Buffer.from(arrBuf).toString("base64");
        imagePart = {
          inlineData: {
            mimeType: "image/jpeg",
            data: b64,
          },
        };
      }
    } catch (err) {
      console.warn("[Runner] Impossibile scaricare immagine da imageUrl:", err.message);
    }
  }

  // 1. CHIEDI A GEMINI DI SELEZIONARE I FILE CANDIDATI
  const candidatePrompt =
    `Dato questo elenco di file del progetto Angular/Ionic "Calcetto Abbuffo":\n` +
    allFiles.slice(0, 150).join("\n") +
    `\n\nIdentifica i file (massimo 5) più rilevanti per risolvere questa richiesta:\n"${userPrompt}"\n\n` +
    `Rispondi con un array JSON di stringhe con i path relativi dei file, ad es: ["src/app/services/timer.service.ts"]`;

  let candidateFiles = [];
  try {
    const rawFiles = await callGemini({
      parts: [{ text: candidatePrompt }],
      jsonMode: true,
    });
    candidateFiles = JSON.parse(rawFiles);
  } catch (err) {
    console.warn("[Runner] Fallita selezione intelligente file, uso fallback euristico.");
    candidateFiles = allFiles.filter((f) =>
      /partit|timer|cronometro|giocator/i.test(f),
    ).slice(0, 5);
  }

  console.log("[Runner] File candidati identificati:", candidateFiles);

  // 2. CARICA CONTENUTO DEI FILE CANDIDATI
  const filesContext = candidateFiles
    .filter((f) => fs.existsSync(path.resolve(rootDir, f)))
    .map((f) => {
      const content = fs.readFileSync(path.resolve(rootDir, f), "utf-8");
      return `=== FILE: ${f} ===\n${content}\n=== FINE FILE ===`;
    })
    .join("\n\n");

  await editOrSendMessage(
    `⚙️ <b>[2/4] Elaborazione fix con Gemini 2.5 Flash...</b>\n` +
      `📁 File analizzati: ${candidateFiles.map((f) => `<code>${escapeHtml(path.basename(f))}</code>`).join(", ")}`,
  );

  // 3. GENERA PATCH MIRATE
  const patchSystemInstruction =
    `Sei il Principal Engineer del progetto "Calcetto Abbuffo" (Angular 18, Ionic, TypeScript).\n` +
    `Il tuo compito è risolvere la richiesta dell'utente applicando patch CHIRURGICHE a blocchi (snippet search/replace).\n` +
    `REGOLE FONDAMENTALI:\n` +
    `1. NON riscrivere interi file lunghi. Fornisci blocchi di snippet 'search' e 'replace' compatti per minimizzare l'output e prevenire troncamenti.\n` +
    `2. 'search' DEVE contenere la porzione esatta di codice presente nel file.\n` +
    `3. Scrivi note di rilascio chiare in italiano: 'userChanges' per i giocatori, 'superUserChanges' per l'admin.\n` +
    `4. Ritorna ESCLUSIVAMENTE un JSON conforme a questo schema:\n` +
    `{\n` +
    `  "title": "Titolo breve del fix",\n` +
    `  "userChanges": ["Modifica 1 visibile all'utente"],\n` +
    `  "superUserChanges": ["Dettaglio tecnico per admin"],\n` +
    `  "patches": [\n` +
    `    {\n` +
    `      "path": "path/relativo/file.ts",\n` +
    `      "search": "codice esatto da sostituire",\n` +
    `      "replace": "nuovo codice correttivo"\n` +
    `    }\n` +
    `  ]\n` +
    `}`;

  const promptParts = [
    {
      text:
        `Richiesta dell'utente:\n"${userPrompt}"\n\n` +
        `Ecco il contenuto dei file di contesto:\n${filesContext}`,
    },
  ];
  if (imagePart) promptParts.push(imagePart);

  const planResponse = await callGemini({
    parts: promptParts,
    systemInstruction: patchSystemInstruction,
    jsonMode: true,
  });

  const plan = JSON.parse(planResponse);
  console.log(`[Runner] Piano generato: "${plan.title}", ${plan.patches?.length || 0} patch.`);

  // 4. APPLICA PATCH E RELEASE NOTES BOZZA
  injectNextReleaseNotes(plan.title, plan.userChanges, plan.superUserChanges);
  const modifiedFiles = applyPatches(plan.patches || []);

  await editOrSendMessage(
    `🧪 <b>[3/4] Modifiche applicate. Verifica build Angular in corso...</b>\n` +
      `📝 Titolo: <b>${escapeHtml(plan.title)}</b>\n` +
      `✏️ File toccati: ${modifiedFiles.map((f) => `<code>${escapeHtml(f)}</code>`).join(", ")}`,
  );

  // 5. CICLO DI COMPILAZIONE & AUTO-HEALING
  let buildResult = verifyBuild();
  let healAttempts = 0;

  while (!buildResult.success && healAttempts < 2) {
    healAttempts++;
    console.warn(`[Runner] Build fallita. Tentativo di Auto-Healing #${healAttempts}...`);
    await editOrSendMessage(
      `⚠️ <b>[3/4] Build Angular fallita al tentativo #${healAttempts}. Auto-healing con Gemini in corso...</b>`,
    );

    const healingPrompt =
      `La build Angular è fallita con i seguenti errori di compilazione:\n` +
      `${buildResult.error}\n\n` +
      `Ecco le patch che avevi applicato:\n${JSON.stringify(plan.patches, null, 2)}\n\n` +
      `Fornisci una nuova lista di 'patches' correttive per risolvere l'errore di TypeScript/Angular.\n` +
      `Rispondi ESCLUSIVAMENTE con un JSON contenente: {"patches": [{"path": "...", "search": "...", "replace": "..."}]}`;

    try {
      const healRes = await callGemini({
        parts: [{ text: healingPrompt }],
        systemInstruction: patchSystemInstruction,
        jsonMode: true,
      });
      const healPlan = JSON.parse(healRes);
      applyPatches(healPlan.patches || []);
      buildResult = verifyBuild();
    } catch (err) {
      console.error("[Runner] Errore durante auto-healing:", err.message);
      break;
    }
  }

  if (!buildResult.success) {
    const errorSnippet = escapeHtml(buildResult.error.slice(0, 500));
    await editOrSendMessage(
      `❌ <b>Hotfix Fallito: Impossibile superare la build Angular</b>\n\n` +
        `<b>Dettaglio errori:</b>\n<pre>${errorSnippet}</pre>\n\n` +
        `Il branch è stato scartato per proteggere la codebase.`,
    );
    process.exit(1);
  }

  // 6. BUILD VERDE! BUMP VERSIONE DEFINITIVO
  console.log("[Runner] Build 100% verde! Esecuzione bump versione...");
  execSync("node scripts/bump-version.mjs", { cwd: rootDir, stdio: "inherit" });

  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf-8"));
  const newVersion = pkg.version;

  // 7. GIT COMMIT, PUSH & PULL REQUEST
  const branchName = `hotfix/${taskId}`;
  console.log(`[Runner] Creazione branch git ${branchName}...`);

  execSync("git config user.name 'Calcetto Remote Agent'", { cwd: rootDir });
  execSync("git config user.email 'bot@calcettoabbuffo.app'", { cwd: rootDir });
  execSync(`git checkout -b ${branchName}`, { cwd: rootDir });
  execSync("git add -A", { cwd: rootDir });
  execSync(`git commit -m "hotfix(${newVersion}): ${plan.title}"`, { cwd: rootDir });
  execSync(`git push origin ${branchName} --force`, { cwd: rootDir });

  // Creazione Pull Request su GitHub
  let prUrl = `https://github.com/${GITHUB_REPOSITORY}/tree/${branchName}`;
  let prNumber = null;

  if (GITHUB_TOKEN) {
    try {
      const prRes = await fetch(
        `https://api.github.com/repos/${GITHUB_REPOSITORY}/pulls`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${GITHUB_TOKEN}`,
            Accept: "application/vnd.github+json",
          },
          body: JSON.stringify({
            title: `Hotfix v${newVersion}: ${plan.title}`,
            head: branchName,
            base: "main",
            body:
              `## 🚀 Remote Hotfix Autonomo (Cloud Runner)\n\n` +
              `**Versione:** \`${newVersion}\`\n` +
              `**Task ID:** \`${taskId}\`\n\n` +
              `### 👥 Novità Giocatori:\n` +
              plan.userChanges.map((c) => `- ${c}`).join("\n") +
              `\n\n### 🔧 Note Tecniche (Admin):\n` +
              plan.superUserChanges.map((c) => `- ${c}`).join("\n") +
              `\n\n---\n*Generato automaticamente a PC spento via Telegram Hotfix Bot.*`,
          }),
        },
      );
      if (prRes.ok) {
        const prData = await prRes.json();
        prUrl = prData.html_url;
        prNumber = prData.number;
      }
    } catch (err) {
      console.warn("[Runner] Creazione PR via API fallita:", err.message);
    }
  }

  // Diff compatto
  const diffStat = execSync("git diff HEAD~1 --stat", { cwd: rootDir })
    .toString()
    .trim();

  // 8. NOTIFICA FINALE COMPATTA SU TELEGRAM
  const finalMessage =
    `🎉 <b>Hotfix v${newVersion} Completato con Successo!</b>\n\n` +
    `📌 <b>${escapeHtml(plan.title)}</b>\n\n` +
    `👥 <b>Giocatori:</b>\n` +
    plan.userChanges.map((c) => `• ${escapeHtml(c)}`).join("\n") +
    `\n\n🔧 <b>Admin:</b>\n` +
    plan.superUserChanges.map((c) => `• ${escapeHtml(c)}`).join("\n") +
    `\n\n📊 <b>Modifiche:</b>\n<pre>${escapeHtml(diffStat)}</pre>\n\n` +
    `🔗 <a href="${prUrl}"><b>Visualizza Pull Request #${prNumber || branchName}</b></a>`;

  const inlineKeyboard = [
    [
      { text: "🚀 Unisci su PROD (/merge)", callback_data: `merge:${branchName}` },
      { text: "🗑 Scarta (/discard)", callback_data: `discard:${branchName}` },
    ],
  ];

  await editOrSendMessage(finalMessage, inlineKeyboard);
  console.log(`[Runner] Hotfix ${taskId} completato e notificato con successo!`);
}

main().catch(async (err) => {
  console.error("[Runner FATAL]:", err);
  await editOrSendMessage(`🚨 <b>Errore Fatale nel Runner Cloud:</b>\n<code>${escapeHtml(err.message)}</code>`);
  process.exit(1);
});

