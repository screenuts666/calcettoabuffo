import { Component, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { SwUpdate } from '@angular/service-worker';
import { ThemeService } from './services/theme.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  private themeService = inject(ThemeService);
  private swUpdate = inject(SwUpdate);

  constructor() {
    if (this.swUpdate.isEnabled) {
      this.swUpdate.versionUpdates.subscribe((evt) => {
        if (evt.type === 'VERSION_READY') {
          this.swUpdate.activateUpdate().then(() => {
            document.location.reload();
          });
        }
      });
      this.swUpdate.checkForUpdate().catch(() => {});
    }
  }
}
