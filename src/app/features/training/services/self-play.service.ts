import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { Board } from '../../../core/models/board.model';
import { GameService } from '../../../core/services/game.service';
import { Move, PieceColor } from '../../../core/models/piece.model';
import { ChessNetwork, TrainingExample } from '../models/chess-network';
import { MCTS, MCTSSearchResult } from '../models/mcts';

export interface GameInstance {
  id: string;
  gameService: GameService;
  mcts: MCTS;
  gameHistory: GamePosition[];
  isFinished: boolean;
  result: number | null; // 1 for white win, -1 for black win, 0 for draw
  moveCount: number;
}

export interface GamePosition {
  board: Board;
  boardEncoding: Float32Array;
  policyTarget: Float32Array;
  visitCounts: Map<string, number>;
  currentPlayer: PieceColor;
  move?: Move;
}

export interface SelfPlayStats {
  gamesCompleted: number;
  gamesInProgress: number;
  totalMoves: number;
  whiteWins: number;
  blackWins: number;
  draws: number;
  averageGameLength: number;
  examplesGenerated: number;
}

@Injectable({
  providedIn: 'root'
})
export class SelfPlayService {
  private games: Map<string, GameInstance> = new Map();
  private replayBuffer: TrainingExample[] = [];
  private maxBufferSize = 50000;
  
  // Observables for monitoring
  private statsSubject = new BehaviorSubject<SelfPlayStats>({
    gamesCompleted: 0,
    gamesInProgress: 0,
    totalMoves: 0,
    whiteWins: 0,
    blackWins: 0,
    draws: 0,
    averageGameLength: 0,
    examplesGenerated: 0
  });
  
  private trainingDataSubject = new Subject<TrainingExample[]>();
  
  public stats$ = this.statsSubject.asObservable();
  public trainingData$ = this.trainingDataSubject.asObservable();
  
  constructor(private network: ChessNetwork) {}
  
  // Start parallel self-play games
  async startSelfPlay(
    numGames: number,
    mctsSimulations: number = 100,
    temperature: number = 1.0,
    temperatureDecayMoves: number = 10
  ): Promise<void> {
    console.log(`Starting ${numGames} self-play games...`);
    
    // Create game instances
    for (let i = 0; i < numGames; i++) {
      const gameId = `game_${Date.now()}_${i}`;
      const gameInstance = this.createGameInstance(gameId, mctsSimulations);
      this.games.set(gameId, gameInstance);
    }
    
    // Run games in parallel
    const gamePromises = Array.from(this.games.values()).map(game => 
      this.playGame(game, temperature, temperatureDecayMoves)
    );
    
    // Wait for all games to complete
    await Promise.all(gamePromises);
    
    console.log('All self-play games completed');
    this.updateStats();
  }
  
  // Create a new game instance
  private createGameInstance(gameId: string, mctsSimulations: number): GameInstance {
    const gameService = new GameService();
    const mcts = new MCTS(this.network);
    
    return {
      id: gameId,
      gameService,
      mcts,
      gameHistory: [],
      isFinished: false,
      result: null,
      moveCount: 0
    };
  }
  
