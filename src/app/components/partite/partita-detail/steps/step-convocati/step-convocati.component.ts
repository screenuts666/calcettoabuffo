import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonList,
  IonItem,
  IonAvatar,
  IonLabel,
  IonCheckbox,
  IonSearchbar,
  IonIcon,
  IonSpinner,
  ToastController,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  closeCircle,
  search,
  flashOutline,
  shareSocialOutline,
  copyOutline,
  logoWhatsapp,
  checkmarkCircle,
  checkmarkDoneCircle,
  helpCircle,
  shieldCheckmarkOutline,
  personAddOutline,
  linkOutline,
  paperPlaneOutline,
} from 'ionicons/icons';
import { MatchStateService, ConvocatoState } from '../../match-state.service';
import {
  getAvatarUrl,
  handleAvatarError,
} from '../../../../../utils/avatar-utils';
import { PlayerAvatarComponent } from '../../../../player-avatar/player-avatar.component';
import { environment } from 'src/environments/environment';
import { StatsEngineService } from 'src/app/services/stats-engine.service';
import { AuthService } from 'src/app/services/auth.service';
import { ShareService } from 'src/app/services/share.service';
import { CURRENT_SEASON } from 'src/app/utils/season-utils';
import { getMatchInviteDeepLink } from 'src/app/utils/whatsapp-formatter';
import { normalizeRsvpStatus } from 'src/app/models/partita.model';
import { AuthModalComponent } from '../../../../auth-modal/auth-modal.component';

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
    IonSpinner,
    PlayerAvatarComponent,
  ],
})
export class StepConvocatiComponent {
  public state = inject(MatchStateService);
  public auth = inject(AuthService);
  private statsEngine = inject(StatsEngineService);
  private toastCtrl = inject(ToastController);
  private modalCtrl = inject(ModalController);
  private router = inject(Router);
  private shareService = inject(ShareService);

  readonly isDev = !environment.production;
  isSavingRsvp = signal<boolean>(false);
  isPreparingInvite = signal<boolean>(false);

  get isAdmin(): boolean {
    return this.auth.isSuperUser();
  }

  /** Stato RSVP attuale del giocatore loggato ('yes' | 'maybe' | 'no' | null) */
  readonly myRsvpStatus = computed<'yes' | 'maybe' | 'no' | null>(() => {
    const uid = this.auth.firebaseUser()?.uid;
    const pid = this.auth.linkedPlayerId();
    const map = this.state.rsvp() || {};
    if (uid && map[uid]) {
      return normalizeRsvpStatus(map[uid].status);
    }
    if (pid) {
      const byPid = Object.values(map).find((e) => e?.playerId === pid);
      if (byPid) return normalizeRsvpStatus(byPid.status);
      const inTutti = this.state.tutti().find((g) => g.id === pid);
      if (inTutti?.rsvpStatus) return inTutti.rsvpStatus;
    }
    return null;
  });

  /** Giocatori in dubbio ("Forse") non ancora convocati */
  readonly maybePlayers = computed<ConvocatoState[]>(() =>
    this.state.tutti().filter((g) => g.rsvpStatus === 'maybe' && !g.selezionato)
  );

  /** Giocatori che hanno risposto "Non partecipo" non ancora convocati */
  readonly declinedPlayers = computed<ConvocatoState[]>(() =>
    this.state.tutti().filter((g) => g.rsvpStatus === 'no' && !g.selezionato)
  );

  /** Conteggio giocatori auto-inseriti tramite link invito */
  readonly selfRegisteredCount = computed<number>(
    () => this.state.convocati().filter((g) => g.selfRegistered).length
  );

  getAvatar(fotoUrl?: string | null): string {
    return getAvatarUrl(fotoUrl);
  }

  onImgError(event: Event) {
    handleAvatarError(event);
  }

  constructor() {
    addIcons({
      closeCircle,
      search,
      flashOutline,
      shareSocialOutline,
      copyOutline,
      logoWhatsapp,
      checkmarkCircle,
      checkmarkDoneCircle,
      helpCircle,
      shieldCheckmarkOutline,
      personAddOutline,
      linkOutline,
      paperPlaneOutline,
    });
  }

