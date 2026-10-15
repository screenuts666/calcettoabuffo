import {
  Component,
  Input,
  OnDestroy,
  inject,
  ChangeDetectionStrategy,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  volumeHighOutline,
  stopCircleOutline,
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

  @Input({ required: true }) text: string = '';
  @Input({ required: true }) id: string = '';
  @Input() compact: boolean = false;
  @Input() label: string = 'Ascolta Telecronaca';
  @Input() stopLabel: string = 'Ferma';

  readonly isThisPlaying = computed(() => {
    return this.ttsService.isPlaying() && this.ttsService.currentPlayingId() === this.id;
  });

  readonly isThisLoading = computed(() => {
    return this.ttsService.isLoadingAudio() && this.ttsService.currentPlayingId() === this.id;
  });

  constructor() {
    addIcons({
      volumeHighOutline,
      stopCircleOutline,
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

  ngOnDestroy(): void {
    // Interrompi l'audio se il componente viene rimosso dal DOM (es. navigazione o chiusura modal)
    if (this.ttsService.currentPlayingId() === this.id) {
      this.ttsService.stop();
    }
  }
}
