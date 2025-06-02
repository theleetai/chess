import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { Board } from '../models/board.model';
import { Move, Piece, Position, PieceColor, PieceType } from '../models/piece.model';

export type EngineType = 'local' | 'stockfish' | 'chessdb';

export interface EngineResult {
  success: boolean;
  bestMove?: { from: Position, to: Position, piece: Piece };
  evaluation?: number;
  error?: string;
}

export interface StockfishResponse {
  success: boolean;
  evaluation?: number;
  mate?: number | null;
  bestmove?: string;
  continuation?: string;
  data?: string; // Error information if success is false
}

export type MoveQuality = 'blunder' | 'mistake' | 'inaccuracy' | 'book' | 'okay' | 'good' | 'excellent' | 'best' | 'brilliant';

@Injectable({
  providedIn: 'root'
})
export class ChessEngineService {
  // Engine configuration
  engineType: EngineType = 'stockfish';
  engineDepth: number = 10;
  
  // Stockfish API endpoints
  private stockfishApiUrl = 'https://stockfish.online/api/s/v2.php';
  private lichessApiUrl = 'https://lichess.org/api/cloud-eval';
  
  constructor(private http: HttpClient) {}
  
  // Get the best move for a given board position
  getBestMove(board: Board, playerColor: PieceColor): Observable<EngineResult> {
    // If using local engine, provide a basic analysis
    if (this.engineType === 'local') {
      return this.getLocalBestMove(board, playerColor);
    }
    
    // Convert board to FEN string
    const fen = this.boardToFen(board);
    
    // Use Stockfish API
    if (this.engineType === 'stockfish') {
      return this.getStockfishAnalysis(fen).pipe(
        map(response => this.processStockfishResponse(response, board)),
        catchError(error => {
          console.error('Error calling Stockfish API:', error);
          // Fallback to local engine
          return this.getLocalBestMove(board, playerColor);
        })
      );
    }
    
    // Use ChessDB API (not implemented yet)
    if (this.engineType === 'chessdb') {
      return this.getLocalBestMove(board, playerColor);
    }
    
    // Default to local engine
    return this.getLocalBestMove(board, playerColor);
  }
  
  // Analyze a position with Stockfish
  getStockfishAnalysis(fen: string): Observable<StockfishResponse> {
    const params = {
      fen: fen,
      depth: this.engineDepth.toString()
    };
    
    return this.http.get<StockfishResponse>(this.stockfishApiUrl, { params }).pipe(
      catchError(error => {
        console.error('Stockfish API error:', error);
        return of({
          success: false,
          data: 'API request failed'
        });
      })
    );
  }
  
  // Process Stockfish API response
  private processStockfishResponse(response: StockfishResponse, board: Board): EngineResult {
    if (!response.success || !response.bestmove) {
      return {
        success: false,
        error: response.data || 'Failed to get engine analysis'
      };
    }
    
    try {
      // Parse best move
      const moveParts = response.bestmove.replace('bestmove ', '').split(' ')[0];
      if (moveParts.length < 4) {
        throw new Error('Invalid move format');
      }
      
      const fromCol = this.fileToCol(moveParts.charAt(0));
      const fromRow = this.rankToRow(moveParts.charAt(1));
      const toCol = this.fileToCol(moveParts.charAt(2));
      const toRow = this.rankToRow(moveParts.charAt(3));
      
      const from: Position = { row: fromRow, col: fromCol };
      const to: Position = { row: toRow, col: toCol };
      
      // Get the piece at the from position
      const piece = board.squares[fromRow][fromCol];
      if (!piece) {
        throw new Error('No piece at starting position');
      }
      
      return {
        success: true,
        bestMove: {
          from,
          to,
          piece
        },
        evaluation: response.evaluation
      };
    } catch (error) {
      console.error('Error processing Stockfish response:', error);
      return {
        success: false,
        error: 'Failed to process engine response'
      };
    }
  }
  
