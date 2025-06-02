import { Component, OnInit, OnDestroy, inject, HostBinding } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { trigger, style, animate, transition } from '@angular/animations';
import { GameService } from '../../../core/services/game.service';
import { BotService } from '../../../core/services/bot.service';
import { GameStateService } from '../../../core/services/game-state.service';
import { Piece, Position } from '../../../core/models/piece.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-chess-board',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chess-board.component.html',
  styleUrls: ['./chess-board.component.css'],
  animations: [
    trigger('pieceAnimation', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.5)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'scale(1)' }))
      ])
    ]),
    trigger('highlightAnimation', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('200ms ease-out', style({ opacity: 1 }))
      ])
    ]),
    trigger('moveAnimation', [
      transition(':enter', [
        style({ backgroundColor: 'rgba(255, 255, 0, 0.5)' }),
        animate('500ms ease-out', style({ backgroundColor: 'transparent' }))
      ])
    ])
  ]
})
export class ChessBoardComponent implements OnInit, OnDestroy {
  private gameService = inject(GameService);
  private botService = inject(BotService);
  private gameStateService = inject(GameStateService);
  private router = inject(Router);
  
  private botMoveSubscription?: Subscription;
  
  // Math reference for the template
  Math = Math;

  // Create a helper array for the template
  boardRows = Array(8).fill(0).map((_, i) => 7 - i);
  boardCols = Array(8).fill(0).map((_, i) => i);

  // Track last moved piece for animation
  lastMovedFrom: Position | null = null;
  lastMovedTo: Position | null = null;
  
  // Replay mode variables
  isReplayMode = false;
  currentReplayMove = 0;
  
  // Drag and drop variables
  draggedPiece: Piece | null = null;
  
  // Game over modal
  showGameOverModal = false;
  
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
  
  // Track last move
  trackLastMove(): void {
    const lastMove = this.board.lastMove;
    if (lastMove) {
      this.lastMovedFrom = lastMove.from;
      this.lastMovedTo = lastMove.to;
      
      // Clear the highlight after 1.5 seconds
      setTimeout(() => {
        this.lastMovedFrom = null;
        this.lastMovedTo = null;
      }, 1500);
    }
    
    // Check if game is over after a move
    if (this.board.isCheckmate || this.board.isStalemate) {
      this.showGameOverModal = true;
    }
  }
  
