import { Injectable, signal, computed } from '@angular/core';

export type GkSoundId =
  | 'cambio_wav'
  | 'hyper_siren'
  | 'stadium_airhorn'
  | 'referee_mega_whistle'
  | 'nuclear_klaxon'
  | 'nba_buzzer'
  | 'police_hilo'
  | 'boxing_gong'
  | 'megaphone_voice'
  | 'cyber_panic'
  | 'ship_foghorn'
  | 'time_bomb';

export type GoalSoundId =
  | 'none'
  | 'stadium_horn'
  | 'arcade_goal'
  | 'referee_goal'
  | 'laser_goal';

export type QuickSoundboardId =
  | 'whistle'
  | 'triple_whistle'
  | 'airhorn'
  | 'var_siren'
  | 'goal_celebration'
  | 'sad_trombone';

export interface GkSoundPreset {
  id: GkSoundId;
  name: string;
  emoji: string;
  badge: string;
  intensity: 'MAX' | 'ESTREMA';
  freqLabel: string;
  description: string;
}

export interface GoalSoundPreset {
  id: GoalSoundId;
  name: string;
  emoji: string;
  description: string;
}

export interface SuperUserSoundConfig {
  selectedGkSoundId: GkSoundId;
  turboVolumeBoost: boolean;
  voiceAnnouncement: boolean;
  vibrationAlert: boolean;
  gkTurnMinutes: number;
  preAlert30Sec: boolean;
  goalSoundId: GoalSoundId;
  autogoalSoundEffect: boolean;
  matchWhistleEffects: boolean;
}

const STORAGE_KEY = 'calcetto_superuser_sound_settings_v1';

export const DEFAULT_SOUND_CONFIG: SuperUserSoundConfig = {
  selectedGkSoundId: 'hyper_siren',
  turboVolumeBoost: true,
  voiceAnnouncement: true,
  vibrationAlert: true,
  gkTurnMinutes: 5,
  preAlert30Sec: true,
  goalSoundId: 'stadium_horn',
  autogoalSoundEffect: true,
  matchWhistleEffects: true,
};

