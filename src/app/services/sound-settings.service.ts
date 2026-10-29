import { Injectable, signal, computed, inject } from '@angular/core';
import { Firestore, doc, getDoc, setDoc } from '@angular/fire/firestore';
import { TtsService } from './tts.service';
import { computeTextHash } from '../utils/text-sanitizer';

export type GkSoundId =
  | 'cambio_wav'
  | 'referee_whistle'
  | 'stadium_chime'
  | 'stadium_horn'
  | 'nba_buzzer'
  | 'voice_only';

export interface GkSoundPreset {
  id: GkSoundId;
  name: string;
  emoji: string;
  badge: string;
  intensity: string;
  freqLabel: string;
  description: string;
}

export interface SuperUserSoundConfig {
  selectedGkSoundId: GkSoundId;
  voiceAnnouncement: boolean;
  vibrationAlert: boolean;
  gkTurnMinutes: number;
  matchWhistleEffects: boolean;
  goalSoundEffects: boolean;
  autogoalSoundEffects: boolean;
}

const STORAGE_KEY = 'calcetto_superuser_sound_settings_v1';

export const DEFAULT_SOUND_CONFIG: SuperUserSoundConfig = {
  selectedGkSoundId: 'cambio_wav',
  voiceAnnouncement: true,
  vibrationAlert: true,
  gkTurnMinutes: 5,
  matchWhistleEffects: true,
  goalSoundEffects: true,
  autogoalSoundEffects: true,
};

export const GK_SOUND_PRESETS: GkSoundPreset[] = [
  {
    id: 'cambio_wav',
    name: 'Originale "CAMBIO!"',
    emoji: '🎺',
    badge: 'UFFICIALE',
    intensity: 'STANDARD',
    freqLabel: 'File audio originale',
    description:
      'Il celebre file audio storico del calcetto, suonato pulito a pieno volume.',
  },
  {
    id: 'referee_whistle',
    name: 'Fischietto Arbitro',
    emoji: '🏁',
    badge: 'SPORTIVO',
    intensity: 'MEDIO',
    freqLabel: 'Doppio fischio fi-fiii!',
    description:
      'Fischio arbitrale naturale e intonato con trillo armonico. Chiaro e piacevole.',
  },
  {
    id: 'stadium_chime',
    name: 'Campanella Stadio',
    emoji: '🔔',
    badge: 'AVVISO CHIARO',
    intensity: 'SQUILLANTE',
    freqLabel: 'Ding-Dong intonato',
    description:
      'Doppio rintocco tubolare stile avviso stadio, risonante ed elegante.',
  },
  {
    id: 'stadium_horn',
    name: 'Tromba da Curva',
    emoji: '📯',
    badge: 'BORDO CAMPO',
    intensity: 'FORTE',
    freqLabel: 'Accordo d’ottoni',
    description:
      'Doppio squillo armonico di fanfara da campo (PA-PAAA!), ben udibile anche all’aperto.',
  },
  {
    id: 'nba_buzzer',
    name: 'Buzzer Palazzetto',
    emoji: '🏀',
    badge: 'TABELLONE',
    intensity: 'MOLTO FORTE',
    freqLabel: 'Buzzer rotondo',
    description:
      'Segnale sportivo da tabellone luminoso, corposo e vigoroso ma senza fruscii fastidiosi.',
  },
  {
    id: 'voice_only',
    name: 'Solo Voce Portieri',
    emoji: '🗣️',
    badge: 'ZERO RUMORE',
    intensity: 'VOCALE',
    freqLabel: 'Sintesi vocale naturale',
    description:
      'Nessun suono di disturbo: solo lo speaker vocale naturale che chiama chi entra in porta.',
  },
];

@Injectable({
  providedIn: 'root',
})
export class SoundSettingsService {
  readonly gkPresets = GK_SOUND_PRESETS;

  config = signal<SuperUserSoundConfig>(this.loadConfig());

  selectedGkPreset = computed<GkSoundPreset>(() => {
    const id = this.config().selectedGkSoundId;
    return (
      this.gkPresets.find((p) => p.id === id) ||
      this.gkPresets.find((p) => p.id === 'cambio_wav')!
    );
  });

