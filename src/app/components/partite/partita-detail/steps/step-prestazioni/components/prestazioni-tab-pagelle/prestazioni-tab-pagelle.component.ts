import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { createOutline } from 'ionicons/icons';
import { MatchReportPlayer } from '../../../../../../../models/mmr.model';
import { PrestazioniPlayerCardComponent } from '../prestazioni-player-card/prestazioni-player-card.component';

@Component({
  selector: 'app-prestazioni-tab-pagelle',
  templateUrl: './prestazioni-tab-pagelle.component.html',
  styleUrls: ['./prestazioni-tab-pagelle.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, IonIcon, PrestazioniPlayerCardComponent],
})
export class PrestazioniTabPagelleComponent {
  @Input() playersA: MatchReportPlayer[] = [];
  @Input() playersB: MatchReportPlayer[] = [];
  @Input() scoreA: number = 0;
  @Input() scoreB: number = 0;
  @Input() votoMedioA: number = 0;
  @Input() votoMedioB: number = 0;
  @Input() teamAvgMmrDeltaA: number = 0;
  @Input() teamAvgMmrDeltaB: number = 0;
  @Input() pagelleInserite: boolean = false;
  @Input() isAdmin: boolean = false;
  @Input() mvpId?: string;

  @Output() voteChange = new EventEmitter<{ player: any; event: Event }>();
  @Output() noteChange = new EventEmitter<{ player: any; note: string }>();
  @Output() editAssist = new EventEmitter<any>();

  teamPagelleFilter = signal<'all' | 'A' | 'B'>('all');

  constructor() {
    addIcons({ createOutline });
  }
}