export const GK_SOUND_PRESETS: GkSoundPreset[] = [
  {
    id: 'cambio_wav',
    name: 'Originale "CAMBIO!" (Turbo)',
    emoji: '🎺',
    badge: 'STORICO + BOOST',
    intensity: 'MAX',
    freqLabel: 'WAV + 2.4kHz Boost',
    description:
      'Il leggendario file CAMBIO.wav abbinato a un rinforzo armonico per sentirsi ancora più forte.',
  },
  {
    id: 'hyper_siren',
    name: 'Sirena Antiaerea Stadio',
    emoji: '🚨',
    badge: 'PIÙ FORTE IN CAMPO',
    intensity: 'ESTREMA',
    freqLabel: '900–2800 Hz Sawtooth',
    description:
      'Doppia sirena d’emergenza modulata sulla frequenza di risonanza massima degli speaker smartphone.',
  },
  {
    id: 'stadium_airhorn',
    name: 'Bomboletta da Curva (Air Horn)',
    emoji: '📯',
    badge: 'CURVA SUD',
    intensity: 'ESTREMA',
    freqLabel: 'Multi-Horn 0 dBFS',
    description:
      'Tripla tromba da stadio ad aria compressa (PA-PA-PAAAA!) ad altissima pressione sonora.',
  },
  {
    id: 'referee_mega_whistle',
    name: 'Fischietto Arbitro Fox-40 Ultra',
    emoji: '🏁',
    badge: 'TAGLIA-RUMORE',
    intensity: 'ESTREMA',
    freqLabel: '2950 + 3250 Hz FM',
    description:
      'Triplo fischio arbitrale acutissimo con trillo reale. Buca qualsiasi schiamazzo a bordocampo.',
  },
  {
    id: 'nuclear_klaxon',
    name: 'Allarme Nucleare / Bunker',
    emoji: '☢️',
    badge: 'ALLERTA ROSSA',
    intensity: 'ESTREMA',
    freqLabel: '1100–2500 Hz Square',
    description:
      'Klaxon militare ad onda quadra saturata con impulsi d’emergenza martellanti.',
  },
  {
    id: 'nba_buzzer',
    name: 'Sirena Palazzetto NBA',
    emoji: '🏀',
    badge: 'FINE QUARTO',
    intensity: 'MAX',
    freqLabel: 'Cluster Buzzer + Beep',
    description:
      'Il celebre buzzer ruvido e potentissimo da tabellone luminoso, seguito da triplo segnale acuto.',
  },
  {
    id: 'police_hilo',
    name: 'Sirena Emergenza Bitonale',
    emoji: '🚓',
    badge: '50 METRI',
    intensity: 'ESTREMA',
    freqLabel: '960 / 1920 Hz Hi-Lo',
    description:
      'Alternanza secca 960 Hz / 1920 Hz ad onda quadra pura, studiata per sentirsi da porta a porta.',
  },
  {
    id: 'boxing_gong',
    name: 'Triplo Gong da Boxe + Buzzer',
    emoji: '🥊',
    badge: 'CAMBIO ROUND',
    intensity: 'MAX',
    freqLabel: '1650 / 2850 Hz Bell',
    description:
      'Tre colpi metallici squillanti di campana da ring (DIN-DIN-DIN!) seguiti dalla sirena di cambio.',
  },
  {
    id: 'megaphone_voice',
    name: 'Megafono + Urlo "CAMBIO PORTIERE!"',
    emoji: '📢',
    badge: 'VOCE + SIRENA',
    intensity: 'ESTREMA',
    freqLabel: 'Sirena + Speaker TTS',
    description:
      'Colpi di sirena d’attenzione seguiti dallo speaker a tutto volume che urla il cambio e i nomi.',
  },
  {
    id: 'cyber_panic',
    name: 'Laser UFO Piercer (3200 Hz)',
    emoji: '⚡',
    badge: 'IPER ACUTO',
    intensity: 'ESTREMA',
    freqLabel: '1500–3400 Hz Hyper',
    description:
      'Arpeggio frenetico nella banda 3 kHz dove l’orecchio umano ha il picco assoluto di sensibilità.',
  },
  {
    id: 'ship_foghorn',
    name: 'Corno da Nave + Fischio Vapore',
    emoji: '🚢',
    badge: 'DOPPIO IMPATTO',
    intensity: 'MAX',
    freqLabel: '350 + 2200 Hz Blast',
    description:
      'Combina il boato potente di una sirena navale con un fischio acuto perforante a impulsi.',
  },
  {
    id: 'time_bomb',
    name: 'Bomba a Tempo + Detonazione',
    emoji: '💣',
    badge: 'ADRENALINA',
    intensity: 'ESTREMA',
    freqLabel: 'Accelerando 1.8–3.5 kHz',
    description:
      'Beep rapidissimi in accelerazione tipo C4 che esplodono in una sirena continua a tutto volume.',
  },
];

export const GOAL_SOUND_PRESETS: GoalSoundPreset[] = [
  {
    id: 'stadium_horn',
    name: 'Tromba Stadio + Esultanza',
    emoji: '📯',
    description: 'Doppio colpo di tromba da curva quando segni un gol',
  },
  {
    id: 'arcade_goal',
    name: 'Jingle Arcade Power-Up',
    emoji: '🕹️',
    description: 'Fanfara elettronica vittoriosa stile sala giochi',
  },
  {
    id: 'referee_goal',
    name: 'Fischio Convalida + Gong',
    emoji: '🏁',
    description: 'Fischio secco dell’arbitro che indica il centrocampo',
  },
  {
    id: 'laser_goal',
    name: 'Sirena Laser Gol',
    emoji: '⚡',
    description: 'Effetto futuristico rapido ad alta energia',
  },
  {
    id: 'none',
    name: 'Nessun suono al Gol',
    emoji: '🔇',
    description: 'Silenzioso (solo feedback visivo e vibrazione)',
  },
];

@Injectable({
  providedIn: 'root',
})
export class SoundSettingsService {
  readonly gkPresets = GK_SOUND_PRESETS;
  readonly goalPresets = GOAL_SOUND_PRESETS;

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

  private audioCtx: AudioContext | null = null;
  private htmlAudioCambio: HTMLAudioElement | null = null;
  private htmlSynthAudio: HTMLAudioElement | null = null;
  private wavBlobUrlCache = new Map<string, string>();

