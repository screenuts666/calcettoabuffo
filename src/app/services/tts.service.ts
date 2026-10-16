import { Injectable, inject, signal } from '@angular/core';
import { Storage, ref, getDownloadURL, uploadBytes, getBlob } from '@angular/fire/storage';
import { Firestore, doc, getDoc, setDoc } from '@angular/fire/firestore';
import { Mp3Encoder } from '@breezystack/lamejs';
import { GeminiService } from './gemini.service';

export interface TtsAudioResult {
  blob: Blob;
  mimeType: string;
  extension: 'mp3';
  downloadUrl?: string;
}

@Injectable({
  providedIn: 'root',
})
export class TtsService {
  private geminiService = inject(GeminiService);
  private storage = inject(Storage);
  private firestore = inject(Firestore);

  // Stato reattivo globale (Single Player)
  readonly isPlaying = signal<boolean>(false);
  readonly isLoadingAudio = signal<boolean>(false);
  readonly currentPlayingId = signal<string | null>(null);
  readonly sharingAudioId = signal<string | null>(null);

  // Cache in memoria degli URL audio (cacheKey -> url o blobUrl)
  private audioCache = new Map<string, string>();

  // Elemento audio HTML condiviso per sbloccare l'audio sui browser mobile (iOS Safari / Android)
  private sharedAudio: HTMLAudioElement | null = null;
  private abortController: AbortController | null = null;
  private activeUtterance: SpeechSynthesisUtterance | null = null;
  private synthTimer: any = null;
  private cachedBestVoice: SpeechSynthesisVoice | null = null;
  private lastCleanedText: string = '';

  // Flag di sessione per evitare chiamate ripetute se la quota ElevenLabs è esaurita
  private elevenLabsQuotaExceeded = false;
  // Cache dei fallimenti Storage per evitare 404 ripetuti nella stessa sessione
  private storageMissCache = new Set<string>();

