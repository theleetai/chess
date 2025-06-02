import { Injectable, signal } from '@angular/core';

export type GameMode = 'player-vs-player' | 'player-vs-bot' | 'player-vs-ai' | null;

@Injectable({
  providedIn: 'root'
})
export class GameStateService {
  private currentModeState = signal<GameMode>(null);
  currentMode = this.currentModeState.asReadonly();
  
  constructor() {}

  // Set the current game mode
  setGameMode(mode: GameMode): void {
    this.currentModeState.set(mode);
  }

  // Check if the current mode is player vs bot
  isPlayerVsBot(): boolean {
    return this.currentModeState() === 'player-vs-bot';
  }

  // Check if the current mode is player vs player
  isPlayerVsPlayer(): boolean {
    return this.currentModeState() === 'player-vs-player';
  }

  // Check if the current mode is player vs AI
  isPlayerVsAI(): boolean {
    return this.currentModeState() === 'player-vs-ai';
  }
} 