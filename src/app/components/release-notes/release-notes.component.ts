import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  sparkles,
  closeOutline,
  shieldCheckmark,
  peopleOutline,
  timeOutline,
  checkmarkCircleOutline,
} from 'ionicons/icons';
import { AppUpdateService } from '../../services/app-update.service';
import { AuthService } from '../../services/auth.service';
import {
  RELEASE_NOTES_HISTORY,
  ReleaseNoteEntry,
  getReleaseNotesDelta,
} from '../../models/release-notes.model';

@Component({
  selector: 'app-release-notes',
  templateUrl: './release-notes.component.html',
  styleUrls: ['./release-notes.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, IonIcon],
})
export class ReleaseNotesComponent {
  public appUpdate = inject(AppUpdateService);
  public authService = inject(AuthService);

  showFullHistory = signal<boolean>(false);

  deltaEntries = computed<ReleaseNoteEntry[]>(() => {
    return getReleaseNotesDelta(
      this.appUpdate.updatedFromVersion(),
      this.appUpdate.version
    );
  });

  visibleEntries = computed<ReleaseNoteEntry[]>(() => {
    if (this.showFullHistory()) {
      return RELEASE_NOTES_HISTORY;
    }
    return this.deltaEntries();
  });

  hasOlderHistory = computed<boolean>(() => {
    return RELEASE_NOTES_HISTORY.length > this.deltaEntries().length;
  });

  constructor() {
    addIcons({
      sparkles,
      closeOutline,
      shieldCheckmark,
      peopleOutline,
      timeOutline,
      checkmarkCircleOutline,
    });
  }

  openModal(): void {
    this.showFullHistory.set(false);
    this.appUpdate.openReleaseNotes();
  }

  closeModal(): void {
    this.appUpdate.closeReleaseNotes();
  }

  dismissBanner(event: Event): void {
    event.stopPropagation();
    this.appUpdate.dismissReleaseBanner();
  }

  toggleFullHistory(): void {
    this.showFullHistory.update((v) => !v);
  }
}

