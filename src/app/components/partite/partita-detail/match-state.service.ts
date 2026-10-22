import { Injectable, inject, signal, computed } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
  docData,
} from '@angular/fire/firestore';
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

export type ConvocatoState = Giocatore & { selezionato?: boolean };
export type MatchDetailState = Partita & { isAdmin?: boolean };

@Injectable()
export class MatchStateService {
  public firestore = inject(Firestore);

  matchId = signal<string | null>(null);
  matchDataOriginale: MatchDetailState | null = null;
  private matchSub?: Subscription;

  step = signal<'convocati' | 'dettagli' | 'squadre' | 'match' | 'prestazioni'>(
    'convocati',
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
      const piede = (g.piedePreferito as string || '').toLowerCase();
      const ruolo = (g.ruoloPreferito as string || '').toLowerCase();
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
    // Se la partita esiste già (modifica match esistente), non bloccare le modifiche
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
    () => this.rotazionePortieri()?.durataTurnoMinuti || 5,
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

  portieriInfoA = computed(() => {
    const rot = this.rotazionePortieri();
    const players = this.teamA();
    const modalita = rot?.modalitaA || 'rotazione';
    const isFisso = modalita === 'fisso';

    if (!players || players.length === 0) {
      return {
        isFisso: false,
        isDiRuolo: false,
        attuale: null as PlayerPerformance | null,
        prossimo: null as PlayerPerformance | null,
        turnoAttualeNumero: 1,
        turnoProssimoNumero: 1,
        lista: [] as Array<
          PlayerPerformance & {
            ordine: number;
            isAttuale: boolean;
            isProssimo: boolean;
            isDiRuolo?: boolean;
          }
        >,
      };
    }

    if (isFisso) {
      const fixedId =
        rot?.portiereFissoAId ||
        players.find(
          (p) => (p as any).ruoloPreferito === RuoloPreferito.Portiere,
        )?.id ||
        players[0]?.id;
      const fixedPlayer = players.find((p) => p.id === fixedId) || players[0] || null;
      const isDiRuolo =
        (fixedPlayer as any)?.ruoloPreferito === RuoloPreferito.Portiere;

      return {
        isFisso: true,
        isDiRuolo,
        attuale: fixedPlayer,
        prossimo: null as PlayerPerformance | null,
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
    const ids = rot?.teamA || players.map((p) => p.id);
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
      .filter(
        (
          item,
        ): item is PlayerPerformance & {
          ordine: number;
          isAttuale: boolean;
          isProssimo: boolean;
          isDiRuolo: boolean;
        } => item !== null,
      );

    return {
      isFisso: false,
      isDiRuolo: (attuale as any)?.ruoloPreferito === RuoloPreferito.Portiere,
      attuale,
      prossimo,
      turnoAttualeNumero: currIdx + 1,
      turnoProssimoNumero: nextIdx + 1,
      lista,
    };
  });

  portieriInfoB = computed(() => {
    const rot = this.rotazionePortieri();
    const players = this.teamB();
    const modalita = rot?.modalitaB || 'rotazione';
    const isFisso = modalita === 'fisso';

    if (!players || players.length === 0) {
      return {
        isFisso: false,
        isDiRuolo: false,
        attuale: null as PlayerPerformance | null,
        prossimo: null as PlayerPerformance | null,
        turnoAttualeNumero: 1,
        turnoProssimoNumero: 1,
        lista: [] as Array<
          PlayerPerformance & {
            ordine: number;
            isAttuale: boolean;
            isProssimo: boolean;
            isDiRuolo?: boolean;
          }
        >,
      };
    }

    if (isFisso) {
      const fixedId =
        rot?.portiereFissoBId ||
        players.find(
          (p) => (p as any).ruoloPreferito === RuoloPreferito.Portiere,
        )?.id ||
        players[0]?.id;
      const fixedPlayer = players.find((p) => p.id === fixedId) || players[0] || null;
      const isDiRuolo =
        (fixedPlayer as any)?.ruoloPreferito === RuoloPreferito.Portiere;

      return {
        isFisso: true,
        isDiRuolo,
        attuale: fixedPlayer,
        prossimo: null as PlayerPerformance | null,
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
    const ids = rot?.teamB || players.map((p) => p.id);
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
      .filter(
        (
          item,
        ): item is PlayerPerformance & {
          ordine: number;
          isAttuale: boolean;
          isProssimo: boolean;
          isDiRuolo: boolean;
        } => item !== null,
      );

    return {
      isFisso: false,
      isDiRuolo: (attuale as any)?.ruoloPreferito === RuoloPreferito.Portiere,
      attuale,
      prossimo,
      turnoAttualeNumero: currIdx + 1,
      turnoProssimoNumero: nextIdx + 1,
      lista,
    };
  });

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

    const shuffle = (array: string[]) => {
      const arr = [...array];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };

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
      teamA: modalitaA === 'rotazione' ? shuffle(teamAIds) : teamAIds,
      teamB: modalitaB === 'rotazione' ? shuffle(teamBIds) : teamBIds,
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

    const shuffle = (array: string[]) => {
      const arr = [...array];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };

    if (team === 'A') {
      this.rotazionePortieri.set({
        ...current,
        teamA: shuffle(this.teamA().map((p) => p.id)),
      });
    } else {
      this.rotazionePortieri.set({
        ...current,
        teamB: shuffle(this.teamB().map((p) => p.id)),
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
    )
      return;
    const temp = list[index1];
    list[index1] = list[index2];
    list[index2] = temp;
    if (team === 'A') {
      this.rotazionePortieri.set({ ...current, teamA: list });
    } else {
      this.rotazionePortieri.set({ ...current, teamB: list });
    }
  }

  avviaAscoltoReale() {
    if (!this.matchId() || this.matchSub) return;

    const docRef = doc(this.firestore, `partite/${this.matchId()}`);

    this.matchSub = docData(docRef).subscribe((data: any) => {
      if (data) {
        this.scoreA.set(data.scoreA || 0);
        this.scoreB.set(data.scoreB || 0);
        this.eventiGol.set(data.eventiGol || []);

        this.isTimerRunning.set(data.isTimerRunning || false);
        this.accumulatedTime.set(data.accumulatedTime || 0);
        this.timerStartAt.set(data.timerStartAt || null);
        this.status.set(data.status || 'da_definire');
        this.cambioAttivo.set(data.cambioAttivo || false);
        this.rotazionePortieri.set(data.rotazionePortieri || null);
        this.fotoUrl.set(data.fotoUrl || null);
        this.fotoPath.set(data.fotoPath || null);
        this.pronosticoAi.set(data.pronosticoAi || null);
        this.cronacaAi.set(data.cronacaAi || null);
        this.commentoPartita.set(data.commentoPartita || data.commento || '');
      }
    });
  }

  fermaAscolto() {
    if (this.matchSub) this.matchSub.unsubscribe();
  }

  async salvaInDatabase(
    pagelleInseriteFlag: boolean,
    matchConclusoFlag: boolean = false,
  ) {
    if (
      !this.matchId() &&
      !isStagioneCorrente({ dataPartita: this.dataPartita() })
    ) {
      throw new Error(
        `Non è possibile aggiungere partite della stagione non corrente. La nuova stagione è ${CURRENT_SEASON} (dal ${MIN_CURRENT_SEASON_DATE}).`,
      );
    }

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
      matchConcluso: matchConclusoFlag || this.matchConcluso(),
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

    this.pagelleInserite.set(pagelleInseriteFlag);
    this.matchConcluso.set(matchConclusoFlag || this.matchConcluso());

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

      this.avviaAscoltoReale();
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
  }
}
