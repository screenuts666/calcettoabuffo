import { Component, inject, ChangeDetectionStrategy, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, AlertController } from '@ionic/angular/standalone';
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
  private alertCtrl = inject(AlertController);

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
    const syncState = this.syncService.syncState();
    const saveTime = this.syncService.formattedLastSave();
    const isOnline = this.syncService.isOnline();

    let headerTitle = '☁️ Database Sincronizzato';
    if (syncState === 'syncing') {
      headerTitle = '🔄 Sincronizzazione in Corso';
    } else if (syncState === 'saved_locally') {
      headerTitle = '💾 Dati Salvati in Locale';
    } else if (!isOnline || syncState === 'offline') {
      headerTitle = '📶 Modalità Offline (Al Sicuro)';
    }

    let detailExplanation = '';
    if (!isOnline || syncState === 'offline') {
      detailExplanation =
        'Nessuna connessione internet disponibile al momento. Non ti preoccupare: tutti i gol, il timer, le formazioni e i cambi portiere sono registrati al sicuro nella memoria del tuo telefono e verranno caricati automaticamente su Firebase non appena tornerà il segnale di rete.';
    } else if (syncState === 'syncing') {
      detailExplanation =
        'Allineamento dei dati del match con il cloud in corso in background. Le ultime modifiche sono state trasmesse.';
    } else if (syncState === 'saved_locally') {
      detailExplanation =
        'Le modifiche sono state salvate sul dispositivo e sono in coda per essere inviate al cloud.';
    } else {
      detailExplanation =
        'Connessione attiva e stabile. Tutti i gol, assist, rotazioni dei portieri e minuti di gioco sono salvati e sincronizzati in tempo reale con il database cloud.';
    }

    const messageLines = [
      `⏱️ Ultimo salvataggio: ${saveTime}`,
      `🌐 Connessione: ${isOnline ? 'Online (attiva)' : 'Offline (nessun campo)'}`,
      '',
      detailExplanation,
    ].join('\n');

    const alert = await this.alertCtrl.create({
      header: headerTitle,
      subHeader: 'Stato Sincronizzazione Partita',
      message: messageLines,
      cssClass: 'sync-status-alert',
      buttons: [
        {
          text: 'Ho Capito',
          role: 'cancel',
        },
      ],
    });
    await alert.present();
  }
}
