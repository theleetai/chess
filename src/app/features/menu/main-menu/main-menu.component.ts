import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { GameStateService } from '../../../core/services/game-state.service';

@Component({
  selector: 'app-main-menu',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './main-menu.component.html',
  styleUrls: ['./main-menu.component.css']
})
export class MainMenuComponent {
  private router = inject(Router);
  private gameStateService = inject(GameStateService);

  startPlayerVsPlayer(): void {
    this.gameStateService.setGameMode('player-vs-player');
    this.router.navigate(['/game']);
  }

  startPlayerVsBot(): void {
    this.gameStateService.setGameMode('player-vs-bot');
    this.router.navigate(['/game']);
  }

  startPlayerVsAI(): void {
    alert('This feature is coming soon!');
  }

  openSettings(): void {
    this.router.navigate(['/settings']);
  }
} 