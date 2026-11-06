import {
  Component,
  Input,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  flash,
  flame,
  trendingUpOutline,
} from 'ionicons/icons';
import { MatchReportData } from '../../../../../../../models/mmr.model';

@Component({
  selector: 'app-prestazioni-tab-statistiche',
  templateUrl: './prestazioni-tab-statistiche.component.html',
  styleUrls: ['./prestazioni-tab-statistiche.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, IonIcon],
})
export class PrestazioniTabStatisticheComponent {
  @Input() matchId?: string | null = null;
  @Input({ required: true }) report!: MatchReportData;
  @Input() isAdmin: boolean = false;

  constructor() {
    addIcons({
      flash,
      flame,
      trendingUpOutline,
    });
  }
}
