import { Component, inject } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { SwUpdate } from '@angular/service-worker';
import { ThemeService } from './services/theme.service';

let ariaHiddenFocusGuardInstalled = false;

function installAriaHiddenFocusGuard(): void {
  if (ariaHiddenFocusGuardInstalled || typeof Element === 'undefined') {
    return;
  }
  ariaHiddenFocusGuardInstalled = true;

  const origSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name: string, value: string) {
    if (
      name === 'aria-hidden' &&
      value === 'true' &&
      typeof document !== 'undefined' &&
      document.activeElement &&
      this.contains(document.activeElement)
    ) {
      const active = document.activeElement as HTMLElement & {
        shadowRoot?: ShadowRoot | null;
      };
      (active.shadowRoot?.activeElement as HTMLElement | null)?.blur?.();
      active.blur?.();
    }
    return origSetAttribute.call(this, name, value);
  };
}

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  private themeService = inject(ThemeService);
  private swUpdate = inject(SwUpdate);
  private router = inject(Router);

  constructor() {
    installAriaHiddenFocusGuard();

    this.router.events.subscribe((evt) => {
      if (evt instanceof NavigationStart && typeof document !== 'undefined') {
        const active = document.activeElement as HTMLElement | null;
        active?.blur?.();
      }
    });

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
