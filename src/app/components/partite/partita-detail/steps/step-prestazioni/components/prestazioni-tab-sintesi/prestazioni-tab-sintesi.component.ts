import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonAvatar, IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  trophy,
  football,
  createOutline,
  logoWhatsapp,
  micOutline,
  sparkles,
  refreshOutline,
  arrowForwardOutline,
  chatbubblesOutline,
  cloudDoneOutline,
} from 'ionicons/icons';
import { MatchReportPlayer } from '../../../../../../../models/mmr.model';
import { PlayerAvatarComponent, MatchPhotoComponent } from '../../../../../../../shared/components';
import { AiTtsButtonComponent } from '../../../../../../ai-tts-button/ai-tts-button.component';
import { formatAiMarkdown } from '../../../../../../../utils/ai-format.utils';

@Component({
  selector: 'app-prestazioni-tab-sintesi',
  templateUrl: './prestazioni-tab-sintesi.component.html',
  styleUrls: ['./prestazioni-tab-sintesi.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    IonAvatar,
    IonIcon,
    PlayerAvatarComponent,
    MatchPhotoComponent,
    IonSpinner,
    AiTtsButtonComponent,
  ],
})
export class PrestazioniTabSintesiComponent {
  @Input() mvp: MatchReportPlayer | null = null;
  @Input() worst: MatchReportPlayer | null = null;
  @Input() eventiGol: any[] = [];
  @Input() isAdmin: boolean = false;
  @Input() gkSummary?: { summaryA: string; summaryB: string } | null = null;

  @Output() shareClick = new EventEmitter<void>();
  @Output() editAssistClick = new EventEmitter<number>();
  @Input() cronacaAi?: string | null = null;
  @Input() isGeneratingCronaca: boolean = false;
  @Input() matchId?: string | null = null;

  @Output() generateCronacaClick = new EventEmitter<boolean>();
  @Output() goToSpogliatoioClick = new EventEmitter<void>();

  readonly formatAiMarkdown = formatAiMarkdown;
  isCronacaExpanded: boolean = false;

  toggleCronacaExpand() {
    this.isCronacaExpanded = !this.isCronacaExpanded;
  }

  constructor() {
    addIcons({
      trophy,
      football,
      createOutline,
      logoWhatsapp,
  micOutline,
  sparkles,
  refreshOutline,
  arrowForwardOutline,
  chatbubblesOutline,
    });
  }
}
