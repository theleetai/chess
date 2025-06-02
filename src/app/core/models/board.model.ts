import { Move, Piece, Position } from './piece.model';

export interface Board {
  squares: (Piece | null)[][];
  currentPlayer: 'white' | 'black';
  moveHistory: string[];
  whiteKingPosition: Position;
  blackKingPosition: Position;
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  selectedPiece: Piece | null;
  legalMoves: Position[];
  capturedWhitePieces: Piece[];
  capturedBlackPieces: Piece[];
  lastMove: Move | null;
  
  // Castling availability flags
  whiteKingMoved: boolean;
  blackKingMoved: boolean;
  whiteKingsideRookMoved: boolean;
  whiteQueensideRookMoved: boolean;
  blackKingsideRookMoved: boolean;
  blackQueensideRookMoved: boolean;
} 