import { formatMinuti } from '../../../../../../../utils/time-format.util';
import {
  Component,
  ChangeDetectionStrategy,
  Input,
  Output,
  EventEmitter,
  computed,
  signal,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonIcon, IonAvatar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  shieldOutline,
  sparkles,
  addCircleOutline,
  removeCircleOutline,
  documentTextOutline,
  checkmarkCircleOutline,
  timeOutline,
  saveOutline,
  handLeftOutline,
  shieldCheckmarkOutline,
  sparklesOutline,
} from 'ionicons/icons';
import { Partita } from '../../../../../../../models/partita.model';
import { PlayerPerformance } from '../../../../../../../models/player-performance.model';
import { StatsEngineService } from '../../../../../../../services/stats-engine.service';
import { PlayerAvatarComponent } from '../../../../../../../shared/components';
import { MatchStateService } from '../../../../match-state.service';

export interface GoalkeeperMatchRow {
  player: PlayerPerformance;
  team: 'A' | 'B';
  teamName: string;
  isFisso: boolean;
  turniInPorta: number;
  minutiInPorta: number;
  minutiInPortaDisplay: string;
  golSubiti: number;
  cleanSheetTurni: number;
  parateIncredibili: number;
}

@Component({
  selector: 'app-prestazioni-tab-portieri',
  templateUrl: './prestazioni-tab-portieri.component.html',
  styleUrls: ['./prestazioni-tab-portieri.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, IonIcon, IonAvatar, PlayerAvatarComponent],
})
export class PrestazioniTabPortieriComponent implements OnChanges, OnDestroy {
  @Input() match!: Partita;
  @Input() isAdmin = false;
  @Input() gkSummary?: { summaryA: string; summaryB: string; notesPrompt: string } | null = null;
  @Input() parateIncredibili: Record<string, number> = {};
  @Input() notePortieri: string | null = null;
  @Input() bonusParataMmr = 1.0;

  @Output() parataChange = new EventEmitter<{ playerId: string; delta: number }>();
  @Output() salvaNote = new EventEmitter<{ note: string; silent?: boolean }>();

  // Stato locale disaccoppiato per Note Portieri
  noteDisplayValue = signal<string>('');
  isNoteSaved = signal<boolean>(false);
  isNoteFocused = signal<boolean>(false);

  private draftNote = '';
  private lastCommittedNote = '';
  private isNoteDirty = false;
  private noteDebounceTimer?: ReturnType<typeof setTimeout>;
  private savedBadgeTimer?: ReturnType<typeof setTimeout>;
  private unregisterFlusher?: () => void;
  private readonly DEBOUNCE_MS = 700;
  private readonly FIELD_KEY = 'notePortieri';

  private router = inject(Router);
  private state = inject(MatchStateService, { optional: true });

  apriSchedaGiocatore(id?: string) {
    if (id) {
      this.router.navigate(['/giocatori', id]);
    }
  }

  constructor() {
    addIcons({
      shieldOutline,
      sparkles,
      addCircleOutline,
      removeCircleOutline,
      documentTextOutline,
      checkmarkCircleOutline,
      timeOutline,
      saveOutline,
      handLeftOutline,
      shieldCheckmarkOutline,
      sparklesOutline,
    });

    this.unregisterFlusher = this.state?.registerDraftFlusher(() =>
      this.flushNoteToStateOnly(),
    );
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['notePortieri']) {
      if (!this.isNoteFocused() && !this.isNoteDirty) {
        const remote = this.notePortieri || '';
        this.draftNote = remote;
        this.lastCommittedNote = remote;
        this.noteDisplayValue.set(remote);
      }
    }
  }

  ngOnDestroy(): void {
    if (this.noteDebounceTimer) {
      clearTimeout(this.noteDebounceTimer);
      this.noteDebounceTimer = undefined;
    }
    if (this.savedBadgeTimer) {
      clearTimeout(this.savedBadgeTimer);
      this.savedBadgeTimer = undefined;
    }
    this.unregisterFlusher?.();
    const hadDirty = this.flushNoteToStateOnly();
    this.state?.endFieldEdit(this.FIELD_KEY);
    if (hadDirty) {
      this.state?.triggerAutoSave(true);
    }
  }

  readonly portieriBianchi = computed<GoalkeeperMatchRow[]>(() => {
    return this.buildGoalkeepersForTeam('A');
  });

  readonly portieriNeri = computed<GoalkeeperMatchRow[]>(() => {
    return this.buildGoalkeepersForTeam('B');
  });

  private buildGoalkeepersForTeam(team: 'A' | 'B'): GoalkeeperMatchRow[] {
    if (!this.match) return [];
    const teamPlayers = team === 'A' ? (this.match.teamA || []) : (this.match.teamB || []);
    const rot = this.match.rotazionePortieri;
    const modalita = team === 'A' ? (rot?.modalitaA || 'rotazione') : (rot?.modalitaB || 'rotazione');
    const isFisso = modalita === 'fisso';
    const teamName = team === 'A' ? 'Bianchi' : 'Neri';

    const result: GoalkeeperMatchRow[] = [];

    for (const pl of teamPlayers) {
      const stats = StatsEngineService.calculateGoalkeeperStatsForMatch(pl.id, this.match, team);
      const parate = this.parateIncredibili[pl.id] || pl.parateIncredibili || 0;

      if (stats.turniGiocati > 0 || (isFisso && stats.turniGiocati >= 0)) {
        const durataTurno = rot?.durataTurnoMinuti || 5;
        const minutiInPorta = isFisso
          ? Math.max(1, Math.round((this.match.cronometro || this.match.accumulatedTime || 3000) / 60))
          : stats.turniGiocati * durataTurno;

        result.push({
          player: pl,
          team,
          teamName,
          isFisso,
          turniInPorta: stats.turniGiocati,
          minutiInPorta,
          minutiInPortaDisplay: formatMinuti(minutiInPorta),
          golSubiti: stats.golSubiti,
          cleanSheetTurni: stats.cleanSheetTurni,
          parateIncredibili: parate,
        });
      }
    }

    return result;
  }

  modificaParate(playerId: string, delta: number) {
    if (!this.isAdmin) return;
    this.parataChange.emit({ playerId, delta });
  }

  onNoteFocus(): void {
    this.isNoteFocused.set(true);
    this.state?.beginFieldEdit(this.FIELD_KEY);
  }

  onNoteInput(event: Event): void {
    const val = (event.target as HTMLTextAreaElement | null)?.value ?? '';
    this.draftNote = val;
    const changed = val !== this.lastCommittedNote;
    this.isNoteDirty = changed;
    this.isNoteSaved.set(false);
    this.state?.markFieldDraftDirty(this.FIELD_KEY, changed);
    this.state?.touchFieldEdit(this.FIELD_KEY);

    if (this.noteDebounceTimer) {
      clearTimeout(this.noteDebounceTimer);
      this.noteDebounceTimer = undefined;
    }
    if (changed) {
      this.noteDebounceTimer = setTimeout(() => {
        this.noteDebounceTimer = undefined;
        if (this.draftNote !== this.lastCommittedNote) {
          this.isNoteDirty = false;
          this.lastCommittedNote = this.draftNote;
          this.state?.markFieldDraftDirty(this.FIELD_KEY, false);
          this.state?.aggiornaNotePortieri(this.draftNote, true);
        }
      }, this.DEBOUNCE_MS);
    }
  }

  onNoteBlur(): void {
    if (this.noteDebounceTimer) {
      clearTimeout(this.noteDebounceTimer);
      this.noteDebounceTimer = undefined;
    }
    const changed = this.draftNote !== this.lastCommittedNote;
    this.isNoteDirty = false;
    this.state?.markFieldDraftDirty(this.FIELD_KEY, false);
    this.noteDisplayValue.set(this.draftNote);
    this.isNoteFocused.set(false);
    this.state?.endFieldEdit(this.FIELD_KEY);
    if (changed) {
      this.lastCommittedNote = this.draftNote;
      this.state?.aggiornaNotePortieri(this.draftNote, true);
    }
  }

  importaResocontoAutomatico() {
    if (!this.gkSummary?.notesPrompt) return;
    const current = this.draftNote.trim();
    const prompt = this.gkSummary.notesPrompt;
    const next = current ? `${current}\n\n${prompt}` : prompt;
    this.draftNote = next;
    this.lastCommittedNote = next;
    this.noteDisplayValue.set(next);
    this.isNoteDirty = false;
    this.isNoteSaved.set(false);
    this.state?.markFieldDraftDirty(this.FIELD_KEY, false);
    this.state?.aggiornaNotePortieri(next, true);
  }

  onSalvaNote() {
    if (this.noteDebounceTimer) {
      clearTimeout(this.noteDebounceTimer);
      this.noteDebounceTimer = undefined;
    }
    this.isNoteDirty = false;
    this.lastCommittedNote = this.draftNote;
    this.state?.markFieldDraftDirty(this.FIELD_KEY, false);
    this.noteDisplayValue.set(this.draftNote);
    this.state?.endFieldEdit(this.FIELD_KEY);
    this.salvaNote.emit({ note: this.draftNote, silent: false });
    this.isNoteSaved.set(true);
    if (this.savedBadgeTimer) clearTimeout(this.savedBadgeTimer);
    this.savedBadgeTimer = setTimeout(() => this.isNoteSaved.set(false), 3000);
  }

  private flushNoteToStateOnly(): boolean {
    if (this.noteDebounceTimer) {
      clearTimeout(this.noteDebounceTimer);
      this.noteDebounceTimer = undefined;
    }
    const changed = this.draftNote !== this.lastCommittedNote;
    this.isNoteDirty = false;
    this.state?.markFieldDraftDirty(this.FIELD_KEY, false);
    if (!changed) return false;
    this.lastCommittedNote = this.draftNote;
    this.state?.aggiornaNotePortieri(this.draftNote, false);
    return true;
  }
}
