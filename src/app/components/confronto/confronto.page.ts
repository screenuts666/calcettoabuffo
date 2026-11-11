import {
  Component,
  inject,
  signal,
  computed,
  effect,
  OnInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ViewChild,
} from '@angular/core';
import { CommonModule, Location } from '@angular/common';
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
  chevronForward,
  arrowBack,
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
  globeOutline,
  diceOutline,
  flashOutline,
} from 'ionicons/icons';
import { ThemeToggleComponent } from '../theme-toggle/theme-toggle.component';
import { PlayerAvatarComponent } from '../player-avatar/player-avatar.component';
import { ConfrontoService } from 'src/app/services/confronto.service';
import { GeminiService } from 'src/app/services/gemini.service';
import {
  HeadToHeadComparison,
  PlayerComparisonProfile,
} from 'src/app/models/confronto.model';
import { getAvatarUrl, handleAvatarError } from 'src/app/utils/avatar-utils';
import {
  ALL_SEASONS,
  CURRENT_SEASON,
  getStagioniDisponibili,
} from 'src/app/utils/season-utils';
import { Giocatore } from 'src/app/models/giocatore.model';
import { formatAiMarkdown } from 'src/app/utils/ai-format.utils';
import { AiTtsButtonComponent } from '../ai-tts-button/ai-tts-button.component';

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
    IonSpinner,
    ThemeToggleComponent,
    AiTtsButtonComponent,
    PlayerAvatarComponent,
  ],
})
export class ConfrontoPage implements OnInit {
  private confrontoService = inject(ConfrontoService);
  private geminiService = inject(GeminiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private location = inject(Location);
  private toastController = inject(ToastController);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('pickerModal') pickerModal?: IonModal;

  readonly formatAiMarkdown = formatAiMarkdown;

  readonly ALL_SEASONS = ALL_SEASONS;
  readonly CURRENT_SEASON = CURRENT_SEASON;

  getAvatar(fotoUrl?: string | null): string {
    return getAvatarUrl(fotoUrl);
  }

  onImgError(event: Event) {
    handleAvatarError(event);
  }

  // Vista attiva: Hub (griglia sfide dinamiche + casuale) o Dettaglio (faccia a faccia 1v1)
  viewMode = signal<'hub' | 'detail'>('hub');
  isAiTextExpanded = signal(false);

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

  playerA = computed(() => {
    const id = this.playerAId();
    return (this.tuttiIGiocatori() || []).find((g) => g.id === id) || null;
  });

  playerB = computed(() => {
    const id = this.playerBId();
    return (this.tuttiIGiocatori() || []).find((g) => g.id === id) || null;
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

  // SFIDE DINAMICHE PER L'HUB 1v1
  dynamicMatchups = computed(() => {
    const partite = this.partite() || [];
    const giocatori = this.tuttiIGiocatori() || [];
    if (giocatori.length < 2 || partite.length === 0) {
      return { rivalita: [], frequenti: [], equilibrati: [] };
    }

    const gMap = new Map(giocatori.map((g) => [g.id, g]));
    const pairOpponents = new Map<
      string,
      {
        p1Id: string;
        p2Id: string;
        p1Wins: number;
        draws: number;
        p2Wins: number;
        total: number;
      }
    >();

    for (const p of partite) {
      if (!p.pagelleInserite && !p.matchConcluso && p.status !== 'conclusa')
        continue;
      const teamA = (p.teamA || []).map((x: any) => x.id);
      const teamB = (p.teamB || []).map((x: any) => x.id);
      const scoreA = Number(p.scoreA) || 0;
      const scoreB = Number(p.scoreB) || 0;

      for (const idA of teamA) {
        for (const idB of teamB) {
          if (!idA || !idB || idA === idB) continue;
          const [p1, p2] = idA < idB ? [idA, idB] : [idB, idA];
          const key = `${p1}_${p2}`;
          let entry = pairOpponents.get(key);
          if (!entry) {
            entry = {
              p1Id: p1,
              p2Id: p2,
              p1Wins: 0,
              draws: 0,
              p2Wins: 0,
              total: 0,
            };
            pairOpponents.set(key, entry);
          }
          entry.total++;
          if (scoreA > scoreB) {
            if (idA === p1) entry.p1Wins++;
            else entry.p2Wins++;
          } else if (scoreB > scoreA) {
            if (idA === p1) entry.p2Wins++;
            else entry.p1Wins++;
          } else {
            entry.draws++;
          }
        }
      }
    }

    const allPairs = Array.from(pairOpponents.values())
      .filter((pair) => gMap.has(pair.p1Id) && gMap.has(pair.p2Id))
      .map((pair) => {
        const g1 = gMap.get(pair.p1Id)!;
        const g2 = gMap.get(pair.p2Id)!;
        const mmr1 = (g1 as any).currentMmr ?? 1000;
        const mmr2 = (g2 as any).currentMmr ?? 1000;
        const deltaMmr = Math.abs(mmr1 - mmr2);
        const diffWins = Math.abs(pair.p1Wins - pair.p2Wins);
        return {
          ...pair,
          g1,
          g2,
          mmr1,
          mmr2,
          deltaMmr,
          diffWins,
        };
      });

    // 1. Scontri Più Frequenti (più match giocati da avversari)
    const frequenti = [...allPairs]
      .filter((p) => p.total >= 2)
      .sort((a, b) => b.total - a.total)
      .slice(0, 4);

    // 2. Rivalità Calde & Bestie Nere
    const rivalita = [...allPairs]
      .filter((p) => p.total >= 2 && p.diffWins >= 1)
      .sort((a, b) => b.diffWins * 2 + b.total - (a.diffWins * 2 + a.total))
      .slice(0, 4);

    // 3. Sfide Equilibrate per MMR
    const equilibrati = [...allPairs]
      .filter((p) => p.total >= 1 && p.deltaMmr <= 45)
      .sort((a, b) => a.deltaMmr - b.deltaMmr || b.total - a.total)
      .slice(0, 4);

    return { rivalita, frequenti, equilibrati };
  });

  constructor() {
    addIcons({
      arrowBack,
      logoWhatsapp,
      diceOutline,
      swapHorizontal,
      flashOutline,
      chevronForward,
      refreshOutline,
      sparkles,
      flash,
      people,
      flame,
      star,
      close,
      trophy,
      shield,
      shieldOutline,
      football,
      snow,
      ribbon,
      trendingUp,
      repeat,
      chevronDown,
      checkmarkCircle,
      medal,
      remove,
      arrowUp,
      arrowDown,
      timeOutline,
      mic,
      globeOutline,
    });

    // Effetto per caricamento verdetto cache
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
      const cached = await this.geminiService.getCachedConfrontoVerdetto(
        idA,
        idB,
      );
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
        message: '🎙️ Verdetto AI generato con successo!',
        duration: 2500,
        color: 'success',
        position: 'bottom',
      });
      await toast.present();
    } catch (err: any) {
      console.error(err);
      const toast = await this.toastController.create({
        message: this.geminiService.formatUserError(err),
        duration: 4000,
        color: 'warning',
        position: 'bottom',
      });
      await toast.present();
    } finally {
      this.isGeneratingVerdetto.set(false);
    }
  }

