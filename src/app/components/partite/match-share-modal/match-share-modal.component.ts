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
  IonToast,
  ModalController,
  ToastController,
} from '@ionic/angular/standalone';
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
  ],
})
export class MatchShareModalComponent implements OnInit {
  private modalCtrl = inject(ModalController);
  private toastCtrl = inject(ToastController);

  @Input({ required: true }) partita!: Partita;

  // Opzioni selezionabili
  includeRisultato = signal<boolean>(true);
  includeMarcatori = signal<boolean>(true);
  includePagelle = signal<boolean>(true);
  includeLink = signal<boolean>(true);

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
    };
    return formatMatchForWhatsApp(this.partita, options);
  });

  toggleOption(key: 'risultato' | 'marcatori' | 'pagelle' | 'link') {
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
    }
  }

  chiudi() {
    this.modalCtrl.dismiss();
  }

  inviaWhatsApp() {
    const testo = this.testoWhatsApp();
    const url = `https://wa.me/?text=${encodeURIComponent(testo)}`;
    window.open(url, '_blank');
  }

  async condividiNativo() {
    this.isSharingNative.set(true);
    const testo = this.testoWhatsApp();
    const deepLink = this.deepLink();

    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        const shareData: ShareData = {
          title: 'Calcetto a Buffone - Report Partita',
          text: testo,
          url: deepLink,
        };

        // Se presente una foto di gruppo, proviamo ad allegarla come File
        if (this.partita.fotoUrl && navigator.canShare) {
          try {
            const resp = await fetch(this.partita.fotoUrl);
            const blob = await resp.blob();
            const file = new File([blob], 'foto-partita.jpg', {
              type: blob.type || 'image/jpeg',
            });
            if (navigator.canShare({ files: [file] })) {
              shareData.files = [file];
            }
          } catch (e) {
            console.warn('Impossibile convertire foto per WebShare:', e);
          }
        }

        await navigator.share(shareData);
      } else {
        // Fallback per browser senza Web Share API
        await this.copiaTesto();
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn('Errore condivisione nativa:', err);
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
      // Fallback classico con textarea temporanea
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
}
