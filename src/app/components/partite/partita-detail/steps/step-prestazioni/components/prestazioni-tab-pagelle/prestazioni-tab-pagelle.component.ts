import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  signal,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  createOutline,
  chatboxEllipsesOutline,
  saveOutline,
  checkmarkCircleOutline,
  hourglassOutline,
  starOutline,
  footballOutline,
} from 'ionicons/icons';
import { MatchReportPlayer } from '../../../../../../../models/mmr.model';
import { PrestazioniPlayerCardComponent } from '../prestazioni-player-card/prestazioni-player-card.component';
import { MatchStateService } from '../../../../match-state.service';

@Component({
  selector: 'app-prestazioni-tab-pagelle',
  templateUrl: './prestazioni-tab-pagelle.component.html',
  styleUrls: ['./prestazioni-tab-pagelle.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, IonIcon, PrestazioniPlayerCardComponent],
})
export class PrestazioniTabPagelleComponent implements OnChanges, OnDestroy {
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
  @Input() commentoPartita: string = '';
  @Input() isSavingCommento: boolean = false;

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
  @Output() editAssist = new EventEmitter<any>();
  @Output() commentoChange = new EventEmitter<{
    value: string;
    triggerSave?: boolean;
  }>();
  @Output() saveCommentoClick = new EventEmitter<boolean>();

  private state = inject(MatchStateService, { optional: true });

  teamPagelleFilter = signal<'all' | 'A' | 'B'>('all');

  // Stato locale disaccoppiato per Note a Bordocampo
  readonly commentoDisplayValue = signal<string>('');
  readonly isCommentoFocused = signal<boolean>(false);

  private draftCommento = '';
  private lastCommittedCommento = '';
  private isCommentoDirty = false;
  private commentoDebounceTimer?: ReturnType<typeof setTimeout>;
  private unregisterFlusher?: () => void;
  private readonly DEBOUNCE_MS = 700;
  private readonly FIELD_KEY = 'commentoPartita';

  constructor() {
    addIcons({
      createOutline,
      chatboxEllipsesOutline,
      saveOutline,
      checkmarkCircleOutline,
      hourglassOutline,
      starOutline,
      footballOutline,
    });

    this.unregisterFlusher = this.state?.registerDraftFlusher(() =>
      this.flushCommentoToStateOnly(),
    );
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['commentoPartita']) {
      if (!this.isCommentoFocused() && !this.isCommentoDirty) {
        const remote = this.commentoPartita || '';
        this.draftCommento = remote;
        this.lastCommittedCommento = remote;
        this.commentoDisplayValue.set(remote);
      }
    }
  }

  ngOnDestroy(): void {
    if (this.commentoDebounceTimer) {
      clearTimeout(this.commentoDebounceTimer);
      this.commentoDebounceTimer = undefined;
    }
    this.unregisterFlusher?.();
    const hadDirty = this.flushCommentoToStateOnly();
    this.state?.endFieldEdit(this.FIELD_KEY);
    if (hadDirty) {
      this.state?.triggerAutoSave(true);
    }
  }

  onCommentoFocus(): void {
    this.isCommentoFocused.set(true);
    this.state?.beginFieldEdit(this.FIELD_KEY);
  }

  onCommentoInput(event: Event): void {
    const val = (event.target as HTMLTextAreaElement | null)?.value ?? '';
    this.draftCommento = val;
    const changed = val !== this.lastCommittedCommento;
    this.isCommentoDirty = changed;
    this.state?.markFieldDraftDirty(this.FIELD_KEY, changed);
    this.state?.touchFieldEdit(this.FIELD_KEY);

    if (this.commentoDebounceTimer) {
      clearTimeout(this.commentoDebounceTimer);
      this.commentoDebounceTimer = undefined;
    }
    if (changed) {
      this.commentoDebounceTimer = setTimeout(() => {
        this.commentoDebounceTimer = undefined;
        this.commitCommento(true);
      }, this.DEBOUNCE_MS);
    }
  }

  onCommentoBlur(): void {
    if (this.commentoDebounceTimer) {
      clearTimeout(this.commentoDebounceTimer);
      this.commentoDebounceTimer = undefined;
    }
    const committed = this.commitCommento(false);
    this.commentoDisplayValue.set(this.draftCommento);
    this.isCommentoFocused.set(false);
    this.state?.endFieldEdit(this.FIELD_KEY);
    if (committed) {
      this.state?.triggerAutoSave(false, 150);
    }
  }

  onSaveCommentoBtnClick(): void {
    if (this.commentoDebounceTimer) {
      clearTimeout(this.commentoDebounceTimer);
      this.commentoDebounceTimer = undefined;
    }
    this.commitCommento(false);
    this.commentoDisplayValue.set(this.draftCommento);
    this.state?.endFieldEdit(this.FIELD_KEY);
    this.saveCommentoClick.emit(false);
  }

  private commitCommento(triggerSave: boolean): boolean {
    const changed = this.draftCommento !== this.lastCommittedCommento;
    this.isCommentoDirty = false;
    this.state?.markFieldDraftDirty(this.FIELD_KEY, false);
    if (!changed) return false;
    this.lastCommittedCommento = this.draftCommento;
    this.state?.touchFieldEdit(this.FIELD_KEY);
    this.commentoChange.emit({
      value: this.draftCommento,
      triggerSave,
    });
    return true;
  }

  private flushCommentoToStateOnly(): boolean {
    if (this.commentoDebounceTimer) {
      clearTimeout(this.commentoDebounceTimer);
      this.commentoDebounceTimer = undefined;
    }
    return this.commitCommento(false);
  }
}
