import {
  Component,
  inject,
  signal,
  computed,
  effect,
  OnInit,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonIcon,
  IonModal,
  IonSearchbar,
  IonAvatar,
  IonSpinner,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  swapHorizontal,
  trophy,
  shield,
  shieldOutline,
  football,
  star,
  flame,
  snow,
  people,
  ribbon,
  trendingUp,
  close,
  repeat,
  logoWhatsapp,
  chevronDown,
  checkmarkCircle,
  medal,
  remove,
  arrowUp,
  arrowDown,
  flash,
  sparkles,
  timeOutline,
  refreshOutline,
  mic,
} from 'ionicons/icons';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';
import { ConfrontoService } from 'src/app/services/confronto.service';
import { GeminiService } from 'src/app/services/gemini.service';
import {
  HeadToHeadComparison,
  PlayerComparisonProfile,
} from 'src/app/models/confronto.model';
import {
  ALL_SEASONS,
  CURRENT_SEASON,
  getStagioniDisponibili,
} from 'src/app/utils/season-utils';
import { Giocatore } from 'src/app/models/giocatore.model';

@Component({
  selector: 'app-confronto',
  templateUrl: './confronto.page.html',
  styleUrls: ['./confronto.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonButton,
    IonIcon,
    IonModal,
    IonSearchbar,
    IonAvatar,
    IonSpinner,
    ThemeToggleComponent,
  ],
})
export class ConfrontoPage implements OnInit {
  private confrontoService = inject(ConfrontoService);
  private geminiService = inject(GeminiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toastController = inject(ToastController);

  readonly ALL_SEASONS = ALL_SEASONS;
  readonly CURRENT_SEASON = CURRENT_SEASON;

  // Giocatori selezionati
  playerAId = signal<string>('');
  playerBId = signal<string>('');

  // Verdetto AI & Loading
  verdettoAi = signal<string | null>(null);
  isGeneratingVerdetto = signal<boolean>(false);

  // Stagione selezionata
  stagioneSelezionata = signal<string>(ALL_SEASONS);

  // Modale di selezione giocatore
  isPickerOpen = signal(false);
  pickerTarget = signal<'A' | 'B'>('A');
  pickerSearchQuery = signal<string>('');

  // Dati reattivi da service
  tuttiIGiocatori = this.confrontoService.giocatoriOrdinati;
  partite = this.confrontoService.partite;

  stagioniDisponibili = computed(() => {
    return getStagioniDisponibili(this.partite() || []);
  });

  // Lista filtrata per la ricerca nel selettore rapido
  giocatoriFiltrati = computed(() => {
    const query = this.pickerSearchQuery().toLowerCase().trim();
    const list = this.tuttiIGiocatori() || [];
    const target = this.pickerTarget();
    const otherId = target === 'A' ? this.playerBId() : this.playerAId();

    return list
      .filter((g) => g.id !== otherId) // esclude l'avversario già selezionato
      .filter((g) => {
        if (!query) return true;
        const nome = (g.nome || '').toLowerCase();
        const sop = (g.soprannome || '').toLowerCase();
        return nome.includes(query) || sop.includes(query);
      });
  });

  // Risultato comparativo completo 1v1
  comparison = computed<HeadToHeadComparison | null>(() => {
    const idA = this.playerAId();
    const idB = this.playerBId();
    const season = this.stagioneSelezionata();

    if (!idA || !idB || idA === idB) return null;

    return this.confrontoService.getComparison(idA, idB, season);
  });

  constructor() {
    addIcons({
      swapHorizontal,
      trophy,
      shield,
      shieldOutline,
      football,
      star,
      flame,
      snow,
      people,
      ribbon,
      trendingUp,
      close,
      repeat,
      logoWhatsapp,
      chevronDown,
      checkmarkCircle,
      medal,
      remove,
      arrowUp,
      arrowDown,
      flash,
      sparkles,
      timeOutline,
      refreshOutline,
      mic,
    });

    effect(() => {
      const idA = this.playerAId();
      const idB = this.playerBId();
      if (!idA || !idB || idA === idB) {
        this.verdettoAi.set(null);
        return;
      }
      this.caricaVerdettoCache(idA, idB);
    });
  }

  async caricaVerdettoCache(idA: string, idB: string) {
    try {
      const cached = await this.geminiService.getCachedConfrontoVerdetto(idA, idB);
      this.verdettoAi.set(cached);
    } catch {
      this.verdettoAi.set(null);
    }
  }

  async generaVerdetto(force = false) {
    const idA = this.playerAId();
    const idB = this.playerBId();
    const comp = this.comparison();
    if (!idA || !idB || !comp || this.isGeneratingVerdetto()) return;

    this.isGeneratingVerdetto.set(true);
    try {
      const text = await this.geminiService.getOrGenerateConfrontoVerdetto(
        idA,
        idB,
        comp,
        force,
      );
      this.verdettoAi.set(text);
      const toast = await this.toastController.create({
        message: '🎙️ Verdetto AI generato e salvato nel database!',
        duration: 2500,
        color: 'success',
        position: 'bottom',
      });
      await toast.present();
    } catch (err: any) {
      console.error(err);
      const toast = await this.toastController.create({
        message: 'Errore generazione verdetto: ' + (err.message || err),
        duration: 3500,
        color: 'danger',
        position: 'bottom',
      });
      await toast.present();
    } finally {
      this.isGeneratingVerdetto.set(false);
    }
  }

  ngOnInit() {
    // Leggi eventuali parametri dalla URL (?playerA=xyz&playerB=abc)
    this.route.queryParams.subscribe((params) => {
      const qA = params['playerA'];
      const qB = params['playerB'];

      const list = this.tuttiIGiocatori() || [];

      if (qA && list.some((g) => g.id === qA)) {
        this.playerAId.set(qA);
      }
      if (qB && list.some((g) => g.id === qB)) {
        this.playerBId.set(qB);
      }

      // Se non sono impostati, seleziona i primi due giocatori della classifica
      if (!this.playerAId() && list.length > 0) {
        this.playerAId.set(list[0].id);
      }
      if (!this.playerBId() && list.length > 1) {
        const second = list.find((g) => g.id !== this.playerAId());
        if (second) {
          this.playerBId.set(second.id);
        }
      }
    });
  }

  // Selettore rapido Giocatore
  apriSelettore(target: 'A' | 'B') {
    this.pickerTarget.set(target);
    this.pickerSearchQuery.set('');
    this.isPickerOpen.set(true);
  }

  chiudiSelettore() {
    this.isPickerOpen.set(false);
  }

  selezionaGiocatore(g: Giocatore) {
    if (this.pickerTarget() === 'A') {
      this.playerAId.set(g.id);
    } else {
      this.playerBId.set(g.id);
    }
    this.chiudiSelettore();
  }

  // Inverte Giocatore A e Giocatore B
  scambiaGiocatori() {
    const a = this.playerAId();
    const b = this.playerBId();
    this.playerAId.set(b);
    this.playerBId.set(a);
  }

  // Cambio stagione
  selezionaStagione(seasonId: string) {
    this.stagioneSelezionata.set(seasonId);
  }

  aggiornaRicerca(event: any) {
    this.pickerSearchQuery.set(event.detail.value || '');
  }

  // Condivisione su WhatsApp del confronto 1v1
  async condividiConfronto() {
    const comp = this.comparison();
    if (!comp) return;

    const pA = comp.playerA;
    const pB = comp.playerB;
    const scontri = comp.scontriContro;
    const intesa = comp.intesaInsieme;

    const lines: string[] = [];
    lines.push(`⚔️ *CONFRONTO 1v1: ${pA.nome.toUpperCase()} vs ${pB.nome.toUpperCase()}* ⚔️`);
    lines.push(``);
    lines.push(`🛡️ *MMR Rating:* ${pA.currentMmr} (${pA.tier.badge}) vs ${pB.currentMmr} (${pB.tier.badge})`);
    lines.push(`🏆 *Peak MMR:* ${pA.peakMmr} vs ${pB.peakMmr}`);
    lines.push(`🥇 *Punti Legacy:* ${pA.puntiLegacy} vs ${pB.puntiLegacy}`);
    lines.push(`⚽ *Gol Totali:* ${pA.golTotali} vs ${pB.golTotali}`);
    lines.push(`⭐ *Media Voto:* ${pA.mediaVoto > 0 ? pA.mediaVoto.toFixed(2) : '--'} vs ${pB.mediaVoto > 0 ? pB.mediaVoto.toFixed(2) : '--'}`);
    lines.push(`🎖️ *Premi MVP:* ${pA.mvpCount} vs ${pB.mvpCount}`);
    lines.push(``);

    if (this.verdettoAi()) {
      lines.push(`🎙️ *VERDETTO AI (Gemini Flash):*`);
      lines.push(`"${this.verdettoAi()}"`);
      lines.push(``);
    }

    lines.push(`🔥 *Scontri Diretti da Avversari (${scontri.totalePartite} match):*`);
    lines.push(`   • ${pA.nome}: ${scontri.vittorieA}V (${scontri.winRateA}%)`);
    lines.push(`   • Pareggi: ${scontri.pareggi}`);
    lines.push(`   • ${pB.nome}: ${scontri.vittorieB}V (${scontri.winRateB}%)`);
    lines.push(`   • ${scontri.bestiaNeraText}`);
    lines.push(``);
    lines.push(`🤝 *Intesa Quando Giocano Insieme:*`);
    lines.push(`   • ${intesa.affinitaEmoji} ${intesa.affinitaLabel} (${intesa.winRate}% vittorie su ${intesa.totalePartite} match)`);
    lines.push(``);
    lines.push(`_Generato da Calcetto Abbuffo_ ⚽`);

    const text = lines.join('\n');
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');

    const toast = await this.toastController.create({
      message: 'Confronto 1v1 pronto per la condivisione WhatsApp!',
      duration: 2000,
      color: 'success',
      position: 'bottom',
    });
    await toast.present();
  }
}
