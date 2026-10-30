import {
  Component,
  ChangeDetectionStrategy,
  Input,
  Output,
  EventEmitter,
  computed,
  signal,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
} from 'ionicons/icons';
import { Partita } from '../../../../../../../models/partita.model';
import { PlayerPerformance } from '../../../../../../../models/player-performance.model';
import { StatsEngineService } from '../../../../../../../services/stats-engine.service';
import { PlayerAvatarComponent } from '../../../../../../../shared/components';

export interface GoalkeeperMatchRow {
  player: PlayerPerformance;
  team: 'A' | 'B';
  teamName: string;
  isFisso: boolean;
  turniInPorta: number;
  minutiInPorta: number;
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
  imports: [CommonModule, FormsModule, IonIcon, IonAvatar, PlayerAvatarComponent],
})
export class PrestazioniTabPortieriComponent implements OnChanges {
  @Input() match!: Partita;
  @Input() isAdmin = false;
  @Input() gkSummary?: { summaryA: string; summaryB: string; notesPrompt: string } | null = null;
  @Input() parateIncredibili: Record<string, number> = {};
  @Input() notePortieri: string | null = null;
  @Input() bonusParataMmr = 1.0;

  @Output() parataChange = new EventEmitter<{ playerId: string; delta: number }>();
  @Output() salvaNote = new EventEmitter<string>();

  noteInput = signal<string>('');
  isNoteSaved = signal<boolean>(false);

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
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['notePortieri']) {
      this.noteInput.set(this.notePortieri || '');
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

  onNoteChange(val: string) {
    this.noteInput.set(val);
    this.isNoteSaved.set(false);
  }

  onSalvaNote() {
    this.salvaNote.emit(this.noteInput());
    this.isNoteSaved.set(true);
    setTimeout(() => this.isNoteSaved.set(false), 3000);
  }
}
