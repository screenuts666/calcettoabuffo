import {
  Component,
  ChangeDetectionStrategy,
  computed,
  input,
  signal,
  Output,
  EventEmitter,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  football,
  shield,
  person,
  closeCircle,
  sparkles,
  camera,
} from 'ionicons/icons';
import { PlayerAvatarComponent } from '../../player-avatar/player-avatar.component';

export interface PositionedPlayer {
  id: string;
  nome: string;
  fotoUrl?: string | null;
  team: 'A' | 'B';
  isGoalkeeper: boolean;
  xPercent: number;
  yPercent: number;
  roleLabel: string;
  originalPlayer: any;
}

@Component({
  selector: 'app-tactical-pitch',
  templateUrl: './tactical-pitch.component.html',
  styleUrls: ['./tactical-pitch.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, IonIcon, PlayerAvatarComponent],
})
export class TacticalPitchComponent {
  readonly match = input<any>(null);
  readonly interactive = input<boolean>(true);
  readonly showUploadButton = input<boolean>(false);
  readonly isAdmin = input<boolean>(false);

  @Output() playerSelect = new EventEmitter<any>();
  @Output() uploadPhotoClick = new EventEmitter<Event>();

  selectedPlayer = signal<PositionedPlayer | null>(null);

  constructor() {
    addIcons({
      football,
      shield,
      person,
      closeCircle,
      sparkles,
      camera,
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

  readonly normalizedTeams = computed<{ teamA: any[]; teamB: any[] }>(() => {
    const m = this.currentMatch();
    let listA = [...this.unwrapList(m.teamA)];
    let listB = [...this.unwrapList(m.teamB)];

    // Se una delle due squadre è vuota ma l'altra ha più giocatori (es. vecchie partite con soli 8 in teamA)
    if (listA.length > 0 && listB.length === 0) {
      if (listA.length >= 2) {
        const half = Math.ceil(listA.length / 2);
        listB = listA.slice(half);
        listA = listA.slice(0, half);
      }
    } else if (listB.length > 0 && listA.length === 0) {
      if (listB.length >= 2) {
        const half = Math.ceil(listB.length / 2);
        listA = listB.slice(half);
        listB = listB.slice(0, half);
      }
    } else if (listA.length === 0 && listB.length === 0) {
      const convocati = this.unwrapList(m.convocati);
      if (convocati.length >= 2) {
        const half = Math.ceil(convocati.length / 2);
        listA = convocati.slice(0, half);
        listB = convocati.slice(half);
      }
    }

    return { teamA: listA, teamB: listB };
  });

  readonly hasEnoughPlayers = computed(() => {
    const { teamA, teamB } = this.normalizedTeams();
    return teamA.length > 0 || teamB.length > 0;
  });

  readonly rotazionePortieri = computed(() => {
    const m = this.currentMatch();
    return this.unwrapField(m.rotazionePortieri);
  });

  readonly positionedPlayers = computed<PositionedPlayer[]>(() => {
    const { teamA, teamB } = this.normalizedTeams();
    const rot = this.rotazionePortieri();
    const result: PositionedPlayer[] = [];

    // --- 1. SQUADRA A (BIANCHI - META CAMPO SINISTRA) ---
    if (teamA.length > 0) {
      const gkAId =
        rot?.modalitaA === 'fisso'
          ? rot?.portiereFissoAId
          : rot?.teamA?.[0] || null;

      let gkAIndex = -1;
      if (gkAId) {
        gkAIndex = teamA.findIndex((p) => p.id === gkAId);
      }
      if (gkAIndex === -1) {
        // Cerca per ruolo preferito
        gkAIndex = teamA.findIndex(
          (p) => p.ruoloPreferito === 'Portiere' || p.ruolo === 'Portiere',
        );
      }
      if (gkAIndex === -1) {
        // Default primo giocatore
        gkAIndex = 0;
      }

      const gkA = teamA[gkAIndex];
      const outfieldA = teamA.filter((_, idx) => idx !== gkAIndex);

      // Posiziona il portiere A dentro l'area di porta (X: 9.5%, Y: 50%)
      if (gkA) {
        result.push({
          id: gkA.id || `gk-a-${gkAIndex}`,
          nome: gkA.nome || 'Portiere A',
          fotoUrl: gkA.fotoUrl || gkA.foto,
          team: 'A',
          isGoalkeeper: true,
          xPercent: 9.5,
          yPercent: 50,
          roleLabel: 'POR',
          originalPlayer: gkA,
        });
      }

      // Posiziona i giocatori di movimento di A
      const coordsA = this.getOutfieldCoordinates(outfieldA.length, 'A');
      outfieldA.forEach((p, idx) => {
        const coord = coordsA[idx] || { x: 30, y: 50, label: 'CEN' };
        result.push({
          id: p.id || `out-a-${idx}`,
          nome: p.nome || `Giocatore ${idx + 1}`,
          fotoUrl: p.fotoUrl || p.foto,
          team: 'A',
          isGoalkeeper: false,
          xPercent: coord.x,
          yPercent: coord.y,
          roleLabel: coord.label,
          originalPlayer: p,
        });
      });
    }

    // --- 2. SQUADRA B (NERI - META CAMPO DESTRA) ---
    if (teamB.length > 0) {
      const gkBId =
        rot?.modalitaB === 'fisso'
          ? rot?.portiereFissoBId
          : rot?.teamB?.[0] || null;

      let gkBIndex = -1;
      if (gkBId) {
        gkBIndex = teamB.findIndex((p) => p.id === gkBId);
      }
      if (gkBIndex === -1) {
        gkBIndex = teamB.findIndex(
          (p) => p.ruoloPreferito === 'Portiere' || p.ruolo === 'Portiere',
        );
      }
      if (gkBIndex === -1) {
        gkBIndex = 0;
      }

      const gkB = teamB[gkBIndex];
      const outfieldB = teamB.filter((_, idx) => idx !== gkBIndex);

      // Posiziona il portiere B dentro l'area di porta (X: 90.5%, Y: 50%)
      if (gkB) {
        result.push({
          id: gkB.id || `gk-b-${gkBIndex}`,
          nome: gkB.nome || 'Portiere B',
          fotoUrl: gkB.fotoUrl || gkB.foto,
          team: 'B',
          isGoalkeeper: true,
          xPercent: 90.5,
          yPercent: 50,
          roleLabel: 'POR',
          originalPlayer: gkB,
        });
      }

      // Posiziona i giocatori di movimento di B (speculari)
      const coordsB = this.getOutfieldCoordinates(outfieldB.length, 'B');
      outfieldB.forEach((p, idx) => {
        const coord = coordsB[idx] || { x: 70, y: 50, label: 'CEN' };
        result.push({
          id: p.id || `out-b-${idx}`,
          nome: p.nome || `Giocatore ${idx + 1}`,
          fotoUrl: p.fotoUrl || p.foto,
          team: 'B',
          isGoalkeeper: false,
          xPercent: coord.x,
          yPercent: coord.y,
          roleLabel: coord.label,
          originalPlayer: p,
        });
      });
    }

    return result;
  });

  /**
   * Genera coordinate tattiche sul campo da calcetto in base al numero di giocatori
   */
  private getOutfieldCoordinates(
    count: number,
    team: 'A' | 'B',
  ): Array<{ x: number; y: number; label: string }> {
    const rawCoords: Array<{ x: number; y: number; label: string }> = [];

    switch (count) {
      case 1:
        rawCoords.push({ x: 34, y: 50, label: 'UNICO' });
        break;
      case 2:
        rawCoords.push({ x: 25, y: 50, label: 'DIF' });
        rawCoords.push({ x: 42, y: 50, label: 'ATT' });
        break;
      case 3: // Calcetto a 4 (1 GK + 3)
        rawCoords.push({ x: 24, y: 50, label: 'DIF' });
        rawCoords.push({ x: 35, y: 28, label: 'ALA' });
        rawCoords.push({ x: 42, y: 72, label: 'PIV' });
        break;
      case 4: // Calcetto a 5 classico (1 GK + 4): 1-2-1 Rombo
        rawCoords.push({ x: 22, y: 50, label: 'DIF' }); // Difensore / Ultimo
        rawCoords.push({ x: 33, y: 24, label: 'LAT' }); // Laterale Sinistro
        rawCoords.push({ x: 33, y: 76, label: 'LAT' }); // Laterale Destro
        rawCoords.push({ x: 43, y: 50, label: 'PIV' }); // Pivot / Punta
        break;
      case 5: // Calciotto a 6 (1 GK + 5): 1-2-2
        rawCoords.push({ x: 22, y: 34, label: 'DIF' });
        rawCoords.push({ x: 22, y: 66, label: 'DIF' });
        rawCoords.push({ x: 34, y: 24, label: 'CEN' });
        rawCoords.push({ x: 34, y: 76, label: 'CEN' });
        rawCoords.push({ x: 43, y: 50, label: 'ATT' });
        break;
      case 6: // Calciotto a 7 (1 GK + 6): 1-2-3-1
        rawCoords.push({ x: 21, y: 32, label: 'DIF' });
        rawCoords.push({ x: 21, y: 68, label: 'DIF' });
        rawCoords.push({ x: 31, y: 50, label: 'MED' });
        rawCoords.push({ x: 37, y: 22, label: 'ALA' });
        rawCoords.push({ x: 37, y: 78, label: 'ALA' });
        rawCoords.push({ x: 44, y: 50, label: 'PUN' });
        break;
      default: {
        // Per 7 o più giocatori di movimento, distribuiamo su 3 linee (difesa, centrocampo, attacco)
        const defCount = Math.max(2, Math.floor(count * 0.35));
        const attCount = Math.max(1, Math.floor(count * 0.25));
        const midCount = count - defCount - attCount;

        const getYPositions = (n: number) => {
          if (n === 1) return [50];
          const step = 64 / (n + 1);
          return Array.from({ length: n }, (_, i) => 18 + step * (i + 1));
        };

        const defY = getYPositions(defCount);
        defY.forEach((y) => rawCoords.push({ x: 21, y, label: 'DIF' }));

        const midY = getYPositions(midCount);
        midY.forEach((y) => rawCoords.push({ x: 33, y, label: 'CEN' }));

        const attY = getYPositions(attCount);
        attY.forEach((y) => rawCoords.push({ x: 44, y, label: 'ATT' }));
        break;
      }
    }

    if (team === 'A') {
      return rawCoords;
    }

    // Per la squadra B, rifletti le coordinate X rispetto al centrocampo (100 - x)
    return rawCoords.map((c) => ({
      x: 100 - c.x,
      y: c.y,
      label: c.label,
    }));
  }

  readonly scoreA = computed(() => {
    const m = this.currentMatch();
    return this.unwrapField(m.scoreA);
  });

  readonly scoreB = computed(() => {
    const m = this.currentMatch();
    return this.unwrapField(m.scoreB);
  });

  readonly hasScore = computed(() => {
    const sA = this.scoreA();
    const sB = this.scoreB();
    const m = this.currentMatch();
    const st = this.unwrapField(m.status);
    return (
      sA !== undefined &&
      sA !== null &&
      sB !== undefined &&
      sB !== null &&
      st !== 'pronta' &&
      st !== 'da_definire'
    );
  });

  onPlayerClick(p: PositionedPlayer, event: Event) {
    event.stopPropagation();
    if (!this.interactive()) return;

    if (this.selectedPlayer()?.id === p.id) {
      this.selectedPlayer.set(null);
    } else {
      this.selectedPlayer.set(p);
      this.playerSelect.emit(p.originalPlayer);
    }
  }

  closePlayerModal(event?: Event) {
    if (event) event.stopPropagation();
    this.selectedPlayer.set(null);
  }

  onUploadClick(event: Event) {
    event.stopPropagation();
    this.uploadPhotoClick.emit(event);
  }
}
