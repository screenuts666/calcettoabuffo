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
      import('./components/impostazioni/impostazioni.page').then(
        (m) => m.ImpostazioniPage
      ),
  },
  {
    path: 'account',
    redirectTo: 'impostazioni',
    pathMatch: 'full',
  },
  {
    path: 'calendario',
    redirectTo: 'disponibilita',
    pathMatch: 'full',
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
      import('./components/rosa/form-giocatore/form-giocatore.page').then(
        (m) => m.FormGiocatorePage
      ),
  },
  {
    path: 'giocatori/:id/modifica',
    canActivate: [canEditPlayerGuard],
    loadComponent: () =>
      import('./components/rosa/form-giocatore/form-giocatore.page').then(
        (m) => m.FormGiocatorePage
      ),
  },
  {
    path: 'giocatori/:id',
    loadComponent: () =>
      import(
        './components/classifica/scheda-giocatore/scheda-giocatore.page'
      ).then((m) => m.SchedaGiocatorePage),
  },
  {
    path: 'chimica/:p1/:p2',
    loadComponent: () =>
      import(
        './components/classifica/dettaglio-chimica/dettaglio-chimica.page'
      ).then((m) => m.DettaglioChimicaPage),
  },
  {
    path: '1v1/:p1/:p2',
    loadComponent: () =>
      import('./components/confronto/confronto.page').then(
        (m) => m.ConfrontoPage
      ),
  },
  {
    path: '1v1',
    redirectTo: 'confronto',
    pathMatch: 'full',
  },
  {
    path: 'confronto/:p1/:p2',
    loadComponent: () =>
      import('./components/confronto/confronto.page').then(
        (m) => m.ConfrontoPage
      ),
  },
  {
    path: '',
    loadChildren: () =>
      import('./components/tabs/tabs.routes').then((m) => m.routes),
  },
];
