import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { GameService } from '../../../core/services/game.service';
import { GameStateService } from '../../../core/services/game-state.service';
import { Piece, PieceType, PieceColor, Position } from '../../../core/models/piece.model';

@Component({
  selector: 'app-game-builder',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './game-builder.component.html',
  styleUrls: ['./game-builder.component.css']
})
export class GameBuilderComponent implements OnInit {
  private gameService = inject(GameService);
  private gameStateService = inject(GameStateService);
  private router = inject(Router);
  
  // Create a helper array for the template
  boardRows = Array(8).fill(0).map((_, i) => 7 - i);
  boardCols = Array(8).fill(0).map((_, i) => i);
  
  // Selected piece for placement
  selectedPieceType: PieceType = 'pawn';
  selectedPieceColor: PieceColor = 'white';
  
  // Error message
  errorMessage = '';
  
  // Available piece types
  pieceTypes: PieceType[] = ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king'];
  
  constructor() {}
  
  ngOnInit(): void {
    // Create an empty board
    this.gameService.createEmptyBoard();
    this.gameStateService.setGameMode(null);
  }
  
  // Getter for the board state
  get board() {
    return this.gameService.board();
  }
  
  // Handle square click - place or remove pieces
  onSquareClick(row: number, col: number): void {
    const square = this.board.squares[row][col];
    
    if (square) {
      // Square has a piece - remove it
      this.gameService.removePiece(row, col);
    } else {
      // Empty square - place the selected piece
      this.gameService.placePiece(this.selectedPieceType, this.selectedPieceColor, row, col);
    }
    
    // Clear any error messages
    this.errorMessage = '';
  }
  
  // Get image for a piece
  getPieceImage(type: PieceType, color: PieceColor): string {
    return `assets/chess-pieces/${color.charAt(0).toUpperCase() + color.slice(1)}_${type.charAt(0).toUpperCase() + type.slice(1)}.png`;
  }
  
  // Get square color (light or dark)
  getSquareColor(row: number, col: number): string {
    return (row + col) % 2 === 0 ? 'bg-green-800' : 'bg-green-500';
  }
  
  // Set starting player
  setStartingPlayer(color: PieceColor): void {
    this.gameService.setCurrentPlayer(color);
    this.errorMessage = '';
  }
  
  // Reset to standard board
  resetToStandardBoard(): void {
    this.gameService.resetGame();
    this.errorMessage = '';
  }
  
  // Clear the board
  clearBoard(): void {
    this.gameService.createEmptyBoard();
    this.errorMessage = '';
  }
  
  // Start the game with current setup
  startGame(): void {
    const validation = this.gameService.validateCustomBoard();
    
    if (validation.valid) {
      if (this.gameService.startFromCustomSetup()) {
        this.gameStateService.setGameMode('custom');
        this.router.navigate(['/game']);
      } else {
        this.errorMessage = 'Failed to start game';
      }
    } else {
      this.errorMessage = validation.message;
    }
  }
  
  // Return to main menu
  returnToMenu(): void {
    this.router.navigate(['/']);
  }
} 