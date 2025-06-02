import { Injectable } from '@angular/core';
import { Board } from '../models/board.model';
import { GameService } from './game.service';

export interface SavedGame {
  id: string;
  name: string;
  date: string;
  boardState: Board;
  gameHistory: Board[];
}

@Injectable({
  providedIn: 'root'
})
export class GamePersistenceService {
  private readonly STORAGE_KEY = 'chess_saved_games';
  
  constructor(private gameService: GameService) {}
  
  // Save the current game state
  saveGame(name: string): SavedGame {
    const savedGames = this.getSavedGames();
    const currentGame = this.gameService.getCurrentGameState();
    
    const savedGame: SavedGame = {
      id: Date.now().toString(),
      name: name || `Game ${savedGames.length + 1}`,
      date: new Date().toISOString(),
      boardState: currentGame.currentState,
      gameHistory: currentGame.history
    };
    
    savedGames.push(savedGame);
    this.saveGamesToStorage(savedGames);
    
    return savedGame;
  }
  
  // Load a saved game
  loadGame(gameId: string): boolean {
    const savedGames = this.getSavedGames();
    const game = savedGames.find(g => g.id === gameId);
    
    if (game) {
      this.gameService.loadGameState(game.boardState, game.gameHistory);
      return true;
    }
    
    return false;
  }
  
  // Delete a saved game
  deleteGame(gameId: string): boolean {
    const savedGames = this.getSavedGames();
    const filteredGames = savedGames.filter(g => g.id !== gameId);
    
    if (filteredGames.length !== savedGames.length) {
      this.saveGamesToStorage(filteredGames);
      return true;
    }
    
    return false;
  }
  
  // Get all saved games
  getSavedGames(): SavedGame[] {
    const gamesJson = localStorage.getItem(this.STORAGE_KEY);
    return gamesJson ? JSON.parse(gamesJson) : [];
  }
  
  // Save games to local storage
  private saveGamesToStorage(games: SavedGame[]): void {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(games));
  }
} 