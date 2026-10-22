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
  flash,
  flame,
  trendingUpOutline,
  refreshOutline,
  sparkles,
} from 'ionicons/icons';
import { MatchReportData } from '../../../../../../../models/mmr.model';
import { formatAiMarkdown } from '../../../../../../../utils/ai-format.utils';
import { AiTtsButtonComponent } from '../../../../../../../shared/components';

@Component({
  selector: 'app-prestazioni-tab-statistiche',
  templateUrl: './prestazioni-tab-statistiche.component.html',
  styleUrls: ['./prestazioni-tab-statistiche.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, IonIcon, IonSpinner, AiTtsButtonComponent],
})
export class PrestazioniTabStatisticheComponent {
  @Input() matchId?: string | null = null;
  @Input({ required: true }) report!: MatchReportData;
  @Input() pronosticoAi?: string | null = null;
  @Input() isGeneratingPronostico: boolean = false;

  @Output() generatePronosticoClick = new EventEmitter<boolean>();

  readonly formatAiMarkdown = formatAiMarkdown;

  constructor() {
    addIcons({
      flash,
      flame,
      trendingUpOutline,
      refreshOutline,
      sparkles,
    });
  }
}
