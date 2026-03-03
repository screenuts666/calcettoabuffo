import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
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
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { close, trophy, analytics, football, people } from 'ionicons/icons';

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
  ],
})
export class SchedaGiocatoreComponent {
  @Input() prof: any;
  @Input() chiudiModale!: () => void;

  constructor() {
    addIcons({ close, trophy, analytics, football, people });
  }
}
