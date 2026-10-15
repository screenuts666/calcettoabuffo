import { Injectable, inject, signal } from '@angular/core';
import { Storage, ref, getDownloadURL, uploadBytes } from '@angular/fire/storage';
import { GeminiService } from './gemini.service';

@Injectable({
  providedIn: 'root',
})
export class TtsService {
  private geminiService = inject(GeminiService);
  private storage = inject(Storage);

  // Stato reattivo globale (Single Player)
  readonly isPlaying = signal<boolean>(false);
  readonly isLoadingAudio = signal<boolean>(false);
  readonly currentPlayingId = signal<string | null>(null);

  // Cache in memoria degli URL audio (cacheKey -> url o blobUrl)
  private audioCache = new Map<string, string>();

  // Elemento audio HTML condiviso per sbloccare l'audio sui browser mobile (iOS Safari / Android)
  private sharedAudio: HTMLAudioElement | null = null;
  private abortController: AbortController | null = null;
  private activeUtterance: SpeechSynthesisUtterance | null = null;
  private synthTimer: any = null;
  private cachedBestVoice: SpeechSynthesisVoice | null = null;
  private lastCleanedText: string = '';

  // Modelli Gemini TTS con supporto responseModalities: ["AUDIO"] (Motore di Fallback 2)
  private readonly TTS_MODELS = [
    'gemini-2.5-flash-preview-tts',
    'gemini-2.0-flash',
    'gemini-2.5-flash',
  ];

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        this.cachedBestVoice = this.findBestItalianVoice();
      };
      this.cachedBestVoice = this.findBestItalianVoice();
    }
  }

  /**
   * Pulisce il testo da markdown, asterischi, underscore, URL ed emoji
   * per evitare letture robotizzate o caratteri strani da parte del sintetizzatore vocale.
   */
  cleanTextForSpeech(rawText: string): string {
    if (!rawText) return '';
    let text = rawText;

    // 1. Rimuovi blocchi di codice e URL
    text = text.replace(/```[\s\S]*?```/g, ' ');
    text = text.replace(/https?:\/\/\S+/gi, ' ');

    // 2. Rimuovi intestazioni markdown (#, ##, ###), blockquote (>) ed elenchi (- o *)
    text = text.replace(/^[#>\-\*]+\s+/gm, ' ');

    // 3. Rimuovi link markdown [testo](url) lasciando solo il testo
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

    // 4. Rimuovi formattazioni bold, italic, barrato, inline code
    text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
    text = text.replace(/(\*|_)(.*?)\1/g, '$2');
    text = text.replace(/`([^`]+)`/g, '$1');
    text = text.replace(/~~(.*?)~~/g, '$1');

    // 5. Rimuovi simboli markdown residui e separatori
    text = text.replace(/[#\*_~`|]/g, ' ');

    // 6. Rimuovi sequenze di emoji per una lettura fluida
    text = text.replace(
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E0}-\u{1F1FF}\u{1F900}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu,
      ' '
    );

    // 7. Rimuovi frecce o icone speciali
    text = text.replace(/[→←↑↓➜➤▶◀🎙️🔮✨🧙‍♂️📋💾🔄⚠️🎧⚽🔥💥]/g, ' ');

    // 8. Normalizza virgolette tipografiche e trattini
    text = text.replace(/[«»“”]/g, '"').replace(/[–—]/g, '-');

    // 9. Normalizza punteggiatura multipla e spazi bianchi
    text = text.replace(/\.{2,}/g, '.');
    text = text.replace(/\s+/g, ' ').trim();

    return text;
  }

  /**
   * Genera un hash deterministico a 32-bit del testo per garantire che modifiche
   * o rigenerazioni del testo producano una nuova chiave audio univoca.
   */
  private computeHash(str: string): string {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 33) ^ str.charCodeAt(i);
    }
    return (hash >>> 0).toString(36);
  }

  /**
   * Avvia la riproduzione vocale con architettura a 3 livelli e Caching su Firebase Storage:
   * 0. Controllo Cache in memoria e Cache Firebase Storage (MP3/WAV)
   * 1. Livello 1 (Primario): ElevenLabs API (eleven_flash_v2_5, voce ultra-realistica e settaggi telecronista)
   * 2. Livello 2 (Secondario): Gemini TTS (Puck con prompt telecronista calcetto)
   * 3. Livello 3 (Terziario/Fallback estremo): Web Speech API del browser nativo
   */
  async play(rawText: string, id: string): Promise<void> {
    // Se è già attivo sullo stesso id, toggle stop
    if (this.currentPlayingId() === id && (this.isPlaying() || this.isLoadingAudio())) {
      this.stop();
      return;
    }

    // Ferma qualsiasi riproduzione precedente
    this.stop();

    const cleaned = this.cleanTextForSpeech(rawText);
    if (!cleaned) return;

    this.lastCleanedText = cleaned;
    this.currentPlayingId.set(id);

    // Sblocca subito l'audio sul tap utente (necessario per iOS Safari / Chrome Android)
    this.primeAudioUnlock();

    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const textHash = this.computeHash(cleaned);
    const cacheKey = `${safeId}_${textHash}`;

    // 1. Controllo se l'audio è già presente nella cache in memoria
    const cachedUrl = this.audioCache.get(cacheKey);
    if (cachedUrl) {
      this.playAudioUrl(cachedUrl, id);
      return;
    }

    this.isLoadingAudio.set(true);
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // 2. Controllo se l'audio è già presente e indicizzato su Firebase Storage (condiviso tra tutti gli utenti)
    try {
      const remoteUrl = await this.checkFirebaseStorageCache(cacheKey);
      if (remoteUrl) {
        if (this.currentPlayingId() !== id) return;
        this.audioCache.set(cacheKey, remoteUrl);
        this.playAudioUrl(remoteUrl, id);
        return;
      }
    } catch (e) {
      console.warn('Controllo cache Firebase Storage non riuscito, procedo alla generazione:', e);
    }

    // Recupera la configurazione AI da Firestore (con cache in-memory)
    const aiConfig = await this.geminiService.getAiConfig();

    // =========================================================================
    // LIVELLO 1: ELEVENLABS API (eleven_flash_v2_5 - Telecronista Ultra-Realistico)
    // =========================================================================
    if (this.isValidElevenLabsKey(aiConfig.elevenLabsApiKey)) {
      try {
        const mp3Blob = await this.generateElevenLabsAudio(
          cleaned,
          aiConfig.elevenLabsApiKey,
          aiConfig.elevenLabsVoiceId,
          signal
        );

        if (this.currentPlayingId() !== id) return;

        const localUrl = URL.createObjectURL(mp3Blob);
        this.audioCache.set(cacheKey, localUrl);
        this.playAudioUrl(localUrl, id);

        // Upload asincrono su Firebase Storage per il caching globale permanente
        const storagePath = `tts_cache/${cacheKey}.mp3`;
        this.uploadAudioToFirebaseStorage(mp3Blob, storagePath, 'audio/mpeg')
          .then((downloadUrl) => {
            this.audioCache.set(cacheKey, downloadUrl);
          })
          .catch((err) => {
            console.warn('Avviso upload audio ElevenLabs su Firebase Storage:', err);
          });

        return;
      } catch (err: any) {
        if (signal.aborted) return;
        console.warn(
          'ElevenLabs API non disponibile o fallito. Attivazione immediata del fallback Gemini TTS:',
          err?.message || err
        );
      }
    }

    // =========================================================================
    // LIVELLO 2: GEMINI TTS (Modello secondario con prompt telecronista calcetto)
    // =========================================================================
    try {
      const wavBlob = await this.generateGeminiAudio(cleaned, signal);

      if (this.currentPlayingId() !== id) return;

      const localUrl = URL.createObjectURL(wavBlob);
      this.audioCache.set(cacheKey, localUrl);
      this.playAudioUrl(localUrl, id);

      // Upload asincrono su Firebase Storage
      const storagePath = `tts_cache/${cacheKey}.wav`;
      this.uploadAudioToFirebaseStorage(wavBlob, storagePath, 'audio/wav')
        .then((downloadUrl) => {
          this.audioCache.set(cacheKey, downloadUrl);
        })
        .catch((err) => {
          console.warn('Avviso upload audio Gemini su Firebase Storage:', err);
        });

      return;
    } catch (err: any) {
      if (signal.aborted) return;
      console.warn(
        'Gemini TTS non disponibile o fallito. Attivazione del fallback nativo Web Speech API:',
        err?.message || err
      );
    }

    // =========================================================================
    // LIVELLO 3: FALLBACK NATIVO WEB SPEECH API (Browser locale)
    // =========================================================================
    if (this.currentPlayingId() === id) {
      this.playNativeSpeech(cleaned, id);
    }
  }

  /**
   * Ferma immediatamente qualsiasi audio in riproduzione o richiesta in corso.
   */
  stop(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.sharedAudio) {
      try {
        this.sharedAudio.pause();
        this.sharedAudio.currentTime = 0;
        this.sharedAudio.onplay = null;
        this.sharedAudio.onended = null;
        this.sharedAudio.onerror = null;
      } catch (err) {
        console.warn('Errore stop sharedAudio:', err);
      }
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (err) {
        console.warn('Errore cancel speechSynthesis:', err);
      }
    }

    this.clearSynthKeepAlive();
    this.activeUtterance = null;
    this.resetState();
  }

  /**
   * Mette in pausa l'audio attualmente in riproduzione.
   */
  pause(): void {
    if (this.sharedAudio && !this.sharedAudio.paused) {
      this.sharedAudio.pause();
      this.isPlaying.set(false);
    } else if (
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      window.speechSynthesis.speaking
    ) {
      window.speechSynthesis.pause();
      this.isPlaying.set(false);
    }
  }

  // =========================================================================
  // GESTIONE CACHING SU FIREBASE STORAGE
  // =========================================================================

  /**
   * Verifica se per la data chiave univoca esiste già un file audio generato
   * (MP3 ElevenLabs o WAV Gemini) su Firebase Storage.
   */
  private async checkFirebaseStorageCache(cacheKey: string): Promise<string | null> {
    const checkPromise = async (): Promise<string | null> => {
      // 1. Priorità all'MP3 ultra-realistico ElevenLabs
      try {
        const mp3Ref = ref(this.storage, `tts_cache/${cacheKey}.mp3`);
        const url = await getDownloadURL(mp3Ref);
        if (url) return url;
      } catch {
        // Nessun MP3 in cache
      }

      // 2. Controllo audio Gemini WAV
      try {
        const wavRef = ref(this.storage, `tts_cache/${cacheKey}.wav`);
        const url = await getDownloadURL(wavRef);
        if (url) return url;
      } catch {
        // Nessun WAV in cache
      }

      return null;
    };

    // Timeout di sicurezza a 2.5s per evitare attese prolungate se offline
    return Promise.race([
      checkPromise(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
    ]);
  }

  /**
   * Salva l'audio generato su Firebase Storage con content-type appropriato.
   */
  private async uploadAudioToFirebaseStorage(
    blob: Blob,
    path: string,
    contentType: string
  ): Promise<string> {
    try {
      const storageRef = ref(this.storage, path);
      await uploadBytes(storageRef, blob, { contentType });
      const downloadUrl = await getDownloadURL(storageRef);
      return downloadUrl;
    } catch (err) {
      console.warn('Errore durante upload dell\'audio su Firebase Storage:', err);
      throw err;
    }
  }

  // =========================================================================
  // GESTIONE AUDIO ELEMENT E UNLOCK PER MOBILE (SAFARI / ANDROID)
  // =========================================================================

  private getOrCreateAudio(): HTMLAudioElement {
    if (!this.sharedAudio) {
      this.sharedAudio = new Audio();
    }
    return this.sharedAudio;
  }

  /**
   * Sblocca l'AudioContext / HTMLAudioElement nel contesto dell'evento click dell'utente.
   */
  private primeAudioUnlock(): void {
    try {
      const audio = this.getOrCreateAudio();
      audio.src =
        'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
      audio.play().catch(() => {});
    } catch {
      // Ignora errori di priming
    }
  }

  /**
   * Riproduce l'audio dato un URL (Blob URL locale o URL remoto Firebase Storage).
   */
  private playAudioUrl(url: string, id: string): void {
    const audio = this.getOrCreateAudio();
    audio.pause();
    audio.src = url;
    audio.currentTime = 0;

    audio.onplay = () => {
      this.isLoadingAudio.set(false);
      this.isPlaying.set(true);
    };

    audio.onended = () => {
      this.resetState();
    };

    audio.onerror = (e) => {
      console.warn('Errore caricamento audio, fallback su Web Speech API:', e);
      this.playNativeSpeech(this.lastCleanedText, id);
    };

    audio.play().catch((err) => {
      console.warn('Riproduzione AudioElement bloccata dal browser, fallback su Web Speech API:', err);
      this.playNativeSpeech(this.lastCleanedText, id);
    });
  }

  // =========================================================================
  // MOTORE 1: ELEVENLABS API (eleven_flash_v2_5)
  // =========================================================================

  /**
   * Verifica se la chiave API di ElevenLabs è valorizzata con una stringa reale.
   */
  private isValidElevenLabsKey(key: string | null | undefined): boolean {
    if (!key) return false;
    const trimmed = key.trim();
    if (trimmed.length < 10) return false;
    if (
      trimmed.includes('INSERISCI') ||
      trimmed.includes('[') ||
      trimmed.includes('ELEVENLABS')
    ) {
      return false;
    }
    return true;
  }

  /**
   * Genera l'audio tramite ElevenLabs API con modello eleven_flash_v2_5.
   */
  private async generateElevenLabsAudio(
    cleanedText: string,
    apiKey: string,
    voiceId: string,
    signal?: AbortSignal
  ): Promise<Blob> {
    const targetVoiceId = voiceId || 'pNInz6obpgDQGcFmaJgB';
    const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${targetVoiceId}?output_format=mp3_44100_64`;

    const body = {
      text: cleanedText,
      model_id: 'eleven_flash_v2_5',
      language_code: 'it',
      voice_settings: {
        stability: 0.35,
        similarity_boost: 0.8,
        style: 0.65,
        use_speaker_boost: true,
      },
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      const errTxt = await response.text();
      throw new Error(`ElevenLabs API errore (${response.status}): ${errTxt}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return new Blob([arrayBuffer], { type: 'audio/mpeg' });
  }

  // =========================================================================
  // MOTORE 2: GEMINI TTS CON INTONAZIONE DA TELECRONISTA
  // =========================================================================

  private async generateGeminiAudio(cleanedText: string, signal?: AbortSignal): Promise<Blob> {
    const apiKey = await this.geminiService.getApiKey();

    const prompt = `Leggi questo testo con l'intonazione e l'enfasi di un vero telecronista sportivo italiano appassionato, energico e goliardico da calcetto tra amici:\n\n"${cleanedText}"`;

    const body: any = {
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: 'Puck',
            },
          },
        },
      },
    };

    let lastError: any = null;

    for (const model of this.TTS_MODELS) {
      if (signal?.aborted) throw new Error('Richiesta audio annullata');

      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal,
        });

        if (response.ok) {
          const json = await response.json();
          const candidate = json.candidates?.[0];
          const inlineData = candidate?.content?.parts?.[0]?.inlineData;

          if (inlineData?.data) {
            const mimeType = inlineData.mimeType || 'audio/wav';
            const rawBytes = this.base64ToUint8Array(inlineData.data);

            if (mimeType.includes('pcm') || mimeType.includes('raw')) {
              const match = mimeType.match(/rate=(\d+)/);
              const sampleRate = match ? parseInt(match[1], 10) : 24000;
              return this.pcmToWavBlob(rawBytes, sampleRate);
            } else {
              return new Blob([rawBytes as any], { type: mimeType });
            }
          }
        } else {
          const errText = await response.text();
          console.warn(`Modello audio ${model} ha risposto con codice ${response.status}:`, errText);
          lastError = new Error(`Errore API Gemini (${response.status})`);
        }
      } catch (err: any) {
        if (signal?.aborted) throw err;
        console.warn(`Tentativo modello ${model} fallito:`, err);
        lastError = err;
      }
    }

    throw lastError || new Error('Nessun modello Gemini TTS disponibile');
  }

  // =========================================================================
  // MOTORE 3: FALLBACK NATIVO WEB SPEECH API
  // =========================================================================

  private findBestItalianVoice(): SpeechSynthesisVoice | null {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    const itVoices = voices.filter(
      (v) => v.lang && (v.lang.toLowerCase().startsWith('it') || v.lang.toLowerCase().includes('it'))
    );
    if (itVoices.length === 0) return null;

    // Priorità a voci espressive Google o native iOS/macOS di qualità superiore
    const preferred = itVoices.find((v) => {
      const name = v.name.toLowerCase();
      return (
        name.includes('google') ||
        name.includes('natural') ||
        name.includes('alice') ||
        name.includes('luca') ||
        name.includes('siri') ||
        name.includes('federica') ||
        name.includes('cosimo') ||
        name.includes('premium')
      );
    });

    return preferred || itVoices.find((v) => v.default) || itVoices[0];
  }

  private playNativeSpeech(text: string, id: string): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      console.warn('SpeechSynthesis non supportata su questo dispositivo.');
      this.resetState();
      return;
    }

    try {
      window.speechSynthesis.cancel();
    } catch {}
    this.clearSynthKeepAlive();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'it-IT';
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    const voice = this.cachedBestVoice || this.findBestItalianVoice();
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onstart = () => {
      this.isLoadingAudio.set(false);
      this.isPlaying.set(true);
      this.startSynthKeepAlive();
    };

    utterance.onend = () => {
      this.clearSynthKeepAlive();
      this.resetState();
    };

    utterance.onerror = (e) => {
      if (e.error !== 'interrupted' && e.error !== 'canceled') {
        console.warn('SpeechSynthesis errore:', e);
      }
      this.clearSynthKeepAlive();
      this.resetState();
    };

    this.activeUtterance = utterance;
    this.currentPlayingId.set(id);
    window.speechSynthesis.speak(utterance);
  }

  // Workaround per Chrome: il sintetizzatore vocale può fermarsi se il testo dura > 15s
  private startSynthKeepAlive(): void {
    this.clearSynthKeepAlive();
    this.synthTimer = setInterval(() => {
      if (
        this.isPlaying() &&
        typeof window !== 'undefined' &&
        'speechSynthesis' in window &&
        window.speechSynthesis.speaking
      ) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      } else {
        this.clearSynthKeepAlive();
      }
    }, 10000);
  }

  private clearSynthKeepAlive(): void {
    if (this.synthTimer) {
      clearInterval(this.synthTimer);
      this.synthTimer = null;
    }
  }

  // =========================================================================
  // UTILITY CONVERSIONE PCM -> WAV CON INTESTAZIONE RIFF
  // =========================================================================

  private pcmToWavBlob(
    pcmData: Uint8Array,
    sampleRate = 24000,
    numChannels = 1,
    bitsPerSample = 16
  ): Blob {
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const buffer = new ArrayBuffer(44 + pcmData.byteLength);
    const view = new DataView(buffer);

    // RIFF chunk descriptor
    this.writeAsciiString(view, 0, 'RIFF');
    view.setUint32(4, 36 + pcmData.byteLength, true);
    this.writeAsciiString(view, 8, 'WAVE');

    // fmt sub-chunk
    this.writeAsciiString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // data sub-chunk
    this.writeAsciiString(view, 36, 'data');
    view.setUint32(40, pcmData.byteLength, true);

    // Dati PCM
    new Uint8Array(buffer, 44).set(pcmData);

    return new Blob([buffer], { type: 'audio/wav' });
  }

  private writeAsciiString(view: DataView, offset: number, str: string): void {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  private base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  private resetState(): void {
    this.isPlaying.set(false);
    this.isLoadingAudio.set(false);
    this.currentPlayingId.set(null);
  }
}
