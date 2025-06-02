import { Injectable, signal } from '@angular/core';

export type GameMode = 'player-vs-player' | 'player-vs-bot' | 'player-vs-ai' | 'custom' | null;

@Injectable({
  providedIn: 'root'
})
export class GameStateService {
  private currentModeState = signal<GameMode>(null);
  currentMode = this.currentModeState.asReadonly();
  
  // Settings
  private showEvalBarState = signal<'always' | 'after-game' | 'never'>('after-game');
  showEvalBar = this.showEvalBarState.asReadonly();
  
  private showMoveAnalysisState = signal<boolean>(true);
  showMoveAnalysis = this.showMoveAnalysisState.asReadonly();
  
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
  
  // Check if the current mode is custom
  isCustomGame(): boolean {
    return this.currentModeState() === 'custom';
  }
  
  // Check if the current mode is one of the supported game modes
  isGameModeActive(): boolean {
    const mode = this.currentModeState();
    return mode === 'player-vs-player' || 
           mode === 'player-vs-bot' || 
           mode === 'player-vs-ai' || 
           mode === 'custom';
  }
  
  // Settings methods
  
  // Set eval bar visibility
  setEvalBarVisibility(visibility: 'always' | 'after-game' | 'never'): void {
    this.showEvalBarState.set(visibility);
  }
  
  // Check if eval bar should be shown
  shouldShowEvalBar(isGameOver: boolean): boolean {
    const setting = this.showEvalBarState();
    
    if (setting === 'always') {
      return true;
    } else if (setting === 'after-game') {
      return isGameOver;
    } else {
      return false;
    }
  }
  
  // Set move analysis visibility
  setMoveAnalysisVisibility(show: boolean): void {
    this.showMoveAnalysisState.set(show);
  }
  
  // Check if move analysis should be shown
  shouldShowMoveAnalysis(): boolean {
    return this.showMoveAnalysisState();
  }
} 