  toggleSelezione(giocatore: ConvocatoState) {
    if (!this.isAdmin) return;
    const nextSelected = !giocatore.selezionato;
    this.state.tutti.update((lista) =>
      lista.map((g) =>
        g.id === giocatore.id
          ? {
              ...g,
              selezionato: nextSelected,
              source: nextSelected
                ? g.selfRegistered
                  ? 'self'
                  : 'mister'
                : undefined,
              rsvpStatus: nextSelected ? 'yes' : g.rsvpStatus === 'yes' ? null : g.rsvpStatus,
            }
          : g
      )
    );

    // Allinea anche la mappa RSVP della partita affinché sia rintracciabile ovunque
    const currentRsvp = { ...(this.state.rsvp() || {}) };
    const rsvpKey = giocatore.linkedUid || ('player_' + giocatore.id);
    if (nextSelected) {
      currentRsvp[rsvpKey] = {
        uid: giocatore.linkedUid || rsvpKey,
        playerId: giocatore.id,
        playerName: giocatore.nome,
        status: 'confirmed',
        source: 'mister',
        updatedAt: new Date().toISOString(),
      };
    } else {
      if (currentRsvp[rsvpKey]?.source === 'mister') {
        delete currentRsvp[rsvpKey];
      }
    }
    this.state.rsvp.set(currentRsvp);

    this.state.triggerAutoSave(true);
  }

  /**
   * Risposta Auto-RSVP del giocatore loggato ('yes' = Partecipo, 'maybe' = Forse, 'no' = Non partecipo).
   * Modificabile in qualsiasi momento finché la partita è nello step 'convocati'.
   */
  async impostaMioRsvp(status: 'yes' | 'maybe' | 'no') {
    if (this.isSavingRsvp() || this.state.step() !== 'convocati') return;

    if (!this.state.matchId() && this.isAdmin) {
      await this.state.ensureMatchCreatedForInvite();
    }

    if (!this.state.matchId()) {
      const toast = await this.toastCtrl.create({
        message:
          '⚠️ Il Mister deve prima salvare la partita per aprire le convocazioni.',
        duration: 2500,
        color: 'warning',
        position: 'top',
      });
      await toast.present();
      return;
    }

    this.isSavingRsvp.set(true);
    try {
      await this.state.submitSelfRsvp(status);
      const messages: Record<'yes' | 'maybe' | 'no', string> = {
        yes: '✅ Presenza confermata! Sei stato aggiunto automaticamente ai convocati.',
        maybe:
          '🤔 Risposta impostata su "Forse" (In dubbio). Puoi aggiornarla quando vuoi!',
        no: '❌ Assenza registrata ("Non partecipo").',
      };
      const colors: Record<
        'yes' | 'maybe' | 'no',
        'success' | 'warning' | 'medium'
      > = {
        yes: 'success',
        maybe: 'warning',
        no: 'medium',
      };
      const toast = await this.toastCtrl.create({
        message: messages[status],
        duration: 2400,
        color: colors[status],
        position: 'top',
        mode: 'ios',
      });
      await toast.present();
    } catch (err: any) {
      console.error('Errore salvataggio RSVP:', err);
      const toast = await this.toastCtrl.create({
        message:
          err?.message ||
          'Impossibile aggiornare la presenza. Verifica di avere un giocatore associato.',
        duration: 2800,
        color: 'danger',
        position: 'top',
        mode: 'ios',
      });
      await toast.present();
    } finally {
      this.isSavingRsvp.set(false);
    }
  }

  /**
   * Condivisione One-Tap minimale per invito convocati (WhatsApp / Web Share)
   */
  async condividiLinkInvito() {
    this.isPreparingInvite.set(true);
    try {
      const mId = await this.state.ensureMatchCreatedForInvite();
      if (!mId) {
        const toast = await this.toastCtrl.create({
          message: '⚠️ Partita non ancora salvata.',
          duration: 2200,
          color: 'warning',
          position: 'top',
        });
        await toast.present();
        return;
      }

      const currentMatch: any = {
        id: mId,
        dataPartita: this.state.dataPartita(),
        orario: this.state.orario(),
        convocati: this.state.convocati(),
        status: this.state.status(),
      };

      await this.shareService.shareMatch(currentMatch, true);
    } finally {
      this.isPreparingInvite.set(false);
    }
  }

