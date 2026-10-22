import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonAvatar, IonIcon, IonTextarea } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { football, createOutline, chatboxEllipsesOutline, closeCircleOutline } from 'ionicons/icons';
import {
  RatingClass,
  RatingThresholds,
} from '../../../../../../../models/player-performance.model';
import { MatchReportPlayer } from '../../../../../../../models/mmr.model';
import { PlayerAvatarComponent } from '../../../../../../../shared/components';

@Component({
  selector: 'app-prestazioni-player-card',
  templateUrl: './prestazioni-player-card.component.html',
  styleUrls: ['./prestazioni-player-card.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, IonAvatar, IonIcon, IonTextarea, PlayerAvatarComponent],
})
export class PrestazioniPlayerCardComponent {
  @Input({ required: true }) player!: MatchReportPlayer;
  @Input() isAdmin: boolean = false;
  @Input() isMvp: boolean = false;

  @Output() voteChange = new EventEmitter<{ player: any; event: Event }>();
  @Output() noteChange = new EventEmitter<{ player: any; note: string }>();
  @Output() assistClick = new EventEmitter<any>();

  readonly isEditingNote = signal<boolean>(false);

  constructor() {
    addIcons({ football, createOutline, chatboxEllipsesOutline, closeCircleOutline });
  }

  toggleNoteEdit() {
    this.isEditingNote.update(v => !v);
  }

  getRatingClass(voto: number | undefined): RatingClass {
    const v = Number(voto);
    if (!v || isNaN(v) || v === 0) return '';
    if (v >= RatingThresholds.HIGH) return 'voto-alto';
    if (v >= RatingThresholds.MEDIUM) return 'voto-medio';
    return 'voto-basso';
  }
}