  // Play a single self-play game
  private async playGame(
    game: GameInstance, 
    temperature: number, 
    temperatureDecayMoves: number
  ): Promise<void> {
    try {
      while (!game.isFinished) {
        const board = game.gameService.board();
        
        // Check if game is over
        if (board.isCheckmate || board.isStalemate || game.moveCount >= 500) {
          this.finishGame(game);
          break;
        }
        
        // Calculate temperature for this move
        const currentTemperature = game.moveCount < temperatureDecayMoves ? temperature : 0.1;
        
        // Run MCTS search
        const searchResult = await game.mcts.search(board, 100, currentTemperature);
        
        // Store position for training
        const position: GamePosition = {
          board: this.cloneBoard(board),
          boardEncoding: this.network.encodeBoardState(board),
          policyTarget: searchResult.policyProbabilities,
          visitCounts: searchResult.visitCounts,
          currentPlayer: board.currentPlayer,
          move: searchResult.bestMove
        };
        
        game.gameHistory.push(position);
        
        // Execute the best move
        const move = searchResult.bestMove;
        
        // First select the piece, then move it
        game.gameService.selectPiece(move.from.row, move.from.col);
        
        // Verify piece was selected
        const selectedPiece = game.gameService.board().selectedPiece;
        if (!selectedPiece) {
          console.error(`Failed to select piece at ${move.from.row},${move.from.col} in game ${game.id}`);
          console.error('Current board state:', {
            currentPlayer: game.gameService.board().currentPlayer,
            pieceAtPosition: game.gameService.board().squares[move.from.row][move.from.col],
            legalMoves: game.gameService.board().legalMoves.length
          });
          this.finishGame(game, 0); // Draw due to error
          return;
        }
        
        // Check if the target move is legal
        const legalMoves = game.gameService.board().legalMoves;
        const isLegalMove = legalMoves.some(legalMove => 
          legalMove.row === move.to.row && legalMove.col === move.to.col
        );
        
        if (!isLegalMove) {
          console.error(`Move ${move.from.row},${move.from.col} -> ${move.to.row},${move.to.col} is not legal in game ${game.id}`);
          console.error('Legal moves:', legalMoves);
          this.finishGame(game, 0); // Draw due to error
          return;
        }
        
        const moveSuccessful = game.gameService.movePiece(move.to.row, move.to.col);
        
        if (!moveSuccessful) {
          console.error(`Failed to execute move ${move.from.row},${move.from.col} -> ${move.to.row},${move.to.col} in game ${game.id}`);
          console.error('Current board state:', {
            currentPlayer: game.gameService.board().currentPlayer,
            selectedPiece: game.gameService.board().selectedPiece,
            legalMoves: game.gameService.board().legalMoves.length
          });
          this.finishGame(game, 0); // Draw due to error
          return;
        }
        
        // Log only every 5th move to reduce spam
        if (game.moveCount % 5 === 0) {
          console.log(`Game ${game.id}: Move ${game.moveCount + 1} - ${move.piece.color} ${move.piece.type}`);
        }
        
        // Increment move count
        game.moveCount++;
        
        // Yield control to prevent blocking
        if (game.moveCount % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 1));
        }
      }
      