  // Get a move quality assessment based on evaluation difference
  getMoveQuality(prevEval: number, currentEval: number, playerColor: PieceColor): MoveQuality {
    // Adjust the evaluation based on player color
    // Positive values are good for white, negative for black
    let evalDiff = playerColor === 'white' 
      ? prevEval - currentEval 
      : currentEval - prevEval;
    
    // Make evalDiff absolute for easier comparison
    evalDiff = Math.abs(evalDiff);
    
    if (evalDiff < 0.05) return 'best';
    if (evalDiff < 0.1) return 'excellent';
    if (evalDiff < 0.2) return 'good';
    if (evalDiff < 0.5) return 'okay';
    if (evalDiff < 1.0) return 'inaccuracy';
    if (evalDiff < 2.0) return 'mistake';
    return 'blunder';
  }
  
  // Check if a move is "brilliant" based on evaluation and context
  isBrilliantMove(prevEval: number, currentEval: number, playerColor: PieceColor, move: Move): boolean {
    // A move is brilliant if:
    // 1. It significantly improves the position (by at least 1.5 pawns)
    // 2. It's not an obvious capture or check
    // 3. It's typically a sacrifice or unusual move
    
    // Calculate eval difference
    const evalDiff = playerColor === 'white' 
      ? currentEval - prevEval 
      : prevEval - currentEval;
    
    // Check if there's a significant improvement
    if (evalDiff < 1.5) return false;
    
    // Check if it's a capture (obvious moves are usually not brilliant)
    if (move.capturedPiece) return false;
    
    // More complex heuristics could be added here
    
    return true;
  }
  
  // Convert algebraic file (a-h) to column index (0-7)
  private fileToCol(file: string): number {
    return file.charCodeAt(0) - 'a'.charCodeAt(0);
  }
  
  // Convert algebraic rank (1-8) to row index (0-7)
  private rankToRow(rank: string): number {
    return parseInt(rank) - 1;
  }
  
  // Convert column index (0-7) to algebraic file (a-h)
  private colToFile(col: number): string {
    return String.fromCharCode('a'.charCodeAt(0) + col);
  }
  
  // Convert row index (0-7) to algebraic rank (1-8)
  private rowToRank(row: number): string {
    return (row + 1).toString();
  }
  
  // Convert a board position to FEN notation
  boardToFen(board: Board): string {
    let fen = '';
    
    // Piece placement
    for (let row = 7; row >= 0; row--) {
      let emptyCount = 0;
      
      for (let col = 0; col < 8; col++) {
        const piece = board.squares[row][col];
        
        if (piece) {
          if (emptyCount > 0) {
            fen += emptyCount.toString();
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
        fen += emptyCount.toString();
      }
      
      if (row > 0) {
        fen += '/';
      }
    }
    
    // Add active color
    fen += ' ' + (board.currentPlayer === 'white' ? 'w' : 'b');
    
    // Add castling availability
    let castling = '';
    if (!board.whiteKingMoved) {
      if (!board.whiteKingsideRookMoved) castling += 'K';
      if (!board.whiteQueensideRookMoved) castling += 'Q';
    }
    if (!board.blackKingMoved) {
      if (!board.blackKingsideRookMoved) castling += 'k';
      if (!board.blackQueensideRookMoved) castling += 'q';
    }
    
    fen += ' ' + (castling || '-');
    
    // Add en passant target (simplified)
    fen += ' -';
    
    // Add halfmove clock and fullmove number (simplified)
    fen += ' 0 1';
    
    return fen;
  }
  
  // Get the FEN character for a piece type
  private getPieceChar(pieceType: string): string {
    switch (pieceType) {
      case 'pawn': return 'p';
      case 'knight': return 'n';
      case 'bishop': return 'b';
      case 'rook': return 'r';
      case 'queen': return 'q';
      case 'king': return 'k';
      default: return '';
    }
  }
  
  // Simple local engine for fallback
  private getLocalBestMove(board: Board, playerColor: PieceColor): Observable<EngineResult> {
    // Find all pieces of the current player
    const pieces: Piece[] = [];
    
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = board.squares[row][col];
        if (piece && piece.color === playerColor) {
          pieces.push(piece);
        }
      }
    }
    
    // Shuffle pieces for some randomness
    this.shuffleArray(pieces);
    
    // Find a move with a simple heuristic
    for (const piece of pieces) {
      const row = piece.position.row;
      const col = piece.position.col;
      
      // Get legal moves
      const legalMoves: Position[] = this.calculateLegalMoves(piece, board);
      
      if (legalMoves.length > 0) {
        // Sort moves by priority
        legalMoves.sort((a, b) => {
          return this.evaluateMove(a, board) - this.evaluateMove(b, board);
        });
        
        return of({
          success: true,
          bestMove: {
            from: { row, col },
            to: legalMoves[0],
            piece: piece
          },
          evaluation: this.evaluateMove(legalMoves[0], board) / 100
        });
      }
    }
    
    return of({
      success: false,
      error: 'No legal moves found'
    });
  }
  
