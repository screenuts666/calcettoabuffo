import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  signal,
  computed,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonAvatar, IonIcon, IonTextarea } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  football,
  footballOutline,
  createOutline,
  chatboxEllipsesOutline,
  closeCircleOutline,
  footstepsOutline,
  trophyOutline,
} from 'ionicons/icons';
import {
  RatingClass,
  RatingThresholds,
} from '../../../../../../../models/player-performance.model';
import { MatchReportPlayer } from '../../../../../../../models/mmr.model';
import { PlayerAvatarComponent } from '../../../../../../../shared/components';
import { MatchStateService } from '../../../../match-state.service';

@Component({
  selector: 'app-prestazioni-player-card',
  templateUrl: './prestazioni-player-card.component.html',
  styleUrls: ['./prestazioni-player-card.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, IonAvatar, IonIcon, IonTextarea, PlayerAvatarComponent],
})
export class PrestazioniPlayerCardComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) player!: MatchReportPlayer;
  @Input() isAdmin: boolean = false;
  @Input() isMvp: boolean = false;

  @Output() voteChange = new EventEmitter<{
    player: any;
    voto: number;
    triggerSave?: boolean;
  }>();
  @Output() noteChange = new EventEmitter<{
    player: any;
    note: string;
    triggerSave?: boolean;
  }>();
  @Output() assistClick = new EventEmitter<any>();

  private router = inject(Router);
  private state = inject(MatchStateService, { optional: true });

  readonly isEditingNote = signal<boolean>(false);
  readonly isNoteFocused = signal<boolean>(false);
  readonly isVotoFocused = signal<boolean>(false);

  // Stato locale disaccoppiato dallo stato remoto (non viene mai sovrascritto durante focus/digitazione)
  readonly noteDisplayValue = signal<string>('');
  readonly hasNoteText = signal<boolean>(false);
  readonly votoDisplayValue = signal<string>('');
  readonly liveVoto = signal<number>(0);

  readonly showNoteEditor = computed<boolean>(
    () => this.hasNoteText() || this.isEditingNote() || this.isNoteFocused(),
  );

  private draftNote = '';
  private lastCommittedNote = '';
  private draftVotoStr = '';
  private lastCommittedVoto = 0;
  private isNoteDirty = false;
  private isVotoDirty = false;
  private trackedPlayerId = '';
  private noteDebounceTimer?: ReturnType<typeof setTimeout>;
  private votoDebounceTimer?: ReturnType<typeof setTimeout>;
  private unregisterFlusher?: () => void;

  private readonly DEBOUNCE_MS = 700;

  private get noteFieldKey(): string {
    return `player_note:${this.trackedPlayerId || this.player?.id || ''}`;
  }

  private get votoFieldKey(): string {
    return `player_voto:${this.trackedPlayerId || this.player?.id || ''}`;
  }

  apriSchedaGiocatore() {
    if (this.player?.id) {
      this.router.navigate(['/giocatori', this.player.id]);
    }
  }

  constructor() {
    addIcons({
      football,
      footballOutline,
      createOutline,
      chatboxEllipsesOutline,
      closeCircleOutline,
      footstepsOutline,
      trophyOutline,
    });

    this.unregisterFlusher = this.state?.registerDraftFlusher(() =>
      this.flushDraftsToStateOnly(),
    );
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['player'] && this.player) {
      const nextId = this.player.id || this.player.nome || '';
      const isDifferentPlayer =
        this.trackedPlayerId !== '' && this.trackedPlayerId !== nextId;

      if (isDifferentPlayer) {
        this.flushDraftsToStateOnly();
        this.clearTimers();
        this.state?.endFieldEdit(this.noteFieldKey);
        this.state?.endFieldEdit(this.votoFieldKey);
        this.isNoteFocused.set(false);
        this.isVotoFocused.set(false);
        this.isEditingNote.set(false);
      }

      this.trackedPlayerId = nextId;

      if (!this.isNoteFocused() && !this.isNoteDirty) {
        const remoteNote = this.player.note || '';
        this.draftNote = remoteNote;
        this.lastCommittedNote = remoteNote;
        this.noteDisplayValue.set(remoteNote);
        this.hasNoteText.set(Boolean(remoteNote.trim()));
      }

      if (!this.isVotoFocused() && !this.isVotoDirty) {
        const remoteVoto =
          this.player.voto && this.player.voto > 0 ? this.player.voto : 0;
        const formatted = remoteVoto > 0 ? String(remoteVoto) : '';
        this.draftVotoStr = formatted;
        this.lastCommittedVoto = remoteVoto;
        this.votoDisplayValue.set(formatted);
        this.liveVoto.set(remoteVoto);
      }
    }
  }

  ngOnDestroy(): void {
    this.clearTimers();
    this.unregisterFlusher?.();
    const hadDirty = this.flushDraftsToStateOnly();
    this.state?.endFieldEdit(this.noteFieldKey);
    this.state?.endFieldEdit(this.votoFieldKey);
    if (hadDirty) {
      this.state?.triggerAutoSave(true);
    }
  }

  private clearTimers(): void {
    if (this.noteDebounceTimer) {
      clearTimeout(this.noteDebounceTimer);
      this.noteDebounceTimer = undefined;
    }
    if (this.votoDebounceTimer) {
      clearTimeout(this.votoDebounceTimer);
      this.votoDebounceTimer = undefined;
    }
  }

  toggleNoteEdit() {
    this.isEditingNote.update((v) => !v);
  }

  closeNoteEditor() {
    if (this.noteDebounceTimer) {
      clearTimeout(this.noteDebounceTimer);
      this.noteDebounceTimer = undefined;
    }
    this.draftNote = '';
    this.noteDisplayValue.set('');
    this.hasNoteText.set(false);
    this.isEditingNote.set(false);
    this.isNoteFocused.set(false);
    const hadRemoteNote = Boolean(this.player?.note || this.lastCommittedNote);
    if (this.isNoteDirty || hadRemoteNote) {
      this.isNoteDirty = false;
      this.lastCommittedNote = '';
      this.state?.markFieldDraftDirty(this.noteFieldKey, false);
      this.state?.touchFieldEdit(this.noteFieldKey);
      this.noteChange.emit({ player: this.player, note: '', triggerSave: false });
      this.state?.endFieldEdit(this.noteFieldKey);
      this.state?.triggerAutoSave(false, 150);
    } else {
      this.state?.endFieldEdit(this.noteFieldKey);
    }
  }

  // --- NOTE PAGELLA (DISACCOPPIATE) ---

  onNoteFocus(): void {
    this.isNoteFocused.set(true);
    this.isEditingNote.set(true);
    this.state?.beginFieldEdit(this.noteFieldKey);
  }

  onNoteInput(value: string | null | undefined): void {
    const val = value ?? '';
    this.draftNote = val;
    this.hasNoteText.set(Boolean(val.trim()));
    const changed = val !== this.lastCommittedNote;
    this.isNoteDirty = changed;
    this.state?.markFieldDraftDirty(this.noteFieldKey, changed);
    this.state?.touchFieldEdit(this.noteFieldKey);

    if (this.noteDebounceTimer) {
      clearTimeout(this.noteDebounceTimer);
      this.noteDebounceTimer = undefined;
    }
    if (changed) {
      this.noteDebounceTimer = setTimeout(() => {
        this.noteDebounceTimer = undefined;
        this.commitNote(true);
      }, this.DEBOUNCE_MS);
    }
  }

  onNoteBlur(): void {
    if (this.noteDebounceTimer) {
      clearTimeout(this.noteDebounceTimer);
      this.noteDebounceTimer = undefined;
    }
    const committed = this.commitNote(false);
    this.noteDisplayValue.set(this.draftNote);
    this.isNoteFocused.set(false);
    if (!this.draftNote.trim()) {
      this.isEditingNote.set(false);
    }
    this.state?.endFieldEdit(this.noteFieldKey);
    if (committed) {
      // Salvataggio pulito al blur con micro-coalescing per navigazione fluida Tab/Mobile
      this.state?.triggerAutoSave(false, 150);
    }
  }

  private commitNote(triggerSave: boolean): boolean {
    if (!this.player) return false;
    const changed = this.draftNote !== this.lastCommittedNote;
    this.isNoteDirty = false;
    this.state?.markFieldDraftDirty(this.noteFieldKey, false);
    if (!changed) return false;
    this.lastCommittedNote = this.draftNote;
    this.state?.touchFieldEdit(this.noteFieldKey);
    this.noteChange.emit({
      player: this.player,
      note: this.draftNote,
      triggerSave,
    });
    return true;
  }

  // --- VOTO PAGELLA (DISACCOPPIATO) ---

  onVotoFocus(): void {
    this.isVotoFocused.set(true);
    this.state?.beginFieldEdit(this.votoFieldKey);
  }

  onVotoEnter(event: Event): void {
    event.preventDefault();
    (event.target as HTMLInputElement | null)?.blur();
  }

  onVotoInput(event: Event): void {
    const raw = (event.target as HTMLInputElement | null)?.value ?? '';
    this.draftVotoStr = raw;
    const parsed = this.parseVoto(raw);
    const changed = parsed !== null && parsed !== this.lastCommittedVoto;
    this.isVotoDirty = changed;
    this.state?.markFieldDraftDirty(this.votoFieldKey, changed);
    this.state?.touchFieldEdit(this.votoFieldKey);

    if (parsed !== null) {
      this.liveVoto.set(parsed);
    }

    if (this.votoDebounceTimer) {
      clearTimeout(this.votoDebounceTimer);
      this.votoDebounceTimer = undefined;
    }
    if (changed) {
      this.votoDebounceTimer = setTimeout(() => {
        this.votoDebounceTimer = undefined;
        this.commitVoto(true);
      }, this.DEBOUNCE_MS);
    }
  }

  onVotoBlur(): void {
    if (this.votoDebounceTimer) {
      clearTimeout(this.votoDebounceTimer);
      this.votoDebounceTimer = undefined;
    }
    const committed = this.commitVoto(false);
    const finalNum = this.parseVoto(this.draftVotoStr);
    if (finalNum !== null) {
      this.liveVoto.set(finalNum);
      this.votoDisplayValue.set(finalNum > 0 ? String(finalNum) : '');
    } else {
      const fallback =
        this.player?.voto && this.player.voto > 0 ? this.player.voto : 0;
      this.liveVoto.set(fallback);
      this.votoDisplayValue.set(fallback > 0 ? String(fallback) : '');
    }
    this.isVotoFocused.set(false);
    this.state?.endFieldEdit(this.votoFieldKey);
    if (committed) {
      this.state?.triggerAutoSave(false, 150);
    }
  }

  private parseVoto(raw: string): number | null {
    const trimmed = raw.trim();
    if (trimmed === '') return 0;
    const v = Number(trimmed.replace(',', '.'));
    if (isNaN(v) || !isFinite(v)) return null;
    return v;
  }

  private commitVoto(triggerSave: boolean): boolean {
    if (!this.player) return false;
    const parsed = this.parseVoto(this.draftVotoStr);
    this.isVotoDirty = false;
    this.state?.markFieldDraftDirty(this.votoFieldKey, false);
    if (parsed === null || parsed === this.lastCommittedVoto) {
      return false;
    }
    this.lastCommittedVoto = parsed;
    this.liveVoto.set(parsed);
    this.state?.touchFieldEdit(this.votoFieldKey);
    this.voteChange.emit({
      player: this.player,
      voto: parsed,
      triggerSave,
    });
    return true;
  }

  private flushDraftsToStateOnly(): boolean {
    this.clearTimers();
    const noteFlushed = this.commitNote(false);
    const votoFlushed = this.commitVoto(false);
    return noteFlushed || votoFlushed;
  }

  getRatingClass(voto: number | undefined): RatingClass {
    const v = Number(voto);
    if (!v || isNaN(v) || v === 0) return '';
    if (v >= RatingThresholds.HIGH) return 'voto-alto';
    if (v >= RatingThresholds.MEDIUM) return 'voto-medio';
    return 'voto-basso';
  }
}