      // Convert game to training examples
      if (game.result !== null) {
        const examples = this.convertGameToExamples(game);
        this.addToReplayBuffer(examples);
      }
      
    } catch (error) {
      console.error('Error in self-play game:', error);
      this.finishGame(game, 0); // Mark as draw on error
    }
  }
  
  // Finish a game and determine the result
  private finishGame(game: GameInstance, forcedResult?: number): void {
    game.isFinished = true;
    
    if (forcedResult !== undefined) {
      game.result = forcedResult;
    } else {
      const board = game.gameService.board();
      
      if (board.isCheckmate) {
        // Current player is in checkmate, so the other player wins
        game.result = board.currentPlayer === 'white' ? -1 : 1;
      } else {
        // Stalemate or max moves reached
        game.result = 0;
      }
    }
    
    // Clear MCTS cache to free memory
    game.mcts.clearCache();
  }
  
  // Convert completed game to training examples
  private convertGameToExamples(game: GameInstance): TrainingExample[] {
    const examples: TrainingExample[] = [];
    const gameResult = game.result!;
    
    for (let i = 0; i < game.gameHistory.length; i++) {
      const position = game.gameHistory[i];
      
      // Calculate value target based on game result and current player
      let valueTarget = gameResult;
      if (position.currentPlayer === 'black') {
        valueTarget = -gameResult; // Flip for black's perspective
      }
      
      const example: TrainingExample = {
        boardState: position.boardEncoding,
        policyTarget: position.policyTarget,
        valueTarget: valueTarget
      };
      
      examples.push(example);
    }
    
    return examples;
  }
  
  // Add examples to replay buffer
  private addToReplayBuffer(examples: TrainingExample[]): void {
    this.replayBuffer.push(...examples);
    
    // Maintain buffer size limit
    if (this.replayBuffer.length > this.maxBufferSize) {
      const excess = this.replayBuffer.length - this.maxBufferSize;
      this.replayBuffer.splice(0, excess); // Remove oldest examples
    }
    
    // Emit new training data
    this.trainingDataSubject.next([...examples]);
    this.updateStats();
  }
  
  // Sample a batch from the replay buffer
  sampleBatch(batchSize: number): TrainingExample[] {
    if (this.replayBuffer.length === 0) {
      return [];
    }
    
    const batch: TrainingExample[] = [];
    const bufferSize = this.replayBuffer.length;
    
    for (let i = 0; i < batchSize && i < bufferSize; i++) {
      const randomIndex = Math.floor(Math.random() * bufferSize);
      batch.push(this.replayBuffer[randomIndex]);
    }
    
    return batch;
  }
  
  // Get current replay buffer size
  getBufferSize(): number {
    return this.replayBuffer.length;
  }
  
  // Clear replay buffer
  clearBuffer(): void {
    this.replayBuffer = [];
    this.updateStats();
  }
  
  // Update statistics and clean up old games
  private updateStats(): void {
    const completedGames = Array.from(this.games.values()).filter(g => g.isFinished);
    const inProgressGames = Array.from(this.games.values()).filter(g => !g.isFinished);
    
    // Clean up old completed games, keep only the last 50
    if (completedGames.length > 50) {
      const sortedCompleted = completedGames.sort((a, b) => 
        parseInt(a.id.split('_')[1]) - parseInt(b.id.split('_')[1])
      );
      
      const gamesToRemove = sortedCompleted.slice(0, completedGames.length - 50);
      console.log(`Cleaning up ${gamesToRemove.length} old games`);
      
      gamesToRemove.forEach(game => {
        game.mcts.clearCache();
        this.games.delete(game.id);
      });
    }
    
    // Recalculate after cleanup
    const remainingCompleted = Array.from(this.games.values()).filter(g => g.isFinished);
    
    let whiteWins = 0;
    let blackWins = 0;
    let draws = 0;
    let totalMoves = 0;
    
    remainingCompleted.forEach(game => {
      totalMoves += game.moveCount;
      
      if (game.result === 1) {
        whiteWins++;
      } else if (game.result === -1) {
        blackWins++;
      } else {
        draws++;
      }
    });
    
    const stats: SelfPlayStats = {
      gamesCompleted: remainingCompleted.length,
      gamesInProgress: inProgressGames.length,
      totalMoves,
      whiteWins,
      blackWins,
      draws,
      averageGameLength: remainingCompleted.length > 0 ? totalMoves / remainingCompleted.length : 0,
      examplesGenerated: this.replayBuffer.length
    };
    
    this.statsSubject.next(stats);
  }
  
  // Stop all games
  stopAllGames(): void {
    this.games.forEach(game => {
      if (!game.isFinished) {
        this.finishGame(game, 0); // Mark as draw
      }
    });
    
    this.games.clear();
    this.updateStats();
  }
  
  // Clone board state
  private cloneBoard(board: Board): Board {
    const tempGameService = new GameService();
    tempGameService.loadGameState(board, [board]);
    return tempGameService.getCurrentGameState().currentState;
  }
  
  // Get active games for monitoring
  getActiveGames(): GameInstance[] {
    return Array.from(this.games.values());
  }
  
  // Get a specific game by ID
  getGame(gameId: string): GameInstance | undefined {
    return this.games.get(gameId);
  }
  
  // Reset service state
  reset(): void {
    this.stopAllGames();
    this.clearBuffer();
    this.games.clear();
    
    // Reset stats
    this.statsSubject.next({
      gamesCompleted: 0,
      gamesInProgress: 0,
      totalMoves: 0,
      whiteWins: 0,
      blackWins: 0,
      draws: 0,
      averageGameLength: 0,
      examplesGenerated: 0
    });
  }
  
  // Configure replay buffer size
  setMaxBufferSize(size: number): void {
    this.maxBufferSize = size;
    
    // Trim buffer if necessary
    if (this.replayBuffer.length > size) {
      const excess = this.replayBuffer.length - size;
      this.replayBuffer.splice(0, excess);
      this.updateStats();
    }
  }
  
  // Get training examples by game result (for analysis)
  getExamplesByResult(result: number): TrainingExample[] {
    return this.replayBuffer.filter((_, index) => {
      // This is a simplified approach - in practice, you'd need to track which examples came from which games
      return true; // Return all for now
    });
  }
} 