  // Handle square click
  onSquareClick(row: number, col: number): void {
    if (this.isReplayMode) return; // Disable clicks in replay mode
    
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
      
      // If move was successful, track it for animation
      if (moveSuccessful) {
        this.trackLastMove();
      }
      // If move failed and clicked on another piece of same color, select that piece
      else if (piece && piece.color === board.currentPlayer) {
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
  
  // Check if a position is under threat by opponent
  isUnderThreat(row: number, col: number): boolean {
    const piece = this.board.squares[row][col];
    if (!piece) return false;
    
    return this.gameService.isPositionThreatened(row, col);
  }
  
  // Check if a position was part of the last move
  isLastMove(row: number, col: number): boolean {
    return ((this.lastMovedFrom !== null && this.lastMovedFrom.row === row && this.lastMovedFrom.col === col) ||
           (this.lastMovedTo !== null && this.lastMovedTo.row === row && this.lastMovedTo.col === col));
  }
  
  // Get the square color (light or dark)
  getSquareColor(row: number, col: number): string {
    return (row + col) % 2 === 0 ? 'bg-green-800' : 'bg-green-500';
  }

  // Get icon for a piece type
  getPieceIcon(piece: Piece): string {
    if (!piece) return '';
    const color = piece.color === 'white' ? 'text-white' : 'text-black';
    
    switch (piece.type) {
      case 'pawn': return `${color} fas fa-chess-pawn`;
      case 'rook': return `${color} fas fa-chess-rook`;
      case 'knight': return `${color} fas fa-chess-knight`;
      case 'bishop': return `${color} fas fa-chess-bishop`;
      case 'queen': return `${color} fas fa-chess-queen`;
      case 'king': return `${color} fas fa-chess-king`;
      default: return '';
    }
  }
  
  // Return to the main menu
  returnToMenu(): void {
    this.router.navigate(['/']);
  }
  
  // Reset the current game
  resetGame(): void {
    this.gameService.resetGame();
    this.lastMovedFrom = null;
    this.lastMovedTo = null;
    this.isReplayMode = false;
    this.currentReplayMove = 0;
    this.showGameOverModal = false;
  }
  
  // Get winner text
  getWinnerText(): string {
    if (this.board.isCheckmate) {
      const winner = this.board.currentPlayer === 'white' ? 'Black' : 'White';
      return `${winner} wins by checkmate!`;
    } else if (this.board.isStalemate) {
      return "Game drawn by stalemate!";
    }
    return "";
  }
  
  // Start replay mode
  startReplay(): void {
    this.isReplayMode = true;
    this.currentReplayMove = 0;
    
    // Set the board to the initial state
    this.gameService.setReplayState(0);
    
    // Hide game over modal if it was shown
    this.showGameOverModal = false;
  }
  
  // Navigate through replay moves
  nextMove(): void {
    if (!this.isReplayMode) return;
    if (this.currentReplayMove < this.board.moveHistory.length) {
      this.currentReplayMove++;
      this.gameService.setReplayState(this.currentReplayMove);
      
      // Highlight the last move
      if (this.currentReplayMove > 0) {
        const lastMove = this.board.lastMove;
        if (lastMove) {
          this.lastMovedFrom = lastMove.from;
          this.lastMovedTo = lastMove.to;
        }
      }
    }
  }
  
  prevMove(): void {
    if (!this.isReplayMode || this.currentReplayMove <= 0) return;
    
    this.currentReplayMove--;
    this.gameService.setReplayState(this.currentReplayMove);
    
    // Update last move highlight
    if (this.currentReplayMove > 0) {
      const board = this.gameService.getBoardAtMove(this.currentReplayMove);
      if (board.lastMove) {
        this.lastMovedFrom = board.lastMove.from;
        this.lastMovedTo = board.lastMove.to;
      } else {
        this.lastMovedFrom = null;
        this.lastMovedTo = null;
      }
    } else {
      this.lastMovedFrom = null;
      this.lastMovedTo = null;
    }
  }
  
  // Handle drag start event
  onDragStart(event: DragEvent, row: number, col: number): void {
    if (this.isReplayMode) {
      event.preventDefault();
      return;
    }
    
    const piece = this.board.squares[row][col];
    if (!piece || piece.color !== this.board.currentPlayer) {
      event.preventDefault();
      return;
    }
    
    this.draggedPiece = piece;
    this.gameService.selectPiece(row, col);
    
    // Set data to transfer
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', `${row},${col}`);
      event.dataTransfer.effectAllowed = 'move';
    }
  }
  
  // Handle drag over event
  onDragOver(event: DragEvent, row: number, col: number): void {
    if (this.isReplayMode || !this.draggedPiece) {
      return; // Don't prevent default to disallow drop
    }
    
    // Check if this is a legal move
    if (this.isLegalMove(row, col)) {
      event.preventDefault(); // Allow the drop
    }
  }
  
  // Handle drop event
  onDrop(event: DragEvent, row: number, col: number): void {
    event.preventDefault();
    
    if (this.isReplayMode || !this.draggedPiece) return;
    
    // Move the piece if it's a legal move
    if (this.isLegalMove(row, col)) {
      const moveSuccessful = this.gameService.movePiece(row, col);
      
      if (moveSuccessful) {
        this.trackLastMove();
      }
    }
    
    this.draggedPiece = null;
  }
  
  // End drag
  onDragEnd(): void {
    if (!this.isReplayMode && this.draggedPiece) {
      this.draggedPiece = null;
    }
  }
} 