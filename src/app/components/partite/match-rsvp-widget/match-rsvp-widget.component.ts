import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore } from '@angular/fire/firestore';
import { doc, updateDoc } from 'firebase/firestore';
import {
  IonIcon,
  IonSpinner,
  ToastController,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  checkmarkCircle,
  helpCircle,
  closeCircle,
  peopleOutline,
  footballOutline,
} from 'ionicons/icons';
import { AuthService } from '../../../services/auth.service';
import { StatsEngineService } from '../../../services/stats-engine.service';
import { MatchRsvpEntry, RsvpStatus } from '../../../models/partita.model';
import { AuthModalComponent } from '../../auth-modal/auth-modal.component';

@Component({
  selector: 'app-match-rsvp-widget',
  templateUrl: './match-rsvp-widget.component.html',
  styleUrls: ['./match-rsvp-widget.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class MatchRsvpWidgetComponent {
  public authService = inject(AuthService);
  private firestore = inject(Firestore);
  private statsEngine = inject(StatsEngineService);
  private toastCtrl = inject(ToastController);
  private modalCtrl = inject(ModalController);

  private _matchId = signal<string | null>(null);
  private _rsvpMap = signal<Record<string, MatchRsvpEntry>>({});
  private _matchConcluso = signal<boolean>(false);

  @Input() set matchId(val: string | null | undefined) {
    this._matchId.set(val || null);
  }
  get matchId(): string | null {
    return this._matchId();
  }

  @Input() set rsvpMap(val: Record<string, MatchRsvpEntry> | null | undefined) {
    this._rsvpMap.set(val || {});
  }

  @Input() set matchConcluso(val: boolean | undefined) {
    this._matchConcluso.set(!!val);
  }
  get isConcluso(): boolean {
    return this._matchConcluso();
  }

  @Output() rsvpUpdated = new EventEmitter<Record<string, MatchRsvpEntry>>();

  isSaving = signal<boolean>(false);

  readonly entries = computed<MatchRsvpEntry[]>(() => {
    const map = this._rsvpMap() || {};
    return Object.values(map).filter((e) => !!e && !!e.uid);
  });

  readonly confirmedList = computed<MatchRsvpEntry[]>(() =>
    this.entries().filter((e) => e.status === 'confirmed')
  );

  readonly maybeList = computed<MatchRsvpEntry[]>(() =>
    this.entries().filter((e) => e.status === 'maybe')
  );

  readonly declinedList = computed<MatchRsvpEntry[]>(() =>
    this.entries().filter((e) => e.status === 'declined')
  );

  readonly myRsvp = computed<MatchRsvpEntry | null>(() => {
    const uid = this.authService.firebaseUser()?.uid;
    if (!uid) return null;
    return (this._rsvpMap() || {})[uid] || null;
  });

  constructor() {
    addIcons({
      checkmarkCircle,
      helpCircle,
      closeCircle,
      peopleOutline,
      footballOutline,
    });
  }

  async setMyRsvp(status: 'confirmed' | 'maybe' | 'declined') {
    const mId = this._matchId();
    const user = this.authService.firebaseUser();
    const playerId = this.authService.linkedPlayerId();

    if (!mId || !user || !playerId || this.isSaving() || this.isConcluso) {
      return;
    }

    const playerObj = (this.statsEngine.giocatoriRaw() || []).find(
      (g) => g.id === playerId
    );
    const playerName =
      playerObj?.nome || this.authService.displayName() || 'Atleta';

    const entry: MatchRsvpEntry = {
      uid: user.uid,
      playerId,
      playerName,
      status,
      updatedAt: new Date().toISOString(),
      respondedVia: 'app',
    };

    this.isSaving.set(true);
    try {
      // Field-level update esclusivamente su `rsvp.<uid>` come richiesto da `firestore.rules`
      await updateDoc(doc(this.firestore, `partite/${mId}`), {
        [`rsvp.${user.uid}`]: entry,
      });

      const updatedMap = {
        ...(this._rsvpMap() || {}),
        [user.uid]: entry,
      };
      this._rsvpMap.set(updatedMap);
      this.rsvpUpdated.emit(updatedMap);

      const labels: Record<string, string> = {
        confirmed: '⚽ Presenza confermata! Ci vediamo in campo.',
        maybe: '🤔 Presenza impostata come "In forse".',
        declined: '❌ Assenza registrata per questa partita.',
      };
      const toast = await this.toastCtrl.create({
        message: labels[status] || 'RSVP aggiornato',
        duration: 2200,
        position: 'bottom',
        mode: 'ios',
        color:
          status === 'confirmed'
            ? 'success'
            : status === 'maybe'
              ? 'warning'
              : 'medium',
      });
      await toast.present();
    } catch (err: any) {
      console.error('Errore salvataggio RSVP:', err);
      const toast = await this.toastCtrl.create({
        message:
          'Impossibile salvare la risposta RSVP. Verifica di avere un giocatore associato.',
        duration: 2800,
        position: 'bottom',
        mode: 'ios',
        color: 'danger',
      });
      await toast.present();
    } finally {
      this.isSaving.set(false);
    }
  }

  async apriLoginOAssociazione() {
    const modal = await this.modalCtrl.create({
      component: AuthModalComponent,
      componentProps: {
        initialMode: 'login',
        openClaimPicker: this.authService.isLoggedIn(),
      },
      mode: 'ios',
    });
    await modal.present();
  }
}

