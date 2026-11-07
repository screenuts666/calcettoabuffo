import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  effect,
  OnInit,
  OnDestroy,
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
  IonRow,
  IonCol,
  IonSpinner,
  IonBackButton,
  ToastController,
} from '@ionic/angular/standalone';
import { Subscription } from 'rxjs';
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
  helpCircleOutline,
  hourglassOutline,
  arrowBack,
  createOutline,
  cloudDoneOutline,
  timeOutline,
  checkmarkCircle,
  callOutline,
  logoWhatsapp,
} from 'ionicons/icons';
import { GiocatoreConPunti } from 'src/app/models/giocatore.model';
import { AuthService } from 'src/app/services/auth.service';
import {
  formatPhoneForTel,
  formatPhoneForWhatsAppUrl,
} from 'src/app/utils/whatsapp-formatter';
import { formatDataNascitaEdEta } from 'src/app/utils/date-utils';
import { GeminiService } from 'src/app/services/gemini.service';
import { TtsService } from 'src/app/services/tts.service';
import { StatsEngineService } from 'src/app/services/stats-engine.service';
import { formatAiMarkdown } from 'src/app/utils/ai-format.utils';
import { AiTtsButtonComponent } from '../../ai-tts-button/ai-tts-button.component';
import {
  getAvatarUrl,
  handleAvatarError,
} from 'src/app/utils/avatar-utils';
import { PlayerAvatarComponent } from '../../player-avatar/player-avatar.component';
import { ThemeToggleComponent } from '../../theme-toggle/theme-toggle.component';

@Component({
  selector: 'app-scheda-giocatore',
  templateUrl: './scheda-giocatore.component.html',
  styleUrls: ['./scheda-giocatore.component.scss'],
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
    IonBackButton,
    IonRow,
    IonCol,
    IonSpinner,
    AiTtsButtonComponent,
    PlayerAvatarComponent,
    ThemeToggleComponent,
  ],
})
export class SchedaGiocatoreComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  public auth = inject(AuthService);
  private geminiService = inject(GeminiService);
  private statsEngine = inject(StatsEngineService);
  private toastCtrl = inject(ToastController);
  private ttsService = inject(TtsService);

  private routeSub?: Subscription;
  private routeId = signal<string | null>(null);
  private _inputProf = signal<GiocatoreConPunti | null>(null);

  isClaiming = signal<boolean>(false);
  privatePhoneNumber = signal<string | null>(null);

  @Input() set prof(val: GiocatoreConPunti | any) {
    this._inputProf.set(val || null);
  }
  @Output() selezionaAltroGiocatore = new EventEmitter<string>();

  get isAdmin(): boolean {
    return this.auth.isAdmin();
  }

  get canEdit(): boolean {
    return this.auth.canEditPlayer(this.prof?.id);
  }

  get isMyPlayer(): boolean {
    return (
      !!this.prof?.id &&
      (this.auth.linkedPlayerId() === this.prof.id ||
        (!!this.prof.linkedUid &&
          this.prof.linkedUid === this.auth.firebaseUser()?.uid))
    );
  }

  get canViewPhone(): boolean {
    return this.auth.canViewPlayerPhone(this.prof);
  }

  getDataNascitaDisplay(prof?: any): string {
    return formatDataNascitaEdEta(prof);
  }

  getTelUrl(phone?: string | null): string {
    return formatPhoneForTel(phone);
  }

  getWhatsAppUrl(phone?: string | null): string {
    return formatPhoneForWhatsAppUrl(phone);
  }

  get canClaimThisPlayer(): boolean {
    if (!this.auth.isLoggedIn()) return false;
    if (this.auth.hasLinkedPlayer()) return false;
    if (!this.prof?.id) return false;
    return !this.prof.linkedUid;
  }

  readonly profileData = computed<GiocatoreConPunti | null>(() => {
    const input = this._inputProf();
    if (input) return input;
    const rId = this.routeId();
    if (rId) {
      return this.statsEngine.getGiocatoreProfile(rId);
    }
    return null;
  });

  get prof(): GiocatoreConPunti | any {
    return this.profileData();
  }

  getAvatar(fotoUrl?: string | null): string {
    return getAvatarUrl(fotoUrl);
  }

  onImgError(event: Event) {
    handleAvatarError(event);
  }

  readonly formatAiMarkdown = formatAiMarkdown;

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
      helpCircleOutline,
      hourglassOutline,
      arrowBack,
      createOutline,
      cloudDoneOutline,
      timeOutline,
      checkmarkCircle,
      callOutline,
      logoWhatsapp,
    });

    effect(() => {
      const p = this.profileData();
      const canSee = this.auth.canViewPlayerPhone(p);
      if (p?.id && canSee) {
        this.auth.getPlayerPhoneNumber(p.id).then((phone) => {
          if (this.profileData()?.id === p.id && this.auth.canViewPlayerPhone(p)) {
            this.privatePhoneNumber.set(phone);
          }
        });
      } else {
        this.privatePhoneNumber.set(null);
      }
    });
  }

  ngOnInit() {
    this.routeSub = this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (id) {
        this.routeId.set(id);
      }
    });
  }

  ngOnDestroy() {
    this.routeSub?.unsubscribe();
  }

  modificaGiocatore() {
    const p = this.prof;
    if (p?.id && this.canEdit) {
      this.router.navigate(['/giocatori', p.id, 'modifica']);
    }
  }

  async reclamaQuestoGiocatore() {
    const p = this.prof;
    if (!p?.id || this.isClaiming()) return;
    this.isClaiming.set(true);
    try {
      await this.auth.claimPlayer(p.id);
      const toast = await this.toastCtrl.create({
        message: `✅ Scheda di ${p.nome} associata al tuo account!`,
        duration: 2500,
        color: 'success',
        position: 'bottom',
      });
      await toast.present();
    } catch (err: any) {
      const toast = await this.toastCtrl.create({
        message: err?.message || 'Errore durante l\'associazione del giocatore.',
        duration: 3000,
        color: 'danger',
        position: 'bottom',
      });
      await toast.present();
    } finally {
      this.isClaiming.set(false);
    }
  }

  async generaScouting(force = false) {
    if (!this.prof?.id || this.isGeneratingScouting() || !this.isAdmin) return;
    this.isGeneratingScouting.set(true);

    try {
      const allMatches = this.statsEngine.partiteRaw() || [];
      const notes: string[] = [];
      for (const p of allMatches) {
        const pl = [...(p.teamA || []), ...(p.teamB || [])].find(
          (x: any) => x.id === this.prof.id
        );
        if (pl?.note && pl.note.trim()) {
          notes.push(pl.note.trim());
        }
      }

      const res = await this.geminiService.getOrGeneratePlayerScouting(
        this.prof,
        this.prof,
        notes,
        force
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
        message: this.geminiService.formatUserError(err),
        duration: 4000,
        color: 'warning',
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
      this.routeId.set(id);
      this.router.navigate(['/giocatori', id]);
    }
  }

  confronta(opponentId?: string) {
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

export { SchedaGiocatoreComponent as GiocatoreDetailPage };
