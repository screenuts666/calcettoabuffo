import {
  Component,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  computed,
  input,
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
  readonly match = input<any>(null);
  readonly height = input<string>('150px');
  readonly interactive = input<boolean>(true);
  readonly showUploadButton = input<boolean>(false);
  readonly isAdmin = input<boolean>(false);

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

  private unwrapField(val: any): any {
    if (!val) return null;
    if (typeof val === 'function') {
      try {
        return val();
      } catch {
        return null;
      }
    }
    return val;
  }

  private unwrapList(val: any): any[] {
    const res = this.unwrapField(val);
    return Array.isArray(res) ? res : [];
  }

  readonly currentMatch = computed(() => {
    const raw = this.match();
    return this.unwrapField(raw) || {};
  });

  readonly teamAPlayers = computed(() => {
    const m = this.currentMatch();
    return this.unwrapList(m.teamA);
  });

  readonly teamBPlayers = computed(() => {
    const m = this.currentMatch();
    return this.unwrapList(m.teamB);
  });

  readonly convocatiPlayers = computed(() => {
    const m = this.currentMatch();
    return this.unwrapList(m.convocati);
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

  readonly scoreA = computed(() => {
    const m = this.currentMatch();
    return this.unwrapField(m.scoreA);
  });

  readonly scoreB = computed(() => {
    const m = this.currentMatch();
    return this.unwrapField(m.scoreB);
  });

  readonly matchStatus = computed(() => {
    const m = this.currentMatch();
    return this.unwrapField(m.status);
  });

  onBannerClick() {
    if (this.interactive()) {
      this.bannerClick.emit();
    }
  }

  onUploadClick(event: Event) {
    event.stopPropagation();
    this.uploadPhotoClick.emit(event);
  }
}
