import {
  Component,
  Input,
  OnInit,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonIcon,
  IonChip,
  IonLabel,
  IonFooter,
  IonSpinner,
  ModalController,
  ToastController,
  LoadingController,
} from '@ionic/angular/standalone';
import { Storage } from '@angular/fire/storage';
import { ref, getBlob } from 'firebase/storage';
import { addIcons } from 'ionicons';
import {
  logoWhatsapp,
  shareSocialOutline,
  copyOutline,
  closeOutline,
  checkmarkCircleOutline,
  checkmarkCircle,
  footballOutline,
  trophyOutline,
  linkOutline,
  documentTextOutline,
  imageOutline,
  image,
  downloadOutline,
  calendarOutline,
  globeOutline,
  sparkles,
  refreshOutline,
  micOutline,
  volumeHighOutline,
  chatboxEllipsesOutline,
} from 'ionicons/icons';
import { Partita } from '../../../models/partita.model';
import {
  formatMatchForWhatsApp,
  getMatchDeepLink,
  WhatsAppShareOptions,
} from '../../../utils/whatsapp-formatter';
import { StatsEngineService } from '../../../services/stats-engine.service';
import { GeminiService } from '../../../services/gemini.service';
import { TtsService } from '../../../services/tts.service';

@Component({
  selector: 'app-match-share-modal',
  templateUrl: './match-share-modal.component.html',
  styleUrls: ['./match-share-modal.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonIcon,
    IonChip,
    IonLabel,
    IonFooter,
    IonSpinner,
  ],
})
export class MatchShareModalComponent implements OnInit {
  private modalCtrl = inject(ModalController);
  private toastCtrl = inject(ToastController);
  private loadingCtrl = inject(LoadingController);
  private storage = inject(Storage);
  private statsEngine = inject(StatsEngineService);
  private geminiService = inject(GeminiService);
  public ttsService = inject(TtsService);

  @Input({ required: true }) partita!: Partita;

  reportData = computed(() => {
    return this.statsEngine.getMatchReport(this.partita);
  });

  // Opzioni selezionabili
  includeRisultato = signal<boolean>(true);
  includeMarcatori = signal<boolean>(true);
  includePagelle = signal<boolean>(true);
  includeLink = signal<boolean>(true);
  includeFoto = signal<boolean>(true);
  includeCronacaAi = signal<boolean>(true);
  includePronosticoAi = signal<boolean>(true);
  includeCommentoPartita = signal<boolean>(true);

  isSharingNative = signal<boolean>(false);
  isSharingAudio = signal<boolean>(false);
  isGeneratingCronaca = signal<boolean>(false);

  constructor() {
    addIcons({
      logoWhatsapp,
      shareSocialOutline,
      copyOutline,
      closeOutline,
      checkmarkCircleOutline,
      checkmarkCircle,
      footballOutline,
      trophyOutline,
      linkOutline,
      documentTextOutline,
      imageOutline,
      image,
      downloadOutline,
      calendarOutline,
      globeOutline,
      sparkles,
      refreshOutline,
      micOutline,
      volumeHighOutline,
      chatboxEllipsesOutline,
    });
  }

  ngOnInit() {
    // Se la partita non ha pagelle inserite, disattiviamo di default l'opzione pagelle
    const hasVoti = [
      ...(this.partita.teamA || []),
      ...(this.partita.teamB || []),
    ].some(
      (g) => g.voto !== undefined && g.voto !== null && Number(g.voto) > 0,
    );

    if (!this.partita.pagelleInserite && !hasVoti) {
      this.includePagelle.set(false);
    }

    const hasPronostico = Boolean(this.partita.pronosticoAi || this.reportData()?.pronosticoAi);
    this.includePronosticoAi.set(hasPronostico);
    const hasCronaca = Boolean(this.partita.cronacaAi || this.reportData()?.cronacaAi);
    this.includeCronacaAi.set(hasCronaca);

    this.includeCommentoPartita.set(this.hasCommentoDisponibile());

    if (!this.partita.fotoUrl) {
      this.includeFoto.set(false);
    }
  }

  hasPronosticoDisponibile = computed(() => {
    return Boolean(this.partita?.pronosticoAi || this.reportData()?.pronosticoAi);
  });

  hasCronacaDisponibile = computed(() => {
    return Boolean(this.partita?.cronacaAi || this.reportData()?.cronacaAi);
  });

  hasCommentoDisponibile = computed(() => {
    return Boolean(
      (this.partita?.commentoPartita || (this.partita as any)?.commento || this.reportData()?.commentoPartita)?.trim()
    );
  });

  hasVotiDisponibili = computed(() => {
    return [
      ...(this.partita?.teamA || []),
      ...(this.partita?.teamB || []),
    ].some(
      (g) => g.voto !== undefined && g.voto !== null && Number(g.voto) > 0,
    );
  });

  deepLink = computed(() => {
    return getMatchDeepLink(this.partita?.id);
  });

