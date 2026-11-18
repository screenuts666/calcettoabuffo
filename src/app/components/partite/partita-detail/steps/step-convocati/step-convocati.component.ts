import {
  Component,
  inject,
  signal,
  computed,
  effect,
  isDevMode,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonSearchbar,
  IonIcon,
  IonSpinner,
  ToastController,
  ModalController,
  AlertController,
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
  checkmarkCircleOutline,
  closeCircleOutline,
  checkmarkDoneCircle,
  helpCircle,
  helpCircleOutline,
  shieldCheckmarkOutline,
  personAddOutline,
  linkOutline,
  paperPlaneOutline,
  peopleOutline,
  addCircleOutline,
  addOutline,
  checkmark,
  warningOutline,
  footballOutline,
  trashOutline,
  refreshOutline,
  lockClosedOutline,
  lockOpenOutline,
  medkit,
  medkitOutline,
} from 'ionicons/icons';
import { MatchStateService, ConvocatoState } from '../../match-state.service';
import { InjuriesService } from 'src/app/services/injuries.service';
import {
  getAvatarUrl,
  handleAvatarError,
} from '../../../../../utils/avatar-utils';
import { PlayerAvatarComponent } from '../../../../player-avatar/player-avatar.component';
import { environment } from 'src/environments/environment';
import { StatsEngineService } from 'src/app/services/stats-engine.service';
import { AuthService } from 'src/app/services/auth.service';
import { ShareService } from 'src/app/services/share.service';
import { AvailabilityService } from 'src/app/services/availability.service';
import { CURRENT_SEASON } from 'src/app/utils/season-utils';
import { getMatchInviteDeepLink } from 'src/app/utils/whatsapp-formatter';
import { getMatchFormatByPlayerCount, normalizeRsvpStatus } from 'src/app/models/partita.model';
import { AuthModalComponent } from '../../../../auth-modal/auth-modal.component';

@Component({
  selector: 'app-step-convocati',
  templateUrl: './step-convocati.component.html',
  styleUrls: ['./step-convocati.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonSearchbar,
    IonIcon,
    IonSpinner,
    PlayerAvatarComponent,
  ],
})
export class StepConvocatiComponent {
  @ViewChild('searchbarEl') searchbarEl?: IonSearchbar;

  public state = inject(MatchStateService);
  public auth = inject(AuthService);
  public injuriesService = inject(InjuriesService);
  private statsEngine = inject(StatsEngineService);
  private toastCtrl = inject(ToastController);
  private modalCtrl = inject(ModalController);
  private alertCtrl = inject(AlertController);
  private router = inject(Router);
  private shareService = inject(ShareService);

  apriSchedaGiocatore(id?: string) {
    if (id) {
      this.router.navigate(['/giocatori', id]);
    }
  }
  private availabilityService = inject(AvailabilityService, { optional: true });

  readonly isDev = !environment.production || isDevMode();
  isSavingRsvp = signal<boolean>(false);
  isPreparingInvite = signal<boolean>(false);
  filtroVista = signal<'tutti' | 'convocati' | 'non_convocati'>('tutti');

  /** Indica se il testo cercato non corrisponde esattamente a nessun giocatore già in rosa (Solo Mister/Presidente) */
  readonly canQuickCreateFromSearch = computed<boolean>(() => {
    if (!this.auth.isSuperUser()) return false;
    const q = this.state.filtro().trim();
    if (!q) return false;
    const lower = q.toLowerCase();
    return !this.state.tutti().some((g) => (g.nome || '').trim().toLowerCase() === lower);
  });

  svuotaRicerca(): void {
    if (this.state.filtro()) {
      this.state.filtro.set('');
    }
    if (this.searchbarEl) {
      this.searchbarEl.value = '';
    }
  }

  /**
   * Porta direttamente alla pagina ufficiale di creazione nuovo giocatore (/giocatori/nuovo),
   * salvando lo stato della partita e passando returnUrl + eventuale nome cercato,
   * così al salvataggio si ritorna sulla partita con il nuovo giocatore già aggiunto e convocato.
   */
  async apriNuovoGiocatoreModal(prefillName?: string): Promise<void> {
    if (!this.isAdmin) return;
    const candidate = (prefillName !== undefined ? prefillName : this.state.filtro()).trim();
    const formatted = candidate
      ? candidate
          .split(/\s+/)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ')
      : '';

    const mId = (await this.state.ensureMatchCreatedForInvite()) || this.state.matchId();
    this.svuotaRicerca();

    const returnUrl = mId ? `/partite/${mId}?step=convocati` : '/partite/nuova';
    const queryParams: Record<string, string> = { returnUrl };
    if (formatted) {
      queryParams['prefillName'] = formatted;
    }

    await this.router.navigate(['/giocatori', 'nuovo'], { queryParams });
  }

