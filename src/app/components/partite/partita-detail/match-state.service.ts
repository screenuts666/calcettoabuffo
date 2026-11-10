import { environment } from 'src/environments/environment';
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
  Timestamp,
} from 'firebase/firestore';
import { Subscription } from 'rxjs';
import { TMatchStatus } from '../../../models/match-status.type';
import {
  EventoGol,
  Partita,
  RotazionePortieri,
  ModalitaPortiere,
  MatchRsvpEntry,
  normalizeRsvpStatus,
  getMatchFormatByPlayerCount,
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
import { CampiService } from '../../../services/campi.service';
import { AuthService } from '../../../services/auth.service';

export type ConvocatoState = Giocatore & {
  selezionato?: boolean;
  selfRegistered?: boolean;
  source?: 'self' | 'mister';
  rsvpStatus?: 'yes' | 'maybe' | 'no' | null;
};

/**
 * Rimuove ricorsivamente i campi con valore `undefined` prima di inviare documenti o array a Firestore,
 * prevenendo l'eccezione FirebaseError: Unsupported field value: undefined.
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === undefined) return null as any;
  if (data === null || typeof data !== 'object') return data;
  if (
    data instanceof Date ||
    (data as any)?.toMillis ||
    (data as any)?._seconds
  )
    return data;
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeForFirestore(item)) as any;
  }
  const result: any = {};
  for (const [key, val] of Object.entries(data as any)) {
    if (val !== undefined) {
      result[key] = sanitizeForFirestore(val);
    }
  }
  return result;
}
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
  public campiService = inject(CampiService, { optional: true });
  public auth = inject(AuthService);
  private injector = inject(EnvironmentInjector);

  readonly canManageMatch = computed<boolean>(() => this.auth.isSuperUser());
  readonly isAdminOrMister = computed<boolean>(() => this.auth.isSuperUser());

  matchId = signal<string | null>(null);
  matchDataOriginale: MatchDetailState | null = null;
  private matchSub?: Subscription;
  public onMatchCreated?: (id: string) => void;
  private autoSaveTimer?: any;

  step = signal<'dettagli' | 'convocati' | 'squadre' | 'match' | 'prestazioni'>(
    'dettagli',
  );
  status = signal<TMatchStatus>('da_definire');
  filtro = signal<string>('');
  luogo = signal<string>('');
  campoGoogleMapsUrl = signal<string | null>(null);
  formato = signal<string | null>(null);
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
  notePortieri = signal<string | null>(null);
  parateIncredibili = signal<Record<string, number>>({});
  rsvp = signal<Record<string, MatchRsvpEntry>>({});

  cronometro = signal<number>(0);
  accumulatedTime = signal<number>(0);
  timerStartAt = signal<number | null>(null);
  startedAt = signal<number | null>(null);
  endedAt = signal<number | null>(null);
  orarioInizioReale = signal<string | null>(null);
  orarioFineReale = signal<string | null>(null);
  isTimerRunning = signal<boolean>(false);
  rotazionePortieri = signal<RotazionePortieri | null>(null);

  convocati = computed(() =>
    this.tutti().filter((g) => g?.selezionato === true),
  );
  totaleConvocati = computed(() => this.convocati().length);
  giocatoriFiltrati = computed(() => {
    const f = this.filtro().toLowerCase().trim();
    if (!f) return this.tutti();
    return this.tutti().filter((g) => {
      const nome = (g.nome || '').toLowerCase();
      const soprannome = (g.soprannome || '').toLowerCase();
      const anno = (g.annoNascita || '').toString();
      const piede = ((g.piedePreferito as string) || '').toLowerCase();
      const ruolo = ((g.ruoloPreferito as string) || '').toLowerCase();
      return (
        nome.includes(f) ||
        soprannome.includes(f) ||
        anno.includes(f) ||
        piede.includes(f) ||
        ruolo.includes(f)
      );
    });
  });
  tuttiInCampo = computed(() => [...this.teamA(), ...this.teamB()]);

  isDataStagioneValida = computed(() => {
    if (
      this.matchDataOriginale?.id &&
      this.matchDataOriginale.stagione &&
      this.matchDataOriginale.stagione !== CURRENT_SEASON
    ) {
      return true;
    }
    const d = this.dataPartita();
    if (!d) return false;
    return isStagioneCorrente({ dataPartita: d });
  });

  isDettagliValidi = computed(
    () =>
      this.luogo().trim() !== '' &&
      this.dataPartita() !== '' &&
      this.orario() !== '' &&
      this.isDataStagioneValida(),
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
      5,
  );

  durataTurnoSecondi = computed(() => {
    return this.durataTurnoMinuti() * 60;
  });

  durataTurnoLabel = computed(() => {
    return `Ogni ${this.durataTurnoMinuti()} min`;
  });

  turnoAttualeIndex = computed(() => {
    return Math.floor(this.cronometro() / this.durataTurnoSecondi());
  });

  minutiRimanentiAlCambio = computed(() => {
    const sec = this.cronometro();
    const durataSec = this.durataTurnoSecondi();
    const passati = sec % durataSec;
    const rim = durataSec - passati;
    const m = Math.floor(rim / 60)
      .toString()
      .padStart(2, '0');
    const s = (rim % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  });

  modalitaPortieriA = computed<ModalitaPortiere>(
    () => this.rotazionePortieri()?.modalitaA || 'rotazione',
  );
  modalitaPortieriB = computed<ModalitaPortiere>(
    () => this.rotazionePortieri()?.modalitaB || 'rotazione',
  );
  portiereFissoAId = computed<string | null>(
    () => this.rotazionePortieri()?.portiereFissoAId || null,
  );
  portiereFissoBId = computed<string | null>(
    () => this.rotazionePortieri()?.portiereFissoBId || null,
  );

  portieriInfoA = computed<PortiereTeamInfo>(() =>
    this.buildPortieriTeamInfo('A'),
  );

  portieriInfoB = computed<PortiereTeamInfo>(() =>
    this.buildPortieriTeamInfo('B'),
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
          (p) => (p as any).ruoloPreferito === RuoloPreferito.Portiere,
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
      durataTurnoMinuti:
        this.rotazionePortieri()?.durataTurnoMinuti ||
        this.soundSettings?.config().gkTurnMinutes ||
        5,
      modalitaA: 'rotazione',
      modalitaB: 'rotazione',
    };

    if (team === 'A') {
      let fissoId = current.portiereFissoAId;
      if (modalita === 'fisso' && !fissoId) {
        const pureGk = this.teamA().find(
          (p) => (p as any).ruoloPreferito === RuoloPreferito.Portiere,
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
          (p) => (p as any).ruoloPreferito === RuoloPreferito.Portiere,
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
      durataTurnoMinuti: this.durataTurnoMinuti(),
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
        (p) => (p as any).ruoloPreferito === RuoloPreferito.Portiere,
      )?.id ||
      teamAIds[0] ||
      null;

    const defaultFissoB =
      current?.portiereFissoBId ||
      this.teamB().find(
        (p) => (p as any).ruoloPreferito === RuoloPreferito.Portiere,
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
      durataTurnoMinuti: this.durataTurnoMinuti(),
    };
    this.rotazionePortieri.set(nuovaRotazione);
  }

  rimescolaSquadra(team: 'A' | 'B') {
    const current = this.rotazionePortieri() || {
      teamA: this.teamA().map((p) => p.id),
      teamB: this.teamB().map((p) => p.id),
      durataTurnoMinuti: this.durataTurnoMinuti(),
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
    if (!id || !this.auth.isSuperUser()) return;
    try {
      await updateDoc(doc(this.firestore, `partite/${id}`), {
        cambioAttivo: attivo,
      });
    } catch (err) {
      console.warn('Errore aggiornamento stato cambio portiere:', err);
    }
  }

  /**
   * Avvia il timer della partita (Fischio d'Inizio).
   * Una volta avviato, il match scorre ininterrotto fino al fischio finale definitivo:
   * non è possibile mettere in pausa per evitare corruzioni del conteggio.
   */
  async avviaTimer(): Promise<void> {
    const id = this.matchId();
    if (!id) return;
    if (this.isTimerRunning()) return;

    const startAt = this.startedAt() || this.timerStartAt() || Date.now();
    this.startedAt.set(startAt);
    this.timerStartAt.set(startAt);
    this.isTimerRunning.set(true);

    const orarioInizioStr = new Intl.DateTimeFormat('it-IT', {
      timeZone: 'Europe/Rome',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(startAt));
    this.orarioInizioReale.set(orarioInizioStr);

    const payload: Record<string, unknown> = {
      isTimerRunning: true,
      startedAt: startAt,
      timerStartAt: startAt,
      inizioPartita: Timestamp.fromMillis(startAt),
      orarioInizioReale: orarioInizioStr,
    };

    // Se il match è all'inizio (inferiore al primo turno), azzera categoricamente il cambio
    if (this.cronometro() < this.durataTurnoSecondi()) {
      this.cambioAttivo.set(false);
      payload['cambioAttivo'] = false;
    }
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
      console.warn('Errore sync avvio timer online (salvato in locale):', err);
      this.syncStatus.notifySyncError();
    }
  }

  /**
   * Chiusura definitiva del cronometro al Fischio Finale.
   * Calcola la durata effettiva reale come (endedAt - startedAt) e persiste il risultato.
   */
  async concludiTimer(): Promise<number> {
    const id = this.matchId();
    const now = Date.now();
    this.endedAt.set(now);
    this.isTimerRunning.set(false);

    const start =
      this.startedAt() || this.timerStartAt() || now - this.cronometro() * 1000;
    const durataSec = Math.max(0, Math.floor((now - start) / 1000));
    const durataFinale =
      this.accumulatedTime() > 0 && !this.startedAt()
        ? this.accumulatedTime() +
          Math.max(0, Math.floor((now - (this.timerStartAt() || now)) / 1000))
        : durataSec;

    this.cronometro.set(durataFinale);
    this.accumulatedTime.set(durataFinale);
    this.timerStartAt.set(null);

    const orarioInizioStr = new Intl.DateTimeFormat('it-IT', {
      timeZone: 'Europe/Rome',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(start));

    const orarioFineStr = new Intl.DateTimeFormat('it-IT', {
      timeZone: 'Europe/Rome',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(now));

    this.orarioInizioReale.set(orarioInizioStr);
    this.orarioFineReale.set(orarioFineStr);

    this.salvaSnapshotLocale();

    if (id) {
      try {
        this.syncStatus.notifySyncPending();
        await updateDoc(doc(this.firestore, `partite/${id}`), {
          isTimerRunning: false,
          timerStartAt: null,
          startedAt: start,
          endedAt: now,
          inizioPartita: Timestamp.fromMillis(start),
          finePartita: Timestamp.fromMillis(now),
          orarioInizioReale: orarioInizioStr,
          orarioFineReale: orarioFineStr,
          cronometro: durataFinale,
          accumulatedTime: durataFinale,
        });
        this.syncStatus.notifySyncSuccess();
      } catch (err) {
        console.warn('Errore sync chiusura definitiva timer online:', err);
        this.syncStatus.notifySyncError();
      }
    }

    return durataFinale;
  }

  async toggleTimerState(): Promise<void> {
    if (!this.isTimerRunning()) {
      await this.avviaTimer();
    }
  }

  async aggiungiGolPartita(
    giocatore: PlayerPerformance,
    teamVantaggio: 'A' | 'B',
    isAutogoal: boolean,
    assistMan: PlayerPerformance | null = null,
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

    const updateScorer = <
      T extends { id: string; gol?: number; autogol?: number },
    >(
      lista: T[],
    ): T[] =>
      lista.map((g) =>
        g.id === giocatore.id
          ? {
              ...g,
              gol: (g.gol || 0) + (isAutogoal ? 0 : 1),
              autogol: (g.autogol || 0) + (isAutogoal ? 1 : 0),
            }
          : g,
      );

    this.tutti.update((l) => updateScorer(l as any) as ConvocatoState[]);
    this.teamA.update(updateScorer);
    this.teamB.update(updateScorer);

    if (assistMan && !isAutogoal) {
      const updateAssist = <T extends { id: string; assist?: number }>(
        lista: T[],
      ): T[] =>
        lista.map((g) =>
          g.id === assistMan.id
            ? {
                ...g,
                assist: (g.assist || 0) + 1,
              }
            : g,
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

  async annullaUltimoGolGenerale(): Promise<EventoGol | null> {
    const list = this.eventiGol();
    if (list.length === 0) return null;
    const ultimo = list[list.length - 1];
    return this.annullaUltimoGolSquadra(ultimo.teamVantaggio);
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
          lista: T[],
        ): T[] =>
          lista.map((g) =>
            g.id === rimosso.idAssegnato
              ? {
                  ...g,
                  gol: Math.max(0, (g.gol || 0) - (rimosso.isAutogoal ? 0 : 1)),
                  autogol: Math.max(
                    0,
                    (g.autogol || 0) - (rimosso.isAutogoal ? 1 : 0),
                  ),
                }
              : g,
          );

        this.tutti.update((l) => removeGol(l as any) as ConvocatoState[]);
        this.teamA.update(removeGol);
        this.teamB.update(removeGol);

        if (rimosso.assistId) {
          const removeAssist = <T extends { id: string; assist?: number }>(
            lista: T[],
          ): T[] =>
            lista.map((g) =>
              g.id === rimosso.assistId
                ? {
                    ...g,
                    assist: Math.max(0, (g.assist || 0) - 1),
                  }
                : g,
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
          const startMs =
            data.startedAt ??
            (data.inizioPartita?.toMillis
              ? data.inizioPartita.toMillis()
              : data.inizioPartita?.seconds
                ? data.inizioPartita.seconds * 1000
                : null) ??
            data.timerStartAt ??
            null;
          const endMs =
            data.endedAt ??
            (data.finePartita?.toMillis
              ? data.finePartita.toMillis()
              : data.finePartita?.seconds
                ? data.finePartita.seconds * 1000
                : null) ??
            data.finishedAt ??
            null;

          this.startedAt.set(startMs);
          this.endedAt.set(endMs);
          if (data.orarioInizioReale) {
            this.orarioInizioReale.set(data.orarioInizioReale);
          } else if (startMs) {
            this.orarioInizioReale.set(
              new Intl.DateTimeFormat('it-IT', {
                timeZone: 'Europe/Rome',
                hour: '2-digit',
                minute: '2-digit',
              }).format(new Date(startMs)),
            );
          }
          if (data.orarioFineReale) {
            this.orarioFineReale.set(data.orarioFineReale);
          } else if (endMs) {
            this.orarioFineReale.set(
              new Intl.DateTimeFormat('it-IT', {
                timeZone: 'Europe/Rome',
                hour: '2-digit',
                minute: '2-digit',
              }).format(new Date(endMs)),
            );
          }
          this.status.set(data.status || 'da_definire');
          // Allarme cambio consentito solo se il timer è attivo e la partita ha superato la durata del primo turno
          const turnSec = this.durataTurnoSecondi();
          const isPastFirstTurn =
            (data.cronometro || this.cronometro() || 0) >= turnSec;
          this.cambioAttivo.set(
            data.isTimerRunning && isPastFirstTurn
              ? data.cambioAttivo || false
              : false,
          );
          this.rotazionePortieri.set(data.rotazionePortieri || null);
          this.fotoUrl.set(data.fotoUrl || null);
          this.fotoPath.set(data.fotoPath || null);
          this.pronosticoAi.set(data.pronosticoAi || null);
          this.cronacaAi.set(data.cronacaAi || null);
          this.commentoPartita.set(data.commentoPartita || data.commento || '');
          if (data.campoGoogleMapsUrl) {
            this.campoGoogleMapsUrl.set(data.campoGoogleMapsUrl);
          }
          if (data.formato) {
            this.formato.set(data.formato);
          }
          if (data.rsvp) {
            this.rsvp.set(data.rsvp);
          }

          if (Array.isArray(data.convocati) || data.rsvp) {
            this.reconcileConvocatiWithRsvp(
              data.convocati || [],
              data.rsvp || this.rsvp() || {},
            );
          }

          if (!this.auth.isSuperUser()) {
            const isConvocatiPhase =
              !data.matchConcluso &&
              data.status !== 'in_corso' &&
              (data.step === 'convocati' ||
                data.step === 'dettagli' ||
                (!data.step &&
                  (!data.teamA || data.teamA.length === 0) &&
                  (!data.teamB || data.teamB.length === 0)));
            if (data.matchConcluso) {
              this.step.set('prestazioni');
            } else if (isConvocatiPhase) {
              this.step.set('convocati');
            } else {
              this.step.set('match');
            }
          }
        }
      },
      error: (err) => console.warn('Errore ascolto partita:', err),
    });
  }

  /**
   * Riallinea la lista `tutti` combinando i giocatori convocati salvati e le risposte RSVP (`yes`/`maybe`/`no`).
   */
  reconcileConvocatiWithRsvp(
    savedConvocati: any[],
    rsvpMap: Record<string, MatchRsvpEntry>,
  ) {
    const entries = Object.values(rsvpMap || {}).filter(Boolean);
    const savedMap = new Map<string, any>();
    for (const c of savedConvocati || []) {
      if (!c) continue;
      if (typeof c === 'string') {
        savedMap.set(c, { id: c, selezionato: true });
      } else if (c.id) {
        savedMap.set(c.id, c);
      } else if (c.playerId) {
        savedMap.set(c.playerId, c);
      }
      if (typeof c === 'object' && c.nome) {
        savedMap.set(c.nome.toLowerCase().trim(), c);
      }
    }

    this.tutti.update((list) =>
      list.map((g) => {
        const rsvpEntry = entries.find(
          (e) =>
            e.playerId === g.id || (!!g.linkedUid && e.uid === g.linkedUid),
        );
        const normStatus = normalizeRsvpStatus(rsvpEntry?.status);
        const saved =
          savedMap.get(g.id) || savedMap.get(g.nome?.toLowerCase().trim());

        const isDeclined = normStatus === 'no';
        const isSelected =
          !isDeclined && (Boolean(saved) || normStatus === 'yes');
        const isSelf = Boolean(
          (normStatus === 'yes' &&
            (rsvpEntry?.selfRegistered ||
              rsvpEntry?.source === 'self' ||
              !!rsvpEntry?.respondedVia)) ||
          saved?.selfRegistered ||
          saved?.source === 'self',
        );

        return {
          ...g,
          selezionato: isSelected,
          selfRegistered: isSelf,
          source: isSelf ? 'self' : isSelected ? 'mister' : undefined,
          rsvpStatus: isSelected ? 'yes' : normStatus,
        };
      }),
    );
  }

  /**
   * Se il Mister avvia la condivisione del link invito su una partita appena aperta (`matchId === null`),
   * salva subito il documento su Firestore nello step `'convocati'` così da ottenere un `matchId` valido.
   */
  async ensureMatchCreatedForInvite(): Promise<string | null> {
    if (this.matchId()) return this.matchId();
    if (!this.auth.isSuperUser()) return null;
    await this.salvaInDatabase(false, false);
    return this.matchId();
  }

  /**
   * Registra o modifica la risposta Auto-RSVP del giocatore loggato (`yes` | `maybe` | `no`)
   * aggiornando immediatamente `rsvp.<uid>` e `convocati` su Firestore.
   * Consentito SOLO quando la partita è nello step `'convocati'`.
   */
  async submitSelfRsvp(status: 'yes' | 'maybe' | 'no'): Promise<void> {
    if (!['yes', 'maybe', 'no'].includes(status)) {
      throw new Error('Parametro stato RSVP non valido.');
    }
    const mId = this.matchId()
      ? this.matchId()!
          .replace(/[^a-zA-Z0-9_-]/g, '')
          .trim()
      : null;
    const user = this.auth.firebaseUser();
    const playerId = this.auth.linkedPlayerId();

    if (
      !mId ||
      !user ||
      !playerId ||
      (this.step() !== 'convocati' && this.step() !== 'dettagli') ||
      this.matchConcluso()
    ) {
      throw new Error(
        'Le convocazioni per questa partita sono chiuse o non hai un giocatore associato.',
      );
    }

    const playerObj = this.tutti().find((g) => g.id === playerId);
    const playerName =
      playerObj?.nome || this.auth.displayName() || 'Giocatore';

    const entry: MatchRsvpEntry = {
      uid: user.uid,
      playerId,
      playerName,
      status,
      selfRegistered: true,
      source: 'self',
      updatedAt: new Date().toISOString(),
      respondedVia: 'whatsapp_link',
    };

    const nextRsvpMap = {
      ...(this.rsvp() || {}),
      [user.uid]: entry,
    };
    this.rsvp.set(nextRsvpMap);

    this.tutti.update((list) =>
      list.map((g) =>
        g.id === playerId
          ? {
              ...g,
              selezionato: status === 'yes',
              selfRegistered: status === 'yes',
              source: 'self',
              rsvpStatus: status,
            }
          : g,
      ),
    );

    const updatedConvocati = this.convocati();

    await updateDoc(doc(this.firestore, `partite/${mId}`), {
      [`rsvp.${user.uid}`]: entry,
      convocati: updatedConvocati,
    });
  }

  fermaAscolto() {
    if (this.matchSub) this.matchSub.unsubscribe();
  }

  salvaSetupPredefinito() {
    try {
      if (typeof localStorage === 'undefined') return;
      const setup = {
        luogo: this.luogo(),
        orario: this.orario(),
        modalitaA: this.modalitaPortieriA(),
        modalitaB: this.modalitaPortieriB(),
        durataTurnoMinuti: this.durataTurnoMinuti(),
      };
      localStorage.setItem('calcetto_last_match_setup', JSON.stringify(setup));
    } catch {}
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
        startedAt: this.startedAt(),
        endedAt: this.endedAt(),
        orarioInizioReale: this.orarioInizioReale(),
        orarioFineReale: this.orarioFineReale(),
        isTimerRunning: this.isTimerRunning(),
        rotazionePortieri: this.rotazionePortieri(),
        matchConcluso: this.matchConcluso(),
        pagelleInserite: this.pagelleInserite(),
        commentoPartita: this.commentoPartita(),
        notePortieri: this.notePortieri(),
        parateIncredibili: this.parateIncredibili(),
        campoGoogleMapsUrl: this.campoGoogleMapsUrl(),
        formato: this.formato(),
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
        if (snap.luogo) this.luogo.set(snap.luogo);
        if (snap.campoGoogleMapsUrl)
          this.campoGoogleMapsUrl.set(snap.campoGoogleMapsUrl);
        if (snap.formato) this.formato.set(snap.formato);
        if (snap.orario) this.orario.set(snap.orario);
        if (snap.dataPartita) this.dataPartita.set(snap.dataPartita);
        if (Array.isArray(snap.tutti) && snap.tutti.length > 0)
          this.tutti.set(snap.tutti);
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
        if (typeof snap.startedAt !== 'undefined')
          this.startedAt.set(snap.startedAt);
        if (typeof snap.endedAt !== 'undefined') this.endedAt.set(snap.endedAt);
        if (typeof snap.orarioInizioReale === 'string')
          this.orarioInizioReale.set(snap.orarioInizioReale);
        if (typeof snap.orarioFineReale === 'string')
          this.orarioFineReale.set(snap.orarioFineReale);
        if (typeof snap.isTimerRunning === 'boolean')
          this.isTimerRunning.set(snap.isTimerRunning);
        if (snap.rotazionePortieri)
          this.rotazionePortieri.set(snap.rotazionePortieri);
        if (snap.step) this.step.set(snap.step);
        if (snap.status) this.status.set(snap.status);
        if (snap.commentoPartita)
          this.commentoPartita.set(snap.commentoPartita);

        console.log(
          '🔄 Snapshot locale ripristinato con successo per il match:',
          snap.matchId || 'nuova',
        );
        this.syncStatus.notifyLocalSave();
        return true;
      }
    } catch (e) {
      console.warn('Impossibile ripristinare snapshot locale:', e);
    }
    return false;
  }

  /**
   * Sincronizza i giocatori convocati con le rose di Team A e Team B quando si accede allo step 'squadre',
   * preservando eventuali formazioni già impostate e integrando i nuovi convocati.
   */
  sincronizzaConvocatiInSquadre(): void {
    const scelti = this.convocati();
    const idsScelti = scelti.map((g) => g.id);

    this.teamA.update((t) => t.filter((g) => idsScelti.includes(g.id)));
    this.teamB.update((t) => t.filter((g) => idsScelti.includes(g.id)));

    const idsAssegnati = [...this.teamA(), ...this.teamB()].map((g) => g.id);
    const nuoviArrivati = scelti.filter((g) => !idsAssegnati.includes(g.id));

    if (nuoviArrivati.length > 0) {
      this.teamA.update((t) => [...t, ...nuoviArrivati]);
    }
  }

  cambiaStep(
    nuovoStep: 'dettagli' | 'convocati' | 'squadre' | 'match' | 'prestazioni',
  ) {
    if (nuovoStep === 'squadre') {
      this.sincronizzaConvocatiInSquadre();
    }
    this.step.set(nuovoStep);
    this.triggerAutoSave(true);
  }

  triggerAutoSave(immediate: boolean = false): void {
    if (!this.auth.isSuperUser()) return;
    this.salvaSnapshotLocale();

    // Se la partita non ha ancora un ID Firestore e non ci sono modifiche significative, non creare record vuoti
    if (
      !this.matchId() &&
      this.totaleConvocati() === 0 &&
      !this.luogo().trim()
    ) {
      return;
    }

    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = undefined;
    }

    if (immediate) {
      this.salvaInDatabase(this.pagelleInserite(), this.matchConcluso()).catch(
        (err) => console.warn('Errore auto-salvataggio immediato:', err),
      );
    } else {
      this.autoSaveTimer = setTimeout(() => {
        this.salvaInDatabase(
          this.pagelleInserite(),
          this.matchConcluso(),
        ).catch((err) =>
          console.warn('Errore auto-salvataggio debounced:', err),
        );
      }, 700);
    }
  }

  flushAutoSave(): Promise<void> {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = undefined;
      return this.salvaInDatabase(
        this.pagelleInserite(),
        this.matchConcluso(),
      ).catch((err) => console.warn('Errore flush auto-salvataggio:', err));
    }
    return Promise.resolve();
  }

  async salvaInDatabase(
    pagelleInseriteFlag: boolean,
    matchConclusoFlag: boolean = false,
  ) {
    if (!this.auth.isSuperUser()) return;
    if (
      !this.matchId() &&
      this.dataPartita() &&
      !isStagioneCorrente({ dataPartita: this.dataPartita() })
    ) {
      throw new Error(
        `Non è possibile aggiungere partite della stagione non corrente. La nuova stagione è ${CURRENT_SEASON} (dal ${MIN_CURRENT_SEASON_DATE}).`,
      );
    }

    const isConcluso = matchConclusoFlag || this.matchConcluso();
    this.pagelleInserite.set(pagelleInseriteFlag);
    this.matchConcluso.set(isConcluso);

    this.salvaSnapshotLocale();

    const startMs = this.startedAt();
    const endMs = this.endedAt();
    const orarioInizioStr = startMs
      ? new Intl.DateTimeFormat('it-IT', {
          timeZone: 'Europe/Rome',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(startMs))
      : null;
    const orarioFineStr = endMs
      ? new Intl.DateTimeFormat('it-IT', {
          timeZone: 'Europe/Rome',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(endMs))
      : null;

    const orarioStr = this.orario() || '21:00';
    let dataOraTimestamp: any = null;
    if (this.dataPartita()) {
      try {
        const dt = new Date(`${this.dataPartita()}T${orarioStr}:00`);
        if (!isNaN(dt.getTime())) {
          dataOraTimestamp = Timestamp.fromDate(dt);
        }
      } catch {
        // ignore
      }
    }

    const cleanConvocati = this.convocati().map((g) => ({
      id: g.id,
      nome: g.nome || 'Giocatore',
      soprannome: g.soprannome || null,
      fotoUrl: g.fotoUrl || null,
      ruoloPreferito: (g.ruoloPreferito as string) || null,
      piedePreferito: (g.piedePreferito as string) || null,
      annoNascita: g.annoNascita || null,
      selezionato: true,
      selfRegistered: Boolean(g.selfRegistered),
      source: g.source || (g.selfRegistered ? 'self' : 'mister'),
      rsvpStatus: g.rsvpStatus || 'yes',
    }));

    const cleanTeamA = (this.teamA() || []).map((p) => ({
      ...p,
      voto: typeof p.voto === 'number' ? p.voto : null,
      note: p.note || null,
      gol: typeof p.gol === 'number' ? p.gol : 0,
      autogol: typeof p.autogol === 'number' ? p.autogol : 0,
      assist: typeof p.assist === 'number' ? p.assist : 0,
    }));

    const cleanTeamB = (this.teamB() || []).map((p) => ({
      ...p,
      voto: typeof p.voto === 'number' ? p.voto : null,
      note: p.note || null,
      gol: typeof p.gol === 'number' ? p.gol : 0,
      autogol: typeof p.autogol === 'number' ? p.autogol : 0,
      assist: typeof p.assist === 'number' ? p.assist : 0,
    }));

    const rawPayload: any = {
      step: this.step(),
      dataPartita: this.dataPartita(),
      orario: orarioStr,
      dataOra: dataOraTimestamp || serverTimestamp(),
      luogo: this.luogo(),
      campoGoogleMapsUrl:
        (this.luogo()
          ? this.campiService?.getGoogleMapsUrl(this.luogo())
          : null) ||
        this.campoGoogleMapsUrl() ||
        (this.luogo()
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
              this.luogo(),
            )}`
          : null),
      formato: getMatchFormatByPlayerCount(this.convocati().length).label,
      convocati: cleanConvocati,
      teamA: cleanTeamA,
      teamB: cleanTeamB,
      scoreA: this.scoreA(),
      scoreB: this.scoreB(),
      eventiGol: this.eventiGol(),
      rotazionePortieri: this.rotazionePortieri() || null,
      matchConcluso: isConcluso,
      pagelleInserite: pagelleInseriteFlag,
      cronometro: this.cronometro(),
      accumulatedTime: this.accumulatedTime(),
      timerStartAt: this.timerStartAt(),
      startedAt: startMs,
      endedAt: endMs,
      inizioPartita: startMs ? Timestamp.fromMillis(startMs) : null,
      finePartita: endMs ? Timestamp.fromMillis(endMs) : null,
      orarioInizioReale: orarioInizioStr,
      orarioFineReale: orarioFineStr,
      isTimerRunning: this.isTimerRunning(),
      status: this.status(),
      fotoUrl: this.fotoUrl() || null,
      fotoPath: this.fotoPath() || null,
      stagione: getStagionePartita({ dataPartita: this.dataPartita() }),
      pronosticoAi: this.pronosticoAi() || null,
      cronacaAi: this.cronacaAi() || null,
      commentoPartita: this.commentoPartita()?.trim() || null,
      notePortieri: this.notePortieri()?.trim() || null,
      parateIncredibili: this.parateIncredibili() || {},
      rsvp: this.rsvp() || {},
    };

    const payload = sanitizeForFirestore(rawPayload);

    try {
      this.syncStatus.notifySyncPending();

      if (this.matchId()) {
        await updateDoc(
          doc(this.firestore, `partite/${this.matchId()}`),
          payload,
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
        this.onMatchCreated?.(docRef.id);
      }

      this.syncStatus.notifySyncSuccess();

      if (isConcluso) {
        this.rimuoviSnapshotLocale();
      }
    } catch (err) {
      console.warn(
        'Salvataggio Firestore non riuscito online (i dati rimangono comunque salvi in locale):',
        err,
      );
      this.syncStatus.notifySyncError();
    }
  }

  aggiornaParataIncredibile(playerId: string, delta: number) {
    this.parateIncredibili.update((map) => {
      const next = { ...(map || {}) };
      const cur = next[playerId] || 0;
      const val = Math.max(0, cur + delta);
      if (val === 0) {
        delete next[playerId];
      } else {
        next[playerId] = val;
      }
      return next;
    });
    this.salvaSnapshotLocale();
    this.salvaInDatabase(this.pagelleInserite(), this.matchConcluso()).catch(
      (err) => console.warn(err),
    );
  }

  salvaNotePortieri(note: string) {
    this.notePortieri.set(note.trim() || null);
    this.salvaSnapshotLocale();
    this.salvaInDatabase(this.pagelleInserite(), this.matchConcluso()).catch(
      (err) => console.warn(err),
    );
  }

  resetMatchState() {
    this.scoreA.set(0);
    this.scoreB.set(0);
    this.eventiGol.set([]);
    this.cronometro.set(0);
    this.accumulatedTime.set(0);
    this.timerStartAt.set(null);
    this.startedAt.set(null);
    this.endedAt.set(null);
    this.orarioInizioReale.set(null);
    this.orarioFineReale.set(null);
    this.isTimerRunning.set(false);
    this.cambioAttivo.set(false);
    this.rimuoviSnapshotLocale();
  }
}