  ngOnInit() {
    // 1. Parametri di rotta dinamica (/confronto/:p1/:p2 o /1v1/:p1/:p2)
    this.route.paramMap.subscribe((params) => {
      const p1 = params.get('p1');
      const p2 = params.get('p2');
      if (p1 && p2) {
        this.playerAId.set(p1);
        this.playerBId.set(p2);
        this.viewMode.set('detail');
        this.isAiTextExpanded.set(false);
        return;
      }
    });

    // 2. Query params (?playerA=xyz&playerB=abc)
    this.route.queryParams.subscribe((params) => {
      const qA = params['playerA'];
      const qB = params['playerB'];

      if (qA && qB) {
        this.playerAId.set(qA);
        this.playerBId.set(qB);
        this.viewMode.set('detail');
        this.isAiTextExpanded.set(false);
      }
    });

    // Se playerA e playerB non sono impostati, precompila con i primi due della classifica per il selettore
    const list = this.tuttiIGiocatori() || [];
    if (!this.playerAId() && list.length > 0) {
      this.playerAId.set(list[0].id);
    }
    if (!this.playerBId() && list.length > 1) {
      const second = list.find((g) => g.id !== this.playerAId());
      if (second) {
        this.playerBId.set(second.id);
      }
    }
  }

  toggleAiText() {
    this.isAiTextExpanded.update((v) => !v);
  }