  // Simple move evaluation for local engine
  private evaluateMove(position: Position, board: Board): number {
    const targetPiece = board.squares[position.row][position.col];
    
    // Prioritize captures
    if (targetPiece) {
      return this.getPieceValue(targetPiece.type) * 10;
    }
    
    // Prioritize center control
    const centerValue = Math.max(0, 3 - Math.abs(position.row - 3.5) - Math.abs(position.col - 3.5));
    
    return centerValue;
  }
  
  // Get the relative value of a piece
  private getPieceValue(pieceType: string): number {
    switch (pieceType) {
      case 'pawn': return 1;
      case 'knight': return 3;
      case 'bishop': return 3;
      case 'rook': return 5;
      case 'queen': return 9;
      case 'king': return 100; // King has high value to prioritize captures
      default: return 0;
    }
  }
  
  // Calculate legal moves for a piece (simplified)
  private calculateLegalMoves(piece: Piece, board: Board): Position[] {
    // This is a simplified version and doesn't fully implement chess rules
    const moves: Position[] = [];
    const { row, col } = piece.position;
    
    switch (piece.type) {
      case 'pawn': {
        const direction = piece.color === 'white' ? 1 : -1;
        
        // Forward move
        if (this.isInBounds(row + direction, col) && !board.squares[row + direction][col]) {
          moves.push({ row: row + direction, col });
        }
        
        // Captures
        if (this.isInBounds(row + direction, col - 1) && 
            board.squares[row + direction][col - 1] && 
            board.squares[row + direction][col - 1]!.color !== piece.color) {
          moves.push({ row: row + direction, col: col - 1 });
        }
        
        if (this.isInBounds(row + direction, col + 1) && 
            board.squares[row + direction][col + 1] && 
            board.squares[row + direction][col + 1]!.color !== piece.color) {
          moves.push({ row: row + direction, col: col + 1 });
        }
        
        break;
      }
      
      case 'knight': {
        const knightMoves = [
          { row: row + 2, col: col + 1 },
          { row: row + 2, col: col - 1 },
          { row: row - 2, col: col + 1 },
          { row: row - 2, col: col - 1 },
          { row: row + 1, col: col + 2 },
          { row: row + 1, col: col - 2 },
          { row: row - 1, col: col + 2 },
          { row: row - 1, col: col - 2 }
        ];
        
        for (const move of knightMoves) {
          if (this.isInBounds(move.row, move.col) && 
              (!board.squares[move.row][move.col] || 
               board.squares[move.row][move.col]!.color !== piece.color)) {
            moves.push(move);
          }
        }
        
        break;
      }
      
      // Simplified logic for other piece types
      default:
        // Return some reasonable moves for testing
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            if ((r !== row || c !== col) && 
                (!board.squares[r][c] || board.squares[r][c]!.color !== piece.color)) {
              moves.push({ row: r, col: c });
            }
          }
        }
    }
    
    return moves;
  }
  
  // Check if a position is within the board
  private isInBounds(row: number, col: number): boolean {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
  }
  
  // Shuffle an array in place
  private shuffleArray<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }
} 