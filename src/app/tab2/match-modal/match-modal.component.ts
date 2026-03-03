import {
  Component,
  Input,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
} from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonList,
  IonItem,
  IonAvatar,
  IonLabel,
  IonIcon,
  IonButtons,
  IonButton,
  IonInput,
  IonBadge,
  IonSearchbar,
  IonListHeader,
  ModalController,
  LoadingController,
  ActionSheetController,
  AlertController,
  IonFab,
  IonFabButton,
  IonTextarea,
} from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import {
  Firestore,
  collection,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
} from '@angular/fire/firestore';
import { addIcons } from 'ionicons';
import {
  arrowBack,
  swapHorizontal,
  closeCircle,
  checkmarkDone,
  ellipseOutline,
  checkmarkCircle,
  arrowForward,
  locationOutline,
  calendarOutline,
  timeOutline,
  people,
  checkmark,
  play,
  pause,
  stop,
  add,
  remove,
  close,
  search,
} from 'ionicons/icons';

@Component({
  selector: 'app-match-modal',
  templateUrl: './match-modal.component.html',
  styleUrls: ['./match-modal.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonAvatar,
    IonLabel,
    IonIcon,
    IonButtons,
    IonButton,
    IonInput,
    IonBadge,
    IonSearchbar,
    IonListHeader,
    IonFab,
    IonFabButton,
    IonTextarea
  ],
})
export class MatchModalComponent implements OnInit, OnDestroy {
  private modalCtrl = inject(ModalController);
  private firestore = inject(Firestore);
  private loadingCtrl = inject(LoadingController);
  private actionSheetCtrl = inject(ActionSheetController);
  private alertCtrl = inject(AlertController);

  @Input() matchData: any;

  // --- SIGNALS ---
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

  // --- CRONOMETRO ---
  cronometro = signal<number>(0);
  isTimerRunning = signal<boolean>(false);
  private timerRef: any;

  // --- COMPUTED ---
  convocati = computed(() =>
    this.tutti().filter((g) => g?.selezionato === true),
  );
  totaleConvocati = computed(() => this.convocati().length);

  // 🔥 LA NUOVA RICERCA IBRIDA MODERNA 🔥
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

  constructor() {
    addIcons({
      arrowBack,
      swapHorizontal,
      closeCircle,
      checkmarkDone,
      ellipseOutline,
      checkmarkCircle,
      arrowForward,
      locationOutline,
      calendarOutline,
      timeOutline,
      people,
      checkmark,
      play,
      pause,
      stop,
      add,
      remove,
      close,
      search,
    });
  }

  ngOnInit() {
    const baseGiocatori = (this.matchData.tuttiGiocatori || []).map(
      (g: any) => ({ ...g, selezionato: false }),
    );

    if (this.matchData.id) {
      this.luogo.set(this.matchData.luogo || '');
      this.dataPartita.set(this.matchData.dataPartita || '');
      this.orario.set(this.matchData.orario || '');
      this.scoreA.set(this.matchData.scoreA || 0);
      this.scoreB.set(this.matchData.scoreB || 0);
      this.eventiGol.set(this.matchData.eventiGol || []);
      this.cronometro.set(this.matchData.cronometro || 0);

      const idsSalvati = (this.matchData.convocati || []).map((c: any) => c.id);
      this.tutti.set(
        baseGiocatori.map((g: any) => ({
          ...g,
          selezionato: idsSalvati.includes(g.id),
        })),
      );

      this.teamA.set(this.matchData.teamA || []);
      this.teamB.set(this.matchData.teamB || []);

      if (!this.isDettagliValidi()) this.step.set('dettagli');
      else if (this.teamA().length === 0 && this.teamB().length === 0)
        this.step.set('squadre');
      else if (!this.matchData.matchConcluso) this.step.set('match');
      else this.step.set('prestazioni');
    } else {
      this.tutti.set(baseGiocatori);
      this.dataPartita.set(this.getProssimoMercoledi());
      this.orario.set('21:00');
      this.step.set('convocati');
    }
  }

  ngOnDestroy() {
    if (this.timerRef) clearInterval(this.timerRef);
  }

  getProssimoMercoledi(): string {
    const d = new Date();
    d.setDate(
      d.getDate() + (d.getDay() <= 3 ? 3 - d.getDay() : 10 - d.getDay()),
    );
    return d.toISOString().split('T')[0];
  }

  chiudi() {
    this.modalCtrl.dismiss();
  }