  async copiaLinkInvito() {
    this.isPreparingInvite.set(true);
    try {
      const mId = await this.state.ensureMatchCreatedForInvite();
      if (!mId) return;
      const url = getMatchInviteDeepLink(mId);
      await this.copiaTestoNegliAppunti(
        url,
        '✅ Link invito copiato negli appunti!'
      );
    } finally {
      this.isPreparingInvite.set(false);
    }
  }

  private async copiaTestoNegliAppunti(text: string, successMsg: string) {
    let copied = false;
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch {
        copied = false;
      }
    }
    if (!copied && typeof document !== 'undefined') {
      try {
        const el = document.createElement('textarea');
        el.value = text;
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        copied = true;
      } catch {
        copied = false;
      }
    }

    const toast = await this.toastCtrl.create({
      message: copied ? successMsg : '❌ Impossibile copiare il link.',
      duration: 2400,
      color: copied ? 'success' : 'danger',
      position: 'top',
      mode: 'ios',
    });
    await toast.present();
  }

  async apriLoginOAssociazionePerRsvp() {
    const mId = this.state.matchId();
    const returnUrl = mId ? `/partite/${mId}?invite=true` : '/partite';
    this.auth.setReturnUrl(returnUrl);

    if (!this.auth.isLoggedIn()) {
      await this.router.navigate(['/login'], { queryParams: { returnUrl } });
      return;
    }

    const modal = await this.modalCtrl.create({
      component: AuthModalComponent,
      componentProps: {
        initialMode: 'login',
        openClaimPicker: true,
        returnUrl,
      },
      mode: 'ios',
    });
    await modal.present();
  }

  /**
   * DEV ONLY: Seleziona in 1 tap i primi 14 giocatori dalla classifica (o anagrafica)
   * per predisporre rapidamente una partita 7 vs 7 nei test di sviluppo.
   */
  async selezionaPrimi14Classifica() {
    if (!this.isAdmin) return;
    const currentSeason = this.state.stagione() || CURRENT_SEASON;
    const seasonLeaderboard =
      this.statsEngine.getLeaderboardBySeason(currentSeason);
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

    if (top14Ids.size < 14) {
      for (const g of tutti) {
        if (top14Ids.size >= 14) break;
        top14Ids.add(g.id);
      }
    }

    const giaTuttiSelezionati =
      top14Ids.size > 0 &&
      tutti.every((g) => top14Ids.has(g.id) === !!g.selezionato);

    if (giaTuttiSelezionati) {
      this.state.tutti.update((lista) =>
        lista.map((g) => ({ ...g, selezionato: false }))
      );
      this.state.triggerAutoSave();
      const toast = await this.toastCtrl.create({
        message: '⚡ DEV: Convocati deselezionati',
        duration: 1500,
        position: 'top',
      });
      await toast.present();
      return;
    }

    this.state.tutti.update((lista) =>
      lista.map((g) => {
        const isSelected = top14Ids.has(g.id);
        return {
          ...g,
          selezionato: isSelected,
          source: isSelected ? 'mister' : undefined,
          rsvpStatus: isSelected ? 'yes' : g.rsvpStatus,
        };
      })
    );

    const currentRsvp = { ...(this.state.rsvp() || {}) };
    for (const g of tutti) {
      const isSelected = top14Ids.has(g.id);
      const rsvpKey = g.linkedUid || ('player_' + g.id);
      if (isSelected) {
        currentRsvp[rsvpKey] = {
          uid: g.linkedUid || rsvpKey,
          playerId: g.id,
          playerName: g.nome,
          status: 'confirmed',
          source: 'mister',
          updatedAt: new Date().toISOString(),
        };
      }
    }
    this.state.rsvp.set(currentRsvp);
    this.state.triggerAutoSave(true);

    const toast = await this.toastCtrl.create({
      message: `⚡ DEV: Selezionati ${top14Ids.size} giocatori (Top Classifica) per 7 vs 7!`,
      duration: 2200,
      color: 'warning',
      position: 'top',
    });
    await toast.present();
  }
}
