import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, catchError, throwError } from 'rxjs';
import { GameService } from './game.service';
import { Board } from '../models/board.model';
import { Piece, Position, PieceType, PieceColor } from '../models/piece.model';

export type EngineType = 'local' | 'chessdb' | 'stockfish';

export interface EngineResult {
  success: boolean;
  evaluation: number;
  bestMove: { from: Position, to: Position, piece: Piece } | null;
  continuation?: string;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ChessEngineService {
  private readonly STOCKFISH_API = 'https://stockfish.online/api/s/v2.php';
  private readonly CHESSDB_API = 'https://www.chessdb.cn/cdb.php';
  
  // Default engine settings
  private _engineType: EngineType = 'local';
  private _engineDepth: number = 10;
  
  constructor(
    private http: HttpClient,
    private gameService: GameService
  ) {}
  
  // Getters and setters for engine settings
  get engineType(): EngineType {
    return this._engineType;
  }
  
  set engineType(type: EngineType) {
    this._engineType = type;
  }
  
  get engineDepth(): number {
    return this._engineDepth;
  }
  
  set engineDepth(depth: number) {
    // Ensure depth is between 1 and 15
    this._engineDepth = Math.max(1, Math.min(15, depth));
  }
  
  // Get the best move based on the current engine settings
  getBestMove(board: Board, color: PieceColor): Observable<EngineResult> {
    switch (this._engineType) {
      case 'chessdb':
        return this.getChessDBMove(board);
      case 'stockfish':
        return this.getStockfishMove(board);
      case 'local':
      default:
        return of(this.getLocalMove(board, color));
    }
  }
  
  // Get a move from the ChessDB API
  private getChessDBMove(board: Board): Observable<EngineResult> {
    const fen = this.boardToFEN(board);
    const url = `${this.CHESSDB_API}?action=querypv&board=${encodeURIComponent(fen)}&json=1`;
    
    return this.http.get<any>(url).pipe(
      catchError(error => {
        console.error('ChessDB API error:', error);
        return throwError(() => ({ 
          success: false, 
          evaluation: 0, 
          bestMove: null, 
          error: 'Failed to connect to ChessDB API'
        }));
      }),
      catchError(error => of({
        success: false,
        evaluation: 0,
        bestMove: null,
        error: error.message || 'Failed to get move from ChessDB'
      }))
    );
  }
  
  // Get a move from the Stockfish API
  private getStockfishMove(board: Board): Observable<EngineResult> {
    const fen = this.boardToFEN(board);
    const params = {
      fen: fen,
      depth: this._engineDepth.toString()
    };
    
    return this.http.post<any>(this.STOCKFISH_API, params).pipe(
      catchError(error => {
        console.error('Stockfish API error:', error);
        return throwError(() => ({ 
          success: false, 
          evaluation: 0, 
          bestMove: null, 
          error: 'Failed to connect to Stockfish API' 
        }));
      }),
      catchError(error => of({
        success: false,
        evaluation: 0,
        bestMove: null,
        error: error.message || 'Failed to get move from Stockfish'
      }))
    );
  }
  
  // Local move calculation fallback
  private getLocalMove(board: Board, color: PieceColor): EngineResult {
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
    
    return {
      success: true,
      evaluation: bestMove?.score || 0,
      bestMove: bestMove ? { from: bestMove.from, to: bestMove.to, piece: bestMove.piece } : null
    };
  }
  
  // Convert a chess board to FEN notation
  private boardToFEN(board: Board): string {
    let fen = '';
    
    // Board position
    for (let row = 7; row >= 0; row--) {
      let emptyCount = 0;
      
      for (let col = 0; col < 8; col++) {
        const piece = board.squares[row][col];
        
        if (piece) {
          if (emptyCount > 0) {
            fen += emptyCount;
            emptyCount = 0;
          }
          
          let pieceChar = this.getPieceChar(piece.type);
          if (piece.color === 'white') {
            pieceChar = pieceChar.toUpperCase();
          }
          
          fen += pieceChar;
        } else {
          emptyCount++;
        }
      }
      
      if (emptyCount > 0) {
        fen += emptyCount;
      }
      
      if (row > 0) {
        fen += '/';
      }
    }
    
    // Active color
    fen += ' ' + (board.currentPlayer === 'white' ? 'w' : 'b');
    
    // Castling availability (simplified)
    let castling = '';
    
    // White kingside
    if (!board.whiteKingMoved && !board.whiteKingsideRookMoved) {
      castling += 'K';
    }
    
    // White queenside
    if (!board.whiteKingMoved && !board.whiteQueensideRookMoved) {
      castling += 'Q';
    }
    
    // Black kingside
    if (!board.blackKingMoved && !board.blackKingsideRookMoved) {
      castling += 'k';
    }
    
    // Black queenside
    if (!board.blackKingMoved && !board.blackQueensideRookMoved) {
      castling += 'q';
    }
    
    fen += ' ' + (castling || '-');
    
    // En passant target square (simplified)
    fen += ' ' + '-';
    
    // Halfmove clock (simplified)
    fen += ' ' + '0';
    
    // Fullmove number
    fen += ' ' + Math.ceil(board.moveHistory.length / 2 + 1);
    
    return fen;
  }
  
  // Get character representation for a piece
  private getPieceChar(type: PieceType): string {
    switch (type) {
      case 'king': return 'k';
      case 'queen': return 'q';
      case 'rook': return 'r';
      case 'bishop': return 'b';
      case 'knight': return 'n';
      case 'pawn': return 'p';
    }
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
  
  // Shuffle an array in place
  private shuffleArray<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }
} 