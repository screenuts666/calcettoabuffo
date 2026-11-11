import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonIcon,
  IonSpinner,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  arrowBack,
  swapHorizontal,
  football,
  trophy,
  flash,
  chevronForward,
  calendarOutline,
  flame,
  people,
} from 'ionicons/icons';
import { ConfrontoService } from 'src/app/services/confronto.service';
import { StatsEngineService } from 'src/app/services/stats-engine.service';
import { PlayerAvatarComponent } from '../../player-avatar/player-avatar.component';
import { ThemeToggleComponent } from '../../theme-toggle/theme-toggle.component';
import { getAvatarUrl } from 'src/app/utils/avatar-utils';
import { HeadToHeadComparison } from 'src/app/models/confronto.model';

@Component({
  selector: 'app-dettaglio-chimica',
  templateUrl: './dettaglio-chimica.page.html',
  styleUrls: ['./dettaglio-chimica.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonButton,
    IonIcon,
    IonSpinner,
    PlayerAvatarComponent,
    ThemeToggleComponent,
  ],
})
export class DettaglioChimicaPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private location = inject(Location);
  private confrontoService = inject(ConfrontoService);
  private statsEngine = inject(StatsEngineService);

  player1Id = signal<string>('');
  player2Id = signal<string>('');

  tuttiIGiocatori = this.confrontoService.giocatoriOrdinati;

  p1 = computed(() => {
    const id = this.player1Id();
    return (this.tuttiIGiocatori() || []).find((g) => g.id === id) || null;
  });

  p2 = computed(() => {
    const id = this.player2Id();
    return (this.tuttiIGiocatori() || []).find((g) => g.id === id) || null;
  });

  comparison = computed<HeadToHeadComparison | null>(() => {
    const id1 = this.player1Id();
    const id2 = this.player2Id();
    if (!id1 || !id2) return null;
    return this.confrontoService.getComparison(id1, id2);
  });

  // Metriche di coppia aggregate
  chimicaData = computed(() => {
    const comp = this.comparison();
    if (!comp) return null;

    const matches = comp.intesaInsieme.matches;
    const wins = comp.intesaInsieme.vittorie;
    const draws = comp.intesaInsieme.pareggi;
    const losses = comp.intesaInsieme.sconfitte;
    const total = comp.intesaInsieme.totalePartite;
    const winRate = comp.intesaInsieme.winRate;

    const golP1 = matches.reduce((acc: number, m: any) => acc + (m.golA || 0), 0);
    const golP2 = matches.reduce((acc: number, m: any) => acc + (m.golB || 0), 0);
    const golCombinati = golP1 + golP2;

    // Recupera sinergia da statsEngine per avere l'impatto medio MMR e assist
    const chemMap = this.statsEngine.statsResult().chemistry;
    const profileP1 = chemMap.get(this.player1Id());
    const bestMate = profileP1?.bestPartner;
    const isBest = bestMate?.partnerId === this.player2Id();

    return {
      total,
      wins,
      draws,
      losses,
      winRate,
      golP1,
      golP2,
      golCombinati,
      matches,
      affinitaEmoji: comp.intesaInsieme.affinitaEmoji,
      affinitaLabel: comp.intesaInsieme.affinitaLabel,
      isUnbeaten: total >= 2 && losses === 0,
      isBest,
      avgMmrDeltaTogether: bestMate?.partnerId === this.player2Id() ? bestMate?.avgMmrDeltaTogether : undefined,
    };
  });

  constructor() {
    addIcons({
      arrowBack,
      swapHorizontal,
      football,
      trophy,
      flash,
      chevronForward,
      calendarOutline,
      flame,
      people,
    });
  }

  ngOnInit() {
    this.route.paramMap.subscribe((params) => {
      const p1 = params.get('p1');
      const p2 = params.get('p2');
      if (p1) this.player1Id.set(p1);
      if (p2) this.player2Id.set(p2);
    });
  }

  getAvatar(fotoUrl?: string | null): string {
    return getAvatarUrl(fotoUrl);
  }

  tornaIndietro() {
    if (window.history.length > 1) {
      this.location.back();
    } else {
      this.router.navigate(['/classifica'], { queryParams: { tab: 'chimica' } });
    }
  }

  vaiAlConfronto1v1() {
    const id1 = this.player1Id();
    const id2 = this.player2Id();
    if (id1 && id2) {
      this.router.navigate(['/confronto', id1, id2]);
    }
  }

  vaiAllaScheda(id: string) {
    if (id) {
      this.router.navigate(['/giocatori', id]);
    }
  }
}

