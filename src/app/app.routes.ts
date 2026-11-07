import { Routes } from '@angular/router';
import {
  superUserGuard,
  superUserMatchGuard,
  canEditPlayerGuard,
  canCreatePlayerGuard,
} from './services/auth.service';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./components/auth-modal/auth-modal.component').then(
        (m) => m.AuthModalComponent
      ),
  },
  {
    path: 'impostazioni',
    loadComponent: () =>
      import('./components/impostazioni-modal/impostazioni-modal.component').then(
        (m) => m.ImpostazioniModalComponent
      ),
  },
  {
    path: 'match/:id',
    redirectTo: 'partite/:id',
    pathMatch: 'full',
  },
  {
    path: 'area-segreta',
    canMatch: [superUserMatchGuard],
    canActivate: [superUserGuard],
    loadComponent: () =>
      import('./components/area-segreta/area-segreta.page').then(
        (m) => m.AreaSegretaPage
      ),
  },
  {
    path: 'partite/nuova',
    canActivate: [superUserGuard],
    loadComponent: () =>
      import('./components/partite/partita-detail/partita-detail.page').then(
        (m) => m.PartitaDetailPage
      ),
  },
  {
    path: 'partite/:id',
    loadComponent: () =>
      import('./components/partite/partita-detail/partita-detail.page').then(
        (m) => m.PartitaDetailPage
      ),
  },
  {
    path: 'giocatori/nuovo',
    canActivate: [canCreatePlayerGuard],
    loadComponent: () =>
      import('./components/rosa/form-giocatore/form-giocatore.component').then(
        (m) => m.FormGiocatoreComponent
      ),
  },
  {
    path: 'giocatori/:id/modifica',
    canActivate: [canEditPlayerGuard],
    loadComponent: () =>
      import('./components/rosa/form-giocatore/form-giocatore.component').then(
        (m) => m.FormGiocatoreComponent
      ),
  },
  {
    path: 'giocatori/:id',
    loadComponent: () =>
      import(
        './components/classifica/scheda-giocatore/scheda-giocatore.component'
      ).then((m) => m.SchedaGiocatoreComponent),
  },
  {
    path: '',
    loadChildren: () =>
      import('./components/tabs/tabs.routes').then((m) => m.routes),
  },
];
