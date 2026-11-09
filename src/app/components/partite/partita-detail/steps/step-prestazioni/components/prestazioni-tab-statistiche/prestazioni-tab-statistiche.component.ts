import {
  Component,
  Input,
  ChangeDetectionStrategy,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  flash,
  flame,
  sparkles,
  trendingUpOutline,
  chevronForwardOutline,
} from 'ionicons/icons';
import { MatchReportData, MatchReportChemistryItem } from '../../../../../../../models/mmr.model';

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

  private router = inject(Router);

  constructor() {
    addIcons({
      flash,
      flame,
      sparkles,
      trendingUpOutline,
      chevronForwardOutline,
    });
  }

  apriDettaglioChimica(chem: MatchReportChemistryItem): void {
    if (!chem.playerIds || chem.playerIds.length < 2) return;
    const [p1, p2] = chem.playerIds;
    if (chem.type === 'synergy') {
      this.router.navigate(['/chimica', p1, p2]);
    } else {
      this.router.navigate(['/1v1', p1, p2]);
    }
  }
}
