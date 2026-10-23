import { Component, inject, ChangeDetectionStrategy, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, ToastController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  cloudDoneOutline,
  syncOutline,
  cloudOfflineOutline,
  fileTrayFullOutline,
  informationCircleOutline,
} from 'ionicons/icons';
import { SyncStatusService } from '../../services/sync-status.service';

@Component({
  selector: 'app-sync-status-badge',
  templateUrl: './sync-status-badge.component.html',
  styleUrls: ['./sync-status-badge.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, IonIcon],
})
export class SyncStatusBadgeComponent {
  public syncService = inject(SyncStatusService);
  private toastCtrl = inject(ToastController);

  @Input() compact = false;

  constructor() {
    addIcons({
      cloudDoneOutline,
      syncOutline,
      cloudOfflineOutline,
      fileTrayFullOutline,
      informationCircleOutline,
    });
  }

  async mostraDettaglioSync() {
    const stato = this.syncService.label();
    const saveTime = this.syncService.formattedLastSave();
    const isOnline = this.syncService.isOnline();

    let msg = `📡 <b>${stato}</b><br/>`;
    msg += `⏱️ Ultimo salvataggio locale: <b>${saveTime}</b><br/>`;

    if (!isOnline) {
      msg += `📶 Nessun campo al momento: tutti i gol, timer e formazioni sono salvati sul telefono e verranno caricati su Firebase appena torna la rete.`;
    } else {
      msg += `☁️ Connessione attiva: i dati sono sincronizzati con il database.`;
    }

    const toast = await this.toastCtrl.create({
      message: msg,
      duration: 4000,
      position: 'top',
      color: this.syncService.color(),
      cssClass: 'sync-status-toast',
      buttons: [
        {
          text: 'OK',
          role: 'cancel',
        },
      ],
    });
    await toast.present();
  }
}
