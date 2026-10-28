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
  syncOutline,
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
  tacticalRoleDescription?: string;
  originalPlayer: any;
}

export interface TacticalSlot {
  x: number;
  y: number;
  line: 'DIF' | 'MID' | 'ATT';
  sideA: 'left' | 'right' | 'center';
  sideB: 'left' | 'right' | 'center';
  label: string;
  descA: string;
  descB: string;
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

  // Override manuale dei portieri (permette di ciclare tra i turni o scegliere chi va in porta)
  manualGkIdA = signal<string | null>(null);
  manualGkIdB = signal<string | null>(null);

  constructor() {
    addIcons({
      football,
      shield,
      person,
      closeCircle,
      sparkles,
      camera,
      syncOutline,
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

  // --- ESTRAZIONE RUOLO E PIEDE PREFERITO ---
  private getPlayerRole(p: any): string {
    const r = p?.ruoloPreferito || p?.ruolo || '';
    return typeof r === 'string' ? r.trim().toLowerCase() : '';
  }

  private getPlayerFoot(p: any): 'destro' | 'sinistro' | 'ambidestro' | 'none' {
    const f = p?.piedePreferito || p?.piede || '';
    if (typeof f !== 'string') return 'none';
    const lower = f.trim().toLowerCase();
    if (lower.startsWith('sinistr')) return 'sinistro';
    if (lower.startsWith('destr')) return 'destro';
    if (lower.startsWith('ambi')) return 'ambidestro';
    return 'none';
  }

  private isPortiereRole(p: any): boolean {
    return this.getPlayerRole(p) === 'portiere';
  }

  // --- LOGICA IDENTIFICAZIONE PORTIERE ATTIVO ---
  getEffectiveGoalkeeper(
    team: 'A' | 'B',
    players: any[],
  ): { gk: any; isRotation: boolean; currentTurn: number; totalTurns: number } {
    if (!players || players.length === 0) {
      return { gk: null, isRotation: false, currentTurn: 1, totalTurns: 1 };
    }

    const rot = this.rotazionePortieri();
    const isTeamA = team === 'A';
    const modalita = isTeamA
      ? rot?.modalitaA || 'rotazione'
      : rot?.modalitaB || 'rotazione';
    const manualId = isTeamA ? this.manualGkIdA() : this.manualGkIdB();

    // 1. Se l'utente ha impostato manualmente un portiere sulla piantina
    if (manualId) {
      const manualP = players.find((p) => p.id === manualId);
      if (manualP) {
        const rotIds: string[] = isTeamA ? rot?.teamA || [] : rot?.teamB || [];
        const idx = rotIds.indexOf(manualId);
        return {
          gk: manualP,
          isRotation: rotIds.length > 1,
          currentTurn: idx !== -1 ? idx + 1 : 1,
          totalTurns: Math.max(rotIds.length, 1),
        };
      }
    }

    // 2. Se modalità fissa
    if (modalita === 'fisso') {
      const fixedId = isTeamA ? rot?.portiereFissoAId : rot?.portiereFissoBId;
      if (fixedId) {
        const fixedP = players.find((p) => p.id === fixedId);
        if (fixedP) {
          return { gk: fixedP, isRotation: false, currentTurn: 1, totalTurns: 1 };
        }
      }
      const roleGk = players.find((p) => this.isPortiereRole(p));
      if (roleGk) {
        return { gk: roleGk, isRotation: false, currentTurn: 1, totalTurns: 1 };
      }
    }

    // 3. Portiere di ruolo naturale (ha precedenza se presente nella squadra)
    const roleGk = players.find((p) => this.isPortiereRole(p));

    // 4. Se rotazione definita
    const rotIds: string[] = isTeamA ? rot?.teamA || [] : rot?.teamB || [];
    if (rotIds.length > 0) {
      const m = this.currentMatch();
      const crono = m?.cronometro || m?.accumulatedTime || 0;
      const durataMin = rot?.durataTurnoMinuti || 5;
      const turnoCalculated = Math.floor(crono / (durataMin * 60));
      const activeIdx = turnoCalculated % rotIds.length;
      const activeId = rotIds[activeIdx];
      const activeP = players.find((p) => p.id === activeId);

      // Se non c'è un portiere di ruolo fisso, usa il turno di rotazione
      if (activeP && (!roleGk || rotIds.includes(roleGk.id))) {
        return {
          gk: activeP,
          isRotation: rotIds.length > 1,
          currentTurn: activeIdx + 1,
          totalTurns: rotIds.length,
        };
      }
    }

    // 5. Portiere di ruolo
    if (roleGk) {
      return { gk: roleGk, isRotation: false, currentTurn: 1, totalTurns: 1 };
    }

    // 6. Default: primo giocatore
    return {
      gk: players[0],
      isRotation: rotIds.length > 1,
      currentTurn: 1,
      totalTurns: Math.max(rotIds.length, 1),
    };
  }

  hasGkRotation(team: 'A' | 'B'): boolean {
    const { teamA, teamB } = this.normalizedTeams();
    const players = team === 'A' ? teamA : teamB;
    return this.getEffectiveGoalkeeper(team, players).isRotation;
  }

  getGkTurnLabel(team: 'A' | 'B'): string {
    const { teamA, teamB } = this.normalizedTeams();
    const players = team === 'A' ? teamA : teamB;
    const info = this.getEffectiveGoalkeeper(team, players);
    return `${info.currentTurn}/${info.totalTurns}`;
  }

  cycleGoalkeeper(team: 'A' | 'B', event?: Event) {
    if (event) event.stopPropagation();
    const { teamA, teamB } = this.normalizedTeams();
    const players = team === 'A' ? teamA : teamB;
    if (players.length <= 1) return;

    const rot = this.rotazionePortieri();
    const isTeamA = team === 'A';
    const rotIds: string[] = isTeamA ? rot?.teamA || [] : rot?.teamB || [];
    const candidateIds = rotIds.length > 1 ? rotIds : players.map((p) => p.id);

    const currentGk = this.getEffectiveGoalkeeper(team, players);
    const currId = currentGk.gk?.id;
    const currIdx = candidateIds.indexOf(currId);
    const nextIdx = (currIdx + 1) % candidateIds.length;
    const nextId = candidateIds[nextIdx];

    if (isTeamA) {
      this.manualGkIdA.set(nextId);
    } else {
      this.manualGkIdB.set(nextId);
    }

    const sel = this.selectedPlayer();
    if (sel && sel.team === team && sel.isGoalkeeper) {
      const nextP = players.find((p) => p.id === nextId);
      if (nextP) {
        this.selectedPlayer.set({
          ...sel,
          id: nextP.id,
          nome: nextP.nome,
          fotoUrl: nextP.fotoUrl || nextP.foto,
          originalPlayer: nextP,
        });
      }
    }
  }

  setPlayerAsGoalkeeper(player: PositionedPlayer, event?: Event) {
    if (event) event.stopPropagation();
    if (player.team === 'A') {
      this.manualGkIdA.set(player.id);
    } else {
      this.manualGkIdB.set(player.id);
    }

    this.selectedPlayer.set({
      ...player,
      isGoalkeeper: true,
      roleLabel: 'POR',
      tacticalRoleDescription: 'Portiere in Porta',
    });
  }

  // --- SLOT TATTICI BASATI SUL NUMERO DI GIOCATORI DI MOVIMENTO ---
  private getOutfieldSlots(count: number): TacticalSlot[] {
    switch (count) {
      case 1:
        return [
          {
            x: 34,
            y: 50,
            line: 'ATT',
            sideA: 'center',
            sideB: 'center',
            label: 'ATT',
            descA: 'Giocatore a Tutto Campo',
            descB: 'Giocatore a Tutto Campo',
          },
        ];

      case 2:
        return [
          {
            x: 24,
            y: 50,
            line: 'DIF',
            sideA: 'center',
            sideB: 'center',
            label: 'DIF',
            descA: 'Difensore Centrale',
            descB: 'Difensore Centrale',
          },
          {
            x: 42,
            y: 50,
            line: 'ATT',
            sideA: 'center',
            sideB: 'center',
            label: 'ATT',
            descA: 'Punta Centrale',
            descB: 'Punta Centrale',
          },
        ];

      case 3: // Calcetto a 4 (1 GK + 3)
        return [
          {
            x: 23,
            y: 50,
            line: 'DIF',
            sideA: 'center',
            sideB: 'center',
            label: 'DIF',
            descA: 'Ultimo / Difensore',
            descB: 'Ultimo / Difensore',
          },
          {
            x: 35,
            y: 26,
            line: 'MID',
            sideA: 'left',
            sideB: 'right',
            label: 'ALA',
            descA: 'Ala Sinistra',
            descB: 'Ala Destra',
          },
          {
            x: 39,
            y: 74,
            line: 'ATT',
            sideA: 'right',
            sideB: 'left',
            label: 'PIV',
            descA: 'Pivot / Ala Destra',
            descB: 'Pivot / Ala Sinistra',
          },
        ];

      case 4: // Calcetto a 5 classico (1 GK + 4): 1-2-1 Rombo
        return [
          {
            x: 22,
            y: 50,
            line: 'DIF',
            sideA: 'center',
            sideB: 'center',
            label: 'DIF',
            descA: 'Difensore / Ultimo',
            descB: 'Difensore / Ultimo',
          },
          {
            x: 33,
            y: 24,
            line: 'MID',
            sideA: 'left',
            sideB: 'right',
            label: 'LAT',
            descA: 'Laterale Sinistro',
            descB: 'Laterale Destro',
          },
          {
            x: 33,
            y: 76,
            line: 'MID',
            sideA: 'right',
            sideB: 'left',
            label: 'LAT',
            descA: 'Laterale Destro',
            descB: 'Laterale Sinistro',
          },
          {
            x: 43,
            y: 50,
            line: 'ATT',
            sideA: 'center',
            sideB: 'center',
            label: 'PIV',
            descA: 'Pivot / Punta',
            descB: 'Pivot / Punta',
          },
        ];

      case 5: // Calciotto a 6 (1 GK + 5): 2-2-1
        return [
          {
            x: 22,
            y: 32,
            line: 'DIF',
            sideA: 'left',
            sideB: 'right',
            label: 'DIF',
            descA: 'Difensore Sinistro',
            descB: 'Difensore Destro',
          },
          {
            x: 22,
            y: 68,
            line: 'DIF',
            sideA: 'right',
            sideB: 'left',
            label: 'DIF',
            descA: 'Difensore Destro',
            descB: 'Difensore Sinistro',
          },
          {
            x: 34,
            y: 24,
            line: 'MID',
            sideA: 'left',
            sideB: 'right',
            label: 'ALA',
            descA: 'Ala Sinistra',
            descB: 'Ala Destra',
          },
          {
            x: 34,
            y: 76,
            line: 'MID',
            sideA: 'right',
            sideB: 'left',
            label: 'ALA',
            descA: 'Ala Destra',
            descB: 'Ala Sinistra',
          },
          {
            x: 43,
            y: 50,
            line: 'ATT',
            sideA: 'center',
            sideB: 'center',
            label: 'PUN',
            descA: 'Punta Centrale',
            descB: 'Punta Centrale',
          },
        ];

      case 6: // Calciotto a 7 (1 GK + 6): 2-3-1
        return [
          {
            x: 21,
            y: 30,
            line: 'DIF',
            sideA: 'left',
            sideB: 'right',
            label: 'DIF',
            descA: 'Terzino / Difensore Sinistro',
            descB: 'Terzino / Difensore Destro',
          },
          {
            x: 21,
            y: 70,
            line: 'DIF',
            sideA: 'right',
            sideB: 'left',
            label: 'DIF',
            descA: 'Terzino / Difensore Destro',
            descB: 'Terzino / Difensore Sinistro',
          },
          {
            x: 31,
            y: 50,
            line: 'MID',
            sideA: 'center',
            sideB: 'center',
            label: 'MED',
            descA: 'Mediano / Centrocampista',
            descB: 'Mediano / Centrocampista',
          },
          {
            x: 37,
            y: 22,
            line: 'MID',
            sideA: 'left',
            sideB: 'right',
            label: 'ALA',
            descA: 'Ala Sinistra',
            descB: 'Ala Destra',
          },
          {
            x: 37,
            y: 78,
            line: 'MID',
            sideA: 'right',
            sideB: 'left',
            label: 'ALA',
            descA: 'Ala Destra',
            descB: 'Ala Sinistra',
          },
          {
            x: 44,
            y: 50,
            line: 'ATT',
            sideA: 'center',
            sideB: 'center',
            label: 'PUN',
            descA: 'Punta Centrale',
            descB: 'Punta Centrale',
          },
        ];

      case 7: // Calcio a 8 (1 GK + 7): 2-3-2
        return [
          {
            x: 20,
            y: 30,
            line: 'DIF',
            sideA: 'left',
            sideB: 'right',
            label: 'DIF',
            descA: 'Difensore Sinistro',
            descB: 'Difensore Destro',
          },
          {
            x: 20,
            y: 70,
            line: 'DIF',
            sideA: 'right',
            sideB: 'left',
            label: 'DIF',
            descA: 'Difensore Destro',
            descB: 'Difensore Sinistro',
          },
          {
            x: 31,
            y: 20,
            line: 'MID',
            sideA: 'left',
            sideB: 'right',
            label: 'ALA',
            descA: 'Ala Sinistra',
            descB: 'Ala Destra',
          },
          {
            x: 30,
            y: 50,
            line: 'MID',
            sideA: 'center',
            sideB: 'center',
            label: 'CEN',
            descA: 'Centrocampista Centrale',
            descB: 'Centrocampista Centrale',
          },
          {
            x: 31,
            y: 80,
            line: 'MID',
            sideA: 'right',
            sideB: 'left',
            label: 'ALA',
            descA: 'Ala Destra',
            descB: 'Ala Sinistra',
          },
          {
            x: 43,
            y: 36,
            line: 'ATT',
            sideA: 'left',
            sideB: 'right',
            label: 'ATT',
            descA: 'Attaccante Sinistro',
            descB: 'Attaccante Destro',
          },
          {
            x: 43,
            y: 64,
            line: 'ATT',
            sideA: 'right',
            sideB: 'left',
            label: 'ATT',
            descA: 'Attaccante Destro',
            descB: 'Attaccante Sinistro',
          },
        ];

      default: {
        const defCount = Math.max(2, Math.floor(count * 0.35));
        const attCount = Math.max(1, Math.floor(count * 0.25));
        const midCount = count - defCount - attCount;

        const getYPositions = (n: number) => {
          if (n === 1) return [50];
          const step = 64 / (n + 1);
          return Array.from({ length: n }, (_, i) => 18 + step * (i + 1));
        };

        const slots: TacticalSlot[] = [];

        const defY = getYPositions(defCount);
        defY.forEach((y, i) => {
          const side = y < 45 ? 'left' : y > 55 ? 'right' : 'center';
          slots.push({
            x: 21,
            y,
            line: 'DIF',
            sideA: side,
            sideB: side === 'left' ? 'right' : side === 'right' ? 'left' : 'center',
            label: 'DIF',
            descA: side === 'left' ? 'Difensore Sinistro' : side === 'right' ? 'Difensore Destro' : 'Difensore Centrale',
            descB: side === 'left' ? 'Difensore Destro' : side === 'right' ? 'Difensore Sinistro' : 'Difensore Centrale',
          });
        });

        const midY = getYPositions(midCount);
        midY.forEach((y, i) => {
          const side = y < 45 ? 'left' : y > 55 ? 'right' : 'center';
          const label = side === 'center' ? 'CEN' : 'ALA';
          slots.push({
            x: 32,
            y,
            line: 'MID',
            sideA: side,
            sideB: side === 'left' ? 'right' : side === 'right' ? 'left' : 'center',
            label,
            descA: side === 'left' ? 'Ala Sinistra' : side === 'right' ? 'Ala Destra' : 'Centrocampista',
            descB: side === 'left' ? 'Ala Destra' : side === 'right' ? 'Ala Sinistra' : 'Centrocampista',
          });
        });

        const attY = getYPositions(attCount);
        attY.forEach((y, i) => {
          const side = y < 45 ? 'left' : y > 55 ? 'right' : 'center';
          slots.push({
            x: 44,
            y,
            line: 'ATT',
            sideA: side,
            sideB: side === 'left' ? 'right' : side === 'right' ? 'left' : 'center',
            label: side === 'center' ? 'PUN' : 'ATT',
            descA: side === 'left' ? 'Attaccante Sinistro' : side === 'right' ? 'Attaccante Destro' : 'Punta Centrale',
            descB: side === 'left' ? 'Attaccante Destro' : side === 'right' ? 'Attaccante Sinistro' : 'Punta Centrale',
          });
        });

        return slots;
      }
    }
  }

  // --- VALUTAZIONE AFFINITÀ GIOCATORE / SLOT TATTICO ---
  private calculateSlotSuitability(
    player: any,
    slot: TacticalSlot,
    team: 'A' | 'B',
  ): number {
    let score = 0;
    const role = this.getPlayerRole(player);
    const foot = this.getPlayerFoot(player);
    const side = team === 'A' ? slot.sideA : slot.sideB;

    // 1. Compatibilità di Ruolo
    if (role === 'difensore') {
      if (slot.line === 'DIF') score += 100;
      else if (slot.line === 'MID') score += 20;
    } else if (role === 'fascia') {
      if (slot.line === 'MID') {
        score += 100;
        if (slot.label === 'ALA' || slot.label === 'LAT') score += 25;
      } else if (slot.line === 'DIF') {
        score += 40; // Terzino di spinta
      } else if (slot.line === 'ATT') {
        score += 45; // Ala offensiva
      }
    } else if (role === 'attaccante') {
      if (slot.line === 'ATT') score += 100;
      else if (slot.line === 'MID') score += 25;
    } else if (role === 'portiere') {
      score += 30; // Giocatore portiere schierato di movimento
    } else {
      score += 50; // Jolly / non specificato
    }

    // 2. Compatibilità di Piede Naturale con la Corsia
    if (foot === 'sinistro') {
      if (side === 'left') score += 50; // Mancino sulla corsia sinistra
      else if (side === 'center') score += 15;
      else if (side === 'right') score -= 35; // Fuori corsia naturale
    } else if (foot === 'destro') {
      if (side === 'right') score += 50; // Destro sulla corsia destra
      else if (side === 'center') score += 15;
      else if (side === 'left') score -= 35; // Fuori corsia naturale
    } else if (foot === 'ambidestro') {
      score += 30; // Versatile su ogni fascia
    }

    return score;
  }

  // --- ASSEGNAZIONE OTTIMALE DEI GIOCATORI AGLI SLOT ---
  private assignPlayersToSlots(
    players: any[],
    slots: TacticalSlot[],
    team: 'A' | 'B',
  ): Array<{ player: any; slot: TacticalSlot }> {
    if (players.length === 0 || slots.length === 0) return [];
    const n = Math.min(players.length, slots.length);

    // Permutazione esatta fino a 7 giocatori (< 0.2ms)
    if (n <= 7) {
      let bestScore = -Infinity;
      let bestPerm: number[] = [];
      const indices = Array.from({ length: n }, (_, i) => i);

      const permute = (arr: number[], m: number = 0) => {
        if (m === arr.length) {
          let currentScore = 0;
          for (let i = 0; i < n; i++) {
            currentScore += this.calculateSlotSuitability(
              players[arr[i]],
              slots[i],
              team,
            );
          }
          if (currentScore > bestScore) {
            bestScore = currentScore;
            bestPerm = [...arr];
          }
          return;
        }
        for (let i = m; i < arr.length; i++) {
          [arr[m], arr[i]] = [arr[i], arr[m]];
          permute(arr, m + 1);
          [arr[m], arr[i]] = [arr[i], arr[m]];
        }
      };

      permute(indices);

      return bestPerm.map((playerIdx, slotIdx) => ({
        player: players[playerIdx],
        slot: slots[slotIdx],
      }));
    }

    // Algoritmo greedy per formazioni numerose
    const usedPlayers = new Set<number>();
    const assignment: Array<{ player: any; slot: TacticalSlot }> = [];

    for (let s = 0; s < slots.length; s++) {
      const slot = slots[s];
      let bestP = -1;
      let maxSc = -Infinity;

      for (let p = 0; p < players.length; p++) {
        if (usedPlayers.has(p)) continue;
        const sc = this.calculateSlotSuitability(players[p], slot, team);
        if (sc > maxSc) {
          maxSc = sc;
          bestP = p;
        }
      }

      if (bestP !== -1) {
        usedPlayers.add(bestP);
        assignment.push({ player: players[bestP], slot });
      }
    }

    return assignment;
  }

  // --- CALCOLO POSIZIONAMENTO REATTIVO DEI GIOCATORI ---
  readonly positionedPlayers = computed<PositionedPlayer[]>(() => {
    const { teamA, teamB } = this.normalizedTeams();
    const result: PositionedPlayer[] = [];

    // --- 1. SQUADRA A (BIANCHI - META CAMPO SINISTRA) ---
    if (teamA.length > 0) {
      const gkAInfo = this.getEffectiveGoalkeeper('A', teamA);
      const gkA = gkAInfo.gk;
      const outfieldA = teamA.filter((p) => p.id !== gkA?.id);

      if (gkA) {
        const turnLabel = gkAInfo.isRotation ? ` ${gkAInfo.currentTurn}/${gkAInfo.totalTurns}` : '';
        result.push({
          id: gkA.id || 'gk-a',
          nome: gkA.nome || 'Portiere A',
          fotoUrl: gkA.fotoUrl || gkA.foto,
          team: 'A',
          isGoalkeeper: true,
          xPercent: 9.5,
          yPercent: 50,
          roleLabel: `POR${turnLabel}`,
          tacticalRoleDescription: gkAInfo.isRotation
            ? `Portiere di Turno (${gkAInfo.currentTurn}/${gkAInfo.totalTurns})`
            : 'Portiere in Porta',
          originalPlayer: gkA,
        });
      }

      const slotsA = this.getOutfieldSlots(outfieldA.length);
      const assignmentsA = this.assignPlayersToSlots(outfieldA, slotsA, 'A');

      assignmentsA.forEach(({ player, slot }) => {
        result.push({
          id: player.id || `out-a-${slot.x}-${slot.y}`,
          nome: player.nome,
          fotoUrl: player.fotoUrl || player.foto,
          team: 'A',
          isGoalkeeper: false,
          xPercent: slot.x,
          yPercent: slot.y,
          roleLabel: slot.label,
          tacticalRoleDescription: slot.descA,
          originalPlayer: player,
        });
      });
    }

    // --- 2. SQUADRA B (NERI - META CAMPO DESTRA) ---
    if (teamB.length > 0) {
      const gkBInfo = this.getEffectiveGoalkeeper('B', teamB);
      const gkB = gkBInfo.gk;
      const outfieldB = teamB.filter((p) => p.id !== gkB?.id);

      if (gkB) {
        const turnLabel = gkBInfo.isRotation ? ` ${gkBInfo.currentTurn}/${gkBInfo.totalTurns}` : '';
        result.push({
          id: gkB.id || 'gk-b',
          nome: gkB.nome || 'Portiere B',
          fotoUrl: gkB.fotoUrl || gkB.foto,
          team: 'B',
          isGoalkeeper: true,
          xPercent: 90.5,
          yPercent: 50,
          roleLabel: `POR${turnLabel}`,
          tacticalRoleDescription: gkBInfo.isRotation
            ? `Portiere di Turno (${gkBInfo.currentTurn}/${gkBInfo.totalTurns})`
            : 'Portiere in Porta',
          originalPlayer: gkB,
        });
      }

      const slotsB = this.getOutfieldSlots(outfieldB.length);
      const assignmentsB = this.assignPlayersToSlots(outfieldB, slotsB, 'B');

      assignmentsB.forEach(({ player, slot }) => {
        result.push({
          id: player.id || `out-b-${slot.x}-${slot.y}`,
          nome: player.nome,
          fotoUrl: player.fotoUrl || player.foto,
          team: 'B',
          isGoalkeeper: false,
          xPercent: 100 - slot.x, // Speculare sull'asse X
          yPercent: slot.y,
          roleLabel: slot.label,
          tacticalRoleDescription: slot.descB,
          originalPlayer: player,
        });
      });
    }

    return result;
  });

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