  testoWhatsApp = computed(() => {
    if (!this.partita) return '';
    const options: WhatsAppShareOptions = {
      includeRisultato: this.includeRisultato(),
      includeMarcatori: this.includeMarcatori(),
      includePagelle: this.includePagelle(),
      includeLink: this.includeLink(),
      includeFoto: this.includeFoto(),
      includeCronacaAi: this.includeCronacaAi(),
      includePronosticoAi: this.includePronosticoAi(),
      includeCommentoPartita: this.includeCommentoPartita(),
    };
    return formatMatchForWhatsApp(this.partita, options, this.reportData());
  });

  toggleOption(key: 'risultato' | 'marcatori' | 'pagelle' | 'link' | 'foto' | 'cronaca' | 'pronostico' | 'commento') {
    switch (key) {
      case 'risultato':
        this.includeRisultato.update((v) => !v);
        break;
      case 'marcatori':
        this.includeMarcatori.update((v) => !v);
        break;
      case 'pagelle':
        this.includePagelle.update((v) => !v);
        break;
      case 'link':
        this.includeLink.update((v) => !v);
        break;
      case 'foto':
        this.includeFoto.update((v) => !v);
        break;
      case 'cronaca':
        this.includeCronacaAi.update((v) => !v);
        break;
      case 'commento':
        this.includeCommentoPartita.update((v) => !v);
        break;
    }
  }

  async generaCronaca() {
    this.isGeneratingCronaca.set(true);
    try {
      const text = await this.geminiService.getOrGenerateCronaca(
        this.partita,
        this.reportData(),
        true,
      );
      this.partita.cronacaAi = text;
      this.includeCronacaAi.set(true);
      const toast = await this.toastCtrl.create({
        message: '🎙️ Cronaca Ignorante AI generata e salvata!',
        duration: 2500,
        color: 'success',
        position: 'bottom',
      });
      await toast.present();
    } catch (err: any) {
      console.error(err);
      const toast = await this.toastCtrl.create({
        message: 'Errore generazione cronaca AI: ' + (err.message || err),
        duration: 3000,
        color: 'danger',
        position: 'bottom',
      });
      await toast.present();
    } finally {
      this.isGeneratingCronaca.set(false);
    }
  }

  chiudi() {
    this.modalCtrl.dismiss();
  }

