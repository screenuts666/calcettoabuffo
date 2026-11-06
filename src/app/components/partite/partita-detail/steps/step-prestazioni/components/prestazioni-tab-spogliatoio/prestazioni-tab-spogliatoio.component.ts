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
  sparkles,
  micOutline,
  refreshOutline,
} from 'ionicons/icons';
import { MatchReportChemistryItem } from '../../../../../../../models/mmr.model';
import { formatAiMarkdown } from '../../../../../../../utils/ai-format.utils';
import { AiTtsButtonComponent } from '../../../../../../../shared/components';
import { PartitaCommentsComponent } from '../../../../../partita-comments/partita-comments.component';

@Component({
  selector: 'app-prestazioni-tab-spogliatoio',
  templateUrl: './prestazioni-tab-spogliatoio.component.html',
  styleUrls: ['./prestazioni-tab-spogliatoio.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    IonIcon,
    IonSpinner,
    AiTtsButtonComponent,
    PartitaCommentsComponent,
  ],
})
export class PrestazioniTabSpogliatoioComponent {
  @Input() matchId?: string | null = null;
  @Input() match?: any = null;
  @Input() cronacaAi?: string | null = null;
  @Input() chemistryNotes: MatchReportChemistryItem[] = [];
  @Input() isAdmin: boolean = false;
  @Input() isGeneratingCronaca: boolean = false;

  @Output() generateCronacaClick = new EventEmitter<boolean>();

  readonly formatAiMarkdown = formatAiMarkdown;

  constructor() {
    addIcons({
      sparkles,
      micOutline,
      refreshOutline,
    });
  }
}
