import { GoogleGenAI } from '@google/genai';
import { CONFIG } from './config';

function getAiClient(): GoogleGenAI {
  const apiKey = CONFIG.geminiApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY non configurata nelle Cloud Functions!');
  }
  return new GoogleGenAI({ apiKey, apiVersion: 'v1beta' });
}

export interface PatchItem {
  path: string;
  content: string;
}

export interface HotfixPlan {
  title: string;
  slug: string;
  userChanges: string[];
  superUserChanges: string[];
  patches: PatchItem[];
}

export async function callGemini({
  parts = [],
  systemInstruction = '',
  responseSchema = null,
}: {
  parts: any[];
  systemInstruction?: string;
  responseSchema?: any;
}): Promise<string> {
  const ai = getAiClient();
  const primaryModel = CONFIG.geminiModel || process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  // Fallback chain: prova il primario, poi gemini-2.5-pro, poi gemini-2.0-flash se ci sono sovraccarichi 503
  const candidateModels = Array.from(
    new Set([primaryModel, 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'])
  );

  const baseConfig: Record<string, any> = {};
  if (systemInstruction) {
    baseConfig.systemInstruction = systemInstruction;
  }
  if (responseSchema) {
    baseConfig.responseMimeType = 'application/json';
    baseConfig.responseSchema = responseSchema;
  }

  let lastError: any = null;

  for (const model of candidateModels) {
    console.log(`[Gemini] Tento generazione con modello ${model}...`);
    // I modelli 2.5 supportano thinking, i modelli 2.0 non lo supportano
    const supportsThinking = model.includes('2.5');
    const modelConfig = supportsThinking
      ? { ...baseConfig, thinkingConfig: { thinkingBudget: -1 } }
      : baseConfig;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: parts,
          config: modelConfig,
        });

        const textOutput = response.text;
        if (textOutput) return textOutput;
      } catch (err: any) {
        lastError = err;
        const errStr = String(err.message || err);

        // Se il modello rifiuta thinkingConfig, riprova senza thinking
        if (errStr.includes('Thinking') || errStr.includes('thinking')) {
          console.warn(`[Gemini] thinkingConfig rifiutato su ${model}, riprovo in modalità standard...`);
          try {
            const response = await ai.models.generateContent({
              model,
              contents: parts,
              config: baseConfig,
            });

            const textOutput = response.text;
            if (textOutput) return textOutput;
          } catch (innerErr: any) {
            lastError = innerErr;
            const innerStr = String(innerErr.message || innerErr);
            if (
              innerStr.includes('503') ||
              innerStr.includes('demand') ||
              innerStr.includes('UNAVAILABLE') ||
              innerStr.includes('429')
            ) {
              console.warn(`[Gemini] Modello ${model} temporaneamente sovraccarico (503), passo al successivo...`);
              await new Promise((r) => setTimeout(r, 1000));
              break;
            }
          }
        } else if (
          errStr.includes('503') ||
          errStr.includes('demand') ||
          errStr.includes('UNAVAILABLE') ||
          errStr.includes('429')
        ) {
          console.warn(`[Gemini] Modello ${model} sovraccarico (tentativo ${attempt}/2)...`);
          await new Promise((r) => setTimeout(r, 1500));
          if (attempt === 2) {
            console.warn(`[Gemini] ${model} ancora occupato, passo al modello successivo...`);
          }
        } else {
          // Errore non recuperabile su questo modello (es. 404 o incompatibilità), passa al modello successivo
          console.warn(`[Gemini] Errore su ${model}: ${errStr}, provo modello alternativo...`);
          break;
        }
      }
    }
  }

  throw lastError || new Error('Nessun modello Gemini ha risposto con successo.');
}

