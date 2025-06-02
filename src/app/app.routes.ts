import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/menu/main-menu/main-menu.component').then(m => m.MainMenuComponent)
  },
  {
    path: 'game',
    loadComponent: () => import('./features/board/chess-board/chess-board.component').then(m => m.ChessBoardComponent)
  },
  {
    path: 'settings',
    loadComponent: () => import('./features/settings/settings/settings.component').then(m => m.SettingsComponent)
  },
  {
    path: '**',
    redirectTo: ''
  }
];
