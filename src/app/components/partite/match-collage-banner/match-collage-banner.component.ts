import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  people,
  football,
  shield,
  camera,
  sparkles,
  timeOutline,
  expandOutline,
} from 'ionicons/icons';
import { PlayerAvatarComponent } from '../../player-avatar/player-avatar.component';

@Component({
  selector: 'app-match-collage-banner',
  templateUrl: './match-collage-banner.component.html',
  styleUrls: ['./match-collage-banner.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, IonIcon, PlayerAvatarComponent],
})
export class MatchCollageBannerComponent {
  @Input({ required: true }) match: any;
  @Input() height = '150px';
  @Input() interactive = true;
  @Input() showUploadButton = false;
  @Input() isAdmin = false;

  @Output() bannerClick = new EventEmitter<void>();
  @Output() uploadPhotoClick = new EventEmitter<Event>();

  constructor() {
    addIcons({
      people,
      football,
      shield,
      camera,
      sparkles,
      timeOutline,
      expandOutline,
    });
  }

  readonly teamAPlayers = computed(() => {
    const list = this.match?.teamA || [];
    return Array.isArray(list) ? list : [];
  });

  readonly teamBPlayers = computed(() => {
    const list = this.match?.teamB || [];
    return Array.isArray(list) ? list : [];
  });

  readonly convocatiPlayers = computed(() => {
    const list = this.match?.convocati || [];
    return Array.isArray(list) ? list : [];
  });

  readonly hasTeams = computed(() => {
    return this.teamAPlayers().length > 0 && this.teamBPlayers().length > 0;
  });

  readonly hasConvocatiOnly = computed(() => {
    return !this.hasTeams() && this.convocatiPlayers().length > 0;
  });

  // Mostra fino a 5 giocatori per lato nel collage compatto
  readonly visibleTeamA = computed(() => this.teamAPlayers().slice(0, 5));
  readonly excessTeamACount = computed(() =>
    Math.max(0, this.teamAPlayers().length - 5),
  );

  readonly visibleTeamB = computed(() => this.teamBPlayers().slice(0, 5));
  readonly excessTeamBCount = computed(() =>
    Math.max(0, this.teamBPlayers().length - 5),
  );

  readonly visibleConvocati = computed(() =>
    this.convocatiPlayers().slice(0, 8),
  );
  readonly excessConvocatiCount = computed(() =>
    Math.max(0, this.convocatiPlayers().length - 8),
  );

  onBannerClick() {
    if (this.interactive) {
      this.bannerClick.emit();
    }
  }

  onUploadClick(event: Event) {
    event.stopPropagation();
    this.uploadPhotoClick.emit(event);
  }
}
