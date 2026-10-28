import {
  EnvironmentInjector,
  Injectable,
  inject,
  runInInjectionContext,
  signal,
  computed,
} from '@angular/core';
import { Firestore, docData } from '@angular/fire/firestore';
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { Subscription } from 'rxjs';
import { TMatchStatus } from '../../../models/match-status.type';
import {
  EventoGol,
  Partita,
  RotazionePortieri,
  ModalitaPortiere,
} from '../../../models/partita.model';
import { Giocatore } from '../../../models/giocatore.model';
import { RuoloPreferito } from '../../../models/ruolo-preferito.enum';
import { PlayerPerformance } from '../../../models/player-performance.model';
import {
  getStagionePartita,
  isStagioneCorrente,
  CURRENT_SEASON,
  MIN_CURRENT_SEASON_DATE,
} from '../../../utils/season-utils';
import { SyncStatusService } from '../../../services/sync-status.service';
import { SoundSettingsService } from '../../../services/sound-settings.service';

export type ConvocatoState = Giocatore & { selezionato?: boolean };
export type MatchDetailState = Partita & { isAdmin?: boolean };
export const LOCAL_STORAGE_MATCH_KEY = 'calcettoabbuffo_active_match';

export type PortiereTurnEntry = PlayerPerformance & {
  ordine: number;
  isAttuale: boolean;
  isProssimo: boolean;
  isDiRuolo: boolean;
};

export interface PortiereTeamInfo {
  isFisso: boolean;
  isDiRuolo: boolean;
  attuale: PlayerPerformance | null;
  prossimo: PlayerPerformance | null;
  turnoAttualeNumero: number;
  turnoProssimoNumero: number;
  lista: PortiereTurnEntry[];
}

@Injectable()
export class MatchStateService {
  public firestore = inject(Firestore);
  public syncStatus = inject(SyncStatusService);
  public soundSettings = inject(SoundSettingsService, { optional: true });
  private injector = inject(EnvironmentInjector);

  matchId = signal<string | null>(null);
  matchDataOriginale: MatchDetailState | null = null;
  private matchSub?: Subscription;

  step = signal<'convocati' | 'dettagli' | 'squadre' | 'match' | 'prestazioni'>(
    'convocati'
  );
  status = signal<TMatchStatus>('da_definire');
  filtro = signal<string>('');
  luogo = signal<string>('');
  dataPartita = signal<string>('');
  orario = signal<string>('');
  tutti = signal<ConvocatoState[]>([]);
  teamA = signal<PlayerPerformance[]>([]);
  teamB = signal<PlayerPerformance[]>([]);
  scoreA = signal<number>(0);
  scoreB = signal<number>(0);
  eventiGol = signal<EventoGol[]>([]);
  matchConcluso = signal<boolean>(false);
  pagelleInserite = signal<boolean>(false);
  cambioAttivo = signal<boolean>(false);
  fotoUrl = signal<string | null>(null);
  fotoPath = signal<string | null>(null);
  stagione = signal<string>(CURRENT_SEASON);
  pronosticoAi = signal<string | null>(null);
  cronacaAi = signal<string | null>(null);
  commentoPartita = signal<string>('');

  cronometro = signal<number>(0);
  accumulatedTime = signal<number>(0);
  timerStartAt = signal<number | null>(null);
  isTimerRunning = signal<boolean>(false);
  rotazionePortieri = signal<RotazionePortieri | null>(null);

  convocati = computed(() =>
    this.tutti().filter((g) => g?.selezionato === true)
  );
  totaleConvocati = computed(() => this.convocati().length);
  giocatoriFiltrati = computed(() => {
    const f = this.filtro().toLowerCase().trim();
    if (!f) return this.tutti();
    return this.tutti().filter((g) => {
      const nome = (g.nome || '').toLowerCase();
      const soprannome = (g.soprannome || '').toLowerCase();
      const soprannomeAi = (g.soprannomeAi || '').toLowerCase();
      const anno = (g.annoNascita || '').toString();
      const piede = ((g.piedePreferito as string) || '').toLowerCase();
      const ruolo = ((g.ruoloPreferito as string) || '').toLowerCase();
      return (
        nome.includes(f) ||
        soprannome.includes(f) ||
        soprannomeAi.includes(f) ||
        anno.includes(f) ||
        piede.includes(f) ||
        ruolo.includes(f)
      );
    });
  });
  tuttiInCampo = computed(() => [...this.teamA(), ...this.teamB()]);

