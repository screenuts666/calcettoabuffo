import { Routes } from '@angular/router';
import { TabsPage } from './tabs.page';
import { PartitePage } from '../partite/partite.page';

export const routes: Routes = [
  {
    path: '',
    component: TabsPage,
    children: [
      {
        path: 'partite',
        component: PartitePage,
      },
      {
        path: 'disponibilita',
        loadComponent: () =>
          import('../disponibilita/disponibilita.page').then((m) => m.DisponibilitaPage),
      },
      {
        path: 'calendario',
        redirectTo: 'disponibilita',
        pathMatch: 'full',
      },
      {
        path: 'classifica',
        loadComponent: () =>
          import('../classifica/classifica.page').then((m) => m.ClassificaPage),
      },
      {
        path: 'confronto',
        loadComponent: () =>
          import('../confronto/confronto.page').then((m) => m.ConfrontoPage),
      },
      {
        path: 'confronto/:p1/:p2',
        loadComponent: () =>
          import('../confronto/confronto.page').then((m) => m.ConfrontoPage),
      },
      {
        path: '1v1',
        redirectTo: 'confronto',
        pathMatch: 'full',
      },
      {
        path: '1v1/:p1/:p2',
        loadComponent: () =>
          import('../confronto/confronto.page').then((m) => m.ConfrontoPage),
      },
      {
        path: 'chimica/:p1/:p2',
        loadComponent: () =>
          import('../classifica/dettaglio-chimica/dettaglio-chimica.page').then(
            (m) => m.DettaglioChimicaPage,
          ),
      },
      {
        path: 'rosa',
        loadComponent: () =>
          import('../rosa/rosa.page').then((m) => m.RosaPage),
      },
      {
        path: '',
        redirectTo: '/partite',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: '',
    redirectTo: '/partite',
    pathMatch: 'full',
  },
];
