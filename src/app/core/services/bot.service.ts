import { Injectable, inject } from '@angular/core';
import { GameService } from './game.service';
import { ChessEngineService } from './chess-engine.service';
import { Board } from '../models/board.model';
import { Piece, Position, PieceColor, PieceType } from '../models/piece.model';

@Injectable({
  providedIn: 'root'
})
export class BotService {
  private gameService = inject(GameService);
  private engineService = inject(ChessEngineService);
  
  constructor() {}

  // Make a move for the bot
  makeBotMove(): void {
    const board = this.gameService.board();
    
    // Only make a move if it's the bot's turn (black)
    if (board.currentPlayer !== 'black') return;
    
    // Delay the bot's move for a more natural feeling
    setTimeout(() => {
      this.engineService.getBestMove(board, 'black').subscribe({
        next: (result) => {
          if (result.success && result.bestMove) {
            const move = result.bestMove;
            this.gameService.selectPiece(move.from.row, move.from.col);
            this.gameService.movePiece(move.to.row, move.to.col);
          } else {
            // Fallback to basic move if engine failed
            const move = this.calculateBasicMove(board);
            if (move) {
              this.gameService.selectPiece(move.from.row, move.from.col);
              this.gameService.movePiece(move.to.row, move.to.col);
            }
          }
        },
        error: () => {
          // Fallback to basic move on error
          const move = this.calculateBasicMove(board);
          if (move) {
            this.gameService.selectPiece(move.from.row, move.from.col);
            this.gameService.movePiece(move.to.row, move.to.col);
          }
        }
      });
    }, 500);
  }

  // Calculate a basic move for the bot (fallback)
  private calculateBasicMove(board: Board): { from: Position, to: Position } | null {
    const botPieces = this.getBotPieces(board);
    
    // Shuffle the pieces for some randomness
    this.shuffleArray(botPieces);
    
    // Try to find a capturing move first
    for (const piece of botPieces) {
      this.gameService.selectPiece(piece.position.row, piece.position.col);
      const legalMoves = this.gameService.board().legalMoves;
      
      // Look for a capturing move
      for (const move of legalMoves) {
        const targetPiece = board.squares[move.row][move.col];
        if (targetPiece) {
          return { from: piece.position, to: move };
        }
      }
    }
    
    // If no capturing move, make a random legal move
    for (const piece of botPieces) {
      this.gameService.selectPiece(piece.position.row, piece.position.col);
      const legalMoves = this.gameService.board().legalMoves;
      
      if (legalMoves.length > 0) {
        const randomMoveIndex = Math.floor(Math.random() * legalMoves.length);
        return { from: piece.position, to: legalMoves[randomMoveIndex] };
      }
    }
    
    return null;
  }

  // Get a suggested best move for any color (for hint feature)
  getBestMove(color: PieceColor): { from: Position, to: Position, piece: Piece } | null {
    const board = this.gameService.board();
    
    // Get all pieces of the requested color
    const pieces: Piece[] = [];
    
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = board.squares[row][col];
        if (piece && piece.color === color) {
          pieces.push(piece);
        }
      }
    }
    
    // Shuffle the pieces for some randomness
    this.shuffleArray(pieces);
    
    // Evaluate moves using a simple heuristic
    let bestMove: { from: Position, to: Position, piece: Piece, score: number } | null = null;
    
    // Try all pieces and their moves
    for (const piece of pieces) {
      this.gameService.selectPiece(piece.position.row, piece.position.col);
      const legalMoves = this.gameService.board().legalMoves;
      
      for (const move of legalMoves) {
        let moveScore = 0;
        
        // Check if this is a capture
        const targetPiece = board.squares[move.row][move.col];
        if (targetPiece) {
          // Score captures based on piece values
          moveScore += this.getPieceValue(targetPiece.type) - this.getPieceValue(piece.type) / 10;
        }
        
        // Bonus for center control (middle 4 squares)
        if ((move.row === 3 || move.row === 4) && (move.col === 3 || move.col === 4)) {
          moveScore += 0.5;
        }
        
        // Bonus for pawn advancement (higher score as pawns approach promotion)
        if (piece.type === 'pawn') {
          const promotionDirection = color === 'white' ? 1 : -1;
          const distanceToPromotion = color === 'white' ? (7 - move.row) : move.row;
          moveScore += (7 - distanceToPromotion) * 0.1;
        }
        
        // Check if this is better than our current best move
        if (bestMove === null || moveScore > bestMove.score) {
          bestMove = { from: piece.position, to: move, piece, score: moveScore };
        }
      }
    }
    
    // Clear selection
    this.gameService.clearSelection();
    
    if (bestMove) {
      return { from: bestMove.from, to: bestMove.to, piece: bestMove.piece };
    }
    
    return null;
  }
  
  // Get relative value of a piece type
  private getPieceValue(type: PieceType): number {
    switch(type) {
      case 'pawn': return 1;
      case 'knight': 
      case 'bishop': return 3;
      case 'rook': return 5;
      case 'queen': return 9;
      case 'king': return 100; // Should never be captured, but high value for calculation
      default: return 0;
    }
  }

  // Get all the bot's pieces
  private getBotPieces(board: Board): Piece[] {
    const botPieces: Piece[] = [];
    
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = board.squares[row][col];
        if (piece && piece.color === 'black') {
          botPieces.push(piece);
        }
      }
    }
    
    return botPieces;
  }

  // Shuffle an array in place
  private shuffleArray<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }
} 