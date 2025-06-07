import { Component, OnInit, OnDestroy, inject, HostBinding, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { trigger, style, animate, transition } from '@angular/animations';
import { GameService } from '../../../core/services/game.service';
import { BotService } from '../../../core/services/bot.service';
import { GameStateService } from '../../../core/services/game-state.service';
import { ChessEngineService, EngineResult, MoveQuality, StockfishResponse } from '../../../core/services/chess-engine.service';
import { GamePersistenceService } from '../../../core/services/game-persistence.service';
import { AIService } from '../../../core/services/ai.service';
import { Piece, Position, PieceType, PieceColor, Move } from '../../../core/models/piece.model';
import { PreMoveService, PreMove } from '../../../core/services/pre-move.service';
import { Subscription, interval, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-chess-board',
  standalone: true,
  imports: [CommonModule, FormsModule],
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
  private persistenceService = inject(GamePersistenceService);
  protected preMoveService = inject(PreMoveService);
  protected aiService = inject(AIService);
  
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
  hintMove: {from: Position, to: Position, piece: Piece} | null = null;
  showHintOnBoard = false;
  
  // Evaluation bar
  evaluationScore = 0;
  
  // Save game modal
  showSaveGameModal = false;
  gameName = '';
  
  // Move analysis
  showMoveAnalysis = true;
  currentMoveEvaluation: string = '';
  
  // Move analysis variables
  private previousPositionEval: number = 0;
  private currentPositionEval: number = 0;
  moveQuality: MoveQuality | null = null;
  moveQualityMessage: string = '';
  isAnalyzing: boolean = false;
  analysisCache: Map<number, { quality: MoveQuality, message: string, evaluation: number }> = new Map();
  
  // Add processingPreMove flag to the component
  private processingPreMove = false;
  
  constructor(private elementRef: ElementRef) {}
  
  ngOnInit(): void {
    // If the game was loaded from a saved state, don't reset
    if (!this.gameStateService.isCustomGame()) {
      // Reset the game state
      this.gameService.resetGame();
    }
    
    // If we're in player vs bot or player vs AI mode, subscribe to player moves to trigger bot responses
    if (this.gameStateService.isPlayerVsBot() || this.gameStateService.isPlayerVsAI()) {
      this.setupBotMoves();
      
      // Patch the bot service to check for pre-moves after a move
      const originalMakeBotMove = this.botService.makeBotMove;
      this.botService.makeBotMove = () => {
        originalMakeBotMove.call(this.botService);
        
        // After a short delay to let the move complete, check for pre-moves
        setTimeout(() => {
          if (this.board.currentPlayer === 'white' && this.preMoveService.preMoveQueue.length > 0) {
            this.executeNextPreMove();
          }
        }, 500);
      };
    }
    
    // Update evaluation score periodically
    this.updateEvaluation();
    
    // Set up periodic evaluation updates
    interval(1000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (!this.isReplayMode) {
          this.updateEvaluation();
          
          // Check if we should execute pre-moves
          if (this.board.currentPlayer === 'white' && this.preMoveService.preMoveQueue.length > 0) {
            this.executeNextPreMove();
          }
        }
      });
      
    // Set move analysis visibility
    this.showMoveAnalysis = this.gameStateService.showMoveAnalysis();
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
  
  // Check if eval bar should be visible
  get shouldShowEvalBar(): boolean {
    return this.gameStateService.shouldShowEvalBar(
      this.board.isCheckmate || this.board.isStalemate || this.resignedPlayer !== null
    );
  }
  
  // Set up the bot to respond to player moves
  private setupBotMoves(): void {
    // Watch for changes in the current player
    const checkBotTurn = () => {
      // Don't process during replay mode or when promotion modal is open
      if (this.isReplayMode || this.showPromotionModal) return;
      
      // Check if a pre-move should be executed
      if (this.board.currentPlayer === 'white' && this.preMoveService.preMoveQueue.length > 0 && !this.processingPreMove) {
        this.processingPreMove = true;
        setTimeout(() => {
          this.executeNextPreMove();
          this.processingPreMove = false;
          
          // After executing the pre-move, if it's black's turn, make a bot move
          if (this.board.currentPlayer === 'black') {
            this.makeBotOrAIMove();
          }
        }, 300);
        return;
      }
      
      if (this.board.currentPlayer === 'black') {
        // Let the bot or AI service make its move
        setTimeout(() => {
          this.makeBotOrAIMove();
        }, 500);
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
  
  // Make either a bot move or AI move depending on game mode
  private async makeBotOrAIMove(): Promise<void> {
    if (this.gameStateService.isPlayerVsAI() && this.aiService.isReady) {
      // Use AI service for Player vs AI mode
      try {
        await this.aiService.makeAIMove();
        this.trackLastMove();
      } catch (error) {
        console.error('AI move failed, falling back to basic bot:', error);
        this.botService.makeBotMove();
      }
    } else {
      // Use traditional bot service
      this.botService.makeBotMove();
    }
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
      return;
    }
    
    // Update evaluation after move
    this.updateEvaluation();
    
    // Get move analysis if enabled
    if (this.showMoveAnalysis && lastMove) {
      this.getMoveAnalysis();
    }

    // Execute pre-moves if it's now the player's turn and we have pre-moves queued
    if (this.board.currentPlayer === 'white' && this.preMoveService.preMoveQueue.length > 0 && !this.isReplayMode) {
      // Small delay to allow UI to update first
      setTimeout(() => {
        this.executeNextPreMove();
      }, 300);
    }
  }
  
  // Get analysis for the last move
  getMoveAnalysis(): void {
    if (!this.showMoveAnalysis || !this.board.lastMove) return;
    
    // Only use external engines for analysis
    if (this.engineService.engineType === 'local') return;
    
    this.engineService.getBestMove(this.board, this.board.currentPlayer)
      .subscribe({
        next: (result: EngineResult) => {
          if (result.success && result.evaluation !== undefined) {
            const evalScore = result.evaluation;
            let evalText = '';
            
            // Determine if the last move was good or bad
            if (Math.abs(evalScore) < 0.3) {
              evalText = 'Equal position';
            } else if (evalScore > 1.5) {
              evalText = 'White has a clear advantage';
            } else if (evalScore < -1.5) {
              evalText = 'Black has a clear advantage';
            } else if (evalScore > 0.3) {
              evalText = 'White is slightly better';
            } else {
              evalText = 'Black is slightly better';
            }
            
            this.currentMoveEvaluation = evalText;
          }
        },
        error: () => {
          this.currentMoveEvaluation = '';
        }
      });
  }
  
  // Handle square click with pre-move support
  onSquareClick(row: number, col: number): void {
    if (this.isReplayMode) return; // Disable clicks in replay mode
    if (this.showPromotionModal) return; // Disable clicks during promotion
    
    const board = this.board;
    const clickedPiece = board.squares[row][col];
    
    // If it's not the player's turn and we click on a piece of our color (white)
    if (board.currentPlayer !== 'white' && 
        clickedPiece && clickedPiece.color === 'white' &&
        (this.gameStateService.isPlayerVsBot() || this.gameStateService.isPlayerVsPlayer() || this.gameStateService.isPlayerVsAI())) {
      
      // Start a pre-move with this piece
      this.startPreMove(row, col);
      return;
    }
    
    // If we have an active pre-move and click on a destination
    if (this.preMoveService.activeFrom && board.currentPlayer !== 'white') {
      // Get the piece we're trying to move
      const fromRow = this.preMoveService.activeFrom.row;
      const fromCol = this.preMoveService.activeFrom.col;
      const piece = board.squares[fromRow][fromCol];
      
      if (piece) {
        // Calculate what would be legal moves for this piece
        this.gameService.selectPiece(fromRow, fromCol);
        const legalMoves = [...board.legalMoves]; // Create a copy
        this.gameService.clearSelection(); // Clear the selection to not affect the UI
        
        // Check if the target square is a legal move
        if (legalMoves.some(move => move.row === row && move.col === col)) {
          this.preMoveService.setPreMoveDestination(row, col);
          return;
        }
      }
      
      // If clicked on an invalid destination, just clear the pre-move
      this.preMoveService.clearPreMoves();
      return;
    }
    
    // If we click on an enemy piece during our turn (normal capture)
    if (board.selectedPiece && clickedPiece && clickedPiece.color !== board.currentPlayer) {
      const moveSuccessful = this.gameService.movePiece(row, col);
      if (moveSuccessful) {
        this.trackLastMove();
        this.showHintOnBoard = false;
      }
      return;
    }
    
    // Normal move logic
    if (board.selectedPiece) {
      // If clicking on the same piece, deselect it
      if (board.squares[row][col] && board.squares[row][col]?.color === board.currentPlayer && 
          board.squares[row][col]?.position.row === board.selectedPiece.position.row && 
          board.squares[row][col]?.position.col === board.selectedPiece.position.col) {
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
        // Hide hint after move is made
        this.showHintOnBoard = false;
      }
      // If move failed and clicked on another piece of same color, select that piece
      else if (board.squares[row][col] && board.squares[row][col]?.color === board.currentPlayer) {
        this.gameService.selectPiece(row, col);
      }
    } else if (board.squares[row][col] && board.squares[row][col]?.color === board.currentPlayer) {
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
    this.currentMoveEvaluation = '';
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
    // Make sure we have the complete game history
    const gameState = this.gameService.getCurrentGameState();
    if (gameState.history.length <= 1) {
      console.error('No game history available for replay');
      return;
    }
    
    this.isReplayMode = true;
    
    // Start from move 0 (initial state)
    this.currentReplayMove = 0;
    this.gameService.setReplayState(this.currentReplayMove);
    
    // Hide game over modal if it was shown
    this.showGameOverModal = false;
    
    // Clear move evaluation and other visual indicators
    this.currentMoveEvaluation = '';
    this.showHintOnBoard = false;
    this.preMoveService.clearPreMoves();
    
    // Start analyzing the first position
    this.analyzePosition();
  }
  
  // Exit replay mode
  exitReplayMode(): void {
    this.isReplayMode = false;
    
    // Return to current game state (last move in history)
    const gameState = this.gameService.getCurrentGameState();
    this.gameService.setReplayState(gameState.history.length - 1);
    
    // If game was over, show the game over modal again
    if (this.board.isCheckmate || this.board.isStalemate || this.resignedPlayer) {
      this.showGameOverModal = true;
    }
  }
  
  // Navigate through replay moves
  nextMove(): void {
    if (!this.isReplayMode) return;
    
    // Calculate the max move index (number of moves in history - 1)
    const maxMoveIndex = this.gameService.getCurrentGameState().history.length - 1;
    
    if (this.currentReplayMove < maxMoveIndex) {
      this.currentReplayMove++;
      this.gameService.setReplayState(this.currentReplayMove);
      
      // Highlight the last move
      const board = this.gameService.board();
      if (board.lastMove) {
        this.lastMovedFrom = board.lastMove.from;
        this.lastMovedTo = board.lastMove.to;
      }
      
      // Analyze this position
      this.analyzePosition();
    }
  }
  
  prevMove(): void {
    if (!this.isReplayMode || this.currentReplayMove <= 0) return;
    
    this.currentReplayMove--;
    this.gameService.setReplayState(this.currentReplayMove);
    
    // Update last move highlight
    const board = this.gameService.board();
    if (this.currentReplayMove > 0 && board.lastMove) {
        this.lastMovedFrom = board.lastMove.from;
        this.lastMovedTo = board.lastMove.to;
      } else {
        this.lastMovedFrom = null;
        this.lastMovedTo = null;
      }
    
    // Analyze this position
    this.analyzePosition();
  }
  
  // Analyze the current position
  analyzePosition(): void {
    // If we've already analyzed this position, use the cached result
    if (this.analysisCache.has(this.currentReplayMove)) {
      const analysis = this.analysisCache.get(this.currentReplayMove)!;
      this.moveQuality = analysis.quality;
      this.moveQualityMessage = analysis.message;
      this.currentPositionEval = analysis.evaluation;
      this.evaluationScore = this.currentPositionEval;
      return;
    }
    
    // Skip analysis for the initial position (move 0)
    if (this.currentReplayMove === 0) {
      this.moveQuality = null;
      this.moveQualityMessage = '';
      this.previousPositionEval = 0;
      this.currentPositionEval = 0;
      this.evaluationScore = 0;
      return;
    }
    
    // Show analyzing state
    this.isAnalyzing = true;
    this.moveQuality = null;
    this.moveQualityMessage = 'Analyzing...';
    
    // Get the board state
    const board = this.gameService.board();
    
    // Convert board to FEN for analysis
    this.engineService.getStockfishAnalysis(this.engineService.boardToFen(board))
      .subscribe({
        next: (response: StockfishResponse) => {
          if (response.success) {
            // Get the evaluation
            this.currentPositionEval = response.evaluation ?? 0;
            this.evaluationScore = this.currentPositionEval;
            
            // Skip move quality for the first move
            if (this.currentReplayMove === 1) {
              this.previousPositionEval = 0;
              this.moveQuality = 'book';
              this.moveQualityMessage = 'Opening move';
    } else {
              // Get the previous move evaluation
              const previousBoard = this.gameService.getBoardAtMove(this.currentReplayMove - 2);
              
              // Get the evaluation for the previous position if not already analyzed
              if (this.analysisCache.has(this.currentReplayMove - 1)) {
                this.previousPositionEval = this.analysisCache.get(this.currentReplayMove - 1)!.evaluation;
                this.evaluateMoveQuality(board.lastMove);
              } else {
                this.engineService.getStockfishAnalysis(this.engineService.boardToFen(previousBoard))
                  .subscribe({
                    next: (prevResponse: StockfishResponse) => {
                      if (prevResponse.success) {
                        this.previousPositionEval = prevResponse.evaluation ?? 0;
                        this.evaluateMoveQuality(board.lastMove);
                      } else {
                        this.moveQuality = null;
                        this.moveQualityMessage = 'Analysis failed';
                        this.isAnalyzing = false;
                      }
                    },
                    error: () => {
                      this.moveQuality = null;
                      this.moveQualityMessage = 'Analysis failed';
                      this.isAnalyzing = false;
                    }
                  });
              }
            }
          } else {
            this.moveQuality = null;
            this.moveQualityMessage = 'Analysis failed';
          }
          
          this.isAnalyzing = false;
        },
        error: () => {
          this.moveQuality = null;
          this.moveQualityMessage = 'Analysis failed';
          this.isAnalyzing = false;
        }
      });
  }
  
  // Evaluate the quality of a move
  evaluateMoveQuality(lastMove: Move | null): void {
    if (!lastMove) {
      this.moveQuality = null;
      this.moveQualityMessage = '';
      return;
    }
    
    const moveColor = lastMove.piece.color;
    
    // Check for brilliant moves
    if (this.engineService.isBrilliantMove(this.previousPositionEval, this.currentPositionEval, moveColor, lastMove)) {
      this.moveQuality = 'brilliant';
      this.moveQualityMessage = 'Brilliant move! An exceptional, non-obvious move that significantly improves the position.';
    } else {
      // Get standard move quality
      this.moveQuality = this.engineService.getMoveQuality(this.previousPositionEval, this.currentPositionEval, moveColor);
      
      // Set appropriate message
      switch (this.moveQuality) {
        case 'best':
          this.moveQualityMessage = 'Best move! Perfect play.';
          break;
        case 'excellent':
          this.moveQualityMessage = 'Excellent move! Very strong play.';
          break;
        case 'good':
          this.moveQualityMessage = 'Good move! A solid choice.';
          break;
        case 'okay':
          this.moveQualityMessage = 'Okay move. Not the strongest, but reasonable.';
          break;
        case 'inaccuracy':
          this.moveQualityMessage = 'Inaccuracy. There was a better move available.';
          break;
        case 'mistake':
          this.moveQualityMessage = 'Mistake. This move weakens your position.';
          break;
        case 'blunder':
          this.moveQualityMessage = 'Blunder! This move gives away a significant advantage.';
          break;
        case 'book':
          this.moveQualityMessage = 'Book move from standard opening theory.';
          break;
        default:
          this.moveQualityMessage = '';
      }
    }
    
    // Cache the analysis
    this.analysisCache.set(this.currentReplayMove, {
      quality: this.moveQuality,
      message: this.moveQualityMessage,
      evaluation: this.currentPositionEval
    });
  }
  
  // Get color class for move quality
  getMoveQualityClass(): string {
    if (!this.moveQuality) return '';
    
    switch (this.moveQuality) {
      case 'brilliant': return 'text-fuchsia-400';
      case 'best': return 'text-emerald-400';
      case 'excellent': return 'text-green-400';
      case 'good': return 'text-teal-400';
      case 'okay': return 'text-blue-400';
      case 'book': return 'text-purple-400';
      case 'inaccuracy': return 'text-yellow-400';
      case 'mistake': return 'text-orange-400';
      case 'blunder': return 'text-red-400';
      default: return '';
    }
  }
  
  // Start a pre-move
  startPreMove(row: number, col: number): void {
    // Find the real position of the piece if it's virtual
    let realRow = row;
    let realCol = col;
    
    // If the piece is a virtual piece, find its original position
    const origPos = this.preMoveService.getOriginalPositionOfVirtualPieceAt(row, col);
    if (origPos) {
      realRow = origPos.row;
      realCol = origPos.col;
    }
    
    const piece = this.board.squares[realRow][realCol];
    if (!piece || piece.color !== 'white') return;
    
    this.preMoveService.startPreMove(row, col);
  }
  
  // Set the destination for a pre-move
  setPreMoveDestination(row: number, col: number): void {
    if (!this.preMoveService.activeFrom) return;
    this.preMoveService.setPreMoveDestination(row, col);
  }
  
  // Execute the next pre-move in the queue
  executeNextPreMove(): void {
    this.preMoveService.executeNextPreMove();
    
    // Track last move after execution
    this.trackLastMove();
  }
  
  // Update virtual positions after pre-move changes (wrapper for service method)
  private updateVirtualPositions(): void {
    // Just using this as a convenience wrapper - we can't access the private method directly
    this.preMoveService.clearPreMoves();
    
    // Re-add all premoves (this is a workaround since we can't call the private method)
    for (const preMove of this.preMoveService.preMoveQueue) {
      this.preMoveService.setPreMoveDestination(preMove.to.row, preMove.to.col);
    }
  }

  // Check if a piece is part of the pre-move queue
  isPieceInPreMoveQueue(row: number, col: number): boolean {
    return this.preMoveService.hasPiecePreMove(row, col);
  }
  
  // Cancel all pre-moves for a specific piece
  cancelPreMovesForPiece(row: number, col: number): void {
    this.preMoveService.cancelPreMovesForPiece(row, col);
  }

  // Check if a position is part of a pre-move
  isPreMove(row: number, col: number): boolean {
    if (this.preMoveService.preMoveQueue.length === 0) return false;
    
    // Check if position is part of any pre-move in the queue
    return this.preMoveService.preMoveQueue.some(move => 
      (move.from.row === row && move.from.col === col) || 
      (move.to.row === row && move.to.col === col)
    );
  }
  
  // Check if a position is the destination of a pre-move
  isPreMoveDestination(row: number, col: number): boolean {
    if (this.preMoveService.preMoveQueue.length === 0) return false;
    
    // Check if position is the destination of any pre-move in the queue
    return this.preMoveService.preMoveQueue.some(move => move.to.row === row && move.to.col === col);
  }

  // Generate a unique key for a piece based on its position
  private getPieceKey(row: number, col: number): string {
    return `${row},${col}`;
  }
  
  // Get the virtual position of a piece after pre-moves
  getVirtualPosition(row: number, col: number): Position {
    const virtualPos = this.preMoveService.getVirtualPosition(row, col);
    return virtualPos || { row, col };
  }
  
  // Check if a piece has a virtual position
  hasVirtualPosition(row: number, col: number): boolean {
    return !!this.preMoveService.getVirtualPosition(row, col);
  }
  
  // Check if a position has a virtual piece on it
  hasVirtualPieceAt(row: number, col: number): boolean {
    return this.preMoveService.hasVirtualPieceAt(row, col);
  }
  
  // Get the original position of a piece that's virtually at the given position
  getOriginalPositionOfVirtualPieceAt(row: number, col: number): Position | null {
    for (const [key, pos] of this.preMoveService.virtualPositions.entries()) {
      if (pos.row === row && pos.col === col) {
        const [origRow, origCol] = key.split(',').map(Number);
        return { row: origRow, col: origCol };
      }
    }
    return null;
  }
  
  // Get the piece at a position, considering virtual positions
  getEffectivePieceAt(row: number, col: number): Piece | null {
    const board = this.board;
    
    // Check if there's a real piece at this position that hasn't moved virtually
    const piece = board.squares[row][col];
    if (piece) {
      const key = this.getPieceKey(row, col);
      if (!this.preMoveService.virtualPositions.has(key)) {
        return piece;
      }
    }
    
    // Check if there's a virtual piece at this position
    const origPos = this.getOriginalPositionOfVirtualPieceAt(row, col);
    if (origPos) {
      return board.squares[origPos.row][origPos.col];
    }
    
    return null;
  }

  // Check if a position is part of the hint
  isHintMove(row: number, col: number): boolean {
    if (!this.showHintOnBoard || !this.hintMove) return false;
    
    return (
      (this.hintMove.from.row === row && this.hintMove.from.col === col) ||
      (this.hintMove.to.row === row && this.hintMove.to.col === col)
    );
  }
  
  // Check if a position is the destination of a hint
  isHintDestination(row: number, col: number): boolean {
    if (!this.showHintOnBoard || !this.hintMove) return false;
    
    return (this.hintMove.to.row === row && this.hintMove.to.col === col);
  }

  // Get the total number of moves in the game history
  getTotalMoves(): number {
    return this.gameService.getCurrentGameState().history.length - 1;
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
  
  // Handle drag start event
  onDragStart(event: DragEvent, row: number, col: number): void {
    if (this.isReplayMode || this.showPromotionModal) {
      event.preventDefault();
      return;
    }
    
    const piece = this.board.squares[row][col];
    
    if (!piece) {
      event.preventDefault();
      return;
    }
    
    // Allow dragging own pieces even when it's not your turn (for pre-moves)
    if (piece.color === 'white' && this.board.currentPlayer === 'black') {
      // Start a pre-move
      this.preMoveService.startPreMove(row, col);
      
      // Set data to transfer
      if (event.dataTransfer) {
        event.dataTransfer.setData('text/plain', `premove:${row},${col}`);
        event.dataTransfer.effectAllowed = 'move';
      }
      return;
    }
    
    // Only allow dragging pieces of the current player for normal moves
    if (piece.color !== this.board.currentPlayer) {
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
    if (this.isReplayMode || this.showPromotionModal) {
      return; // Don't prevent default to disallow drop
    }
    
    // Allow drop for both normal moves and pre-moves
    event.preventDefault();
  }
  
  // Handle drop event
  onDrop(event: DragEvent, row: number, col: number): void {
    event.preventDefault();
    
    if (this.isReplayMode || this.showPromotionModal) return;
    
    const data = event.dataTransfer?.getData('text/plain');
    
    // Handle pre-moves
    if (data?.startsWith('premove:')) {
      const coords = data.replace('premove:', '').split(',').map(Number);
      const fromRow = coords[0];
      const fromCol = coords[1];
      
      // Start pre-move if not already started
      if (!this.preMoveService.activeFrom) {
        this.preMoveService.startPreMove(fromRow, fromCol);
      }
      
      // Set destination
      this.preMoveService.setPreMoveDestination(row, col);
      return;
    }
    
    // Handle normal moves
    if (data && !data.startsWith('premove:')) {
      const [fromRow, fromCol] = data.split(',').map(Number);
      this.draggedPiece = this.board.squares[fromRow][fromCol];
      
      if (!this.draggedPiece) return;
      
      // Check for pawn promotion
      if (this.isPawnPromotion(this.draggedPiece, { row, col })) {
        this.pendingPromotionMove = {
          from: { row: fromRow, col: fromCol },
          to: { row, col }
        };
        this.promotionPosition = { row, col };
        this.showPromotionModal = true;
        return;
      }
      
      // Move the piece if it's a legal move
      this.gameService.selectPiece(fromRow, fromCol);
      if (this.isLegalMove(row, col)) {
        const moveSuccessful = this.gameService.movePiece(row, col);
        
        if (moveSuccessful) {
          this.trackLastMove();
          this.showHintOnBoard = false;
        }
      }
      
      this.draggedPiece = null;
    }
  }
  
  // End drag
  onDragEnd(): void {
      this.draggedPiece = null;
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
    
    // Clear current move evaluation
    this.currentMoveEvaluation = '';
  }
  
  // Show a hint for the current player
  showHint(): void {
    if (this.isReplayMode) return;
    
    // Get a hint from the chess engine
    this.engineService.getBestMove(this.board, this.board.currentPlayer)
      .subscribe({
        next: (result: EngineResult) => {
          if (result.success && result.bestMove) {
            this.hintMove = result.bestMove;
            this.hintMessage = `Consider moving your ${result.bestMove.piece.type} from ${this.formatPosition(result.bestMove.from)} to ${this.formatPosition(result.bestMove.to)}.`;
            this.showHintOnBoard = true;
          } else {
            this.hintMessage = result.error || 'No good moves available at the moment.';
            this.showHintModal = true;
          }
        },
        error: (error) => {
          console.error('Error getting hint:', error);
          this.hintMessage = 'Error calculating best move. Please try again.';
          this.showHintModal = true;
        }
      });
  }
  
  // Toggle hint visibility
  toggleHint(): void {
    this.showHintOnBoard = !this.showHintOnBoard;
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
  
  // Show save game modal
  showSaveGame(): void {
    if (this.isReplayMode) return;
    
    this.gameName = `Game ${new Date().toLocaleString()}`;
    this.showSaveGameModal = true;
  }
  
  // Save the current game
  saveGame(): void {
    if (!this.gameName.trim()) {
      this.gameName = `Game ${new Date().toLocaleString()}`;
    }
    
    this.persistenceService.saveGame(this.gameName);
    this.showSaveGameModal = false;
  }

  // Check if a position has a virtual piece visualization
  hasVirtualPieceVisualization(row: number, col: number): boolean {
    return this.hasVirtualPieceAt(row, col);
  }
  
  // Get the piece that should be visualized at a position
  getVirtualPieceAt(row: number, col: number): Piece | null {
    return this.preMoveService.getVirtualPieceAt(row, col, this.board);
  }

  // Add this getter to map preMoveQueue to preMoveChain for template compatibility
  get preMoveChain(): PreMove[] {
    return this.preMoveService.preMoveQueue;
  }

  // Clear all pre-moves (wrapper for service method)
  clearPreMoves(): void {
    this.preMoveService.clearPreMoves();
  }
} 