  private loopIntervalId: ReturnType<typeof setInterval> | null = null;
  private previewTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private vibrationIntervalId: ReturnType<typeof setInterval> | null = null;
  private currentMatchGkText: string = '';

  constructor() {
    if (typeof window !== 'undefined') {
      this.htmlAudioCambio = new Audio('/assets/sound/CAMBIO.wav');
      this.htmlAudioCambio.preload = 'auto';
      this.htmlSynthAudio = new Audio();
      this.htmlSynthAudio.preload = 'auto';
    }
  }

  private loadConfig(): SuperUserSoundConfig {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          return {
            ...DEFAULT_SOUND_CONFIG,
            ...parsed,
          };
        }
      }
    } catch (e) {
      console.warn('Impossibile leggere impostazioni audio salvate:', e);
    }
    return { ...DEFAULT_SOUND_CONFIG };
  }

  private saveConfig(cfg: SuperUserSoundConfig) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
      }
    } catch (e) {
      console.warn('Impossibile salvare impostazioni audio:', e);
    }
  }

  updateConfig(partial: Partial<SuperUserSoundConfig>) {
    this.config.update((prev) => {
      const updated = { ...prev, ...partial };
      this.saveConfig(updated);
      return updated;
    });
  }

  selectGkSound(id: GkSoundId) {
    this.updateConfig({ selectedGkSoundId: id });
  }

  resetToDefaults() {
    this.stopAllSounds();
    this.config.set({ ...DEFAULT_SOUND_CONFIG });
    this.saveConfig(DEFAULT_SOUND_CONFIG);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SBLOCCO AUDIO CONTEXT & CANALE MEDIA MOBILE (iOS / ANDROID)
  // ──────────────────────────────────────────────────────────────────────────

  unlockAudioOnUserGesture() {
    try {
      const ctx = this.getOrCreateAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      if (this.htmlAudioCambio) {
        this.htmlAudioCambio.volume = 1.0;
        this.htmlAudioCambio
          .play()
          .then(() => {
            this.htmlAudioCambio!.pause();
            this.htmlAudioCambio!.currentTime = 0;
          })
          .catch(() => {});
      }
    } catch {}
  }

  private getOrCreateAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const AudioCtx =
        window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.audioCtx = new AudioCtx();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
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

    // Esegue subito il ciclo sonoro + un secondo ciclo per 5.2 secondi totali
    this.playSingleGkCycle(soundId, 'Cambio portiere! Test volume massimo!');

    this.loopIntervalId = setInterval(() => {
      if (this.previewingSoundId() === soundId) {
        this.playSingleGkCycle(soundId, 'Cambio portiere!');
      }
    }, 2600);

    this.previewTimeoutId = setTimeout(() => {
      if (this.previewingSoundId() === soundId) {
        this.stopPreview();
      }
    }, 5300);
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
      this.currentMatchGkText = gkNamesSpeechText || this.currentMatchGkText;
      return;
    }

    this.isMatchAlarmPlaying.set(true);
    this.currentMatchGkText =
      gkNamesSpeechText || 'Attenzione! Cambio portiere!';

    const cfg = this.config();
    const soundId = cfg.selectedGkSoundId;

    // 1° ciclo immediato
    let cycleCount = 0;
    this.playSingleGkCycle(soundId, this.currentMatchGkText, true);

    // Loop continuo ogni 2.7 secondi fino a quando il Super User preme STOP
    this.loopIntervalId = setInterval(() => {
      if (!this.isMatchAlarmPlaying()) return;
      cycleCount++;
      const shouldSpeakThisCycle =
        (cfg.voiceAnnouncement || soundId === 'megaphone_voice') &&
        cycleCount % 2 === 1;
      this.playSingleGkCycle(
        soundId,
        shouldSpeakThisCycle ? this.currentMatchGkText : undefined,
        shouldSpeakThisCycle
      );
    }, 2700);

    // Vibrazione continua di emergenza se attiva
    if (cfg.vibrationAlert) {
      this.triggerVibrationPattern([500, 150, 500, 150, 700]);
      this.vibrationIntervalId = setInterval(() => {
        if (this.isMatchAlarmPlaying() && this.config().vibrationAlert) {
          this.triggerVibrationPattern([500, 150, 500, 150, 700]);
        }
      }, 2500);
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
  // MOTORE DI RIPRODUZIONE IBRIDO AD ALTISSIMO VOLUME (WAV 0dBFS + WEBAUDIO)
  // ──────────────────────────────────────────────────────────────────────────

  private playSingleGkCycle(
    soundId: GkSoundId,
    speechText?: string,
    forceVoiceCheck: boolean = false
  ) {
    const cfg = this.config();
    const boost = cfg.turboVolumeBoost;

    // 1. Se è "cambio_wav", suona il file originale /assets/sound/CAMBIO.wav al 100%
    //    E se Turbo Boost è attivo, aggiunge un rinforzo di armoniche alte per bucare il campo
    if (soundId === 'cambio_wav') {
      if (this.htmlAudioCambio) {
        this.htmlAudioCambio.loop = false;
        this.htmlAudioCambio.volume = 1.0;
        this.htmlAudioCambio.currentTime = 0;
        this.htmlAudioCambio.play().catch(() => {});
      }
      if (boost) {
        this.playWebAudioBoosterOverlay();
      }
    } else {
      // 2. Per i 11 segnali iper-avvisanti:
      //    Riproduce sia tramite HTMLAudioElement (con WAV 0dBFS generato in memoria, che buca anche il silenzioso iOS!)
      //    sia tramite WebAudio API con compressore brickwall per raddoppiare la presenza sonora!
      this.playGeneratedWavOnMediaChannel(soundId, boost);
      this.playWebAudioSynthCycle(soundId, boost);
    }

    // 3. Sintesi vocale opzionale ("CAMBIO PORTIERE!")
    const shouldSpeak =
      soundId === 'megaphone_voice' ||
      (forceVoiceCheck && cfg.voiceAnnouncement);
    if (shouldSpeak && speechText) {
      this.speakLoud(speechText);
    }
  }

  private speakLoud(text: string) {
    try {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        return;
      }
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'it-IT';
      utter.volume = 1.0;
      utter.rate = 1.08;
      utter.pitch = 1.15;
      window.speechSynthesis.speak(utter);
    } catch {}
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GENERATORE WAV 16-BIT PCM 0 dBFS (MASSIMA PRESSIONE SONORA SU SPEAKER TELEFONO)
  // ──────────────────────────────────────────────────────────────────────────

  private playGeneratedWavOnMediaChannel(soundId: GkSoundId, boost: boolean) {
    try {
      if (!this.htmlSynthAudio) return;
      const cacheKey = `${soundId}_${boost ? 'boost' : 'norm'}`;
      let blobUrl = this.wavBlobUrlCache.get(cacheKey);
      if (!blobUrl) {
        blobUrl = this.buildAlarmWavBlobUrl(soundId, boost);
        this.wavBlobUrlCache.set(cacheKey, blobUrl);
      }
      this.htmlSynthAudio.src = blobUrl;
      this.htmlSynthAudio.volume = 1.0;
      this.htmlSynthAudio.currentTime = 0;
      this.htmlSynthAudio.play().catch(() => {});
    } catch {}
  }

  /**
   * Sintetizza un buffer WAV 16-bit 22050Hz normalizzato a 0 dBFS con soft-clipping
   * brickwall, così ogni singolo campione sfrutta il 100% del DAC dello smartphone.
   */
  private buildAlarmWavBlobUrl(soundId: GkSoundId, boost: boolean): string {
    const sampleRate = 22050;
    const durationSec = 2.4;
    const numSamples = Math.floor(sampleRate * durationSec);
    const samples = new Float32Array(numSamples);

    let phase1 = 0;
    let phase2 = 0;
    let phase3 = 0;

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      let f1 = 1000;
      let f2 = 2000;
      let f3 = 0;
      let amp = 1.0;
      let waveType: 'saw' | 'square' | 'whistle' | 'bell' = 'square';

      switch (soundId) {
        case 'hyper_siren': {
          // Sweep rapido 900 Hz <-> 2850 Hz
          const lfo = Math.sin(2 * Math.PI * 1.6 * t);
          f1 = 1850 + 950 * lfo;
          f2 = f1 * 1.5;
          f3 = 2400;
          waveType = 'saw';
          break;
        }
        case 'stadium_airhorn': {
          // Pattern PA-PA-PAAAA! (0..0.28, 0.36..0.64, 0.72..2.25)
          const inBlast =
            (t >= 0 && t < 0.28) ||
            (t >= 0.36 && t < 0.64) ||
            (t >= 0.72 && t < 2.25);
          amp = inBlast ? 1.0 : 0.0;
          // Accordo dissonante da bomboletta stadio + ottava alta
          f1 = 580;
          f2 = 1160;
          f3 = 2320;
          waveType = 'saw';
          break;
        }
        case 'referee_mega_whistle': {
          // Triplo fischio arbitrale FI-FI-FIIIII! con trillo a 45 Hz
          const inBlast =
            (t >= 0 && t < 0.32) ||
            (t >= 0.42 && t < 0.74) ||
            (t >= 0.86 && t < 2.25);
          const trill = 0.65 + 0.35 * Math.sin(2 * Math.PI * 48 * t);
          amp = inBlast ? trill : 0.0;
          f1 = 2920;
          f2 = 3240;
          f3 = 1460;
          waveType = 'whistle';
          break;
        }
        case 'nuclear_klaxon': {
          // Impulsi di sweep ascendente 1000 -> 2600 Hz ogni 0.6s
          const cycleT = t % 0.6;
          amp = cycleT < 0.5 ? 1.0 : 0.0;
          f1 = 1000 + (cycleT / 0.5) * 1600;
          f2 = f1 * 2;
          f3 = 2500;
          waveType = 'square';
          break;
        }
        case 'nba_buzzer': {
          // Buzzer lungo 0..1.4s + 3 colpi acuti
          if (t < 1.4) {
            f1 = 290;
            f2 = 870;
            f3 = 2150;
            amp = 1.0;
          } else {
            const sub = (t - 1.4) % 0.3;
            amp = sub < 0.2 ? 1.0 : 0.0;
            f1 = 2200;
            f2 = 2750;
            f3 = 1100;
          }
          waveType = 'saw';
          break;
        }
        case 'police_hilo': {
          // Alternanza secca ogni 0.3s tra 960 Hz e 1920 Hz + armonica 2880 Hz
          const isHigh = Math.floor(t / 0.3) % 2 === 0;
          f1 = isHigh ? 1920 : 960;
          f2 = isHigh ? 2880 : 1920;
          f3 = 2400;
          waveType = 'square';
          break;
        }
        case 'boxing_gong': {
          // 3 colpi di gong (0, 0.38, 0.76) + sirena finale
          if (t < 1.25) {
            const hitT = t % 0.38;
            const decay = Math.exp(-hitT * 6.5);
            amp = Math.max(0.25, decay);
            f1 = 1680;
            f2 = 2790;
            f3 = 3360;
            waveType = 'bell';
          } else {
            f1 = 1950;
            f2 = 2600;
            f3 = 1300;
            waveType = 'square';
          }
          break;
        }
        case 'megaphone_voice': {
          // Sirena iniziale di attenzione (0..0.95s) poi lascia spazio/accompagna la voce
          if (t < 0.95) {
            f1 = 1400 + Math.sin(2 * Math.PI * 5 * t) * 700;
            f2 = f1 * 1.5;
            f3 = 2600;
            amp = 1.0;
          } else if (t > 2.0) {
            f1 = 2400;
            f2 = 3000;
            amp = 0.9;
          } else {
            amp = 0.0;
          }
          waveType = 'square';
          break;
        }
        case 'cyber_panic': {
          // Arpeggio rapidissimo 16 step al secondo tra 1600 e 3400 Hz
          const step = Math.floor(t * 18) % 4;
          const freqs = [1800, 2600, 2200, 3300];
          f1 = freqs[step];
          f2 = f1 * 0.5;
          f3 = 2900;
          waveType = 'square';
          break;
        }
        case 'ship_foghorn': {
          const inBlast = (t >= 0 && t < 0.95) || (t >= 1.15 && t < 2.25);
          amp = inBlast ? 1.0 : 0.0;
          f1 = 380;
          f2 = 1140;
          f3 = 2280;
          waveType = 'saw';
          break;
        }
        case 'time_bomb': {
          if (t < 1.45) {
            // Beep che accelerano
            const rate = 4 + t * 12;
            const pulse = Math.sin(2 * Math.PI * rate * t) > 0 ? 1.0 : 0.0;
            amp = pulse;
            f1 = 2000 + t * 900;
            f2 = f1 * 1.25;
            f3 = 3100;
          } else {
            // Detonazione sirena continua
            amp = 1.0;
            f1 = 2400 + Math.sin(2 * Math.PI * 12 * t) * 600;
            f2 = 1200;
            f3 = 3000;
          }
          waveType = 'square';
          break;
        }
        default: {
          f1 = 1800;
          f2 = 2400;
          break;
        }
      }

      phase1 += (2 * Math.PI * f1) / sampleRate;
      phase2 += (2 * Math.PI * f2) / sampleRate;
      phase3 += (2 * Math.PI * f3) / sampleRate;

      let raw = 0;
      if (waveType === 'square') {
        const s1 = Math.sin(phase1) >= 0 ? 1 : -1;
        const s2 = Math.sin(phase2) >= 0 ? 1 : -1;
        const s3 = f3 > 0 ? (Math.sin(phase3) >= 0 ? 1 : -1) : 0;
        raw = 0.5 * s1 + 0.35 * s2 + 0.25 * s3;
      } else if (waveType === 'saw') {
        const saw1 = 2 * ((phase1 / (2 * Math.PI)) % 1) - 1;
        const sq2 = Math.sin(phase2) >= 0 ? 1 : -1;
        const sq3 = f3 > 0 ? (Math.sin(phase3) >= 0 ? 1 : -1) : 0;
        raw = 0.45 * saw1 + 0.35 * sq2 + 0.3 * sq3;
      } else {
        raw =
          0.5 * Math.sin(phase1) +
          0.4 * Math.sin(phase2) +
          (f3 > 0 ? 0.25 * Math.sin(phase3) : 0);
      }

      // Overdrive brickwall (massimizza l'energia RMS per gli speaker piccoli)
      const drive = boost ? 3.2 : 1.8;
      const saturated = Math.tanh(raw * drive) * amp;
      samples[i] = Math.max(-0.99, Math.min(0.99, saturated));
    }

    return this.encodeWavFromFloat32(samples, sampleRate);
  }

  private encodeWavFromFloat32(
    samples: Float32Array,
    sampleRate: number
  ): string {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    const writeStr = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
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

  // ──────────────────────────────────────────────────────────────────────────
  // RINFORZO WEBAUDIO REAL-TIME CON COMPRESSORE BRICKWALL
  // ──────────────────────────────────────────────────────────────────────────

  private createMaximizedOutputChain(
    ctx: AudioContext,
    boost: boolean
  ): AudioNode {
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-28, ctx.currentTime);
    compressor.knee.setValueAtTime(0, ctx.currentTime);
    compressor.ratio.setValueAtTime(20, ctx.currentTime);
    compressor.attack.setValueAtTime(0.001, ctx.currentTime);
    compressor.release.setValueAtTime(0.05, ctx.currentTime);

    // Filtro peaking a 2450 Hz (massima proiezione acustica all'aperto da telefono)
    const presenceFilter = ctx.createBiquadFilter();
    presenceFilter.type = 'peaking';
    presenceFilter.frequency.setValueAtTime(2450, ctx.currentTime);
    presenceFilter.Q.setValueAtTime(1.0, ctx.currentTime);
    presenceFilter.gain.setValueAtTime(boost ? 10 : 4, ctx.currentTime);

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(boost ? 2.5 : 1.3, ctx.currentTime);

    presenceFilter.connect(compressor);
    compressor.connect(masterGain);
    masterGain.connect(ctx.destination);

    return presenceFilter;
  }

  private playWebAudioBoosterOverlay() {
    const ctx = this.getOrCreateAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const out = this.createMaximizedOutputChain(ctx, true);

    // Doppio colpo di fischio d'attenzione iniziale sopra il file CAMBIO.wav
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(2400, now);
    osc.frequency.setValueAtTime(2900, now + 0.14);
    g.gain.setValueAtTime(0.45, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

    osc.connect(g);
    g.connect(out);
    osc.start(now);
    osc.stop(now + 0.34);
  }

  private playWebAudioSynthCycle(soundId: GkSoundId, boost: boolean) {
    const ctx = this.getOrCreateAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const out = this.createMaximizedOutputChain(ctx, boost);

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'square';

    osc1.frequency.setValueAtTime(1850, now);
    osc1.frequency.linearRampToValueAtTime(2850, now + 0.45);
    osc1.frequency.linearRampToValueAtTime(1400, now + 0.9);

    osc2.frequency.setValueAtTime(2400, now);
    osc2.frequency.setValueAtTime(3100, now + 0.45);

    const duration = soundId === 'megaphone_voice' ? 0.9 : 1.8;
    gain.gain.setValueAtTime(0.85, now);
    gain.gain.setValueAtTime(0.85, now + duration - 0.05);
    gain.gain.linearRampToValueAtTime(0.001, now + duration);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(out);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + duration);
    osc2.stop(now + duration);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // EFFETTI SONORI LIVE PARTITA (PREAVVISO -30s, GOL, AUTOGOL, FISCHI ARBITRO)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Doppio beep acuto di preavviso (-30 secondi al cambio portiere)
   */
  playPreAlert30SecBeep() {
    if (!this.config().preAlert30Sec) return;
    const ctx = this.getOrCreateAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const out = this.createMaximizedOutputChain(
      ctx,
      this.config().turboVolumeBoost
    );

    for (let i = 0; i < 2; i++) {
      const start = now + i * 0.22;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(2600, start);
      g.gain.setValueAtTime(0.8, start);
      g.gain.exponentialRampToValueAtTime(0.01, start + 0.15);
      osc.connect(g);
      g.connect(out);
      osc.start(start);
      osc.stop(start + 0.16);
    }
    this.triggerVibrationPattern([150, 80, 150]);
  }

  /**
   * Suono quando viene registrato un Gol o un Autogol
   */
  playGoalSound(isAutogoal: boolean = false) {
    const cfg = this.config();
    if (isAutogoal) {
      if (cfg.autogoalSoundEffect) {
        this.playSadTrombone();
      }
      return;
    }

    if (cfg.goalSoundId === 'none') return;
    this.playGoalPresetById(cfg.goalSoundId);
  }

  playGoalPresetById(goalId: GoalSoundId) {
    if (goalId === 'none') return;
    const ctx = this.getOrCreateAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const out = this.createMaximizedOutputChain(
      ctx,
      this.config().turboVolumeBoost
    );

    if (goalId === 'stadium_horn') {
      // Doppio colpo di tromba da stadio (PA - PAAAA!)
      const times = [
        { s: 0, d: 0.22 },
        { s: 0.28, d: 0.65 },
      ];
      times.forEach((b) => {
        [523.25, 659.25, 1046.5, 2093].forEach((freq) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, now + b.s);
          g.gain.setValueAtTime(0.45, now + b.s);
          g.gain.exponentialRampToValueAtTime(0.01, now + b.s + b.d);
          osc.connect(g);
          g.connect(out);
          osc.start(now + b.s);
          osc.stop(now + b.s + b.d + 0.02);
        });
      });
    } else if (goalId === 'arcade_goal') {
      // Fanfara Do - Mi - Sol - Do alto!
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98];
      notes.forEach((freq, idx) => {
        const start = now + idx * 0.09;
        const dur = idx === notes.length - 1 ? 0.45 : 0.09;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, start);
        g.gain.setValueAtTime(0.7, start);
        g.gain.exponentialRampToValueAtTime(0.01, start + dur);
        osc.connect(g);
        g.connect(out);
        osc.start(start);
        osc.stop(start + dur + 0.02);
      });
    } else if (goalId === 'referee_goal') {
      this.playRefereeWhistleBlast(now, 0.55);
    } else if (goalId === 'laser_goal') {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(900, now);
      osc.frequency.exponentialRampToValueAtTime(3200, now + 0.25);
      osc.frequency.exponentialRampToValueAtTime(1400, now + 0.55);
      g.gain.setValueAtTime(0.85, now);
      g.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
      osc.connect(g);
      g.connect(out);
      osc.start(now);
      osc.stop(now + 0.62);
    }
  }

  /**
   * Trombone triste "Wah-Wah-Waaah" per Autogol / Papere
   */
  playSadTrombone() {
    const ctx = this.getOrCreateAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const out = this.createMaximizedOutputChain(
      ctx,
      this.config().turboVolumeBoost
    );

    const steps = [
      { fStart: 784, fEnd: 740, start: 0, dur: 0.28 },
      { fStart: 740, fEnd: 698, start: 0.32, dur: 0.28 },
      { fStart: 698, fEnd: 659, start: 0.64, dur: 0.28 },
      { fStart: 622, fEnd: 466, start: 0.96, dur: 0.75 },
    ];

    steps.forEach((st) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(st.fStart, now + st.start);
      osc.frequency.linearRampToValueAtTime(st.fEnd, now + st.start + st.dur);
      g.gain.setValueAtTime(0.75, now + st.start);
      g.gain.exponentialRampToValueAtTime(0.01, now + st.start + st.dur);
      osc.connect(g);
      g.connect(out);
      osc.start(now + st.start);
      osc.stop(now + st.start + st.dur + 0.02);
    });
  }

  /**
   * Fischio d'inizio (singolo) o Triplice Fischio Finale
   */
  playMatchWhistle(type: 'kickoff' | 'final') {
    if (!this.config().matchWhistleEffects) return;
    const ctx = this.getOrCreateAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (type === 'kickoff') {
      this.playRefereeWhistleBlast(now, 0.65);
    } else {
      // Triplice fischio finale: PIII - PIII - PIIIIII!
      this.playRefereeWhistleBlast(now, 0.28);
      this.playRefereeWhistleBlast(now + 0.38, 0.28);
      this.playRefereeWhistleBlast(now + 0.76, 0.9);
    }
  }

  private playRefereeWhistleBlast(startTime: number, duration: number) {
    const ctx = this.getOrCreateAudioContext();
    if (!ctx) return;
    const out = this.createMaximizedOutputChain(
      ctx,
      this.config().turboVolumeBoost
    );

    [2920, 3210].forEach((freq) => {
      const osc = ctx.createOscillator();
      const mod = ctx.createOscillator();
      const modGain = ctx.createGain();
      const g = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      // Trillo della pallina del fischietto a 48 Hz
      mod.type = 'square';
      mod.frequency.setValueAtTime(48, startTime);
      modGain.gain.setValueAtTime(140, startTime);
      mod.connect(modGain);
      modGain.connect(osc.frequency);

      g.gain.setValueAtTime(0.85, startTime);
      g.gain.setValueAtTime(0.85, startTime + Math.max(0.02, duration - 0.05));
      g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc.connect(g);
      g.connect(out);

      mod.start(startTime);
      osc.start(startTime);
      mod.stop(startTime + duration);
      osc.stop(startTime + duration);
    });
  }

  /**
   * Soundboard istantanea da bordo campo (1-tap)
   */
  playQuickSoundboard(id: QuickSoundboardId) {
    const ctx = this.getOrCreateAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.triggerVibrationPattern(60);

    switch (id) {
      case 'whistle':
        this.playRefereeWhistleBlast(now, 0.6);
        break;
      case 'triple_whistle':
        this.playRefereeWhistleBlast(now, 0.26);
        this.playRefereeWhistleBlast(now + 0.35, 0.26);
        this.playRefereeWhistleBlast(now + 0.7, 0.85);
        break;
      case 'airhorn':
        this.playGoalPresetById('stadium_horn');
        break;
      case 'var_siren': {
        const out = this.createMaximizedOutputChain(ctx, true);
        for (let i = 0; i < 4; i++) {
          const st = now + i * 0.16;
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(i % 2 === 0 ? 2200 : 1650, st);
          g.gain.setValueAtTime(0.8, st);
          g.gain.exponentialRampToValueAtTime(0.01, st + 0.13);
          osc.connect(g);
          g.connect(out);
          osc.start(st);
          osc.stop(st + 0.14);
        }
        this.speakLoud('Attenzione! Controllo VAR in corso!');
        break;
      }
      case 'goal_celebration':
        this.playGoalPresetById('arcade_goal');
        break;
      case 'sad_trombone':
        this.playSadTrombone();
        break;
    }
  }
}

