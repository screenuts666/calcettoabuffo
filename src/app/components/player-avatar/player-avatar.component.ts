import {
  Component,
  Input,
  signal,
  computed,
  ChangeDetectionStrategy,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-player-avatar',
  templateUrl: './player-avatar.component.html',
  styleUrls: ['./player-avatar.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class PlayerAvatarComponent implements OnChanges {
  @Input() fotoUrl?: string | null = null;
  @Input() alt?: string | null = 'Avatar';

  imageError = signal(false);
  imageLoaded = signal(false);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['fotoUrl']) {
      this.imageError.set(false);
      this.imageLoaded.set(false);
    }
  }

  isValidPhoto = computed(() => {
    if (this.imageError()) return false;
    const url = this.fotoUrl;
    if (!url || typeof url !== 'string') return false;
    const clean = url.trim();
    if (!clean || clean === 'null' || clean === 'undefined') return false;
    if (clean.includes('ionicframework.com') || clean.includes('default-avatar.svg')) {
      return false;
    }
    return true;
  });

  onImgError(): void {
    this.imageError.set(true);
    this.imageLoaded.set(false);
  }

  onImgLoad(): void {
    this.imageLoaded.set(true);
  }
}

