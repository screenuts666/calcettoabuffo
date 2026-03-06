import { Routes } from '@angular/router';
import { TabsPage } from './tabs.page';

export const routes: Routes = [
  {
    path: '',
    component: TabsPage,
    children: [
      {
        path: 'partite',
        loadComponent: () =>
          import('../partite/partite.page').then((m) => m.PartitePage),
      },
      {
        path: 'classifica',
        loadComponent: () =>
          import('../classifica/classifica.page').then((m) => m.ClassificaPage),
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
