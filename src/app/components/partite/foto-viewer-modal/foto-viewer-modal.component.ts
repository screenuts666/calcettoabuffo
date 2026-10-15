import { Component, Input, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonIcon,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { close, openOutline, downloadOutline } from 'ionicons/icons';

@Component({
  selector: 'app-foto-viewer-modal',
  templateUrl: './foto-viewer-modal.component.html',
  styleUrls: ['./foto-viewer-modal.component.scss'],
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
  ],
})
export class FotoViewerModalComponent {
  private modalCtrl = inject(ModalController);

  @Input() fotoUrl: string = '';
  @Input() dataPartita: string = '';
  @Input() luogo: string = '';
  @Input() risultato?: string;

  constructor() {
    addIcons({ close, openOutline, downloadOutline });
  }

  chiudi() {
    this.modalCtrl.dismiss();
  }

  apriInNuovaScheda() {
    if (this.fotoUrl) {
      window.open(this.fotoUrl, '_blank');
    }
  }
}
