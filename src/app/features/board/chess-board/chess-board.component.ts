import { Component, OnInit, OnDestroy, inject, HostBinding, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { trigger, style, animate, transition } from '@angular/animations';
import { GameService } from '../../../core/services/game.service';
import { BotService } from '../../../core/services/bot.service';
import { GameStateService } from '../../../core/services/game-state.service';
import { ChessEngineService, EngineResult } from '../../../core/services/chess-engine.service';
import { Piece, Position, PieceType, PieceColor, Move } from '../../../core/models/piece.model';
import { Subscription, interval, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

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
  protected gameStateService = inject(GameStateService);
  private router = inject(Router);
  private engineService = inject(ChessEngineService);
  
  private botMoveSubscription?: Subscription;
  private destroy$ = new Subject<void>();
  
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
  
  // Pawn promotion variables
  showPromotionModal = false;
  promotionPosition: Position | null = null;
  promotionOptions: PieceType[] = ['queen', 'rook', 'bishop', 'knight'];
  pendingPromotionMove: {from: Position, to: Position} | null = null;
  
  // Resign variables
  showResignModal = false;
  resignedPlayer: PieceColor | null = null;
  
  // Hint variables
  showHintModal = false;
  hintMessage = '';
  hintMove: {from: Position, to: Position} | null = null;
  
  // Evaluation bar
  evaluationScore = 0;
  
  constructor(private elementRef: ElementRef) {}
  
  ngOnInit(): void {
    // Reset the game state
    this.gameService.resetGame();
    
    // If we're in player vs bot mode, subscribe to player moves to trigger bot responses
    if (this.gameStateService.isPlayerVsBot()) {
      this.setupBotMoves();
    }
    
    // Update evaluation score periodically
    this.updateEvaluation();
    
    // Set up periodic evaluation updates
    interval(1000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (!this.isReplayMode) {
          this.updateEvaluation();
        }
      });
  }
  
  ngOnDestroy(): void {
    // Clean up subscriptions
    if (this.botMoveSubscription) {
      this.botMoveSubscription.unsubscribe();
    }
    
    // Complete the destroy subject
    this.destroy$.next();
    this.destroy$.complete();
  }
  
  // Set up the bot to respond to player moves
  private setupBotMoves(): void {
    // Watch for changes in the current player
    const checkBotTurn = () => {
      if (this.board.currentPlayer === 'black' && !this.isReplayMode && !this.showPromotionModal) {
        this.botService.makeBotMove();
      }
    };
    
    // Initial check
    checkBotTurn();
    
    // Set up an interval to check if it's the bot's turn
    const intervalId = setInterval(() => {
      if (!this.showGameOverModal && !this.showPromotionModal) {
        checkBotTurn();
      }
    }, 500);
    
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
    
    // Update evaluation after move
    this.updateEvaluation();
  }
  
  // Handle square click
  onSquareClick(row: number, col: number): void {
    if (this.isReplayMode) return; // Disable clicks in replay mode
    if (this.showPromotionModal) return; // Disable clicks during promotion
    
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
      
      // Check if this would be a pawn promotion
      if (this.isPawnPromotion(board.selectedPiece, { row, col })) {
        this.pendingPromotionMove = {
          from: { ...board.selectedPiece.position },
          to: { row, col }
        };
        this.promotionPosition = { row, col };
        this.showPromotionModal = true;
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
  
  // Check if move would result in pawn promotion
  isPawnPromotion(piece: Piece, to: Position): boolean {
    if (piece.type !== 'pawn') return false;
    
    const targetRow = to.row;
    return (piece.color === 'white' && targetRow === 7) || 
           (piece.color === 'black' && targetRow === 0);
  }
  
  // Handle pawn promotion selection
  selectPromotion(promotionPiece: PieceType): void {
    if (!this.pendingPromotionMove) return;
    
    // Set the promotion piece and execute the move
    this.gameService.movePieceWithPromotion(
      this.pendingPromotionMove.from,
      this.pendingPromotionMove.to,
      promotionPiece
    );
    
    // Reset promotion state
    this.showPromotionModal = false;
    this.pendingPromotionMove = null;
    this.promotionPosition = null;
    
    // Track the move for animation
    this.trackLastMove();
  }
  
  // Get image for promotion piece
  getPromotionImage(pieceType: PieceType): string {
    const color = this.board.currentPlayer;
    return `assets/chess-pieces/${color.charAt(0).toUpperCase() + color.slice(1)}_${pieceType.charAt(0).toUpperCase() + pieceType.slice(1)}.png`;
  }
  
  // Check if a square is a legal move for the selected piece
  isLegalMove(row: number, col: number): boolean {
    const board = this.board;
    return board.legalMoves.some(move => move.row === row && move.col === col);
  }
  
  // Check if a position is threatened by the currently selected piece
  isPieceThreatenedBySelected(row: number, col: number): boolean {
    const piece = this.board.squares[row][col];
    const selectedPiece = this.board.selectedPiece;
    
    if (!piece || !selectedPiece) return false;
    if (piece.color === selectedPiece.color) return false;
    
    // Check if the selected piece can capture this piece
    return this.isLegalMove(row, col);
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
    this.resignedPlayer = null;
    this.evaluationScore = 0;
    this.updateEvaluation();
  }
  
  // Get winner text
  getWinnerText(): string {
    if (this.resignedPlayer) {
      return `${this.resignedPlayer === 'white' ? 'Black' : 'White'} wins by resignation!`;
    } else if (this.board.isCheckmate) {
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
  
  // Exit replay mode
  exitReplayMode(): void {
    this.isReplayMode = false;
    
    // Return to current game state
    this.gameService.setReplayState(this.board.moveHistory.length);
    
    // If game was over, show the game over modal again
    if (this.board.isCheckmate || this.board.isStalemate || this.resignedPlayer) {
      this.showGameOverModal = true;
    }
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
    if (this.isReplayMode || this.showPromotionModal) {
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
    if (this.isReplayMode || !this.draggedPiece || this.showPromotionModal) {
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
    
    if (this.isReplayMode || !this.draggedPiece || this.showPromotionModal) return;
    
    // Check for pawn promotion
    if (this.isPawnPromotion(this.draggedPiece, { row, col })) {
      this.pendingPromotionMove = {
        from: { ...this.draggedPiece.position },
        to: { row, col }
      };
      this.promotionPosition = { row, col };
      this.showPromotionModal = true;
      return;
    }
    
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
  
  // Confirm resignation
  confirmResign(): void {
    if (this.isReplayMode || this.board.isCheckmate || this.board.isStalemate) return;
    this.showResignModal = true;
  }
  
  // Resign the game
  resign(): void {
    this.resignedPlayer = this.board.currentPlayer;
    this.showResignModal = false;
    this.showGameOverModal = true;
  }
  
  // Undo the last move
  undoMove(): void {
    if (this.isReplayMode || this.board.moveHistory.length === 0) return;
    
    // If playing against bot, undo both player and bot moves
    if (this.gameStateService.isPlayerVsBot()) {
      // Undo twice to get back to player's turn
      this.gameService.undoMove();
      if (this.board.moveHistory.length > 0) {
        this.gameService.undoMove();
      }
    } else {
      // Just undo the last move in player vs player
      this.gameService.undoMove();
    }
    
    // Update the evaluation
    this.updateEvaluation();
  }
  
  // Show a hint for the current player
  showHint(): void {
    if (this.isReplayMode) return;
    
    // Show loading state
    this.hintMessage = 'Calculating best move...';
    this.hintMove = null;
    this.showHintModal = true;
    
    // Get a hint from the chess engine
    this.engineService.getBestMove(this.board, this.board.currentPlayer)
      .subscribe({
        next: (result: EngineResult) => {
          if (result.success && result.bestMove) {
            this.hintMove = result.bestMove;
            this.hintMessage = `Consider moving your ${result.bestMove.piece.type} from ${this.formatPosition(result.bestMove.from)} to ${this.formatPosition(result.bestMove.to)}.`;
          } else {
            this.hintMessage = result.error || 'No good moves available at the moment.';
          }
        },
        error: (error) => {
          console.error('Error getting hint:', error);
          this.hintMessage = 'Error calculating best move. Please try again.';
        }
      });
  }
  
  // Close the hint modal
  closeHint(): void {
    this.showHintModal = false;
    this.hintMove = null;
  }
  
  // Format a position (e.g., e4)
  formatPosition(pos: Position): string {
    const file = String.fromCharCode(97 + pos.col); // a-h
    const rank = pos.row + 1; // 1-8
    return `${file}${rank}`;
  }
  
  // Format hint move for display
  formatHintMove(): string {
    if (!this.hintMove) return '';
    
    const from = this.formatPosition(this.hintMove.from);
    const to = this.formatPosition(this.hintMove.to);
    
    return `${from} → ${to}`;
  }
  
  // Update the evaluation score
  updateEvaluation(): void {
    if (this.board.isCheckmate) {
      this.evaluationScore = this.board.currentPlayer === 'white' ? -10 : 10;
      return;
    }
    
    if (this.board.isStalemate) {
      this.evaluationScore = 0;
      return;
    }
    
    // Calculate material advantage
    let score = 0;
    
    // Piece values: pawn=1, knight/bishop=3, rook=5, queen=9
    const pieceValues: Record<PieceType, number> = {
      'pawn': 1,
      'knight': 3,
      'bishop': 3,
      'rook': 5,
      'queen': 9,
      'king': 0 // King isn't counted in material evaluation
    };
    
    // Loop through the board and count material
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = this.board.squares[row][col];
        if (piece) {
          const value = pieceValues[piece.type];
          if (piece.color === 'white') {
            score += value;
          } else {
            score -= value;
          }
        }
      }
    }
    
    // Add position bonuses
    // Center control bonus
    for (const pos of [{row: 3, col: 3}, {row: 3, col: 4}, {row: 4, col: 3}, {row: 4, col: 4}]) {
      const piece = this.board.squares[pos.row][pos.col];
      if (piece) {
        const bonus = 0.2;
        if (piece.color === 'white') {
          score += bonus;
        } else {
          score -= bonus;
        }
      }
    }
    
    // Check bonus
    if (this.board.isCheck) {
      const checkBonus = 0.5;
      if (this.board.currentPlayer === 'black') {
        score += checkBonus;
      } else {
        score -= checkBonus;
      }
    }
    
    // Mobility advantage (approximated by legal moves when a piece is selected)
    const whiteMobility = this.estimateMobility('white');
    const blackMobility = this.estimateMobility('black');
    const mobilityFactor = 0.01;
    score += (whiteMobility - blackMobility) * mobilityFactor;
    
    // Round to 1 decimal place for display
    this.evaluationScore = Math.round(score * 10) / 10;
  }
  
  // Estimate mobility for a color (number of legal moves)
  private estimateMobility(color: PieceColor): number {
    let mobility = 0;
    
    // Save the current selection
    const savedSelectedPiece = this.board.selectedPiece;
    
    // Create a deep copy of the current board
    const boardCopy = { ...this.gameService.board() };
    
    // Check mobility for each piece
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = this.board.squares[row][col];
        if (piece && piece.color === color) {
          // Get the legal moves without affecting the UI
          mobility += this.getMobilityForPiece(piece);
        }
      }
    }
    
    // Restore the previous selection if needed
    if (savedSelectedPiece && !this.board.selectedPiece) {
      this.gameService.selectPiece(savedSelectedPiece.position.row, savedSelectedPiece.position.col);
    }
    
    return mobility;
  }
  
  // Get mobility for a single piece without affecting the UI state
  private getMobilityForPiece(piece: Piece): number {
    // We'll implement a simplified version of legal moves calculation
    // This is a basic approximation that doesn't affect the UI
    
    const { type, color, position } = piece;
    let moveCount = 0;
    
    // Simplified mobility calculation based on piece type
    // These are very rough approximations to avoid calling the game service
    switch (type) {
      case 'pawn':
        moveCount = 2; // Forward + capture options (approximation)
        break;
      case 'knight':
        moveCount = 8; // Maximum possible knight moves
        // Reduce for edge knights
        if (position.row <= 1 || position.row >= 6) moveCount -= 2;
        if (position.col <= 1 || position.col >= 6) moveCount -= 2;
        break;
      case 'bishop':
        moveCount = 13; // Average bishop mobility
        break;
      case 'rook':
        moveCount = 14; // Average rook mobility
        break;
      case 'queen':
        moveCount = 27; // Average queen mobility
        break;
      case 'king':
        moveCount = 8; // Maximum king moves
        // Reduce for edge kings
        if (position.row <= 0 || position.row >= 7) moveCount -= 3;
        if (position.col <= 0 || position.col >= 7) moveCount -= 3;
        break;
    }
    
    return moveCount;
  }
} 