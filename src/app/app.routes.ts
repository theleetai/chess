import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/menu/main-menu/main-menu.component').then(m => m.MainMenuComponent),
    data: { animation: 'home' }
  },
  {
    path: 'game',
    loadComponent: () => import('./features/board/chess-board/chess-board.component').then(m => m.ChessBoardComponent),
    data: { animation: 'game' }
  },
  {
    path: 'player-vs-ai',
    loadComponent: () => import('./features/ai/player-vs-ai/player-vs-ai.component').then(m => m.PlayerVsAIComponent),
    data: { animation: 'ai' }
  },
  {
    path: 'training',
    loadComponent: () => import('./features/training/training-page/training-page.component').then(m => m.TrainingPageComponent),
    data: { animation: 'training' }
  },
  {
    path: 'settings',
    loadComponent: () => import('./features/settings/settings/settings.component').then(m => m.SettingsComponent),
    data: { animation: 'settings' }
  },
  {
    path: 'builder',
    loadComponent: () => import('./features/builder/game-builder/game-builder.component').then(m => m.GameBuilderComponent),
    data: { animation: 'builder' }
  },
  {
    path: '**',
    redirectTo: ''
  }
];
