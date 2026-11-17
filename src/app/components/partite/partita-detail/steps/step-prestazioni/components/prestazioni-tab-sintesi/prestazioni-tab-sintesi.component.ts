import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonAvatar, IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  trophy,
  football,
  createOutline,
  logoWhatsapp,
  micOutline,
  sparkles,
  refreshOutline,
  arrowForwardOutline,
  chatbubblesOutline,
  cloudDoneOutline,
} from 'ionicons/icons';
import { MatchReportPlayer } from '../../../../../../../models/mmr.model';
import { PlayerAvatarComponent, MatchPhotoComponent } from '../../../../../../../shared/components';
import { TacticalPitchComponent } from '../../../../../tactical-pitch/tactical-pitch.component';

@Component({
  selector: 'app-prestazioni-tab-sintesi',
  templateUrl: './prestazioni-tab-sintesi.component.html',
  styleUrls: ['./prestazioni-tab-sintesi.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    IonAvatar,
    IonIcon,
    PlayerAvatarComponent,
    MatchPhotoComponent,
    TacticalPitchComponent,
  ],
})
export class PrestazioniTabSintesiComponent {
  @Input() match: any = null;
  @Input() mvp: MatchReportPlayer | null = null;
  @Input() worst: MatchReportPlayer | null = null;
  @Input() eventiGol: any[] = [];
  @Input() isAdmin: boolean = false;
  @Input() gkSummary?: { summaryA: string; summaryB: string } | null = null;

  /**
   * Mostra/nasconde la piantina tattica della squadra (temporaneamente disabilitata su richiesta UI, codice preservato).
   */
  readonly showTacticalPitch = false;

  @Output() shareClick = new EventEmitter<void>();
  @Output() editAssistClick = new EventEmitter<number>();

  private router = inject(Router);

  apriSchedaGiocatore(id?: string | null) {
    if (id) {
      this.router.navigate(['/giocatori', id]);
    }
  }

  constructor() {
    addIcons({
      trophy,
      football,
      createOutline,
      logoWhatsapp,
    });
  }
}