  isDataStagioneValida = computed(() => {
    if (this.matchId()) return true;
    const d = this.dataPartita();
    if (!d) return false;
    return isStagioneCorrente({ dataPartita: d });
  });

  isDettagliValidi = computed(
    () =>
      this.luogo().trim() !== '' &&
      this.dataPartita() !== '' &&
      this.orario() !== '' &&
      this.isDataStagioneValida()
  );

  messaggioEquilibrio = computed(() => {
    const diff = Math.abs(this.teamA().length - this.teamB().length);
    return diff > 1
      ? `⚠️ Sbilanciato! (${this.teamA().length} vs ${this.teamB().length})`
      : null;
  });

  formatTimer = computed(() => {
    const m = Math.floor(this.cronometro() / 60)
      .toString()
      .padStart(2, '0');
    const s = (this.cronometro() % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  });

  durataTurnoMinuti = computed(
    () =>
      this.rotazionePortieri()?.durataTurnoMinuti ||
      this.soundSettings?.config().gkTurnMinutes ||
      5
  );

  turnoAttualeIndex = computed(() => {
    const minuti = Math.floor(this.cronometro() / 60);
    return Math.floor(minuti / this.durataTurnoMinuti());
  });

  minutiRimanentiAlCambio = computed(() => {
    const sec = this.cronometro();
    const durataSec = this.durataTurnoMinuti() * 60;
    const passati = sec % durataSec;
    const rim = durataSec - passati;
    const m = Math.floor(rim / 60)
      .toString()
      .padStart(2, '0');
    const s = (rim % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  });

  modalitaPortieriA = computed<ModalitaPortiere>(
    () => this.rotazionePortieri()?.modalitaA || 'rotazione'
  );
  modalitaPortieriB = computed<ModalitaPortiere>(
    () => this.rotazionePortieri()?.modalitaB || 'rotazione'
  );
  portiereFissoAId = computed<string | null>(
    () => this.rotazionePortieri()?.portiereFissoAId || null
  );
  portiereFissoBId = computed<string | null>(
    () => this.rotazionePortieri()?.portiereFissoBId || null
  );

  portieriInfoA = computed<PortiereTeamInfo>(() =>
    this.buildPortieriTeamInfo('A')
  );

  portieriInfoB = computed<PortiereTeamInfo>(() =>
    this.buildPortieriTeamInfo('B')
  );

  private buildPortieriTeamInfo(team: 'A' | 'B'): PortiereTeamInfo {
    const rot = this.rotazionePortieri();
    const players = team === 'A' ? this.teamA() : this.teamB();
    const modalita =
      (team === 'A' ? rot?.modalitaA : rot?.modalitaB) || 'rotazione';
    const isFisso = modalita === 'fisso';

    if (!players || players.length === 0) {
      return {
        isFisso: false,
        isDiRuolo: false,
        attuale: null,
        prossimo: null,
        turnoAttualeNumero: 1,
        turnoProssimoNumero: 1,
        lista: [],
      };
    }

    if (isFisso) {
      const configuredFixedId =
        team === 'A' ? rot?.portiereFissoAId : rot?.portiereFissoBId;
      const fixedId =
        configuredFixedId ||
        players.find(
          (p) => (p as any).ruoloPreferito === RuoloPreferito.Portiere
        )?.id ||
        players[0]?.id;
      const fixedPlayer =
        players.find((p) => p.id === fixedId) || players[0] || null;
      const isDiRuolo =
        (fixedPlayer as any)?.ruoloPreferito === RuoloPreferito.Portiere;

      return {
        isFisso: true,
        isDiRuolo,
        attuale: fixedPlayer,
        prossimo: null,
        turnoAttualeNumero: 1,
        turnoProssimoNumero: 1,
        lista: fixedPlayer
          ? [
              {
                ...fixedPlayer,
                ordine: 1,
                isAttuale: true,
                isProssimo: false,
                isDiRuolo,
              },
            ]
          : [],
      };
    }

    // Modalità a rotazione ciclica ogni 5 minuti
    const rotIds = team === 'A' ? rot?.teamA : rot?.teamB;
    const ids = rotIds && rotIds.length > 0 ? rotIds : players.map((p) => p.id);
    const turno = this.turnoAttualeIndex();
    const currIdx = ids.length > 0 ? turno % ids.length : 0;
    const nextIdx = ids.length > 0 ? (turno + 1) % ids.length : 0;

    const findP = (id: string): PlayerPerformance | null =>
      players.find((p) => p.id === id) || null;
    const attuale = ids.length > 0 ? findP(ids[currIdx]) : null;
    const prossimo = ids.length > 0 ? findP(ids[nextIdx]) : null;

    const lista = ids
      .map((id, idx) => {
        const p = findP(id);
        if (!p) return null;
        return {
          ...p,
          ordine: idx + 1,
          isAttuale: idx === currIdx,
          isProssimo: idx === nextIdx,
          isDiRuolo: (p as any).ruoloPreferito === RuoloPreferito.Portiere,
        };
      })
      .filter((item): item is PortiereTurnEntry => item !== null);

    return {
      isFisso: false,
      isDiRuolo: (attuale as any)?.ruoloPreferito === RuoloPreferito.Portiere,
      attuale,
      prossimo,
      turnoAttualeNumero: currIdx + 1,
      turnoProssimoNumero: nextIdx + 1,
      lista,
    };
  }

  private shuffleIds(array: string[]): string[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  impostaModalitaPortiere(team: 'A' | 'B', modalita: ModalitaPortiere) {
    const current = this.rotazionePortieri() || {
      teamA: this.teamA().map((p) => p.id),
      teamB: this.teamB().map((p) => p.id),
      durataTurnoMinuti: 5,
      modalitaA: 'rotazione',
      modalitaB: 'rotazione',
    };

    if (team === 'A') {
      let fissoId = current.portiereFissoAId;
      if (modalita === 'fisso' && !fissoId) {
        const pureGk = this.teamA().find(
          (p) => (p as any).ruoloPreferito === RuoloPreferito.Portiere
        );
        fissoId = pureGk?.id || this.teamA()[0]?.id || null;
      }
      this.rotazionePortieri.set({
        ...current,
        modalitaA: modalita,
        portiereFissoAId: fissoId,
      });
    } else {
      let fissoId = current.portiereFissoBId;
      if (modalita === 'fisso' && !fissoId) {
        const pureGk = this.teamB().find(
          (p) => (p as any).ruoloPreferito === RuoloPreferito.Portiere
        );
        fissoId = pureGk?.id || this.teamB()[0]?.id || null;
      }
      this.rotazionePortieri.set({
        ...current,
        modalitaB: modalita,
        portiereFissoBId: fissoId,
      });
    }
  }

  impostaPortiereFisso(team: 'A' | 'B', playerId: string) {
    const current = this.rotazionePortieri() || {
      teamA: this.teamA().map((p) => p.id),
      teamB: this.teamB().map((p) => p.id),
      durataTurnoMinuti: 5,
      modalitaA: 'rotazione',
      modalitaB: 'rotazione',
    };

    if (team === 'A') {
      this.rotazionePortieri.set({
        ...current,
        modalitaA: 'fisso',
        portiereFissoAId: playerId,
      });
    } else {
      this.rotazionePortieri.set({
        ...current,
        modalitaB: 'fisso',
        portiereFissoBId: playerId,
      });
    }
  }

  inizializzaRotazionePortieri(forceReroll: boolean = false) {
    const teamAIds = this.teamA().map((p) => p.id);
    const teamBIds = this.teamB().map((p) => p.id);
    if (teamAIds.length === 0 || teamBIds.length === 0) return;

    const current = this.rotazionePortieri();
    const modalitaA: ModalitaPortiere = current?.modalitaA || 'rotazione';
    const modalitaB: ModalitaPortiere = current?.modalitaB || 'rotazione';

    const defaultFissoA =
      current?.portiereFissoAId ||
      this.teamA().find(
        (p) => (p as any).ruoloPreferito === RuoloPreferito.Portiere
      )?.id ||
      teamAIds[0] ||
      null;

    const defaultFissoB =
      current?.portiereFissoBId ||
      this.teamB().find(
        (p) => (p as any).ruoloPreferito === RuoloPreferito.Portiere
      )?.id ||
      teamBIds[0] ||
      null;

    if (current && !forceReroll) {
      const validA =
        teamAIds.every((id) => current.teamA?.includes(id)) &&
        current.teamA?.length === teamAIds.length;
      const validB =
        teamBIds.every((id) => current.teamB?.includes(id)) &&
        current.teamB?.length === teamBIds.length;
      if (validA && validB) {
        if (!current.modalitaA || !current.modalitaB) {
          this.rotazionePortieri.set({
            ...current,
            modalitaA,
            modalitaB,
            portiereFissoAId: defaultFissoA,
            portiereFissoBId: defaultFissoB,
          });
        }
        return;
      }
    }

    const nuovaRotazione: RotazionePortieri = {
      modalitaA,
      modalitaB,
      portiereFissoAId: defaultFissoA,
      portiereFissoBId: defaultFissoB,
      teamA: modalitaA === 'rotazione' ? this.shuffleIds(teamAIds) : teamAIds,
      teamB: modalitaB === 'rotazione' ? this.shuffleIds(teamBIds) : teamBIds,
      durataTurnoMinuti: 5,
    };
    this.rotazionePortieri.set(nuovaRotazione);
  }

  rimescolaSquadra(team: 'A' | 'B') {
    const current = this.rotazionePortieri() || {
      teamA: this.teamA().map((p) => p.id),
      teamB: this.teamB().map((p) => p.id),
      durataTurnoMinuti: 5,
      modalitaA: 'rotazione',
      modalitaB: 'rotazione',
    };

    if (team === 'A') {
      this.rotazionePortieri.set({
        ...current,
        teamA: this.shuffleIds(this.teamA().map((p) => p.id)),
      });
    } else {
      this.rotazionePortieri.set({
        ...current,
        teamB: this.shuffleIds(this.teamB().map((p) => p.id)),
      });
    }
  }

  scambiaOrdinePortieri(team: 'A' | 'B', index1: number, index2: number) {
    const current = this.rotazionePortieri();
    if (!current) return;
    const list = team === 'A' ? [...current.teamA] : [...current.teamB];
    if (
      index1 < 0 ||
      index1 >= list.length ||
      index2 < 0 ||
      index2 >= list.length
    ) {
      return;
    }
    const temp = list[index1];
    list[index1] = list[index2];
    list[index2] = temp;
    if (team === 'A') {
      this.rotazionePortieri.set({ ...current, teamA: list });
    } else {
      this.rotazionePortieri.set({ ...current, teamB: list });
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // AZIONI LIVE MATCH CENTRALIZZATE (TIMER, CAMBIO PORTIERE, GOL, UNDO)
  // ──────────────────────────────────────────────────────────────────────

  async setCambioPortiereAttivo(attivo: boolean): Promise<void> {
    this.cambioAttivo.set(attivo);
    const id = this.matchId();
    if (!id) return;
    try {
      await updateDoc(doc(this.firestore, `partite/${id}`), {
        cambioAttivo: attivo,
      });
    } catch (err) {
      console.warn('Errore aggiornamento stato cambio portiere:', err);
    }
  }

  async toggleTimerState(): Promise<void> {
    const id = this.matchId();
    if (!id) return;

    if (this.isTimerRunning()) {
      const start = this.timerStartAt() || Date.now();
      const diffSec = Math.floor((Date.now() - start) / 1000);
      const nuovoAccumulo = this.accumulatedTime() + diffSec;

      this.isTimerRunning.set(false);
      this.accumulatedTime.set(nuovoAccumulo);
      this.timerStartAt.set(null);
      this.cronometro.set(nuovoAccumulo);

      this.salvaSnapshotLocale();

      try {
        this.syncStatus.notifySyncPending();
        await updateDoc(doc(this.firestore, `partite/${id}`), {
          isTimerRunning: false,
          accumulatedTime: nuovoAccumulo,
          timerStartAt: null,
          cronometro: nuovoAccumulo,
        });
        this.syncStatus.notifySyncSuccess();
      } catch (err) {
        console.warn('Errore sync timer online (salvato in locale):', err);
        this.syncStatus.notifySyncError();
      }
    } else {
      const startAt = Date.now();
      this.isTimerRunning.set(true);
      this.timerStartAt.set(startAt);

      const payload: Record<string, unknown> = {
        isTimerRunning: true,
        timerStartAt: startAt,
      };
      const currentStatus = this.status();
      if (currentStatus !== 'in_corso' && currentStatus !== 'conclusa') {
        payload['status'] = 'in_corso';
        this.status.set('in_corso');
      }

      this.salvaSnapshotLocale();

      try {
        this.syncStatus.notifySyncPending();
        await updateDoc(doc(this.firestore, `partite/${id}`), payload);
        this.syncStatus.notifySyncSuccess();
      } catch (err) {
        console.warn('Errore sync timer online (salvato in locale):', err);
        this.syncStatus.notifySyncError();
      }
    }
  }

  async aggiungiGolPartita(
    giocatore: PlayerPerformance,
    teamVantaggio: 'A' | 'B',
    isAutogoal: boolean,
    assistMan: PlayerPerformance | null = null
  ): Promise<{ evento: EventoGol; portiereSubitoNome: string | null }> {
    const defendingTeam = teamVantaggio === 'A' ? 'B' : 'A';
    const portiereInfo =
      defendingTeam === 'A' ? this.portieriInfoA() : this.portieriInfoB();
    const portiereSubito = portiereInfo?.attuale;

    const nuovoEvento: EventoGol = {
      idAssegnato: giocatore.id,
      nome: giocatore.nome,
      teamVantaggio,
      isAutogoal,
      tempo: this.formatTimer(),
      assistId: assistMan ? assistMan.id : null,
      assistNome: assistMan ? assistMan.nome : null,
      portiereSubitoId: portiereSubito?.id || null,
      portiereSubitoNome: portiereSubito?.nome || null,
    };

    this.eventiGol.update((list) => [...list, nuovoEvento]);

    if (teamVantaggio === 'A') {
      this.scoreA.update((s) => s + 1);
    } else {
      this.scoreB.update((s) => s + 1);
    }

    const updateScorer = <T extends { id: string; gol?: number; autogol?: number }>(
      lista: T[]
    ): T[] =>
      lista.map((g) =>
        g.id === giocatore.id
          ? {
              ...g,
              gol: (g.gol || 0) + (isAutogoal ? 0 : 1),
              autogol: (g.autogol || 0) + (isAutogoal ? 1 : 0),
            }
          : g
      );

    this.tutti.update((l) => updateScorer(l as any) as ConvocatoState[]);
    this.teamA.update(updateScorer);
    this.teamB.update(updateScorer);

    if (assistMan && !isAutogoal) {
      const updateAssist = <T extends { id: string; assist?: number }>(
        lista: T[]
      ): T[] =>
        lista.map((g) =>
          g.id === assistMan.id
            ? {
                ...g,
                assist: (g.assist || 0) + 1,
              }
            : g
        );

      this.tutti.update((l) => updateAssist(l as any) as ConvocatoState[]);
      this.teamA.update(updateAssist);
      this.teamB.update(updateAssist);
    }

    await this.salvaInDatabase(false);

    return {
      evento: nuovoEvento,
      portiereSubitoNome: portiereSubito?.nome || null,
    };
  }

  async annullaUltimoGolSquadra(team: 'A' | 'B'): Promise<EventoGol | null> {
    const list = this.eventiGol();
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].teamVantaggio === team) {
        const rimosso = list[i];
        this.eventiGol.update((l) => l.filter((_, index) => index !== i));

        if (team === 'A') {
          this.scoreA.update((s) => Math.max(0, s - 1));
        } else {
          this.scoreB.update((s) => Math.max(0, s - 1));
        }

        const removeGol = <
          T extends { id: string; gol?: number; autogol?: number },
        >(
          lista: T[]
        ): T[] =>
          lista.map((g) =>
            g.id === rimosso.idAssegnato
              ? {
                  ...g,
                  gol: Math.max(
                    0,
                    (g.gol || 0) - (rimosso.isAutogoal ? 0 : 1)
                  ),
                  autogol: Math.max(
                    0,
                    (g.autogol || 0) - (rimosso.isAutogoal ? 1 : 0)
                  ),
                }
              : g
          );

        this.tutti.update((l) => removeGol(l as any) as ConvocatoState[]);
        this.teamA.update(removeGol);
        this.teamB.update(removeGol);

        if (rimosso.assistId) {
          const removeAssist = <T extends { id: string; assist?: number }>(
            lista: T[]
          ): T[] =>
            lista.map((g) =>
              g.id === rimosso.assistId
                ? {
                    ...g,
                    assist: Math.max(0, (g.assist || 0) - 1),
                  }
                : g
            );

          this.tutti.update((l) => removeAssist(l as any) as ConvocatoState[]);
          this.teamA.update(removeAssist);
          this.teamB.update(removeAssist);
        }

        await this.salvaInDatabase(false);
        return rimosso;
      }
    }
    return null;
  }

  avviaAscoltoReale() {
    if (!this.matchId() || this.matchSub) return;

    const docRef = doc(this.firestore, `partite/${this.matchId()}`);

    const doc$ = runInInjectionContext(this.injector, () => docData(docRef));
    this.matchSub = doc$.subscribe({
      next: (data: any) => {
        if (data) {
          this.scoreA.set(data.scoreA || 0);
          this.scoreB.set(data.scoreB || 0);
          this.eventiGol.set(data.eventiGol || []);

          if (Array.isArray(data.teamA) && data.teamA.length > 0) {
            this.teamA.set(data.teamA);
          }
          if (Array.isArray(data.teamB) && data.teamB.length > 0) {
            this.teamB.set(data.teamB);
          }

          this.isTimerRunning.set(data.isTimerRunning || false);
          this.accumulatedTime.set(data.accumulatedTime || 0);
          this.timerStartAt.set(data.timerStartAt || null);
          this.status.set(data.status || 'da_definire');
          // Allarme cambio consentito solo se il timer della partita è effettivamente attivo
          this.cambioAttivo.set(data.isTimerRunning ? (data.cambioAttivo || false) : false);
          this.rotazionePortieri.set(data.rotazionePortieri || null);
          this.fotoUrl.set(data.fotoUrl || null);
          this.fotoPath.set(data.fotoPath || null);
          this.pronosticoAi.set(data.pronosticoAi || null);
          this.cronacaAi.set(data.cronacaAi || null);
          this.commentoPartita.set(
            data.commentoPartita || data.commento || ''
          );
        }
      },
      error: (err) => console.warn('Errore ascolto partita:', err),
    });
  }

  fermaAscolto() {
    if (this.matchSub) this.matchSub.unsubscribe();
  }

  salvaSnapshotLocale() {
    try {
      if (typeof localStorage === 'undefined') return;
      const snapshot = {
        timestamp: Date.now(),
        matchId: this.matchId(),
        step: this.step(),
        status: this.status(),
        luogo: this.luogo(),
        dataPartita: this.dataPartita(),
        orario: this.orario(),
        tutti: this.tutti(),
        teamA: this.teamA(),
        teamB: this.teamB(),
        scoreA: this.scoreA(),
        scoreB: this.scoreB(),
        eventiGol: this.eventiGol(),
        cronometro: this.cronometro(),
        accumulatedTime: this.accumulatedTime(),
        timerStartAt: this.timerStartAt(),
        isTimerRunning: this.isTimerRunning(),
        rotazionePortieri: this.rotazionePortieri(),
        matchConcluso: this.matchConcluso(),
        pagelleInserite: this.pagelleInserite(),
        commentoPartita: this.commentoPartita(),
      };
      localStorage.setItem(LOCAL_STORAGE_MATCH_KEY, JSON.stringify(snapshot));
      this.syncStatus.notifyLocalSave();
    } catch (e) {
      console.warn('Errore salvataggio snapshot locale:', e);
    }
  }

  rimuoviSnapshotLocale() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(LOCAL_STORAGE_MATCH_KEY);
      }
    } catch {}
  }

  ripristinaSnapshotLocaleSeRecente(targetMatchId: string | null): boolean {
    try {
      if (typeof localStorage === 'undefined') return false;
      const raw = localStorage.getItem(LOCAL_STORAGE_MATCH_KEY);
      if (!raw) return false;
      const snap = JSON.parse(raw);
      if (!snap || typeof snap !== 'object') return false;

      const isMatchingId =
        snap.matchId === targetMatchId ||
        (!targetMatchId && !snap.matchId) ||
        (targetMatchId === 'nuova' && !snap.matchId);

      const isRecent = Date.now() - (snap.timestamp || 0) < 24 * 60 * 60 * 1000;

      if (isMatchingId && isRecent && !snap.matchConcluso) {
        if (snap.teamA && snap.teamA.length > 0) this.teamA.set(snap.teamA);
        if (snap.teamB && snap.teamB.length > 0) this.teamB.set(snap.teamB);
        if (typeof snap.scoreA === 'number') this.scoreA.set(snap.scoreA);
        if (typeof snap.scoreB === 'number') this.scoreB.set(snap.scoreB);
        if (Array.isArray(snap.eventiGol)) this.eventiGol.set(snap.eventiGol);
        if (typeof snap.cronometro === 'number')
          this.cronometro.set(snap.cronometro);
        if (typeof snap.accumulatedTime === 'number')
          this.accumulatedTime.set(snap.accumulatedTime);
        if (typeof snap.timerStartAt !== 'undefined')
          this.timerStartAt.set(snap.timerStartAt);
        if (typeof snap.isTimerRunning === 'boolean')
          this.isTimerRunning.set(snap.isTimerRunning);
        if (snap.rotazionePortieri)
          this.rotazionePortieri.set(snap.rotazionePortieri);
        if (snap.step && snap.step !== 'convocati') this.step.set(snap.step);
        if (snap.status) this.status.set(snap.status);
        if (snap.commentoPartita)
          this.commentoPartita.set(snap.commentoPartita);

        console.log(
          '🔄 Snapshot locale ripristinato con successo per il match:',
          snap.matchId || 'nuova'
        );
        this.syncStatus.notifyLocalSave();
        return true;
      }
    } catch (e) {
      console.warn('Impossibile ripristinare snapshot locale:', e);
    }
    return false;
  }

  async salvaInDatabase(
    pagelleInseriteFlag: boolean,
    matchConclusoFlag: boolean = false
  ) {
    if (
      !this.matchId() &&
      !isStagioneCorrente({ dataPartita: this.dataPartita() })
    ) {
      throw new Error(
        `Non è possibile aggiungere partite della stagione non corrente. La nuova stagione è ${CURRENT_SEASON} (dal ${MIN_CURRENT_SEASON_DATE}).`
      );
    }

    const isConcluso = matchConclusoFlag || this.matchConcluso();
    this.pagelleInserite.set(pagelleInseriteFlag);
    this.matchConcluso.set(isConcluso);

    this.salvaSnapshotLocale();

    const payload: any = {
      dataPartita: this.dataPartita(),
      orario: this.orario(),
      luogo: this.luogo(),
      convocati: this.convocati(),
      teamA: this.teamA(),
      teamB: this.teamB(),
      scoreA: this.scoreA(),
      scoreB: this.scoreB(),
      eventiGol: this.eventiGol(),
      rotazionePortieri: this.rotazionePortieri() || null,
      matchConcluso: isConcluso,
      pagelleInserite: pagelleInseriteFlag,
      cronometro: this.cronometro(),
      accumulatedTime: this.accumulatedTime(),
      timerStartAt: this.timerStartAt(),
      isTimerRunning: this.isTimerRunning(),
      status: this.status(),
      fotoUrl: this.fotoUrl() || null,
      fotoPath: this.fotoPath() || null,
      stagione: getStagionePartita({ dataPartita: this.dataPartita() }),
      pronosticoAi: this.pronosticoAi() || null,
      cronacaAi: this.cronacaAi() || null,
      commentoPartita: this.commentoPartita()?.trim() || null,
    };

    try {
      this.syncStatus.notifySyncPending();

      if (this.matchId()) {
        await updateDoc(
          doc(this.firestore, `partite/${this.matchId()}`),
          payload
        );
      } else {
        const docRef = await addDoc(collection(this.firestore, 'partite'), {
          ...payload,
          dataOra: serverTimestamp(),
          classificaAggiornata: false,
        });
        this.matchId.set(docRef.id);
        this.salvaSnapshotLocale();
        this.avviaAscoltoReale();
      }

      this.syncStatus.notifySyncSuccess();

      if (isConcluso) {
        this.rimuoviSnapshotLocale();
      }
    } catch (err) {
      console.warn(
        'Salvataggio Firestore non riuscito online (i dati rimangono comunque salvi in locale):',
        err
      );
      this.syncStatus.notifySyncError();
    }
  }

  resetMatchState() {
    this.scoreA.set(0);
    this.scoreB.set(0);
    this.eventiGol.set([]);
    this.cronometro.set(0);
    this.accumulatedTime.set(0);
    this.timerStartAt.set(null);
    this.isTimerRunning.set(false);
    this.cambioAttivo.set(false);
    this.rimuoviSnapshotLocale();
  }
}
