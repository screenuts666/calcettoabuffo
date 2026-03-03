import { Injectable, inject, signal, computed } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
} from '@angular/fire/firestore';

@Injectable()
export class MatchStateService {
  private firestore = inject(Firestore);

  matchId = signal<string | null>(null);
  matchDataOriginale: any = null;

  step = signal<'convocati' | 'dettagli' | 'squadre' | 'match' | 'prestazioni'>(
    'convocati',
  );
  filtro = signal<string>('');

  luogo = signal<string>('');
  dataPartita = signal<string>('');
  orario = signal<string>('');

  tutti = signal<any[]>([]);
  teamA = signal<any[]>([]);
  teamB = signal<any[]>([]);

  scoreA = signal<number>(0);
  scoreB = signal<number>(0);
  eventiGol = signal<any[]>([]);

  cronometro = signal<number>(0);
  isTimerRunning = signal<boolean>(false);
  matchConcluso = signal<boolean>(false);
  pagelleInserite = signal<boolean>(false);

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
      const piede = (g.piedePreferito || '').toLowerCase();
      return (
        nome.includes(f) ||
        soprannome.includes(f) ||
        anno.includes(f) ||
        piede.includes(f)
      );
    });
  });

  tuttiInCampo = computed(() => [...this.teamA(), ...this.teamB()]);

  isDettagliValidi = computed(
    () =>
      this.luogo().trim() !== '' &&
      this.dataPartita() !== '' &&
      this.orario() !== '',
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

  async salvaInDatabase(
    pagelleInseriteFlag: boolean,
    matchConclusoFlag: boolean = false,
  ) {
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
      cronometro: this.cronometro(),
      matchConcluso: matchConclusoFlag || this.matchConcluso(),
      pagelleInserite: pagelleInseriteFlag,
    };

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
    }
  }
}
