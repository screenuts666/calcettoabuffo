import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  chatboxEllipsesOutline,
  hourglassOutline,
  saveOutline,
  sparkles,
  micOutline,
  refreshOutline,
} from 'ionicons/icons';
import { MatchReportChemistryItem } from '../../../../../../../models/mmr.model';
import { formatAiMarkdown } from '../../../../../../../utils/ai-format.utils';
import { AiTtsButtonComponent } from '../../../../../../../shared/components';

@Component({
  selector: 'app-prestazioni-tab-spogliatoio',
  templateUrl: './prestazioni-tab-spogliatoio.component.html',
  styleUrls: ['./prestazioni-tab-spogliatoio.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, IonIcon, IonSpinner, AiTtsButtonComponent],
})
export class PrestazioniTabSpogliatoioComponent {
  @Input() matchId?: string | null = null;
  @Input() commentoPartita: string = '';
  @Input() cronacaAi?: string | null = null;
  @Input() chemistryNotes: MatchReportChemistryItem[] = [];
  @Input() isAdmin: boolean = false;
  @Input() isSavingCommento: boolean = false;
  @Input() isGeneratingCronaca: boolean = false;

  @Output() commentoChange = new EventEmitter<Event>();
  @Output() saveCommentoClick = new EventEmitter<boolean>();
  @Output() generateCronacaClick = new EventEmitter<boolean>();

  readonly formatAiMarkdown = formatAiMarkdown;

  constructor() {
    addIcons({
      chatboxEllipsesOutline,
      hourglassOutline,
      saveOutline,
      sparkles,
      micOutline,
      refreshOutline,
    });
  }
}
