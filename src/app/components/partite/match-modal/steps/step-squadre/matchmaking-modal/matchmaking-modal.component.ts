import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  computed,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonIcon,
  IonModal,
  IonSpinner,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  close,
  checkmark,
  sparkles,
  people,
  shield,
  flame,
  football,
  trophy,
  checkmarkCircle,
  swapHorizontal,
  trendingUp,
  snow,
  refreshOutline,
  micOutline,
} from 'ionicons/icons';
import {
  MatchmakingProposal,
  SynergyHighlight,
} from 'src/app/services/matchmaking.service';
import { getMmrTier } from 'src/app/models/mmr.model';
import { GeminiService } from 'src/app/services/gemini.service';
import { AiTtsButtonComponent } from '../../../../../ai-tts-button/ai-tts-button.component';
import {
  getAvatarUrl,
  handleAvatarError,
} from 'src/app/utils/avatar-utils';

import { PlayerAvatarComponent } from '../../../../../player-avatar/player-avatar.component';

@Component({
  selector: 'app-matchmaking-modal',
  templateUrl: './matchmaking-modal.component.html',
  styleUrls: ['./matchmaking-modal.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonButton,
    IonIcon,
    IonModal,
    IonSpinner,
    AiTtsButtonComponent,
    PlayerAvatarComponent,
  ],
})
export class MatchmakingModalComponent {
  private geminiService = inject(GeminiService);

  getAvatar(fotoUrl?: string | null): string {
    return getAvatarUrl(fotoUrl);
  }

  onImgError(event: Event) {
    handleAvatarError(event);
  }

  @Input() isOpen: boolean = false;
  @Input() proposals: MatchmakingProposal[] = [];
  @Output() close = new EventEmitter<void>();
  @Output() apply = new EventEmitter<MatchmakingProposal>();

  selectedIndex = signal<number>(0);
  tacticalAnalysisMap = signal<Map<string, string>>(new Map());
  isGeneratingTactical = signal<boolean>(false);

  activeProposal = computed(() => {
    const list = this.proposals || [];
    const idx = this.selectedIndex();
    return list[idx] || list[0] || null;
  });

  activeTacticalAnalysis = computed(() => {
    const p = this.activeProposal();
    return p ? this.tacticalAnalysisMap().get(p.id) || null : null;
  });

  constructor() {
    addIcons({
      close,
      checkmark,
      sparkles,
      people,
      shield,
      flame,
      football,
      trophy,
      checkmarkCircle,
      swapHorizontal,
      trendingUp,
      snow,
      refreshOutline,
      micOutline,
    });
  }

  async generaDisaminaTattica() {
    const p = this.activeProposal();
    if (!p || this.isGeneratingTactical()) return;
    this.isGeneratingTactical.set(true);
    try {
      const text = await this.geminiService.generateTacticalAnalysis(p);
      this.tacticalAnalysisMap.update((map) => {
        const next = new Map(map);
        next.set(p.id, text);
        return next;
      });
    } catch (err) {
      console.error('Errore generazione disamina tattica:', err);
    } finally {
      this.isGeneratingTactical.set(false);
    }
  }

  selezionaProposta(idx: number) {
    this.selectedIndex.set(idx);
  }

  chiudi() {
    this.close.emit();
  }

  applica() {
    const p = this.activeProposal();
    if (p) {
      this.apply.emit(p);
    }
  }

  getTierColor(mmr?: number | null): string {
    return getMmrTier(mmr ?? 1000).color;
  }

  getTierBadge(mmr?: number | null): string {
    return getMmrTier(mmr ?? 1000).badge;
  }

  getRuoloIcon(ruolo: string): string {
    switch ((ruolo || '').toLowerCase()) {
      case 'portiere':
        return '🧤';
      case 'difensore':
        return '🛡️';
      case 'fascia':
        return '⚡';
      case 'attaccante':
        return '🎯';
      default:
        return '⚽';
    }
  }
}
