import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { GameService } from '../../../core/services/game.service';
import { BotService } from '../../../core/services/bot.service';
import { GameStateService } from '../../../core/services/game-state.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-chess-board',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chess-board.component.html',
  styleUrls: ['./chess-board.component.css']
})
export class ChessBoardComponent implements OnInit, OnDestroy {
  private gameService = inject(GameService);
  private botService = inject(BotService);
  private gameStateService = inject(GameStateService);
  private router = inject(Router);
  
  private botMoveSubscription?: Subscription;
  
  // Create a helper array for the template
  boardRows = Array(8).fill(0).map((_, i) => 7 - i);
  boardCols = Array(8).fill(0).map((_, i) => i);
  
  constructor() {}
  
  ngOnInit(): void {
    // Reset the game state
    this.gameService.resetGame();
    
    // If we're in player vs bot mode, subscribe to player moves to trigger bot responses
    if (this.gameStateService.isPlayerVsBot()) {
      this.setupBotMoves();
    }
  }
  
  ngOnDestroy(): void {
    // Clean up subscriptions
    if (this.botMoveSubscription) {
      this.botMoveSubscription.unsubscribe();
    }
  }
  
  // Set up the bot to respond to player moves
  private setupBotMoves(): void {
    // Watch for changes in the current player
    const checkBotTurn = () => {
      if (this.board.currentPlayer === 'black') {
        this.botService.makeBotMove();
      }
    };
    
    // Initial check
    checkBotTurn();
    
    // Set up an interval to check if it's the bot's turn
    const intervalId = setInterval(checkBotTurn, 500);
    
    // Clean up the interval on component destruction
    this.botMoveSubscription = new Subscription(() => {
      clearInterval(intervalId);
    });
  }
  
  // Getter for the board state
  get board() {
    return this.gameService.board();
  }
  
  // Handle square click
  onSquareClick(row: number, col: number): void {
    const board = this.board;
    const piece = board.squares[row][col];
    
    // If a piece is already selected, try to move it
    if (board.selectedPiece) {
      // If clicking on the same piece, deselect it
      if (piece && piece.color === board.currentPlayer && 
          piece.position.row === board.selectedPiece.position.row && 
          piece.position.col === board.selectedPiece.position.col) {
        this.gameService.clearSelection();
        return;
      }
      
      // Try to move the selected piece
      const moveSuccessful = this.gameService.movePiece(row, col);
      
      // If move failed and clicked on another piece of same color, select that piece
      if (!moveSuccessful && piece && piece.color === board.currentPlayer) {
        this.gameService.selectPiece(row, col);
      }
    } else if (piece && piece.color === board.currentPlayer) {
      // If no piece is selected and clicking on a piece of the current player, select it
      this.gameService.selectPiece(row, col);
    }
  }
  
  // Check if a square is a legal move for the selected piece
  isLegalMove(row: number, col: number): boolean {
    const board = this.board;
    return board.legalMoves.some(move => move.row === row && move.col === col);
  }
  
  // Get the square color (light or dark)
  getSquareColor(row: number, col: number): string {
    return (row + col) % 2 === 0 ? 'bg-green-800' : 'bg-green-500';
  }
  
  // Return to the main menu
  returnToMenu(): void {
    this.router.navigate(['/']);
  }
  
  // Reset the current game
  resetGame(): void {
    this.gameService.resetGame();
  }
} 