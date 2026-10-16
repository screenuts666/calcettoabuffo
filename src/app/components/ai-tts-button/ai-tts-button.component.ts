import {
  Component,
  Input,
  OnDestroy,
  inject,
  ChangeDetectionStrategy,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonSpinner, ToastController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  volumeHighOutline,
  stopCircleOutline,
  logoWhatsapp,
} from 'ionicons/icons';
import { TtsService } from '../../services/tts.service';

@Component({
  selector: 'app-ai-tts-button',
  templateUrl: './ai-tts-button.component.html',
  styleUrls: ['./ai-tts-button.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, IonIcon, IonSpinner],
})
export class AiTtsButtonComponent implements OnDestroy {
  public ttsService = inject(TtsService);
  private toastCtrl = inject(ToastController);

  @Input({ required: true }) text: string = '';
  @Input({ required: true }) id: string = '';
  @Input() compact: boolean = false;
  @Input() label: string = 'Ascolta Telecronaca';
  @Input() stopLabel: string = 'Ferma';
  @Input() showWhatsAppShare: boolean = true;
  @Input() shareTitle?: string;
  @Input() showShareText: boolean = false;

  readonly isThisPlaying = computed(() => {
    return this.ttsService.isPlaying() && this.ttsService.currentPlayingId() === this.id;
  });

  readonly isThisLoading = computed(() => {
    return this.ttsService.isLoadingAudio() && this.ttsService.currentPlayingId() === this.id;
  });

  readonly isThisSharing = computed(() => {
    return this.ttsService.sharingAudioId() === this.id;
  });

  constructor() {
    addIcons({
      volumeHighOutline,
      stopCircleOutline,
      logoWhatsapp,
    });
  }

  togglePlayback(event: Event): void {
    event.stopPropagation();
    event.preventDefault();

    if (!this.text || !this.text.trim()) return;

    if (this.isThisPlaying() || this.isThisLoading()) {
      this.ttsService.stop();
    } else {
      this.ttsService.play(this.text, this.id);
    }
  }

  async shareToWhatsApp(event: Event): Promise<void> {
    event.stopPropagation();
    event.preventDefault();

    if (!this.text || !this.text.trim() || this.isThisSharing()) return;

    try {
      const title = this.shareTitle || this.label || 'Audio Calcetto Abbuffo';
      const result = await this.ttsService.shareAudioToWhatsApp(this.text, this.id, title);

      if (result.method === 'download-and-wa') {
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
      if (err?.name !== 'AbortError') {
        const toast = await this.toastCtrl.create({
          message: 'Errore condivisione audio: ' + (err?.message || 'Riprova'),
          duration: 3000,
          color: 'danger',
          position: 'bottom',
          mode: 'ios',
        });
        await toast.present();
      }
    }
  }

  ngOnDestroy(): void {
    // Interrompi l'audio se il componente viene rimosso dal DOM (es. navigazione o chiusura modal)
    if (this.ttsService.currentPlayingId() === this.id) {
      this.ttsService.stop();
    }
  }
}