  getInjuryTooltip(g: ConvocatoState): string {
    return this.injuriesService.getInjuryBadgeText(g);
  }

  /** CAP massimo corrente (14 default per 7vs7, oppure 16 se sbloccato 8vs8) */
  readonly maxCap = computed<14 | 16>(() =>
    this.state.maxPlayers() === 16 ? 16 : 14
  );

  /** Flag indicante se il CAP massimo di convocati è stato raggiunto */
  readonly isCapReached = computed<boolean>(
    () => this.state.totaleConvocati() >= this.maxCap()
  );

  get isAdmin(): boolean {
    return this.auth.isSuperUser();
  }

  setFiltroVista(vista: 'tutti' | 'convocati' | 'non_convocati') {
    this.filtroVista.set(vista);
  }

  /** Conteggio giocatori non ancora convocati */
  readonly nonConvocatiCount = computed<number>(() =>
    Math.max(0, this.state.tutti().length - this.state.totaleConvocati())
  );

  /** Badge dinamico formato partita live (es. 10 -> 5 vs 5, 14 -> 7 vs 7, o avviso compatto Dispari: X) */
  readonly formatBadgeInfo = computed<{
    label: string;
    isOdd: boolean;
    isEmpty: boolean;
  }>(() => {
    const tot = this.state.totaleConvocati();
    if (tot === 0) {
      return { label: '0 convocati', isOdd: false, isEmpty: true };
    }
    if (tot % 2 !== 0) {
      return { label: `Dispari: ${tot}`, isOdd: true, isEmpty: false };
    }
    const half = tot / 2;
    return {
      label: `${half} vs ${half}`,
      isOdd: false,
      isEmpty: false,
    };
  });

  /** Lista convocati filtrata dalla searchbar (Sezione 1 in cima) */
  readonly convocatiFiltrati = computed<ConvocatoState[]>(() =>
    this.state.giocatoriFiltrati().filter((g) => g.selezionato)
  );

  /** Lista disponibili non convocati filtrata dalla searchbar (Sezione 2 subito sotto) */
  readonly disponibiliFiltrati = computed<ConvocatoState[]>(() => {
    const list = this.state.giocatoriFiltrati().filter((g) => !g.selezionato);
    return [...list].sort((a, b) => {
      const rank = (g: ConvocatoState) => {
        if (g.rsvpStatus === 'maybe') return 0;
        if (g.rsvpStatus === 'no') return 2;
        return 1;
      };
      const diff = rank(a) - rank(b);
      if (diff !== 0) return diff;
      return (a.nome || '').localeCompare(b.nome || '');
    });
  });

  getRuoloShort(ruolo?: string | null): string {
    if (!ruolo) return '';
    const r = ruolo.trim().toUpperCase();
    if (r.startsWith('POR')) return 'POR';
    if (r.startsWith('DIF')) return 'DIF';
    if (r.startsWith('CEN')) return 'CEN';
    if (r.startsWith('ATT')) return 'ATT';
    return r.slice(0, 3);
  }

  /** Giocatore della rosa associato all'utente loggato (per ID, linkedUid o nome profilo) */
  readonly myPlayer = computed<ConvocatoState | null>(() => {
    const pid = this.auth.linkedPlayerId();
    const uid = this.auth.firebaseUser()?.uid;
    const list = this.state.tutti();

    if (pid) {
      const byId = list.find((g) => g.id === pid);
      if (byId) return byId;
    }
    if (uid) {
      const byUid = list.find(
        (g) => g.linkedUid === uid || (g as any).uid === uid,
      );
      if (byUid) return byUid;
    }
    const dName = this.auth.displayName()?.toLowerCase().trim();
    if (
      dName &&
      dName !== 'tifoso' &&
      dName !== 'utente' &&
      dName !== 'mister'
    ) {
      const byName = list.find((g) => {
        const gn = g.nome?.toLowerCase().trim();
        const sn = g.soprannome?.toLowerCase().trim();
        return (
          gn === dName ||
          sn === dName ||
          (gn && (gn.startsWith(dName) || dName.startsWith(gn)))
        );
      });
      if (byName) return byName;
    }
    return null;
  });