  // Stato anteprima suono nelle impostazioni
  previewingSoundId = signal<GkSoundId | null>(null);
  // Stato allarme cambio portiere attivo in partita
  isMatchAlarmPlaying = signal<boolean>(false);
  // Stato anteprima effetto match (fischietto, gol, autogol)
  previewingEffectId = signal<string | null>(null);

  private firestore = inject(Firestore, { optional: true });
  private tts = inject(TtsService, { optional: true });
  private htmlAudioCambio: HTMLAudioElement | null = null;
  private htmlSynthAudio: HTMLAudioElement | null = null;
  private wavBlobUrlCache = new Map<string, string>();

  private loopIntervalId: ReturnType<typeof setInterval> | null = null;
  private previewTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private vibrationIntervalId: ReturnType<typeof setInterval> | null = null;
  private currentMatchGkText: string = '';
  private speechTimeoutId: any = null;

  // Gestione sintesi vocale naturale italiana (evita voce robotica e GC browser)
  private cachedBestVoice: SpeechSynthesisVoice | null = null;
  private activeUtterance: SpeechSynthesisUtterance | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.htmlAudioCambio = new Audio('/assets/sound/CAMBIO.wav');
      this.htmlAudioCambio.preload = 'auto';
      this.htmlSynthAudio = new Audio();
      this.htmlSynthAudio.preload = 'auto';

      if (this.firestore) {
        getDoc(doc(this.firestore, 'config_stagioni/superuser_sound_settings'))
          .then((snap) => {
            if (snap.exists()) {
              const data = snap.data() as Partial<SuperUserSoundConfig>;
              if (data && typeof data === 'object') {
                this.config.update((prev) => {
                  const merged = { ...prev, ...data };
                  if (typeof localStorage !== 'undefined') {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
                  }
                  return merged;
                });
              }
            }
          })
          .catch(() => {});
      }

