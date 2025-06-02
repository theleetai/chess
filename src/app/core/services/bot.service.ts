import { Injectable, inject } from '@angular/core';
import { GameService } from './game.service';
import { Board } from '../models/board.model';
import { Piece, Position } from '../models/piece.model';

@Injectable({
  providedIn: 'root'
})
export class BotService {
  private gameService = inject(GameService);
  
  constructor() {}

  // Make a move for the bot
  makeBotMove(): void {
    const board = this.gameService.board();
    
    // Only make a move if it's the bot's turn (black)
    if (board.currentPlayer !== 'black') return;
    
    // Delay the bot's move for a more natural feeling
    setTimeout(() => {
      const move = this.calculateBestMove(board);
      if (move) {
        this.gameService.selectPiece(move.from.row, move.from.col);
        this.gameService.movePiece(move.to.row, move.to.col);
      }
    }, 500);
  }

  // Calculate the best move for the bot
  private calculateBestMove(board: Board): { from: Position, to: Position } | null {
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