  toggleSelezione(giocatore: any) {
    this.tutti.update((list) =>
      list.map((g) =>
        g.id === giocatore.id ? { ...g, selezionato: !g.selezionato } : g,
      ),
    );
  }

  spostaIn(giocatore: any, target: 'A' | 'B') {
    if (target === 'A') {
      this.teamB.update((list) => list.filter((g) => g.id !== giocatore.id));
      if (!this.teamA().find((g) => g.id === giocatore.id))
        this.teamA.update((l) => [...l, giocatore]);
    } else {
      this.teamA.update((list) => list.filter((g) => g.id !== giocatore.id));
      if (!this.teamB().find((g) => g.id === giocatore.id))
        this.teamB.update((l) => [...l, giocatore]);
    }
  }

  vaiADettagli() {
    this.step.set('dettagli');
  }

  vaiASquadre() {
    const scelti = this.convocati();
    const idsScelti = scelti.map((g) => g.id);

    // 1. Rimuove dai team chi è stato eventualmente deselezionato nello step 1
    this.teamA.update((t) => t.filter((g) => idsScelti.includes(g.id)));
    this.teamB.update((t) => t.filter((g) => idsScelti.includes(g.id)));

    // 2. Trova chi è già smistato nei due team
    const idsAssegnati = [...this.teamA(), ...this.teamB()].map((g) => g.id);

    // 3. Trova le "new entry" che hai appena aggiunto e non sono ancora smistate
    const nuoviArrivati = scelti.filter((g) => !idsAssegnati.includes(g.id));

    // 4. Mette i nuovi arrivati nel Team A (così li vedi e li puoi spostare)
    if (nuoviArrivati.length > 0) {
      this.teamA.update((t) => [...t, ...nuoviArrivati]);
    }

    this.salvaInDatabase(false); // Salva la bozza
    this.step.set('squadre');
  }

  confermaSquadre() {
    this.salvaInDatabase(false);
    this.step.set('match');
  }

  async finisciMatch() {
    const alert = await this.alertCtrl.create({
      header: 'Fischio Finale',
      message:
        'Sei sicuro di chiudere la partita? Non potrai più aggiungere gol o cambiare le squadre.',
      buttons: [
        { text: 'Continua a Giocare', role: 'cancel' },
        {
          text: 'Termina Partita',
          role: 'destructive',
          handler: () => {
            if (this.isTimerRunning()) this.toggleTimer();
            this.matchData.matchConcluso = true;
            this.salvaInDatabase(false, true);
            this.step.set('prestazioni');
          },
        },
      ],
    });
    await alert.present();
  }

  toggleTimer() {
    if (this.isTimerRunning()) {
      clearInterval(this.timerRef);
      this.isTimerRunning.set(false);
    } else {
      this.isTimerRunning.set(true);
      this.timerRef = setInterval(
        () => this.cronometro.update((t) => t + 1),
        1000,
      );
    }
  }

  async chiediChiHaSegnato(teamVantaggio: 'A' | 'B') {
    const teamCheSegna = teamVantaggio === 'A' ? this.teamA() : this.teamB();
    const teamAvversario = teamVantaggio === 'A' ? this.teamB() : this.teamA();

    const buttons = [
      // 1. Giocatori della squadra che ha segnato (Normali)
      ...teamCheSegna.map((g) => ({
        text: g.nome,
        handler: () => this.registraGol(g, teamVantaggio, false),
      })),

      // 2. Avversari (Autogol - appaiono in rosso in automatico)
      ...teamAvversario.map((g) => ({
        text: g.nome + ' (Autogol)',
        role: 'destructive',
        handler: () => this.registraGol(g, teamVantaggio, true),
      })),

      // 3. Tasto annulla vero e unico
      { text: 'Annulla', role: 'cancel' },
    ];

    const as = await this.actionSheetCtrl.create({
      header: `Gol per i ${teamVantaggio === 'A' ? 'BIANCHI' : 'NERI'}! Chi ha segnato?`,
      buttons,
    });
    await as.present();
  }

  registraGol(giocatore: any, teamVantaggio: 'A' | 'B', isAutogoal: boolean) {
    this.eventiGol.update((list) => [
      ...list,
      {
        idAssegnato: giocatore.id,
        nome: giocatore.nome,
        teamVantaggio,
        isAutogoal,
        tempo: this.formatTimer(),
      },
    ]);
    teamVantaggio === 'A'
      ? this.scoreA.update((s) => s + 1)
      : this.scoreB.update((s) => s + 1);
    this.tutti.update((list) =>
      list.map((g) =>
        g.id === giocatore.id
          ? { ...g, gol: (g.gol || 0) + (isAutogoal ? 0 : 1) }
          : g,
      ),
    );
    this.salvaInDatabase(false);
  }

