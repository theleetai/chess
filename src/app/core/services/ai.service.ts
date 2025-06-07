import { Injectable } from '@angular/core';
import { ChessNetwork, NetworkPrediction } from '../../features/training/models/chess-network';
import { GameService } from './game.service';
import { Board } from '../models/board.model';
import { Piece, Position, PieceColor } from '../models/piece.model';

@Injectable({
  providedIn: 'root'
})
export class AIService {
  private network: ChessNetwork | null = null;
  private isModelLoaded = false;

  constructor(private gameService: GameService) {}

  // Load AI model from file
  async loadModelFromFile(file: File): Promise<void> {
    try {
      this.network = new ChessNetwork();
      await this.network.loadModelFromFile(file);
      this.isModelLoaded = true;
      console.log('AI model loaded successfully');
    } catch (error) {
      console.error('Error loading AI model:', error);
      this.isModelLoaded = false;
      this.network = null;
      
      // Provide more specific error messages
      if (error instanceof Error) {
        throw new Error(error.message);
      } else {
        throw new Error('Failed to load AI model. Please ensure you selected the correct .json file.');
      }
    }
  }

  // Add method to load from multiple files
  async loadModelFromFiles(jsonFile: File, weightsFile: File): Promise<void> {
    try {
      this.network = new ChessNetwork();
      await this.network.loadModelFromFiles(jsonFile, weightsFile);
      this.isModelLoaded = true;
      console.log('AI model loaded successfully from both files');
    } catch (error) {
      console.error('Error loading AI model from files:', error);
      this.isModelLoaded = false;
      this.network = null;
      
      if (error instanceof Error) {
        throw new Error(error.message);
      } else {
        throw new Error('Failed to load AI model from files.');
      }
    }
  }

  // Check if AI model is ready
  get isReady(): boolean {
    return this.isModelLoaded && this.network !== null;
  }

  // Get AI move suggestion
  async getAIMove(board: Board, color: PieceColor): Promise<{ from: Position, to: Position, piece: Piece } | null> {
    if (!this.isReady || !this.network) {
      throw new Error('AI model not loaded');
    }

    try {
      // Encode the board state
      const boardState = this.network.encodeBoardState(board);
      
      // Get AI prediction
      const prediction = await this.network.predict(boardState);
      
      // Convert policy to move
      const move = this.convertPolicyToMove(prediction.policy, board, color);
      
      return move;
    } catch (error) {
      console.error('Error getting AI move:', error);
      return null;
    }
  }

  // Convert policy output to chess move
  private convertPolicyToMove(policy: Float32Array, board: Board, color: PieceColor): { from: Position, to: Position, piece: Piece } | null {
    // Create a list of legal moves with their policy scores
    const legalMoves: { from: Position, to: Position, piece: Piece, score: number }[] = [];

    // Get all pieces of the AI color
    for (let fromRow = 0; fromRow < 8; fromRow++) {
      for (let fromCol = 0; fromCol < 8; fromCol++) {
        const piece = board.squares[fromRow][fromCol];
        if (piece && piece.color === color) {
          // Select this piece to get legal moves
          this.gameService.selectPiece(fromRow, fromCol);
          const currentBoard = this.gameService.board();
          
          // Check each legal move
          for (const legalMove of currentBoard.legalMoves) {
            const toRow = legalMove.row;
            const toCol = legalMove.col;
            
            // Calculate policy index (from_square * 64 + to_square)
            const fromSquare = fromRow * 8 + fromCol;
            const toSquare = toRow * 8 + toCol;
            const policyIndex = fromSquare * 64 + toSquare;
            
            if (policyIndex < policy.length) {
              legalMoves.push({
                from: { row: fromRow, col: fromCol },
                to: { row: toRow, col: toCol },
                piece: piece,
                score: policy[policyIndex]
              });
            }
          }
        }
      }
    }

    // Clear selection
    this.gameService.clearSelection();

    // Sort by score and return the best move
    if (legalMoves.length === 0) {
      return null;
    }

    legalMoves.sort((a, b) => b.score - a.score);
    const bestMove = legalMoves[0];

    return {
      from: bestMove.from,
      to: bestMove.to,
      piece: bestMove.piece
    };
  }

  // Make an AI move
  async makeAIMove(): Promise<boolean> {
    if (!this.isReady) {
      return false;
    }

    const board = this.gameService.board();
    
    // Only make move if it's AI's turn (black)
    if (board.currentPlayer !== 'black') {
      return false;
    }

    try {
      const move = await this.getAIMove(board, 'black');
      
      if (move) {
        // Execute the move
        this.gameService.selectPiece(move.from.row, move.from.col);
        const moveSuccess = this.gameService.movePiece(move.to.row, move.to.col);
        
        return moveSuccess;
      }
      
      return false;
    } catch (error) {
      console.error('Error making AI move:', error);
      return false;
    }
  }

  // Dispose of the model to free memory
  dispose(): void {
    if (this.network) {
      // Note: ChessNetwork doesn't have a dispose method, but we could add one
      this.network = null;
    }
    this.isModelLoaded = false;
  }
} 