import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  calendarOutline,
  locationOutline,
  stopwatchOutline,
  timeOutline,
  logoWhatsapp,
  createOutline,
} from 'ionicons/icons';

@Component({
  selector: 'app-prestazioni-hero',
  templateUrl: './prestazioni-hero.component.html',
  styleUrls: ['./prestazioni-hero.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, IonIcon],
})
export class PrestazioniHeroComponent {
  @Input() dataPartita?: string;
  @Input() luogo?: string;
  @Input() timerFormatted?: string;
  @Input() orarioInizio?: string | null;
  @Input() orarioFine?: string | null;
  @Input() scoreA: number = 0;
  @Input() scoreB: number = 0;
  @Input() pagelleInserite: boolean = false;
  @Input() isAdmin: boolean = false;
  @Input() scorersA: { nome: string; gol: number }[] = [];
  @Input() scorersB: { nome: string; gol: number }[] = [];
  @Input() isUpset: boolean = false;
  @Input() upsetDescription?: string;
  @Input() meteo?: { emoji: string; temp: string; label: string; rainProbability?: number } | null;

  @Output() shareClick = new EventEmitter<void>();
  @Output() editScoreClick = new EventEmitter<void>();

  constructor() {
    addIcons({
      calendarOutline,
      locationOutline,
      stopwatchOutline,
      timeOutline,
      logoWhatsapp,
      createOutline,
    });
  }
}