  tornaAllHub() {
    this.viewMode.set('hub');
    this.router.navigate(['/confronto']);
  }

  apriConfrontoCoppia(idA: string, idB: string) {
    if (!idA || !idB || idA === idB) return;
    this.playerAId.set(idA);
    this.playerBId.set(idB);
    this.viewMode.set('detail');
    this.isAiTextExpanded.set(false);
    this.router.navigate(['/confronto', idA, idB]);
  }

  vaiAConfrontoCasuale() {
    const list = this.tuttiIGiocatori() || [];
    if (list.length < 2) return;
    const p1 = list[Math.floor(Math.random() * list.length)];
    const others = list.filter((g) => g.id !== p1.id);
    const p2 = others[Math.floor(Math.random() * others.length)];
    this.apriConfrontoCoppia(p1.id, p2.id);
  }

  // Selettore rapido Giocatore
  apriSelettore(target: 'A' | 'B') {
    this.pickerTarget.set(target);
    this.pickerSearchQuery.set('');
    this.isPickerOpen.set(true);
    this.cdr.markForCheck();
  }

  async chiudiSelettore() {
    this.isPickerOpen.set(false);
    this.cdr.markForCheck();
    try {
      await this.pickerModal?.dismiss();
    } catch {
      // ignore
    }
  }

  async selezionaGiocatore(g: Giocatore) {
    const target = this.pickerTarget();
    if (target === 'A') {
      this.playerAId.set(g.id);
    } else {
      this.playerBId.set(g.id);
    }

    // Chiudi istantaneamente la modale
    await this.chiudiSelettore();

    if (this.viewMode() === 'detail') {
      const idA = target === 'A' ? g.id : this.playerAId();
      const idB = target === 'B' ? g.id : this.playerBId();
      if (idA && idB && idA !== idB) {
        this.apriConfrontoCoppia(idA, idB);
      }
    }
  }

  // Inverte Giocatore A e Giocatore B
  scambiaGiocatori() {
    const a = this.playerAId();
    const b = this.playerBId();
    this.playerAId.set(b);
    this.playerBId.set(a);
    if (this.viewMode() === 'detail') {
      this.apriConfrontoCoppia(b, a);
    }
  }

  // Cambio stagione
  selezionaStagione(seasonId: string) {
    this.stagioneSelezionata.set(seasonId);
  }

  aggiornaRicerca(event: any) {
    this.pickerSearchQuery.set(
      event.detail?.value !== undefined
        ? event.detail.value
        : event.target?.value || '',
    );
  }

  // Condivisione su WhatsApp del confronto 1v1
  async condividiConfronto() {
    const comp = this.comparison();
    if (!comp) return;

    const pA = comp.playerA;
    const pB = comp.playerB;
    const sc = comp.scontriContro;
    const stg = this.stagioneSelezionata();
    const stgLabel =
      stg === ALL_SEASONS ? 'Tutte le Stagioni' : `Stagione ${stg}`;

    const lines: string[] = [];
    lines.push(
      `⚔️ *CONFRONTO 1v1: ${pA.nome.toUpperCase()} vs ${pB.nome.toUpperCase()}* ⚔️`,
    );
    lines.push(`📅 *${stgLabel}*`);
    lines.push('');
    lines.push(`📊 *Bilancio Scontri Diretti (${sc.totalePartite} gare):*`);
    lines.push(`• *${pA.nome}:* ${sc.vittorieA} vittorie (${sc.winRateA}%)`);
    lines.push(`• *Pareggi:* ${sc.pareggi}`);
    lines.push(`• *${pB.nome}:* ${sc.vittorieB} vittorie (${sc.winRateB}%)`);
    lines.push(`🔥 *Bestia Nera:* ${sc.bestiaNeraText}`);
    lines.push('');
    if (this.verdettoAi()) {
      lines.push('🎙️ *Verdetto AI:*');
      lines.push(`"${this.verdettoAi()}"`);
      lines.push('');
    }
    lines.push(
      `🔗 *Guarda il testa a testa:* ${window.location.origin}/confronto/${pA.id}/${pB.id}`,
    );

    const text = lines.join('\n');
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, '_blank');

    const toast = await this.toastController.create({
      message: 'Confronto 1v1 pronto per la condivisione WhatsApp!',
      duration: 2500,
      color: 'success',
      position: 'bottom',
    });
    await toast.present();
  }
}
