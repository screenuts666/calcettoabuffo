import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonList,
  IonItem,
  IonAvatar,
  IonLabel,
  IonCheckbox,
  IonSearchbar,
  IonIcon,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeCircle, search, flashOutline } from 'ionicons/icons';
import { MatchStateService } from '../../match-state.service';
import {
  getAvatarUrl,
  handleAvatarError,
} from '../../../../../utils/avatar-utils';
import { PlayerAvatarComponent } from '../../../../player-avatar/player-avatar.component';
import { environment } from 'src/environments/environment';
import { StatsEngineService } from 'src/app/services/stats-engine.service';
import { CURRENT_SEASON } from 'src/app/utils/season-utils';

@Component({
  selector: 'app-step-convocati',
  templateUrl: './step-convocati.component.html',
  styleUrls: ['./step-convocati.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonList,
    IonItem,
    IonAvatar,
    IonLabel,
    IonCheckbox,
    IonSearchbar,
    IonIcon,
    PlayerAvatarComponent,
  ],
})
export class StepConvocatiComponent {
  public state = inject(MatchStateService);
  private statsEngine = inject(StatsEngineService);
  private toastCtrl = inject(ToastController);

  readonly isDev = !environment.production;

  getAvatar(fotoUrl?: string | null): string {
    return getAvatarUrl(fotoUrl);
  }

  onImgError(event: Event) {
    handleAvatarError(event);
  }

  constructor() {
    addIcons({ closeCircle, search, flashOutline });
  }

  toggleSelezione(giocatore: any) {
    this.state.tutti.update((lista) =>
      lista.map((g) =>
        g.id === giocatore.id ? { ...g, selezionato: !g.selezionato } : g,
      ),
    );
  }

  /**
   * DEV ONLY: Seleziona in 1 tap i primi 14 giocatori dalla classifica (o anagrafica)
   * per predisporre rapidamente una partita 7 vs 7 nei test di sviluppo.
   */
  async selezionaPrimi14Classifica() {
    const currentSeason = this.state.stagione() || CURRENT_SEASON;
    const seasonLeaderboard = this.statsEngine.getLeaderboardBySeason(currentSeason);
    const allTimeLeaderboard = this.statsEngine.allTimeLeaderboard();

    const rankedIds: string[] = [];
    for (const p of seasonLeaderboard) {
      if (!rankedIds.includes(p.giocatoreId)) rankedIds.push(p.giocatoreId);
    }
    for (const p of allTimeLeaderboard) {
      if (!rankedIds.includes(p.giocatoreId)) rankedIds.push(p.giocatoreId);
    }

    const tutti = this.state.tutti();
    const top14Ids = new Set<string>();

    for (const id of rankedIds) {
      if (top14Ids.size >= 14) break;
      if (tutti.some((g) => g.id === id)) {
        top14Ids.add(id);
      }
    }

    // Se non bastano a 14 con lo storico classifica, prendi altri giocatori disponibili
    if (top14Ids.size < 14) {
      for (const g of tutti) {
        if (top14Ids.size >= 14) break;
        top14Ids.add(g.id);
      }
    }

    // Toggle: se sono già tutti e solo questi 14 selezionati, deseleziona
    const giaTuttiSelezionati =
      top14Ids.size > 0 &&
      tutti.every((g) => top14Ids.has(g.id) === !!g.selezionato);

    if (giaTuttiSelezionati) {
      this.state.tutti.update((lista) =>
        lista.map((g) => ({ ...g, selezionato: false }))
      );
      const toast = await this.toastCtrl.create({
        message: '⚡ DEV: Convocati deselezionati',
        duration: 1500,
        position: 'top',
      });
      await toast.present();
      return;
    }

    this.state.tutti.update((lista) =>
      lista.map((g) => ({
        ...g,
        selezionato: top14Ids.has(g.id),
      }))
    );

    const toast = await this.toastCtrl.create({
      message: `⚡ DEV: Selezionati ${top14Ids.size} giocatori (Top Classifica) per 7 vs 7!`,
      duration: 2200,
      color: 'warning',
      position: 'top',
    });
    await toast.present();
  }
}
