import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonAvatar, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  trophy,
  football,
  createOutline,
  logoWhatsapp,
} from 'ionicons/icons';
import { MatchReportPlayer } from '../../../../../../../models/mmr.model';
import { PlayerAvatarComponent, MatchPhotoComponent } from '../../../../../../../shared/components';

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
  ],
})
export class PrestazioniTabSintesiComponent {
  @Input() mvp: MatchReportPlayer | null = null;
  @Input() worst: MatchReportPlayer | null = null;
  @Input() eventiGol: any[] = [];
  @Input() isAdmin: boolean = false;
  @Input() gkSummary?: { summaryA: string; summaryB: string } | null = null;

  @Output() shareClick = new EventEmitter<void>();
  @Output() editAssistClick = new EventEmitter<number>();

  constructor() {
    addIcons({
      trophy,
      football,
      createOutline,
      logoWhatsapp,
    });
  }
}
