import { Component, Input, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonIcon,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { close, sparkles, micOutline } from 'ionicons/icons';
import { AiTtsButtonComponent } from '../../ai-tts-button/ai-tts-button.component';
import { formatAiMarkdown } from '../../../utils/ai-format.utils';

@Component({
  selector: 'app-ai-story-modal',
  templateUrl: './ai-story-modal.component.html',
  styleUrls: ['./ai-story-modal.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonButton,
    IonIcon,
    AiTtsButtonComponent,
  ],
})
export class AiStoryModalComponent {
  private modalCtrl = inject(ModalController);

  @Input() tipo: 'cronaca' | 'pronostico' = 'cronaca';
  @Input() titolo: string = '';
  @Input() sottotitolo: string = '';
  @Input() testo: string = '';
  @Input() matchId: string = 'temp';
  @Input() audioLabel?: string;

  readonly formatAiMarkdown = formatAiMarkdown;

  constructor() {
    addIcons({ close, sparkles, micOutline });
  }

  chiudi() {
    this.modalCtrl.dismiss();
  }
}