      if ('speechSynthesis' in window) {
        this.cachedBestVoice = this.findBestItalianVoice();
        window.speechSynthesis.onvoiceschanged = () => {
          this.cachedBestVoice = this.findBestItalianVoice();
        };
      }
    }
  }

  private loadConfig(): SuperUserSoundConfig {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          const validIds: GkSoundId[] = [
            'cambio_wav',
            'referee_whistle',
            'stadium_chime',
            'stadium_horn',
            'nba_buzzer',
            'voice_only',
          ];
          const selectedGkSoundId: GkSoundId = validIds.includes(parsed.selectedGkSoundId)
            ? parsed.selectedGkSoundId
            : 'cambio_wav';
          return {
            selectedGkSoundId,
            voiceAnnouncement:
              typeof parsed.voiceAnnouncement === 'boolean'
                ? parsed.voiceAnnouncement
                : true,
            vibrationAlert:
              typeof parsed.vibrationAlert === 'boolean'
                ? parsed.vibrationAlert
                : true,
            gkTurnMinutes:
              typeof parsed.gkTurnMinutes === 'number'
                ? parsed.gkTurnMinutes
                : 5,
            matchWhistleEffects:
              typeof parsed.matchWhistleEffects === 'boolean'
                ? parsed.matchWhistleEffects
                : true,
            goalSoundEffects:
              typeof parsed.goalSoundEffects === 'boolean'
                ? parsed.goalSoundEffects
                : true,
            autogoalSoundEffects:
              typeof parsed.autogoalSoundEffects === 'boolean'
                ? parsed.autogoalSoundEffects
                : true,
          };
        }
      }
    } catch {}
    return { ...DEFAULT_SOUND_CONFIG };
  }

  updateConfig(partial: Partial<SuperUserSoundConfig>) {
    const updated: SuperUserSoundConfig = {
      ...this.config(),
      ...partial,
    };
    this.config.set(updated);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      }
    } catch {}
  }

  toggleMatchWhistleEffects() {
    this.updateConfig({ matchWhistleEffects: !this.config().matchWhistleEffects });
  }

  toggleGoalSoundEffects() {
    this.updateConfig({ goalSoundEffects: !this.config().goalSoundEffects });
  }

  toggleAutogoalSoundEffects() {
    this.updateConfig({ autogoalSoundEffects: !this.config().autogoalSoundEffects });
  }

  playEffect(effectId: 'whistle_kickoff' | 'whistle_final' | 'goal_celebration' | 'sad_trombone') {
    try {
      if (!this.htmlSynthAudio) return;
      let blobUrl = this.wavBlobUrlCache.get(effectId);
      if (!blobUrl) {
        blobUrl = this.buildEffectWavBlobUrl(effectId);
        this.wavBlobUrlCache.set(effectId, blobUrl);
      }
      this.previewingEffectId.set(effectId);
      this.htmlSynthAudio.src = blobUrl;
      this.htmlSynthAudio.volume = 1.0;
      this.htmlSynthAudio.currentTime = 0;
      this.htmlSynthAudio.onended = () => {
        this.previewingEffectId.set(null);
      };
      this.htmlSynthAudio.onerror = () => {
        this.previewingEffectId.set(null);
      };
      this.htmlSynthAudio.play().catch(() => {
        this.previewingEffectId.set(null);
      });
    } catch {
      this.previewingEffectId.set(null);
    }
  }

  stopEffect() {
    if (this.htmlSynthAudio) {
      try {
        this.htmlSynthAudio.pause();
        this.htmlSynthAudio.currentTime = 0;
      } catch {}
    }
    this.previewingEffectId.set(null);
  }

  playMatchWhistle(type: 'kickoff' | 'final') {
    if (!this.config().matchWhistleEffects) return;
    this.playEffect(type === 'kickoff' ? 'whistle_kickoff' : 'whistle_final');
  }

  playGoalSound(isAutogoal: boolean = false) {
    if (isAutogoal) {
      if (this.config().autogoalSoundEffects) {
        this.playEffect('sad_trombone');
      }
    } else {
      if (this.config().goalSoundEffects) {
        this.playEffect('goal_celebration');
      }
    }
  }

  selectGkSound(id: GkSoundId) {
    const valid = this.gkPresets.some((p) => p.id === id) ? id : 'cambio_wav';
    this.updateConfig({ selectedGkSoundId: valid });
  }

  resetToDefaults() {
    this.stopAllSounds();
    this.config.set({ ...DEFAULT_SOUND_CONFIG });
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {}
  }

  /**
   * Sblocco audio su interazione utente (iOS Safari / mobile)
   */
  unlockAudioOnUserGesture() {
    try {
      if (this.htmlAudioCambio) {
        this.htmlAudioCambio.load();
      }
    } catch {}
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ANTEPRIMA SUONO (DALLA SEZIONE IMPOSTAZIONI)
  // ──────────────────────────────────────────────────────────────────────────

  togglePreviewGkSound(soundId: GkSoundId) {
    if (this.previewingSoundId() === soundId) {
      this.stopPreview();
      return;
    }
    this.stopAllSounds();
    this.previewingSoundId.set(soundId);

    const cfg = this.config();
    if (cfg.voiceAnnouncement || soundId === 'voice_only') {
      this.playGkCycleWithVoiceAfter(soundId, 'Cambio portiere! Prova vocale con voce naturale!');
    } else {
      this.triggerSoundBurst(soundId);
    }

    this.previewTimeoutId = setTimeout(() => {
      if (this.previewingSoundId() === soundId) {
        this.stopPreview();
      }
    }, 4800);
  }

  stopPreview() {
    if (this.previewTimeoutId) {
      clearTimeout(this.previewTimeoutId);
      this.previewTimeoutId = null;
    }
    if (this.loopIntervalId && !this.isMatchAlarmPlaying()) {
      clearInterval(this.loopIntervalId);
      this.loopIntervalId = null;
    }
    this.previewingSoundId.set(null);
    this.stopImmediateAudioElements();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ALLARME CAMBIO PORTIERE LIVE IN PARTITA (LOOP CONTINUO FINO A STOP)
  // ──────────────────────────────────────────────────────────────────────────

  startMatchCambioAlarm(gkNamesSpeechText?: string) {
    this.stopPreview();
    if (this.isMatchAlarmPlaying()) {
      if (gkNamesSpeechText) {
        this.currentMatchGkText = gkNamesSpeechText;
      }
      return;
    }

    this.isMatchAlarmPlaying.set(true);
    this.currentMatchGkText = gkNamesSpeechText || 'Cambio portiere!';

    const cfg = this.config();
    const soundId = cfg.selectedGkSoundId;

    // 1° ciclo immediato: suono acustico + annuncio vocale nomi
    this.playGkCycleWithVoiceAfter(soundId, this.currentMatchGkText);

    // Loop continuo ogni 7.5 secondi fino a STOP manuale premuto
    if (this.loopIntervalId) {
      clearInterval(this.loopIntervalId);
    }
    this.loopIntervalId = setInterval(() => {
      if (!this.isMatchAlarmPlaying()) return;
      this.playGkCycleWithVoiceAfter(soundId, this.currentMatchGkText);
    }, 7500);

    // Vibrazione continua finché l'allarme è attivo
    if (cfg.vibrationAlert) {
      this.triggerVibrationPattern([500, 200, 500, 200, 600]);
      if (this.vibrationIntervalId) {
        clearInterval(this.vibrationIntervalId);
      }
      this.vibrationIntervalId = setInterval(() => {
        if (this.isMatchAlarmPlaying() && this.config().vibrationAlert) {
          this.triggerVibrationPattern([500, 200, 500, 200, 600]);
        }
      }, 3000);
    }
  }

  stopMatchCambioAlarm() {
    this.isMatchAlarmPlaying.set(false);
    if (this.loopIntervalId) {
      clearInterval(this.loopIntervalId);
      this.loopIntervalId = null;
    }
    if (this.vibrationIntervalId) {
      clearInterval(this.vibrationIntervalId);
      this.vibrationIntervalId = null;
    }
    if (this.speechTimeoutId) {
      clearTimeout(this.speechTimeoutId);
      this.speechTimeoutId = null;
    }
    this.stopImmediateAudioElements();
  }

  stopAllSounds() {
    this.stopPreview();
    this.stopMatchCambioAlarm();
  }

  private stopImmediateAudioElements() {
    try {
      if (this.htmlAudioCambio) {
        this.htmlAudioCambio.pause();
        this.htmlAudioCambio.currentTime = 0;
      }
      if (this.htmlSynthAudio) {
        this.htmlSynthAudio.pause();
        this.htmlSynthAudio.currentTime = 0;
      }
      if (
        typeof window !== 'undefined' &&
        'speechSynthesis' in window &&
        window.speechSynthesis.speaking
      ) {
        window.speechSynthesis.cancel();
      }
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(0);
      }
    } catch {}
  }

  private triggerVibrationPattern(pattern: number | number[]) {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(pattern);
      }
    } catch {}
  }

  // ──────────────────────────────────────────────────────────────────────────
  // RIPRODUZIONE AUDIO E VOCE NATURALE
  // ──────────────────────────────────────────────────────────────────────────

  private playGkCycleWithVoiceAfter(soundId: GkSoundId, speechText?: string) {
    const cfg = this.config();

    // 1. Suona l'effetto acustico
    this.triggerSoundBurst(soundId);

    if (this.speechTimeoutId) {
      clearTimeout(this.speechTimeoutId);
      this.speechTimeoutId = null;
    }

    const shouldSpeak =
      (cfg.voiceAnnouncement || soundId === 'voice_only') && Boolean(speechText);

    if (shouldSpeak) {
      const delay = soundId === 'voice_only' ? 100 : 1200;
      this.speechTimeoutId = setTimeout(() => {
        if ((this.isMatchAlarmPlaying() || this.previewingSoundId()) && speechText) {
          this.speakLoud(speechText);
        }
      }, delay);
    }
  }

  private triggerSoundBurst(soundId: GkSoundId) {
    if (soundId === 'voice_only') {
      return;
    }

    if (soundId === 'cambio_wav') {
      if (this.htmlAudioCambio) {
        this.htmlAudioCambio.pause();
        this.htmlAudioCambio.loop = false;
        this.htmlAudioCambio.volume = 1.0;
        this.htmlAudioCambio.currentTime = 0;
        this.htmlAudioCambio.play().catch(() => {});
      }
      return;
    }

    // Per gli altri preset sportivi riproduce il relativo file WAV naturale pulito
    this.playPresetWav(soundId);
  }

  private playPresetWav(soundId: GkSoundId) {
    try {
      if (!this.htmlSynthAudio) return;
      let blobUrl = this.wavBlobUrlCache.get(soundId);
      if (!blobUrl) {
        blobUrl = this.buildAlarmWavBlobUrl(soundId);
        this.wavBlobUrlCache.set(soundId, blobUrl);
      }
      this.htmlSynthAudio.src = blobUrl;
      this.htmlSynthAudio.volume = 1.0;
      this.htmlSynthAudio.currentTime = 0;
      this.htmlSynthAudio.play().catch(() => {});
    } catch {}
  }

  private buildAlarmWavBlobUrl(soundId: GkSoundId): string {
    const sampleRate = 22050;
    let durationSec = 1.1;
    if (soundId === 'stadium_chime') durationSec = 1.3;
    else if (soundId === 'stadium_horn') durationSec = 1.15;
    else if (soundId === 'nba_buzzer') durationSec = 0.65;

    const numSamples = Math.floor(sampleRate * durationSec);
    const samples = new Float32Array(numSamples);

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      let sample = 0;

      switch (soundId) {
        case 'referee_whistle': {
          // Fischietto d'arbitro naturale con trillo a 24 Hz (fi-fiii!)
          const inWhistle = (t >= 0 && t < 0.16) || (t >= 0.24 && t < 0.85);
          if (inWhistle) {
            const trill = 1 + 0.045 * Math.sin(2 * Math.PI * 24 * t);
            const f1 = 2200 * trill;
            const f2 = 2750 * trill;
            const blastT = t < 0.24 ? t : t - 0.24;
            const dur = t < 0.24 ? 0.16 : 0.61;
            const env = Math.min(1.0, blastT * 40) * Math.min(1.0, (dur - blastT) * 35);
            sample = (0.65 * Math.sin(2 * Math.PI * f1 * t) + 0.35 * Math.sin(2 * Math.PI * f2 * t)) * Math.max(0, env);
          }
          break;
        }

        case 'stadium_chime': {
          // Ding-Dong da stadio squillante e armonico (E5 659Hz -> C5 523Hz)
          if (t < 0.5) {
            const decay = Math.exp(-t * 4.2);
            sample = (0.7 * Math.sin(2 * Math.PI * 659.25 * t) + 0.3 * Math.sin(2 * Math.PI * 1318.5 * t)) * decay;
          } else {
            const t2 = t - 0.5;
            const decay = Math.exp(-t2 * 3.6);
            sample = (0.75 * Math.sin(2 * Math.PI * 523.25 * t2) + 0.25 * Math.sin(2 * Math.PI * 1046.5 * t2)) * decay;
          }
          break;
        }

        case 'stadium_horn': {
          // Tromba da curva/campo: doppio squillo accordo d'ottoni (C4 + E4 + G4)
          const inBlast = (t >= 0 && t < 0.22) || (t >= 0.32 && t < 0.85);
          if (inBlast) {
            const blastT = t < 0.32 ? t : t - 0.32;
            const dur = t < 0.32 ? 0.22 : 0.53;
            const env = Math.min(1.0, blastT * 30) * Math.min(1.0, (dur - blastT) * 25);
            sample = (
              0.40 * Math.sin(2 * Math.PI * 261.63 * t) +
              0.35 * Math.sin(2 * Math.PI * 329.63 * t) +
              0.25 * Math.sin(2 * Math.PI * 392.00 * t)
            ) * Math.max(0, env);
          }
          break;
        }

        case 'nba_buzzer': {
          // Buzzer da tabellone da 0.6s rotondo e pieno
          if (t < 0.6) {
            const env = Math.min(1.0, t * 50) * Math.min(1.0, (0.6 - t) * 15);
            sample = (
              0.45 * Math.sin(2 * Math.PI * 330 * t) +
              0.35 * Math.sin(2 * Math.PI * 440 * t) +
              0.20 * Math.sin(2 * Math.PI * 550 * t)
            ) * Math.max(0, env);
          }
          break;
        }

        default:
          sample = 0;
          break;
      }

      samples[i] = Math.max(-0.95, Math.min(0.95, sample * 0.95));
    }

    return this.encodeWav(samples, sampleRate);
  }

  private encodeWav(samples: Float32Array, sampleRate: number): string {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    const writeStr = (offset: number, str: string) => {
      for (let j = 0; j < str.length; j++) {
        view.setUint8(offset + j, str.charCodeAt(j));
      }
    };

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }

    const blob = new Blob([buffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  }

  private buildEffectWavBlobUrl(effectId: string): string {
    const sampleRate = 22050;
    let durationSec = 1.0;
    if (effectId === 'whistle_kickoff') durationSec = 0.65;
    else if (effectId === 'whistle_final') durationSec = 1.4;
    else if (effectId === 'goal_celebration') durationSec = 1.35;
    else if (effectId === 'sad_trombone') durationSec = 1.85;

    const numSamples = Math.floor(sampleRate * durationSec);
    const samples = new Float32Array(numSamples);

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      let sample = 0;

      switch (effectId) {
        case 'whistle_kickoff': {
          // Fischio d'inizio singolo limpido e squillante (2450Hz & 2880Hz con trillo a 28 Hz)
          if (t < 0.62) {
            const trill = 1 + 0.05 * Math.sin(2 * Math.PI * 28 * t);
            const env = Math.min(1.0, t * 40) * Math.min(1.0, (0.62 - t) * 20);
            sample = (0.6 * Math.sin(2 * Math.PI * 2450 * trill * t) + 0.4 * Math.sin(2 * Math.PI * 2880 * trill * t)) * Math.max(0, env);
          }
          break;
        }

        case 'whistle_final': {
          // Triplice fischio finale d'arbitro: blast1 (0.22s), blast2 (0.22s), blast3 (0.65s)
          const inB1 = t >= 0 && t < 0.22;
          const inB2 = t >= 0.34 && t < 0.56;
          const inB3 = t >= 0.68 && t < 1.35;
          if (inB1 || inB2 || inB3) {
            const trill = 1 + 0.05 * Math.sin(2 * Math.PI * 28 * t);
            let bT = 0;
            let bDur = 0.22;
            if (inB1) { bT = t; bDur = 0.22; }
            else if (inB2) { bT = t - 0.34; bDur = 0.22; }
            else { bT = t - 0.68; bDur = 0.67; }
            const env = Math.min(1.0, bT * 40) * Math.min(1.0, (bDur - bT) * 25);
            sample = (0.6 * Math.sin(2 * Math.PI * 2450 * trill * t) + 0.4 * Math.sin(2 * Math.PI * 2880 * trill * t)) * Math.max(0, env);
          }
          break;
        }

        case 'goal_celebration': {
          // Fanfara tromba d'aria stadio per il gol (PA-PA-PAAAA!)
          const inB1 = t >= 0 && t < 0.18;
          const inB2 = t >= 0.24 && t < 0.42;
          const inB3 = t >= 0.48 && t < 1.30;
          if (inB1 || inB2 || inB3) {
            let bT = 0;
            let bDur = 0.18;
            if (inB1) { bT = t; bDur = 0.18; }
            else if (inB2) { bT = t - 0.24; bDur = 0.18; }
            else { bT = t - 0.48; bDur = 0.82; }
            const env = Math.min(1.0, bT * 35) * Math.min(1.0, (bDur - bT) * 20);
            sample = (
              0.35 * Math.sin(2 * Math.PI * 261.63 * t) +
              0.30 * Math.sin(2 * Math.PI * 329.63 * t) +
              0.25 * Math.sin(2 * Math.PI * 392.00 * t) +
              0.20 * Math.sin(2 * Math.PI * 523.25 * t)
            ) * Math.max(0, env);
          }
          break;
        }

        case 'sad_trombone': {
          // Trombone comico "wah-wah-waaah" per autogol
          const step1 = t >= 0 && t < 0.32;
          const step2 = t >= 0.35 && t < 0.67;
          const step3 = t >= 0.70 && t < 1.02;
          const step4 = t >= 1.06 && t < 1.80;
          if (step1) {
            const rel = t / 0.32;
            const f = 784 - rel * 44;
            const env = Math.min(1.0, t * 30) * Math.min(1.0, (0.32 - t) * 20);
            sample = (0.7 * Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 2 * t)) * env;
          } else if (step2) {
            const rel = (t - 0.35) / 0.32;
            const f = 740 - rel * 42;
            const env = Math.min(1.0, (t - 0.35) * 30) * Math.min(1.0, (0.67 - t) * 20);
            sample = (0.7 * Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 2 * t)) * env;
          } else if (step3) {
            const rel = (t - 0.70) / 0.32;
            const f = 698 - rel * 39;
            const env = Math.min(1.0, (t - 0.70) * 30) * Math.min(1.0, (1.02 - t) * 20);
            sample = (0.7 * Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 2 * t)) * env;
          } else if (step4) {
            const rel = (t - 1.06) / 0.74;
            const vibrato = 1 + 0.03 * Math.sin(2 * Math.PI * 6 * t);
            const f = (622 - rel * 156) * vibrato;
            const env = Math.min(1.0, (t - 1.06) * 25) * Math.min(1.0, (1.80 - t) * 5);
            sample = (0.75 * Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(2 * Math.PI * f * 2 * t)) * env;
          }
          break;
        }

        default:
          sample = 0;
          break;
      }

      samples[i] = Math.max(-0.95, Math.min(0.95, sample * 0.95));
    }

    return this.encodeWav(samples, sampleRate);
  }


  // ──────────────────────────────────────────────────────────────────────────
  // SINTESI VOCALE NATURALE (ITALIANA, NON ROBOTICA)
  // ──────────────────────────────────────────────────────────────────────────

  private findBestItalianVoice(): SpeechSynthesisVoice | null {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    const itVoices = voices.filter(
      (v) => v.lang && (v.lang.toLowerCase().startsWith('it') || v.lang.toLowerCase().includes('it'))
    );
    if (itVoices.length === 0) return null;

    const scoreVoice = (v: SpeechSynthesisVoice): number => {
      const name = v.name.toLowerCase();
      if (name.includes('online') || name.includes('natural')) return 100;
      if (name.includes('google')) return 85;
      if (name.includes('premium') || name.includes('enhanced') || name.includes('siri')) return 75;
      if (v.localService === false) return 60;
      if (name.includes('alice') || name.includes('federica') || name.includes('luca')) return 50;
      if (name.includes('cosimo') || name.includes('desktop') || name.includes('sapi')) return 10;
      return 30;
    };

    const sorted = [...itVoices].sort((a, b) => scoreVoice(b) - scoreVoice(a));
    return sorted[0] || itVoices[0];
  }

  private speakLoud(text: string) {
    // 1. Utilizza prima il motore professionale TtsService (ElevenLabs / Gemini TTS con voce umana)
    if (this.tts) {
      try {
        const hash = computeTextHash(text);
        this.tts.play(text, 'gk_voice_' + hash);
        return;
      } catch (err) {
        console.warn('TtsService fallito, uso sintesi vocale naturale browser:', err);
      }
    }

    // 2. Fallback su sintesi vocale browser con prioritizzazione neurale naturale
    try {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        return;
      }
      window.speechSynthesis.cancel();

      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'it-IT';
      utter.volume = 1.0;
      utter.rate = 1.0;
      utter.pitch = 1.0;

      const voice = this.cachedBestVoice || this.findBestItalianVoice();
      if (voice) {
        utter.voice = voice;
      }

      this.activeUtterance = utter;
      utter.onend = () => {
        this.activeUtterance = null;
      };
      utter.onerror = () => {
        this.activeUtterance = null;
      };

      window.speechSynthesis.speak(utter);
    } catch {}
  }
}
