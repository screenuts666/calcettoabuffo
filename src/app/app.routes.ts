import { Routes } from '@angular/router';
import { superUserGuard } from './services/auth.service';

export const routes: Routes = [
  {
    path: 'area-segreta',
    canActivate: [superUserGuard],
    loadComponent: () =>
      import('./components/area-segreta/area-segreta.page').then(
        (m) => m.AreaSegretaPage,
      ),
  },
  {
    path: 'partite/nuova',
    loadComponent: () =>
      import('./components/partite/partita-detail/partita-detail.page').then(
        (m) => m.PartitaDetailPage,
      ),
  },
  {
    path: 'partite/:id',
    loadComponent: () =>
      import('./components/partite/partita-detail/partita-detail.page').then(
        (m) => m.PartitaDetailPage,
      ),
  },
  {
    path: 'giocatori/nuovo',
    loadComponent: () =>
      import('./components/rosa/form-giocatore/form-giocatore.component').then(
        (m) => m.FormGiocatoreComponent,
      ),
  },
  {
    path: 'giocatori/:id/modifica',
    loadComponent: () =>
      import('./components/rosa/form-giocatore/form-giocatore.component').then(
        (m) => m.FormGiocatoreComponent,
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