  /** Verifica infallibile se il giocatore dell'utente corrente è già tra i convocati della partita */
  readonly isMyPlayerConvocato = computed<boolean>(() => {
    const p = this.myPlayer();
    if (p) {
      const live = this.state.tutti().find((g) => g.id === p.id);
      if (live?.selezionato) return true;
    }
    const pid = this.auth.linkedPlayerId();
    const uid = this.auth.firebaseUser()?.uid;
    const convocati = this.state.convocati();
    return convocati.some(
      (c) =>
        (p && c.id === p.id) ||
        (pid && (c.id === pid || (c as any).playerId === pid)) ||
        (uid && (c.linkedUid === uid || (c as any).uid === uid)),
    );
  });

  /** Stato RSVP attuale del giocatore loggato ('yes' | 'maybe' | 'no' | null) */
  readonly myRsvpStatus = computed<'yes' | 'maybe' | 'no' | null>(() => {
    // 1. Se il giocatore è convocato nella partita corrente, lo stato è SEMPRE 'yes'
    if (this.isMyPlayerConvocato()) {
      return 'yes';
    }

    // 2. Se non è convocato, verifica se ha risposto esplicitamente 'maybe' o 'no'
    const p = this.myPlayer();
    if (p?.rsvpStatus === 'maybe' || p?.rsvpStatus === 'no') {
      return p.rsvpStatus;
    }

    const uid = this.auth.firebaseUser()?.uid;
    const pid = this.auth.linkedPlayerId();
    const map = this.state.rsvp() || {};

    if (uid && map[uid]) {
      const s = normalizeRsvpStatus(map[uid].status);
      if (s) return s;
    }
    if (pid) {
      const byPid = Object.values(map).find((e) => e?.playerId === pid);
      if (byPid) {
        const s = normalizeRsvpStatus(byPid.status);
        if (s) return s;
      }
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
    addIcons({warningOutline,footballOutline,flashOutline,linkOutline,logoWhatsapp,copyOutline,helpCircleOutline,closeCircleOutline,trashOutline,medkit,checkmark,addOutline,peopleOutline,closeCircle,search,shareSocialOutline,checkmarkCircle,checkmarkCircleOutline,checkmarkDoneCircle,helpCircle,shieldCheckmarkOutline,personAddOutline,paperPlaneOutline,addCircleOutline,refreshOutline,lockClosedOutline,lockOpenOutline,});

    // Sincronizza in tempo reale i giocatori aggiunti/modificati in Rosa su Firestore
    // anche se la partita era già stata aperta o salvata in snapshot locale
    effect(() => {
      const liveGiocatori = this.statsEngine.giocatoriRaw() || [];
      if (liveGiocatori.length === 0) return;

      const currentTutti = this.state.tutti();
      if (currentTutti.length === 0) return;

      const currentIds = new Set(currentTutti.map((g) => g.id));
      const missingPlayers = liveGiocatori.filter((lg) => lg.id && !currentIds.has(lg.id));

      if (missingPlayers.length > 0) {
        this.state.tutti.update((lista) => {
          const ids = new Set(lista.map((g) => g.id));
          const toAdd: ConvocatoState[] = missingPlayers
            .filter((mp) => !ids.has(mp.id))
            .map((mp) => ({
              ...mp,
              selezionato: false,
            }));
          if (toAdd.length === 0) return lista;
          return [...lista, ...toAdd].sort((a, b) =>
            (a.nome || '').localeCompare(b.nome || '')
          );
        });
      }
    });
  }

  /**
   * Toggle Sblocco 16 posti (8vs8) / Limita a 14 (7vs7) per la partita corrente.
   * Azione riservata esclusivamente a Mister e Presidente.
   */
  async toggleMaxCap(): Promise<void> {
    if (!this.isAdmin) return;
    const current = this.maxCap();
    const next: 14 | 16 = current === 14 ? 16 : 14;

    if (next === 14 && this.state.totaleConvocati() > 14) {
      const toast = await this.toastCtrl.create({
        message: `Ci sono attualmente ${this.state.totaleConvocati()} convocati. Rimuovi prima i giocatori in eccesso per tornare a Max 14.`,
        duration: 3000,
        color: 'warning',
        position: 'top',
        mode: 'ios',
      });
      await toast.present();
      return;
    }

    this.state.maxPlayers.set(next);
    this.state.triggerAutoSave(true);

    const dataP = this.state.dataPartita();
    if (dataP && this.availabilityService) {
      try {
        await this.availabilityService.setDayEightVsEight(dataP, next === 16);
      } catch (e) {
        console.warn('Errore sync disponibilita cap:', e);
      }
    }

    const toast = await this.toastCtrl.create({
      message:
        next === 16
          ? '🔓 Sbloccati 16 posti (8vs8)! Ora puoi convocare il 15° e 16° giocatore.'
          : '🔒 Limite riportato a 14 giocatori (7vs7 standard).',
      duration: 2200,
      color: next === 16 ? 'success' : 'medium',
      position: 'top',
      mode: 'ios',
    });
    await toast.present();
  }

  async toggleSelezione(giocatore: ConvocatoState): Promise<void> {
    if (!this.isAdmin) return;

    // Se si sta aggiungendo un giocatore ma il CAP è già stato raggiunto
    if (!giocatore.selezionato && this.isCapReached()) {
      const cap = this.maxCap();
      const message =
        cap === 14
          ? 'Limite di 14 raggiunto. Sblocca il formato a 16 (8vs8) in alto o rimuovi un convocato.'
          : 'Limite di 16 raggiunto (8vs8). Rimuovi un convocato per aggiungerne un altro.';
      const toast = await this.toastCtrl.create({
        message,
        duration: 2800,
        color: 'warning',
        position: 'top',
        mode: 'ios',
      });
      await toast.present();
      return;
    }

    // Se si sta aggiungendo un giocatore che risulta attualmente infortunato:
    // mostra un avviso/dialog a Mister e Presidente proponendo di chiudere automaticamente l'infortunio
    if (!giocatore.selezionato && giocatore.isInjured) {
      const matchDate = this.state.dataPartita() || this.injuriesService.getTodayString();
      const matchDateFmt = this.injuriesService.formatDateDisplay(matchDate);
      const alert = await this.alertCtrl.create({
        header: 'Giocatore Infortunato',
        subHeader: `${giocatore.nome} è in infermeria`,
        message: `Stai per inserire ${giocatore.nome} tra i convocati. Vuoi dichiararlo guarito e chiudere automaticamente l'infortunio alla data della gara (${matchDateFmt})?`,
        mode: 'ios',
        buttons: [
          {
            text: 'Mantieni infortunato',
            role: 'cancel',
            handler: () => {
              this.eseguiSelezioneConvocato(giocatore);
            },
          },
          {
            text: 'Sì, segna recuperato',
            handler: async () => {
              try {
                await this.injuriesService.segnaRecuperato(giocatore, matchDate);
                giocatore.isInjured = false;
                giocatore.currentInjury = null;
                const toast = await this.toastCtrl.create({
                  message: `Infortunio di ${giocatore.nome} chiuso con successo alla data del match.`,
                  duration: 2800,
                  color: 'success',
                  position: 'top',
                  mode: 'ios',
                });
                await toast.present();
              } catch (err: any) {
                console.warn('Errore chiusura automatica infortunio:', err);
              }
              this.eseguiSelezioneConvocato(giocatore);
            },
          },
        ],
      });
      await alert.present();
      return;
    }

    this.eseguiSelezioneConvocato(giocatore);
  }

  private eseguiSelezioneConvocato(giocatore: ConvocatoState) {
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

    // Se l'utente aveva filtrato un giocatore nella barra di ricerca e lo ha selezionato, svuota subito il filtro
    if (this.state.filtro().trim() !== '') {
      this.svuotaRicerca();
    }

    this.state.triggerAutoSave(true);
  }

  /**
   * Risposta Auto-RSVP del giocatore loggato ('yes' = Partecipo, 'maybe' = Forse, 'no' = Non partecipo).
   * Modificabile in qualsiasi momento finché la partita è nello step 'convocati'.
   */
  async toggleMioRsvp(target: 'yes' | 'no'): Promise<void> {
    const p = this.myPlayer();
    if (this.isAdmin && p) {
      await this.toggleSelezione(p);
      return;
    }
    if (this.isMyPlayerConvocato()) {
      await this.impostaMioRsvp('no');
    } else {
      await this.impostaMioRsvp('yes');
    }
  }

  getMaybeNamesShort(): string {
    const list = this.maybePlayers();
    if (list.length === 0) return '';
    const names = list.map((p) => p.nome || p.soprannome);
    if (names.length <= 3) return names.join(', ');
    return `${names.slice(0, 3).join(', ')} e altri ${names.length - 3}`;
  }

  sollecitaForseWhatsApp(): void {
    if (!this.isAdmin) return;
    const forse = this.maybePlayers();
    if (forse.length === 0) return;
    const names = forse.map((p) => p.nome || p.soprannome).join(', ');
    const dataFmt = this.state.dataPartita() || 'la prossima gara';
    const orario = this.state.orario() ? ` alle ${this.state.orario()}` : '';
    const mId = this.state.matchId();
    const link = mId ? `\n\nLink convocazioni: ${getMatchInviteDeepLink(mId)}` : '';

    const text = `⚽ *Calcetto Abbuffo - Sollecito Convocazioni*\nCiao ragazzi! Per la partita del ${dataFmt}${orario} risultate ancora in forse:\n👉 ${names}\n\nConfermate se ci siete per chiudere le squadre! 💪${link}`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  }

  async impostaMioRsvp(status: 'yes' | 'maybe' | 'no') {
    if (this.isSavingRsvp() || this.state.step() !== 'convocati') return;

    if (
      status === 'yes' &&
      this.isCapReached() &&
      !this.isMyPlayerConvocato()
    ) {
      const cap = this.maxCap();
      const toast = await this.toastCtrl.create({
        message: `⚠️ La partita è al completo (${cap}/${cap}). Non è possibile confermare la presenza.`,
        duration: 2800,
        color: 'warning',
        position: 'top',
        mode: 'ios',
      });
      await toast.present();
      return;
    }

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
      const nome =
        this.myPlayer()?.nome ||
        this.auth.displayName() ||
        'Te';
      const messages: Record<'yes' | 'maybe' | 'no', string> = {
        yes: `${nome} inserito tra i convocati`,
        maybe: `${nome} impostato in forse`,
        no: `${nome} rimosso dai convocati`,
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
   * DEV / QUICK ACTION: Seleziona in 1 tap i primi giocatori dalla classifica (Top 14 o Top 16)
   * in base al CAP massimo impostato.
   */
  async selezionaPrimiClassifica() {
    if (!this.isAdmin || !this.isDev) return;
    const targetCap = this.maxCap();
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
    const topIds = new Set<string>();

    for (const id of rankedIds) {
      if (topIds.size >= targetCap) break;
      if (tutti.some((g) => g.id === id)) {
        topIds.add(id);
      }
    }

    if (topIds.size < targetCap) {
      for (const g of tutti) {
        if (topIds.size >= targetCap) break;
        topIds.add(g.id);
      }
    }

    const giaTuttiSelezionati =
      topIds.size > 0 &&
      tutti.every((g) => topIds.has(g.id) === !!g.selezionato);

    if (giaTuttiSelezionati) {
      this.state.tutti.update((lista) =>
        lista.map((g) => ({ ...g, selezionato: false }))
      );
      this.state.triggerAutoSave();
      const toast = await this.toastCtrl.create({
        message: '⚡ Convocati deselezionati',
        duration: 1500,
        position: 'top',
      });
      await toast.present();
      return;
    }

    this.state.tutti.update((lista) =>
      lista.map((g) => {
        const isSelected = topIds.has(g.id);
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
      const isSelected = topIds.has(g.id);
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

    const formatLabel = targetCap === 16 ? '8 vs 8' : '7 vs 7';
    const toast = await this.toastCtrl.create({
      message: `⚡ Selezionati ${topIds.size} giocatori (Top Classifica) per ${formatLabel}!`,
      duration: 2200,
      color: 'warning',
      position: 'top',
    });
    await toast.present();
  }

  /** Alias retro-compatibile */
  async selezionaPrimi14Classifica() {
    return this.selezionaPrimiClassifica();
  }

  /**
   * Apre il dialog di conferma per azzerare tutti i giocatori convocati (Solo Mister e Presidente).
   */
  async confermaSvuotaConvocati(): Promise<void> {
    const tot = this.state.totaleConvocati();
    if (!this.isAdmin || tot === 0) return;

    const alert = await this.alertCtrl.create({
      header: 'Svuota tutti i convocati?',
      message: `Stai per rimuovere tutti i ${tot} giocatori convocati e riportare la partita a zero. Vuoi procedere?`,
      mode: 'ios',
      buttons: [
        {
          text: 'Annulla',
          role: 'cancel',
        },
        {
          text: 'Sì, svuota tutto',
          role: 'destructive',
          handler: async () => {
            await this.state.svuotaTuttiConvocati();
            const toast = await this.toastCtrl.create({
              message: 'Convocati azzerati',
              duration: 2200,
              color: 'medium',
              position: 'top',
              mode: 'ios',
            });
            await toast.present();
          },
        },
      ],
    });

    await alert.present();
  }
}
