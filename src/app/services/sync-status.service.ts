import { Injectable, signal, computed } from '@angular/core';

export type TSyncState = 'synced' | 'syncing' | 'saved_locally' | 'offline';

@Injectable({
  providedIn: 'root',
})
export class SyncStatusService {
  readonly isOnline = signal<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  readonly syncState = signal<TSyncState>(
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'synced',
  );
  readonly lastLocalSaveTime = signal<Date | null>(null);
  readonly pendingChanges = signal<number>(0);

  private syncDebounceTimer?: any;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline.set(true);
        if (this.pendingChanges() > 0 || this.syncState() === 'saved_locally') {
          this.syncState.set('syncing');
        } else {
          this.syncState.set('synced');
        }
      });

      window.addEventListener('offline', () => {
        this.isOnline.set(false);
        this.syncState.set('offline');
      });
    }
  }

  notifyLocalSave(): void {
    this.lastLocalSaveTime.set(new Date());
    if (!this.isOnline()) {
      this.syncState.set('saved_locally');
    } else {
      this.syncState.set('syncing');
      if (this.syncDebounceTimer) clearTimeout(this.syncDebounceTimer);
      // Ritorna a 'synced' automaticamente dopo breve conferma se non ci sono errori
      this.syncDebounceTimer = setTimeout(() => {
        if (this.isOnline() && this.pendingChanges() === 0) {
          this.syncState.set('synced');
        }
      }, 1400);
    }
  }

  notifySyncPending(): void {
    this.pendingChanges.update((c) => c + 1);
    if (this.isOnline()) {
      this.syncState.set('syncing');
    } else {
      this.syncState.set('saved_locally');
    }
  }

  notifySyncSuccess(): void {
    this.pendingChanges.set(0);
    if (this.isOnline()) {
      this.syncState.set('synced');
    } else {
      this.syncState.set('saved_locally');
    }
  }

  notifySyncError(): void {
    // In caso di errore di rete/timeout, i dati rimangono comunque salvi in locale
    if (!this.isOnline()) {
      this.syncState.set('offline');
    } else {
      this.syncState.set('saved_locally');
    }
  }

  readonly label = computed<string>(() => {
    switch (this.syncState()) {
      case 'synced':
        return 'Online · Sincronizzato';
      case 'syncing':
        return 'Sincronizzazione...';
      case 'saved_locally':
        return 'Salvato in locale (In coda)';
      case 'offline':
        return 'Offline · Dati al sicuro';
    }
  });

  readonly shortLabel = computed<string>(() => {
    switch (this.syncState()) {
      case 'synced':
        return 'Sincronizzato';
      case 'syncing':
        return 'In sync...';
      case 'saved_locally':
        return 'Locale (coda)';
      case 'offline':
        return 'Offline (sicuro)';
    }
  });

  readonly iconName = computed<string>(() => {
    switch (this.syncState()) {
      case 'synced':
        return 'cloud-done-outline';
      case 'syncing':
        return 'sync-outline';
      case 'saved_locally':
        return 'file-tray-full-outline';
      case 'offline':
        return 'cloud-offline-outline';
    }
  });

  readonly color = computed<'success' | 'warning' | 'medium' | 'danger'>(() => {
    switch (this.syncState()) {
      case 'synced':
        return 'success';
      case 'syncing':
      case 'saved_locally':
        return 'warning';
      case 'offline':
        return 'medium';
    }
  });

  readonly formattedLastSave = computed<string>(() => {
    const d = this.lastLocalSaveTime();
    if (!d) return 'Nessun salvataggio recente';
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    const ss = d.getSeconds().toString().padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  });
}
