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
  ModalController,
  ToastController,
  LoadingController,
} from '@ionic/angular/standalone';
import { Storage, ref, getBlob } from '@angular/fire/storage';
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
} from 'ionicons/icons';
import { Partita } from '../../../models/partita.model';
import {
  formatMatchForWhatsApp,
  getMatchDeepLink,
  WhatsAppShareOptions,
} from '../../../utils/whatsapp-formatter';

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
  ],
})
export class MatchShareModalComponent implements OnInit {
  private modalCtrl = inject(ModalController);
  private toastCtrl = inject(ToastController);
  private loadingCtrl = inject(LoadingController);
  private storage = inject(Storage);

  @Input({ required: true }) partita!: Partita;

  // Opzioni selezionabili
  includeRisultato = signal<boolean>(true);
  includeMarcatori = signal<boolean>(true);
  includePagelle = signal<boolean>(true);
  includeLink = signal<boolean>(true);
  includeFoto = signal<boolean>(true);

  isSharingNative = signal<boolean>(false);

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
    });
  }

  ngOnInit() {
    // Se la partita non ha pagelle inserite, disattiviamo di default l'opzione pagelle
    const hasVoti = [
      ...(this.partita.teamA || []),
      ...(this.partita.teamB || []),
    ].some((g) => g.voto !== undefined && g.voto !== null && Number(g.voto) > 0);

    if (!this.partita.pagelleInserite && !hasVoti) {
      this.includePagelle.set(false);
    }

    if (!this.partita.fotoUrl) {
      this.includeFoto.set(false);
    }
  }

  hasVotiDisponibili = computed(() => {
    return [
      ...(this.partita?.teamA || []),
      ...(this.partita?.teamB || []),
    ].some((g) => g.voto !== undefined && g.voto !== null && Number(g.voto) > 0);
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
    };
    return formatMatchForWhatsApp(this.partita, options);
  });

  toggleOption(key: 'risultato' | 'marcatori' | 'pagelle' | 'link' | 'foto') {
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

      if (this.includeFoto() && (this.partita.fotoUrl || this.partita.fotoPath)) {
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
            title: 'Calcetto a Buffone - Report Match',
            text: testo,
            files: [fileFoto],
          });
          return;
        } else {
          // Solo testo e url
          await loading.dismiss();
          await navigator.share({
            title: 'Calcetto a Buffone - Report Match',
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
