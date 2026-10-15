import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonIcon,
  IonRow,
  IonCol,
  IonSpinner,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  close,
  trophy,
  analytics,
  football,
  people,
  shield,
  shieldOutline,
  medal,
  ribbon,
  diamond,
  flame,
  snow,
  heart,
  skull,
  flash,
  trendingUp,
  trendingDown,
  remove,
  arrowUp,
  arrowDown,
  swapHorizontal,
  sparkles,
  refreshOutline,
  documentTextOutline,
} from 'ionicons/icons';
import { GiocatoreConPunti } from '../classifica.page';
import { GeminiService } from 'src/app/services/gemini.service';
import { StatsEngineService } from 'src/app/services/stats-engine.service';

@Component({
  selector: 'app-scheda-giocatore',
  templateUrl: './scheda-giocatore.component.html',
  styleUrls: ['./scheda-giocatore.component.scss'],
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
    IonRow,
    IonCol,
    IonSpinner,
  ],
})
export class SchedaGiocatoreComponent {
  private router = inject(Router);
  private geminiService = inject(GeminiService);
  private statsEngine = inject(StatsEngineService);
  private toastCtrl = inject(ToastController);

  @Input() prof: GiocatoreConPunti | any = null;
  @Input() chiudiModale!: () => void;
  @Output() selezionaAltroGiocatore = new EventEmitter<string>();

  isGeneratingScouting = signal<boolean>(false);

  constructor() {
    addIcons({
      close,
      trophy,
      analytics,
      football,
      people,
      shield,
      shieldOutline,
      medal,
      ribbon,
      diamond,
      flame,
      snow,
      heart,
      skull,
      flash,
      trendingUp,
      trendingDown,
      remove,
      arrowUp,
      arrowDown,
      swapHorizontal,
      sparkles,
      refreshOutline,
      documentTextOutline,
    });
  }

  async generaScouting(force = false) {
    if (!this.prof?.id || this.isGeneratingScouting()) return;
    this.isGeneratingScouting.set(true);

    try {
      const allMatches = this.statsEngine.partiteRaw() || [];
      const notes: string[] = [];
      for (const p of allMatches) {
        const pl = [...(p.teamA || []), ...(p.teamB || [])].find(
          (x: any) => x.id === this.prof.id,
        );
        if (pl?.note && pl.note.trim()) {
          notes.push(pl.note.trim());
        }
      }

      const res = await this.geminiService.getOrGeneratePlayerScouting(
        this.prof,
        this.prof,
        notes,
        force,
      );

      this.prof.soprannomeAi = res.nickname;
      this.prof.scoutingReportAi = res.scouting;

      const toast = await this.toastCtrl.create({
        message: '📋 Scouting Report e Soprannome AI salvati!',
        duration: 2500,
        color: 'success',
        position: 'bottom',
      });
      await toast.present();
    } catch (err: any) {
      console.error(err);
      const toast = await this.toastCtrl.create({
        message: 'Errore generazione scouting: ' + (err.message || err),
        duration: 3500,
        color: 'danger',
        position: 'bottom',
      });
      await toast.present();
    } finally {
      this.isGeneratingScouting.set(false);
    }
  }

  apriGiocatore(id?: string) {
    if (id) {
      this.selezionaAltroGiocatore.emit(id);
    }
  }

  confronta(opponentId?: string) {
    if (this.chiudiModale) {
      this.chiudiModale();
    }
    const queryParams: any = {};
    if (this.prof?.id) {
      queryParams.playerA = this.prof.id;
    }
    if (opponentId) {
      queryParams.playerB = opponentId;
    }
    this.router.navigate(['/confronto'], { queryParams });
  }
}
