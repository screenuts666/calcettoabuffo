import { GoogleGenAI, ThinkingLevel } from '@google/genai';
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
  const model = CONFIG.geminiModel || process.env.GEMINI_MODEL || 'gemini-3.8-flash';

  const config: Record<string, any> = {
    thinkingConfig: {
      thinkingLevel: ThinkingLevel.HIGH, // Forza modalità High Thinking
    },
  };

  if (systemInstruction) {
    config.systemInstruction = systemInstruction;
  }

  if (responseSchema) {
    config.responseMimeType = 'application/json';
    config.responseSchema = responseSchema;
  }

  const response = await ai.models.generateContent({
    model,
    contents: parts,
    config,
  });

  const textOutput = response.text;
  if (!textOutput) {
    throw new Error('Risposta vuota o priva di testo generato da Gemini API');
  }

  return textOutput;
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
- patches: array di oggetti { path: string, content: string } contenenti l'INTERO contenuto aggiornato e corretto di ogni file modificato. NON omettere parti di codice e mantieni tutti gli import e logiche esistenti non modificate.`;

  parts.push({ text: promptText });

  const systemInstruction = `Sei l'AI Senior Software Engineer per l'app mobile Ionic + Angular 20 "Calcetto Abbuffo" in esecuzione su Firebase Cloud Functions v2.
Stai operando con Gemini 3.8 Flash in modalità High Thinking per analizzare con il massimo livello di ragionamento la richiesta multimodale.
La tua missione è capire istantaneamente il problema dal testo, dallo screenshot o dal messaggio vocale, identificare i file sorgente corretti in src/ e restituire il codice completo corretto pronto per passare "npm run build" senza nessun errore TypeScript.
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