  rimuoviUltimoGol(team: 'A' | 'B') {
    const list = this.eventiGol();
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].teamVantaggio === team) {
        const rimosso = list[i];
        this.eventiGol.update((l) => l.filter((_, index) => index !== i));
        team === 'A'
          ? this.scoreA.update((s) => Math.max(0, s - 1))
          : this.scoreB.update((s) => Math.max(0, s - 1));
        this.tutti.update((l) =>
          l.map((g) =>
            g.id === rimosso.idAssegnato
              ? {
                  ...g,
                  gol: Math.max(0, (g.gol || 0) - (rimosso.isAutogoal ? 0 : 1)),
                }
              : g,
          ),
        );
        this.salvaInDatabase(false);
        break;
      }
    }
  }

  aggiornaVoto(giocatore: any, event: any) {
    const inputElement = event.target;
    let votoStr = inputElement.value; // Legge quello che l'utente ha appena scritto

    // ==========================================
    // FASE 1: SMARCATURA AGGRESSIVA (Pulizia visiva istantanea)
    // ==========================================

    // ❌ Rimuove subito lettere, simboli speciali e DOPI MENI.
    // Accetta solo numeri (0-9) e un singolo punto (.) o virgola (,)
    votoStr = votoStr.replace(/[^\d.,-]/g, '');

    // ❌ Rimuove eventuali meno multipli (es. '--5' -> '-5')
    votoStr = votoStr.replace(/-{2,}/g, '-');

    // ❌ Sostituisce la virgola col punto per il parseFloat (per chi usa la virgola come decimale)
    votoStr = votoStr.replace(',', '.');

    // ==========================================
    // FASE 2: PULIZIA ZERO INIZIALE E RANGE (0-10)
    // ==========================================

    // Se il campo è vuoto, salviamo 0 nello stato e stop
    if (votoStr === '') {
      this.salvaVotoNelloStato(giocatore.id, 0);
      return;
    }

    // Converte in numero (questo toglierà gli zeri in eccesso: '00005' -> 5)
    let v = parseFloat(votoStr);

    // Se digita più di 10 (es. 100), forziamo graficamente il campo a "10"
    if (v > 10) {
      inputElement.value = '10';
      v = 10;
    }
    // Se prova a mettere numeri negativi (es. -5), forziamo a "0"
    else if (v < 0) {
      inputElement.value = '0';
      v = 0;
    }
    // Altrimenti, se il numero è pulito e nel range, aggiorniamo il campo visivo col numero pulito
    else {
      // Questo serve a pulire visivamente gli zeri in eccesso (es. '00005' -> '5')
      inputElement.value = v.toString();
    }

    if (isNaN(v)) v = 0;

    // Salva il voto finale nello stato (Team A/B)
    this.salvaVotoNelloStato(giocatore.id, v);
  }

  // Funzione d'appoggio per mantenere pulito il codice (non cambiarla se l'hai già aggiunta)
  private salvaVotoNelloStato(id: string, voto: number) {
    if (this.teamA().find((g) => g.id === id)) {
      this.teamA.update((l) =>
        l.map((g) => (g.id === id ? { ...g, voto: voto } : g)),
      );
    } else {
      this.teamB.update((l) =>
        l.map((g) => (g.id === id ? { ...g, voto: voto } : g)),
      );
    }
  }

  aggiornaNote(giocatore: any, testo: string) {
    this.teamA().find((g) => g.id === giocatore.id)
      ? this.teamA.update((l) =>
          l.map((g) => (g.id === giocatore.id ? { ...g, note: testo } : g)),
        )
      : this.teamB.update((l) =>
          l.map((g) => (g.id === giocatore.id ? { ...g, note: testo } : g)),
        );
  }

  async concludiTutto() {
    await this.salvaInDatabase(true, true);
    this.modalCtrl.dismiss(true);
  }

  private async salvaInDatabase(
    pagelleInserite: boolean,
    matchConcluso: boolean = false,
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
      matchConcluso: matchConcluso || this.matchData.matchConcluso || false,
      pagelleInserite,
    };

    if (this.matchData.id)
      await updateDoc(
        doc(this.firestore, `partite/${this.matchData.id}`),
        payload,
      );
    else {
      const docRef = await addDoc(collection(this.firestore, 'partite'), {
        ...payload,
        dataOra: serverTimestamp(),
        classificaAggiornata: false,
      });
      this.matchData.id = docRef.id;
    }
  }
}