  // Modelli Gemini TTS con supporto responseModalities: ["AUDIO"] (Motore di Fallback 2)
  private readonly TTS_MODELS = [
    'gemini-3.8-flash-tts',
    'gemini-3.8-flash-lite-tts',
    'gemini-3.1-flash-tts-preview',
    'gemini-2.5-flash-preview-tts',
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
    if (
      this.isValidElevenLabsKey(aiConfig.elevenLabsApiKey) &&
      !this.elevenLabsQuotaExceeded
    ) {
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
            this.storageMissCache.delete(cacheKey);
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
    // LIVELLO 2: GEMINI TTS (Modello secondario con codifica MP3 nativa)
    // =========================================================================
    try {
      const mp3Blob = await this.generateGeminiAudio(cleaned, signal);

      if (this.currentPlayingId() !== id) return;

      const localUrl = URL.createObjectURL(mp3Blob);
      this.audioCache.set(cacheKey, localUrl);
      this.playAudioUrl(localUrl, id);

      // Upload asincrono su Firebase Storage (sempre MP3 per massima compatibilità)
      const storagePath = `tts_cache/${cacheKey}.mp3`;
      this.uploadAudioToFirebaseStorage(mp3Blob, storagePath, 'audio/mpeg')
        .then((downloadUrl) => {
          this.storageMissCache.delete(cacheKey);
          this.audioCache.set(cacheKey, downloadUrl);
        })
        .catch((err) => {
          console.warn('Avviso upload audio Gemini MP3 su Firebase Storage:', err);
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
   * memorizzato su Firestore/Firebase Storage (zero errori 404 in console!).
   */
  private async checkFirebaseStorageCache(cacheKey: string): Promise<string | null> {
    if (this.storageMissCache.has(cacheKey)) {
      return null;
    }

    try {
      const snap = await getDoc(doc(this.firestore, `tts_cache/${cacheKey}`));
      if (snap.exists() && snap.data()?.['downloadUrl']) {
        const url = snap.data()['downloadUrl'];
        const ext = snap.data()['extension'];
        // Accetta esclusivamente file MP3 validi (ignora vecchi .wav per garantire compatibilità WhatsApp)
        if (ext === 'mp3' && !url.includes('.wav')) {
          this.audioCache.set(cacheKey, url);
          return url;
        }
      }
    } catch (e) {
      // Ignora errori di rete Firestore temporanei
    }

    // Se il documento non esiste su Firestore o era un vecchio wav, è un cache miss:
    // Evitiamo qualsiasi chiamata cieca a Firebase Storage che produrrebbe un 404 in console
    this.storageMissCache.add(cacheKey);
    return null;
  }

  /**
   * Salva l'audio generato su Firebase Storage e ne indicizza l'URL su Firestore.
   */
  private async uploadAudioToFirebaseStorage(
    blob: Blob,
    path: string,
    contentType = 'audio/mpeg'
  ): Promise<string> {
    try {
      const storageRef = ref(this.storage, path);
      await uploadBytes(storageRef, blob, { contentType });
      const downloadUrl = await getDownloadURL(storageRef);

      const cacheKey = path.replace('tts_cache/', '').replace(/\.(mp3|wav)$/, '');

      try {
        await setDoc(
          doc(this.firestore, `tts_cache/${cacheKey}`),
          {
            cacheKey,
            downloadUrl,
            contentType: 'audio/mpeg',
            extension: 'mp3',
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (fErr) {
        console.warn('Avviso salvataggio indice tts_cache su Firestore:', fErr);
      }

      this.storageMissCache.delete(cacheKey);
      return downloadUrl;
    } catch (err) {
      console.warn('Errore durante upload dell\'audio su Firebase Storage:', err);
      throw err;
    }
  }

  // =========================================================================
  // CONDIVISIONE DIRETTA SU WHATSAPP (FILE BINARIO MP3 / AUDIO TRACK)
  // =========================================================================

  /**
   * Recupera o genera l'effettivo Blob binario del file audio strictly .mp3 (128kbps / 44.1kHz).
   * Se già presente in memoria o su Firebase Storage, lo restituisce istantaneamente.
   * Altrimenti lo genera tramite ElevenLabs o Gemini TTS e lo indicizza.
   */
  async getOrGenerateAudioBlob(rawText: string, id: string): Promise<TtsAudioResult> {
    const cleaned = this.cleanTextForSpeech(rawText);
    if (!cleaned) {
      throw new Error('Testo vuoto o non valido per la generazione audio');
    }

    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const textHash = this.computeHash(cleaned);
    const cacheKey = `${safeId}_${textHash}`;

    // 1. Controllo cache in memoria (SOLO se MP3, mai WAV)
    const cachedUrl = this.audioCache.get(cacheKey);
    if (cachedUrl && !cachedUrl.includes('.wav')) {
      try {
        const resp = await fetch(cachedUrl);
        if (resp.ok) {
          const blob = await resp.blob();
          if (!blob.type.includes('wav') && blob.size > 0) {
            return {
              blob,
              mimeType: 'audio/mpeg',
              extension: 'mp3',
              downloadUrl: cachedUrl.startsWith('http') ? cachedUrl : undefined,
            };
          }
        }
      } catch (e) {
        console.warn('Errore lettura audio in cache:', e);
      }
    }

    // 2. Controllo se l'audio è già indicizzato su Firestore come MP3
    if (!this.storageMissCache.has(cacheKey)) {
      try {
        const snap = await getDoc(doc(this.firestore, `tts_cache/${cacheKey}`));
        if (snap.exists() && snap.data()?.['downloadUrl']) {
          const downloadUrl = snap.data()['downloadUrl'];
          const ext = snap.data()['extension'];
          if (ext === 'mp3' && !downloadUrl.includes('.wav')) {
            const resp = await fetch(downloadUrl);
            if (resp.ok) {
              const blob = await resp.blob();
              if (blob.size > 0) {
                this.audioCache.set(cacheKey, downloadUrl);
                return {
                  blob,
                  mimeType: 'audio/mpeg',
                  extension: 'mp3',
                  downloadUrl,
                };
              }
            }
          }
        }
      } catch {
        // Nessun record Firestore
      }

      this.storageMissCache.add(cacheKey);
    }

    // 3. Se non in cache o se vecchio file non era MP3, generiamo l'audio MP3 nativo
    const aiConfig = await this.geminiService.getAiConfig();

    // MOTORE 1: ElevenLabs (se la chiave è valida e la quota non è esaurita)
    if (
      this.isValidElevenLabsKey(aiConfig.elevenLabsApiKey) &&
      !this.elevenLabsQuotaExceeded
    ) {
      try {
        const mp3Blob = await this.generateElevenLabsAudio(
          cleaned,
          aiConfig.elevenLabsApiKey,
          aiConfig.elevenLabsVoiceId
        );
        const storagePath = `tts_cache/${cacheKey}.mp3`;
        let downloadUrl: string | undefined;
        try {
          downloadUrl = await this.uploadAudioToFirebaseStorage(mp3Blob, storagePath, 'audio/mpeg');
          this.storageMissCache.delete(cacheKey);
          this.audioCache.set(cacheKey, downloadUrl);
        } catch (upErr) {
          console.warn('Upload Firebase Storage fallito (generazione share):', upErr);
          this.audioCache.set(cacheKey, URL.createObjectURL(mp3Blob));
        }
        return {
          blob: mp3Blob,
          mimeType: 'audio/mpeg',
          extension: 'mp3',
          downloadUrl,
        };
      } catch (elevenErr) {
        console.warn('ElevenLabs fallito per share audio, fallback su Gemini TTS:', elevenErr);
      }
    }

    // MOTORE 2: Gemini TTS (sempre convertito in MP3 128kbps / 44.1kHz per piena compatibilità WhatsApp)
    try {
      const mp3Blob = await this.generateGeminiAudio(cleaned);
      const storagePath = `tts_cache/${cacheKey}.mp3`;
      let downloadUrl: string | undefined;
      try {
        downloadUrl = await this.uploadAudioToFirebaseStorage(mp3Blob, storagePath, 'audio/mpeg');
        this.storageMissCache.delete(cacheKey);
        this.audioCache.set(cacheKey, downloadUrl);
      } catch (upErr) {
        console.warn('Upload Firebase Storage fallito (generazione share MP3):', upErr);
        this.audioCache.set(cacheKey, URL.createObjectURL(mp3Blob));
      }
      return {
        blob: mp3Blob,
        mimeType: 'audio/mpeg',
        extension: 'mp3',
        downloadUrl,
      };
    } catch (geminiErr: any) {
      console.error('Generazione audio Gemini TTS MP3 fallita:', geminiErr);
      throw new Error('Impossibile generare il file audio MP3: ' + (geminiErr?.message || geminiErr));
    }
  }

  /**
   * Condivide l'audio direttamente su WhatsApp:
   * - Su Mobile (Android/iOS) con Web Share API: passa l'effettivo file binario audio
   *   .mp3 che WhatsApp apre e allega come audio inviabile!
   *   IMPORTANTE: NON passare 'text' con il file audio in navigator.share, poiché su WhatsApp
   *   l'audio non supporta didascalie e passare testo causava la traccia vuota/non avviabile.
   * - Su Desktop o browser senza supporto file: scarica il file audio localmente
   *   e apre WhatsApp Web con il messaggio formattato e link all'audio online.
   */
  async shareAudioToWhatsApp(
    rawText: string,
    id: string,
    title = 'Audio Calcetto Abbuffo'
  ): Promise<{ success: boolean; method: 'web-share' | 'download-and-wa' | 'aborted' }> {
    if (this.sharingAudioId() === id) {
      return { success: false, method: 'aborted' };
    }

    this.sharingAudioId.set(id);

    try {
      const audioData = await this.getOrGenerateAudioBlob(rawText, id);
      const safeTitle = (title || 'Audio Calcetto Abbuffo').trim();
      const safeBase = safeTitle
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '') || 'telecronaca_calcetto';
      const fileName = `${safeBase}.mp3`;
      const file = new File([audioData.blob], fileName, {
        type: 'audio/mpeg',
      });

      const isMobile =
        typeof navigator !== 'undefined' &&
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');

      const canShareFiles =
        typeof navigator !== 'undefined' &&
        'share' in navigator &&
        'canShare' in navigator &&
        (navigator as any).canShare({ files: [file] });

      if (isMobile && canShareFiles) {
        // Condivisione nativa su mobile (iOS Safari / Chrome Android)
        // NOTA FONDAMENTALE PER WHATSAPP:
        // Passare solo `files` e `title`. Omettere `text` per evitare che WhatsApp
        // interpreti erroneamente l'audio con caption vuota bloccandone l'ascolto.
        await navigator.share({
          title: safeTitle,
          files: [file],
        });
        return { success: true, method: 'web-share' };
      }

      // Modalità Desktop o browser senza canShare files:
      // 1. Scarica automaticamente il file .mp3
      this.downloadBlobFile(audioData.blob, fileName);

      // 2. Apri WhatsApp Web
      const cleanedSnippet = this.cleanTextForSpeech(rawText).slice(0, 160);
      let messageText = `🎙️ *${safeTitle}*\n\n"${cleanedSnippet}..."`;
      if (audioData.downloadUrl) {
        messageText += `\n\n🎧 *Ascolta l'audio online:*\n${audioData.downloadUrl}`;
      }
      messageText += `\n\n_(File audio MP3 scaricato sul dispositivo, pronto da allegare in chat!)_`;

      const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(messageText)}`;
      if (isMobile) {
        window.location.href = waUrl;
      } else {
        window.open(waUrl, '_blank');
      }

      return { success: true, method: 'download-and-wa' };
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return { success: false, method: 'aborted' };
      }
      console.error('Errore shareAudioToWhatsApp:', err);
      throw err;
    } finally {
      this.sharingAudioId.set(null);
    }
  }


  private downloadBlobFile(blob: Blob, fileName: string): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
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
    const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${targetVoiceId}?output_format=mp3_44100_128`;

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
      if (response.status === 401 || errTxt.includes('quota_exceeded')) {
        this.elevenLabsQuotaExceeded = true;
      }
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
      safetySettings: [
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_NONE',
        },
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_NONE',
        },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: 'BLOCK_NONE',
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_NONE',
        },
      ],
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
            const match = mimeType.match(/rate=(\d+)/);
            const sampleRate = match ? parseInt(match[1], 10) : 24000;
            return this.pcmToMp3Blob(rawBytes, sampleRate);
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
  // UTILITY CONVERSIONE PCM/WAV -> MP3 NATIVO A 128KBPS / 44.1kHz
  // =========================================================================

  private pcmToMp3Blob(
    rawBytes: Uint8Array,
    inputSampleRate = 24000,
    channels = 1,
    kbps = 128
  ): Blob {
    let pcm = rawBytes;
    let sampleRate = inputSampleRate;

    // Se è presente un header RIFF WAVE (44 byte), estrai sample rate ed escludi l'header
    if (
      pcm.byteLength > 44 &&
      pcm[0] === 0x52 && // 'R'
      pcm[1] === 0x49 && // 'I'
      pcm[2] === 0x46 && // 'F'
      pcm[3] === 0x46    // 'F'
    ) {
      try {
        const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
        const wavRate = view.getUint32(24, true);
        if (wavRate >= 8000 && wavRate <= 48000) {
          sampleRate = wavRate;
        }
      } catch {}
      pcm = pcm.subarray(44);
    }

    const sampleCount = Math.floor(pcm.byteLength / 2);
    // Allineamento sicuro della memoria a 16-bit
    const alignedBuffer = new ArrayBuffer(sampleCount * 2);
    new Uint8Array(alignedBuffer).set(pcm.subarray(0, sampleCount * 2));
    const int16 = new Int16Array(alignedBuffer);

    // Resampling a 44100 Hz per garantire massima compatibilità MPEG-1 Layer 3 su WhatsApp
    const targetSampleRate = 44100;
    const samplesToEncode =
      sampleRate === targetSampleRate
        ? int16
        : this.resamplePcmLinear(int16, sampleRate, targetSampleRate);

    const encoder = new Mp3Encoder(channels, targetSampleRate, kbps);
    const mp3Chunks: Uint8Array[] = [];
    const blockSize = 1152;

    for (let i = 0; i < samplesToEncode.length; i += blockSize) {
      const chunk = samplesToEncode.subarray(i, i + blockSize);
      const mp3buf = encoder.encodeBuffer(chunk);
      if (mp3buf && mp3buf.length > 0) {
        // Conversione in Uint8Array pulito per evitare problemi di buffer con Int8Array
        mp3Chunks.push(new Uint8Array(mp3buf.buffer, mp3buf.byteOffset, mp3buf.byteLength));
      }
    }

    const mp3end = encoder.flush();
    if (mp3end && mp3end.length > 0) {
      mp3Chunks.push(new Uint8Array(mp3end.buffer, mp3end.byteOffset, mp3end.byteLength));
    }

    return new Blob(mp3Chunks as any, { type: 'audio/mpeg' });
  }

  private resamplePcmLinear(
    samples: Int16Array,
    oldRate: number,
    newRate: number
  ): Int16Array {
    if (oldRate === newRate || samples.length === 0) return samples;
    const ratio = oldRate / newRate;
    const newLength = Math.round(samples.length / ratio);
    const result = new Int16Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const origIndex = i * ratio;
      const indexFloor = Math.floor(origIndex);
      const indexCeil = Math.min(indexFloor + 1, samples.length - 1);
      const frac = origIndex - indexFloor;
      result[i] = Math.round(samples[indexFloor] * (1 - frac) + samples[indexCeil] * frac);
    }
    return result;
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