  /**
   * Scarica il file dell'immagine da Firebase Storage (usando getBlob dell'SDK per evitare CORS)
   * con timeout di sicurezza di 4.5s per evitare blocchi della UI.
   */
  private async ottieniFileFoto(): Promise<File | null> {
    if (!this.partita.fotoUrl && !this.partita.fotoPath) return null;

    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), 4500),
    );

    const downloadPromise = (async (): Promise<File | null> => {
      try {
        const storageRef = ref(
          this.storage,
          this.partita.fotoPath || this.partita.fotoUrl!,
        );
        const blob = await getBlob(storageRef);
        return new File(
          [blob],
          `calcetto-partita-${this.partita.dataPartita || 'foto'}.jpg`,
          {
            type: blob.type || 'image/jpeg',
          },
        );
      } catch (err) {
        console.warn('getBlob fallito, provo fallback fetch:', err);
        try {
          if (this.partita.fotoUrl) {
            const resp = await fetch(this.partita.fotoUrl);
            if (!resp.ok) return null;
            const blob = await resp.blob();
            return new File(
              [blob],
              `calcetto-partita-${this.partita.dataPartita || 'foto'}.jpg`,
              {
                type: blob.type || 'image/jpeg',
              },
            );
          }
        } catch (e2) {
          console.warn('Fallback fetch fallito:', e2);
        }
      }
      return null;
    })();

    return Promise.race([downloadPromise, timeoutPromise]);
  }

  /**
   * Invia su WhatsApp:
   * - Su Mobile con foto inclusa e Web Share API: apre lo share nativo per allegare
   *   il file immagine reale con didascalia (caption).
   * - Su Desktop o senza foto: apre direttamente WhatsApp Web / App via URL con il testo
   *   formattato (e link diretto alla foto se attiva).
   */
  async inviaWhatsApp() {
    const isMobile =
      typeof navigator !== 'undefined' &&
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');

    if (
      isMobile &&
      this.includeFoto() &&
      (this.partita.fotoUrl || this.partita.fotoPath) &&
      typeof navigator !== 'undefined' &&
      'share' in navigator
    ) {
      await this.condividiNativo();
      return;
    }

    this.inviaWhatsAppWeb();
  }

  inviaWhatsAppWeb() {
    const testo = this.testoWhatsApp();
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(testo)}`;
    const isMobile =
      typeof navigator !== 'undefined' &&
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');

    if (isMobile) {
      window.location.href = url;
    } else {
      window.open(url, '_blank');
    }
  }

  async condividiNativo() {
    this.isSharingNative.set(true);
    const loading = await this.loadingCtrl.create({
      message: 'Preparazione foto e report...',
      mode: 'ios',
      duration: 6000,
    });
    await loading.present();

    try {
      const testo = this.testoWhatsApp();
      let fileFoto: File | null = null;

      if (
        this.includeFoto() &&
        (this.partita.fotoUrl || this.partita.fotoPath)
      ) {
        fileFoto = await this.ottieniFileFoto();
      }

      if (typeof navigator !== 'undefined' && 'share' in navigator) {
        // Se c'è il file foto ed è supportato da canShare, condividiamo con file e testo
        // IMPORTANTE: non passare 'url' contemporaneamente a 'files' su iOS Safari, altrimenti viene rifiutato
        if (
          fileFoto &&
          'canShare' in navigator &&
          (navigator as any).canShare({ files: [fileFoto] })
        ) {
          await loading.dismiss();
          await navigator.share({
            title: 'Report Match',
            text: testo,
            files: [fileFoto],
          });
          return;
        } else {
          // Solo testo e url
          await loading.dismiss();
          await navigator.share({
            title: 'Report Match',
            text: testo,
            url: this.deepLink(),
          });
          return;
        }
      } else {
        // Se Web Share non è supportato (es. desktop), apriamo WhatsApp via URL wa.me
        await loading.dismiss();
        this.inviaWhatsAppWeb();
      }
    } catch (err: any) {
      await loading.dismiss();
      if (err?.name !== 'AbortError') {
        console.warn('Errore condivisione nativa:', err);
        this.inviaWhatsAppWeb();
      }
    } finally {
      this.isSharingNative.set(false);
    }
  }

  /**
   * Condivide l'audio della Cronaca AI direttamente su WhatsApp (come traccia audio .mp3/.wav su mobile,
   * o via download e WhatsApp Web su desktop).
   */
  async inviaAudioCronacaWhatsApp() {
    const cronaca = (this.partita.cronacaAi || this.reportData()?.cronacaAi)?.trim();
    if (!cronaca) {
      const toast = await this.toastCtrl.create({
        message: 'Nessuna telecronaca AI generata da condividere in audio.',
        duration: 2500,
        color: 'warning',
        position: 'bottom',
        mode: 'ios',
      });
      await toast.present();
      return;
    }

    this.isSharingAudio.set(true);
    const loading = await this.loadingCtrl.create({
      message: '🎙️ Preparazione audio per WhatsApp...',
      mode: 'ios',
      duration: 10000,
    });
    await loading.present();

    try {
      const title = `Telecronaca ${this.partita.dataPartita || 'Match'}`;
      const res = await this.ttsService.shareAudioToWhatsApp(
        cronaca,
        `cronaca-${this.partita.id || 'temp'}`,
        title
      );
      await loading.dismiss();

      if (res.method === 'download-and-wa') {
        const toast = await this.toastCtrl.create({
          message: '📁 Audio scaricato! Trascinalo nella chat WhatsApp aperta.',
          duration: 3500,
          color: 'success',
          position: 'bottom',
          mode: 'ios',
        });
        await toast.present();
      }
    } catch (err: any) {
      await loading.dismiss();
      if (err?.name !== 'AbortError') {
        console.warn('Errore condivisione audio:', err);
        const toast = await this.toastCtrl.create({
          message: 'Errore preparazione audio: ' + (err?.message || 'Riprova'),
          duration: 3000,
          color: 'danger',
          position: 'bottom',
          mode: 'ios',
        });
        await toast.present();
      }
    } finally {
      this.isSharingAudio.set(false);
    }
  }

  async copiaTesto() {
    const testo = this.testoWhatsApp();
    let copiato = false;

    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(testo);
        copiato = true;
      } catch (e) {
        copiato = false;
      }
    }

    if (!copiato) {
      try {
        const el = document.createElement('textarea');
        el.value = testo;
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        copiato = true;
      } catch (err) {
        copiato = false;
      }
    }

    const toast = await this.toastCtrl.create({
      message: copiato
        ? '✅ Copiato! Pronto da incollare su WhatsApp'
        : '❌ Errore durante la copia',
      duration: 2500,
      position: 'bottom',
      color: copiato ? 'success' : 'danger',
      mode: 'ios',
    });
    await toast.present();
  }

  async scaricaFoto() {
    if (!this.partita.fotoUrl && !this.partita.fotoPath) return;

    const loading = await this.loadingCtrl.create({
      message: 'Download foto in corso...',
      mode: 'ios',
      duration: 5000,
    });
    await loading.present();

    try {
      const file = await this.ottieniFileFoto();
      await loading.dismiss();

      if (file) {
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = `calcetto-${this.partita.dataPartita || 'partita'}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        const toast = await this.toastCtrl.create({
          message: 'Foto scaricata sul dispositivo!',
          duration: 2500,
          color: 'success',
          mode: 'ios',
        });
        await toast.present();
      } else if (this.partita.fotoUrl) {
        window.open(this.partita.fotoUrl, '_blank');
      }
    } catch (e) {
      await loading.dismiss();
      if (this.partita.fotoUrl) {
        window.open(this.partita.fotoUrl, '_blank');
      }
    }
  }
}
