import {
  Component,
  Input,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  chatbubbleEllipsesOutline,
  send,
  trashOutline,
  lockClosedOutline,
  sparkles,
  timeOutline,
} from 'ionicons/icons';
import { Subscription } from 'rxjs';
import { MatchCommentsService } from '../../../services/match-comments.service';
import { AuthService } from '../../../services/auth.service';
import { V2FeaturesService } from '../../../services/v2-features.service';
import { MatchComment } from '../../../models/match-comment.model';
import { PlayerAvatarComponent } from '../../player-avatar/player-avatar.component';

@Component({
  selector: 'app-partita-comments',
  templateUrl: './partita-comments.component.html',
  styleUrls: ['./partita-comments.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    IonIcon,
    IonSpinner,
    PlayerAvatarComponent,
  ],
})
export class PartitaCommentsComponent implements OnInit, OnDestroy {
  @Input({ required: true }) matchId!: string;
  @Input() match?: any = null;

  public commentsService = inject(MatchCommentsService);
  public authService = inject(AuthService);
  public v2Features = inject(V2FeaturesService);

  readonly comments = signal<MatchComment[]>([]);
  readonly newCommentText = signal<string>('');
  readonly isSubmitting = signal<boolean>(false);
  private sub?: Subscription;

  readonly isV2Active = computed<boolean>(() => this.v2Features.isEnabled());

  readonly currentUserId = computed<string | null>(
    () => this.authService.firebaseUser()?.uid || this.authService.userProfile()?.uid || null
  );

  readonly currentAuthorName = computed<string>(() => {
    return this.authService.displayName() || (this.authService.isSuperUser() ? 'Mister' : 'Giocatore');
  });

  constructor() {
    addIcons({
      chatbubbleEllipsesOutline,
      send,
      trashOutline,
      lockClosedOutline,
      sparkles,
      timeOutline,
    });
  }

  ngOnInit(): void {
    if (this.matchId) {
      this.sub = this.commentsService
        .getComments$(this.matchId)
        .subscribe((list) => {
          this.comments.set(list);
        });
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  canDelete(comment: MatchComment): boolean {
    if (this.authService.isSuperUser()) return true;
    const uid = this.currentUserId();
    return Boolean(uid && comment.authorUid === uid);
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.inviaCommento();
    }
  }

  async eliminaCommento(commentId: string): Promise<void> {
    if (!this.matchId || !commentId) return;
    try {
      await this.commentsService.deleteComment(this.matchId, commentId);
    } catch (e) {
      console.warn('[MatchComments] Errore cancellazione commento:', e);
    }
  }

  async inviaCommento(): Promise<void> {
    const text = this.newCommentText().trim();
    if (!text || this.isSubmitting() || !this.matchId) return;

    this.isSubmitting.set(true);

    try {
      const isMister = this.authService.isSuperUser();
      const currentUid = this.currentUserId() || undefined;
      const authorName = this.currentAuthorName();
      const authorPhotoUrl = this.authService.userProfile()?.photoURL || null;

      // Determinazione squadra e badge per il match
      let team: 'A' | 'B' | null = null;
      let badge: string | null = null;

      if (isMister) {
        badge = '👑 Mister';
      }

      const m = this.match;
      if (m) {
        const teamA: any[] = m.teamA || [];
        const teamB: any[] = m.teamB || [];
        const normName = authorName.trim().toLowerCase();

        const matchA = teamA.find(
          (p) => (currentUid && p.id === currentUid) || (p.nome && p.nome.trim().toLowerCase() === normName)
        );
        const matchB = teamB.find(
          (p) => (currentUid && p.id === currentUid) || (p.nome && p.nome.trim().toLowerCase() === normName)
        );

        if (matchA) {
          team = 'A';
          const gol = matchA.gol || 0;
          badge = gol > 0 ? `⚪ Bianchi · ⚽ ${gol}` : '⚪ Bianchi';
        } else if (matchB) {
          team = 'B';
          const gol = matchB.gol || 0;
          badge = gol > 0 ? `⚫ Neri · ⚽ ${gol}` : '⚫ Neri';
        }
      }

      await this.commentsService.addComment(this.matchId, {
        matchId: this.matchId,
        authorUid: currentUid,
        authorName,
        authorPhotoUrl,
        authorRole: isMister ? 'superuser' : 'user',
        playerTeam: team,
        playerBadge: badge,
        text,
        createdAt: new Date().toISOString(),
      });

      this.newCommentText.set('');
    } catch (e) {
      console.warn('[MatchComments] Errore invio commento:', e);
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
