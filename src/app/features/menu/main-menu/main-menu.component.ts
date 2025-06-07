import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { GameStateService } from '../../../core/services/game-state.service';
import { GamePersistenceService, SavedGame } from '../../../core/services/game-persistence.service';

@Component({
  selector: 'app-main-menu',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './main-menu.component.html',
  styleUrls: ['./main-menu.component.css']
})
export class MainMenuComponent implements OnInit {
  private router = inject(Router);
  private gameStateService = inject(GameStateService);
  private persistenceService = inject(GamePersistenceService);
  
  // Saved games
  savedGames: SavedGame[] = [];
  showSavedGamesModal = false;
  
  ngOnInit(): void {
    // Load saved games
    this.savedGames = this.persistenceService.getSavedGames();
  }

  startPlayerVsPlayer(): void {
    this.gameStateService.setGameMode('player-vs-player');
    this.router.navigate(['/game']);
  }

  startPlayerVsBot(): void {
    this.gameStateService.setGameMode('player-vs-bot');
    this.router.navigate(['/game']);
  }

  startCreativeMode(): void {
    this.gameStateService.setGameMode('creative');
    this.router.navigate(['/builder']);
  }

  startPlayerVsAI(): void {
    this.router.navigate(['/player-vs-ai']);
  }
  
  startTraining(): void {
    this.router.navigate(['/training']);
  }
  
  startCustomGame(): void {
    this.router.navigate(['/builder']);
  }
  
  // Show saved games modal
  showSavedGames(): void {
    this.savedGames = this.persistenceService.getSavedGames();
    this.showSavedGamesModal = true;
  }
  
  // Load a saved game
  loadGame(gameId: string): void {
    if (this.persistenceService.loadGame(gameId)) {
      this.gameStateService.setGameMode('custom');
      this.router.navigate(['/game']);
      this.showSavedGamesModal = false;
    } else {
      alert('Failed to load game');
    }
  }
  
  // Delete a saved game
  deleteGame(gameId: string): void {
    if (this.persistenceService.deleteGame(gameId)) {
      this.savedGames = this.persistenceService.getSavedGames();
    } else {
      alert('Failed to delete game');
    }
  }
  
  // Format date for display
  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  }

  openSettings(): void {
    this.router.navigate(['/settings']);
  }
} 