export async function planAndGeneratePatch({
  userText = '',
  imageBuffer = null,
  audioBuffer = null,
  filesContext = {},
  availableFilePaths = [],
}: {
  userText?: string;
  imageBuffer?: Buffer | null;
  audioBuffer?: Buffer | null;
  filesContext?: Record<string, string>;
  availableFilePaths?: string[];
}): Promise<HotfixPlan> {
  const parts: any[] = [];

  if (audioBuffer) {
    parts.push({
      inlineData: {
        mimeType: 'audio/ogg',
        data: audioBuffer.toString('base64'),
      },
    });
  }

  if (imageBuffer) {
    parts.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: imageBuffer.toString('base64'),
      },
    });
  }

  let promptText = `L'utente ha inviato una richiesta di Hotfix per l'applicazione Ionic / Angular 20 "Calcetto Abbuffo".\n`;
  if (userText) {
    promptText += `\nIstruzioni testuali / trascrizione: "${userText}"\n`;
  }
  if (audioBuffer) {
    promptText += `\nÈ allegato un messaggio vocale inviato dal campo da calcetto: ascolta con attenzione l'audio in italiano e comprendi esattamente cosa deve essere corretto o modificato.\n`;
  }
  if (imageBuffer) {
    promptText += `\nÈ allegato uno screenshot: esamina attentamente l'interfaccia grafica, l'errore visivo o il componente mostrato per applicare il fix corrispondente.\n`;
  }

  promptText += `\nAlbero file principali del progetto disponibili in src/:\n${availableFilePaths.slice(0, 150).join('\n')}\n`;

  if (Object.keys(filesContext).length > 0) {
    promptText += `\nContenuto dei file correlati attualmente sul disco:\n`;
    for (const [p, content] of Object.entries(filesContext)) {
      promptText += `\n--- INIZIO FILE: ${p} ---\n${content}\n--- FINE FILE: ${p} ---\n`;
    }
  }

  promptText += `\nGenera la risposta in formato JSON rispettando rigorosamente lo schema:
- title: titolo sintetico dell'aggiornamento (in italiano)
- slug: breve slug descrittivo in formato kebab-case (es. fix-timer-tap, fix-pulsante-presenza)
- userChanges: array di stringhe descrittive delle novità/correzioni utili per i Giocatori (in italiano)
- superUserChanges: array di stringhe descrittive delle novità tecniche per il SuperUser / Admin (in italiano)
- patches: array di oggetti { path: string, content: string } contenenti l'INTERO contenuto aggiornato e corretto di ogni file modificato.

ATTENZIONE - REGOLE ASSOLUTE SULLE PATCH:
1. Modifica SOLTANTO i file reali del progetto. NON inventare file né sostituire interi componenti complessi con mockup o simulazioni ridotte (es. MAI fare 'Simulo una card...').
2. In 'patches[].content' devi restituire il file COMPLETO al 100%, preservando tutti gli import, tutte le funzioni, tutti i metodi del component e l'intero template HTML/SCSS preesistente, cambiando solo ed esclusivamente le righe necessarie per soddisfare la richiesta.
3. MAI omettere codice o scrivere commenti placeholder come '// resto del file invariato'.`;

  parts.push({ text: promptText });

  const systemInstruction = `Sei l'AI Senior Software Engineer per l'app mobile Ionic + Angular 20 "Calcetto Abbuffo" in esecuzione su Firebase Cloud Functions v2.
Stai operando in modalità High Thinking per analizzare con il massimo livello di ragionamento la richiesta multimodale.
La tua missione è capire istantaneamente il problema dal testo, dallo screenshot o dal messaggio vocale, identificare i file sorgente corretti in src/ e restituire il codice completo corretto pronto per passare "npm run build" senza nessun errore TypeScript.
Devi sempre preservare la totalità dell'architettura esistente, senza mai distruggere il codice reale sostituendolo con template finti o simulazioni.
Devi sempre restituire ESCLUSIVAMENTE JSON valido.`;

  const responseSchema = {
    type: 'OBJECT',
    properties: {
      title: { type: 'STRING' },
      slug: { type: 'STRING' },
      userChanges: {
        type: 'ARRAY',
        items: { type: 'STRING' },
      },
      superUserChanges: {
        type: 'ARRAY',
        items: { type: 'STRING' },
      },
      patches: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            path: { type: 'STRING' },
            content: { type: 'STRING' },
          },
          required: ['path', 'content'],
        },
      },
    },
    required: ['title', 'slug', 'userChanges', 'superUserChanges', 'patches'],
  };

  const rawJson = await callGemini({ parts, systemInstruction, responseSchema });
  return JSON.parse(rawJson);
}

export async function selfHealBuildErrors({
  errorOutput,
  appliedPatches = [],
  attempt = 1,
}: {
  errorOutput: string;
  appliedPatches: PatchItem[];
  attempt: number;
}): Promise<PatchItem[]> {
  const parts = [
    {
      text: `La compilazione Angular (npm run build) è FALLITA al tentativo #${attempt} con i seguenti errori del compilatore TypeScript:\n\n${errorOutput}\n\nEcco le patch che erano state applicate:\n${JSON.stringify(appliedPatches, null, 2)}\n\nCorreggi immediatamente gli errori TypeScript/Angular e restituisci il codice completo corretto per i file che generano errore.`,
    },
  ];

  const systemInstruction = `Sei un esperto risolutore di errori TypeScript e compilatore Angular 20 in modalità High Thinking su Firebase Cloud Functions.
Analizza il log di errore, identifica esattamente le righe o i tipi che falliscono la compilazione e correggi i file.
Restituisci ESCLUSIVAMENTE un array JSON di oggetti { path: string, content: string } contenenti il file completo corretto.`;

  const responseSchema = {
    type: 'ARRAY',
    items: {
      type: 'OBJECT',
      properties: {
        path: { type: 'STRING' },
        content: { type: 'STRING' },
      },
      required: ['path', 'content'],
    },
  };

  const rawJson = await callGemini({ parts, systemInstruction, responseSchema });
  return JSON.parse(rawJson);
}

