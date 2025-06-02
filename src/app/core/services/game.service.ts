import { Injectable, signal } from '@angular/core';
import { Board } from '../models/board.model';
import { Move, Piece, PieceColor, PieceType, Position } from '../models/piece.model';

@Injectable({
  providedIn: 'root'
})
export class GameService {
  private readonly BOARD_SIZE = 8;
  
  private boardState = signal<Board>({
    squares: this.initializeBoard(),
    currentPlayer: 'white',
    moveHistory: [],
    whiteKingPosition: { row: 0, col: 4 },
    blackKingPosition: { row: 7, col: 4 },
    isCheck: false,
    isCheckmate: false,
    isStalemate: false,
    selectedPiece: null,
    legalMoves: []
  });

  board = this.boardState.asReadonly();

  constructor() {}

  // Initialize a new chess board with pieces in their starting positions
  private initializeBoard(): (Piece | null)[][] {
    const board: (Piece | null)[][] = Array(this.BOARD_SIZE)
      .fill(null)
      .map(() => Array(this.BOARD_SIZE).fill(null));

    // Initialize pawns
    for (let col = 0; col < this.BOARD_SIZE; col++) {
      board[1][col] = this.createPiece('pawn', 'white', 1, col);
      board[6][col] = this.createPiece('pawn', 'black', 6, col);
    }

    // Initialize other pieces
    this.initializeBackRank(board, 0, 'white');
    this.initializeBackRank(board, 7, 'black');

    return board;
  }

  private initializeBackRank(board: (Piece | null)[][], row: number, color: PieceColor): void {
    const pieces: PieceType[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
    
    pieces.forEach((type, col) => {
      board[row][col] = this.createPiece(type, color, row, col);
    });
  }

  private createPiece(type: PieceType, color: PieceColor, row: number, col: number): Piece {
    return {
      type,
      color,
      position: { row, col },
      hasMoved: false,
      image: `assets/chess-pieces/${color.charAt(0).toUpperCase() + color.slice(1)}_${type.charAt(0).toUpperCase() + type.slice(1)}.png`
    };
  }

  // Select a piece and calculate its legal moves
  selectPiece(row: number, col: number): void {
    const board = this.boardState();
    const piece = board.squares[row][col];

    if (!piece || piece.color !== board.currentPlayer) {
      this.clearSelection();
      return;
    }

    const legalMoves = this.calculateLegalMoves(piece);
    
    this.boardState.update(state => ({
      ...state,
      selectedPiece: piece,
      legalMoves
    }));
  }

  // Clear the current selection
  clearSelection(): void {
    this.boardState.update(state => ({
      ...state,
      selectedPiece: null,
      legalMoves: []
    }));
  }

  // Move a piece to the specified position
  movePiece(toRow: number, toCol: number): boolean {
    const board = this.boardState();
    const selectedPiece = board.selectedPiece;

    if (!selectedPiece) return false;

    // Check if move is legal
    const isLegalMove = board.legalMoves.some(
      move => move.row === toRow && move.col === toCol
    );

    if (!isLegalMove) return false;

    // Create a move object
    const move: Move = {
      from: { ...selectedPiece.position },
      to: { row: toRow, col: toCol },
      piece: { ...selectedPiece }
    };

    // Check for captured piece
    const capturedPiece = board.squares[toRow][toCol];
    if (capturedPiece) {
      move.capturedPiece = { ...capturedPiece };
    }

    // Execute the move
    this.executeMove(move);
    
    // Check for game state (check, checkmate, stalemate)
    this.updateGameState();

    return true;
  }

  // Execute a move on the board
  private executeMove(move: Move): void {
    this.boardState.update(state => {
      const newSquares = state.squares.map(row => [...row]);
      const { from, to, piece } = move;
      
      // Update piece position
      const movedPiece = { 
        ...newSquares[from.row][from.col]!,
        position: { row: to.row, col: to.col },
        hasMoved: true
      };
      
      // Remove piece from old position
      newSquares[from.row][from.col] = null;
      
      // Place piece in new position
      newSquares[to.row][to.col] = movedPiece;

      // Update king position if king was moved
      let whiteKingPosition = state.whiteKingPosition;
      let blackKingPosition = state.blackKingPosition;
      
      if (piece.type === 'king') {
        if (piece.color === 'white') {
          whiteKingPosition = { ...to };
        } else {
          blackKingPosition = { ...to };
        }
      }

      // Add move to history (basic algebraic notation for now)
      const moveNotation = this.getMoveNotation(move);
      
      return {
        ...state,
        squares: newSquares,
        currentPlayer: state.currentPlayer === 'white' ? 'black' : 'white',
        moveHistory: [...state.moveHistory, moveNotation],
        whiteKingPosition,
        blackKingPosition,
        selectedPiece: null,
        legalMoves: []
      };
    });
  }

  // Get basic algebraic notation for a move
  private getMoveNotation(move: Move): string {
    const { from, to, piece } = move;
    const pieceSymbol = this.getPieceSymbol(piece.type);
    const fromSquare = this.squareToAlgebraic(from);
    const toSquare = this.squareToAlgebraic(to);
    
    return `${pieceSymbol}${fromSquare}-${toSquare}`;
  }

  private getPieceSymbol(type: PieceType): string {
    switch (type) {
      case 'king': return 'K';
      case 'queen': return 'Q';
      case 'rook': return 'R';
      case 'bishop': return 'B';
      case 'knight': return 'N';
      case 'pawn': return '';
    }
  }

  private squareToAlgebraic(position: Position): string {
    const file = String.fromCharCode(97 + position.col); // a-h
    const rank = position.row + 1; // 1-8
    return `${file}${rank}`;
  }

  // Calculate legal moves for a piece
  private calculateLegalMoves(piece: Piece): Position[] {
    const { type, color, position } = piece;
    const board = this.boardState();
    
    let potentialMoves: Position[] = [];
    
    // Calculate potential moves based on piece type
    switch (type) {
      case 'pawn':
        potentialMoves = this.getPawnMoves(piece);
        break;
      case 'rook':
        potentialMoves = this.getRookMoves(piece);
        break;
      case 'knight':
        potentialMoves = this.getKnightMoves(piece);
        break;
      case 'bishop':
        potentialMoves = this.getBishopMoves(piece);
        break;
      case 'queen':
        potentialMoves = [
          ...this.getRookMoves(piece),
          ...this.getBishopMoves(piece)
        ];
        break;
      case 'king':
        potentialMoves = this.getKingMoves(piece);
        break;
    }
    
    // Filter moves that would put or leave the king in check
    return potentialMoves.filter(move => {
      return this.isLegalMove(piece, move);
    });
  }

  // Check if a move is legal (doesn't leave king in check)
  private isLegalMove(piece: Piece, to: Position): boolean {
    // For now, consider all moves legal
    // In a complete implementation, we would check if the move leaves the king in check
    return true;
  }

  // Get potential moves for a pawn
  private getPawnMoves(piece: Piece): Position[] {
    const { color, position, hasMoved } = piece;
    const { row, col } = position;
    const moves: Position[] = [];
    const direction = color === 'white' ? 1 : -1;
    const board = this.boardState();
    
    // Forward move
    if (this.isInBounds(row + direction, col) && 
        !board.squares[row + direction][col]) {
      moves.push({ row: row + direction, col });
      
      // Double move from starting position
      if (!hasMoved && 
          this.isInBounds(row + 2 * direction, col) && 
          !board.squares[row + 2 * direction][col] &&
          !board.squares[row + direction][col]) {
        moves.push({ row: row + 2 * direction, col });
      }
    }
    
    // Capture moves
    const captureOffsets = [{ row: direction, col: -1 }, { row: direction, col: 1 }];
    
    captureOffsets.forEach(offset => {
      const captureRow = row + offset.row;
      const captureCol = col + offset.col;
      
      if (this.isInBounds(captureRow, captureCol)) {
        const targetPiece = board.squares[captureRow][captureCol];
        
        if (targetPiece && targetPiece.color !== color) {
          moves.push({ row: captureRow, col: captureCol });
        }
        
        // En passant would be implemented here
      }
    });
    
    return moves;
  }

  // Get potential moves for a rook
  private getRookMoves(piece: Piece): Position[] {
    return this.getLinearMoves(piece, [
      { row: 1, col: 0 },
      { row: -1, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: -1 }
    ]);
  }

  // Get potential moves for a knight
  private getKnightMoves(piece: Piece): Position[] {
    const { color, position } = piece;
    const { row, col } = position;
    const moves: Position[] = [];
    const board = this.boardState();
    
    const offsets = [
      { row: -2, col: -1 }, { row: -2, col: 1 },
      { row: -1, col: -2 }, { row: -1, col: 2 },
      { row: 1, col: -2 }, { row: 1, col: 2 },
      { row: 2, col: -1 }, { row: 2, col: 1 }
    ];
    
    offsets.forEach(offset => {
      const targetRow = row + offset.row;
      const targetCol = col + offset.col;
      
      if (this.isInBounds(targetRow, targetCol)) {
        const targetPiece = board.squares[targetRow][targetCol];
        
        if (!targetPiece || targetPiece.color !== color) {
          moves.push({ row: targetRow, col: targetCol });
        }
      }
    });
    
    return moves;
  }

  // Get potential moves for a bishop
  private getBishopMoves(piece: Piece): Position[] {
    return this.getLinearMoves(piece, [
      { row: 1, col: 1 },
      { row: 1, col: -1 },
      { row: -1, col: 1 },
      { row: -1, col: -1 }
    ]);
  }

  // Get potential moves for a king
  private getKingMoves(piece: Piece): Position[] {
    const { color, position, hasMoved } = piece;
    const { row, col } = position;
    const moves: Position[] = [];
    const board = this.boardState();
    
    // All 8 adjacent squares
    const offsets = [
      { row: -1, col: -1 }, { row: -1, col: 0 }, { row: -1, col: 1 },
      { row: 0, col: -1 }, { row: 0, col: 1 },
      { row: 1, col: -1 }, { row: 1, col: 0 }, { row: 1, col: 1 }
    ];
    
    offsets.forEach(offset => {
      const targetRow = row + offset.row;
      const targetCol = col + offset.col;
      
      if (this.isInBounds(targetRow, targetCol)) {
        const targetPiece = board.squares[targetRow][targetCol];
        
        if (!targetPiece || targetPiece.color !== color) {
          moves.push({ row: targetRow, col: targetCol });
        }
      }
    });
    
    // Castling would be implemented here
    
    return moves;
  }

  // Helper for linear piece moves (rook, bishop, queen)
  private getLinearMoves(piece: Piece, directions: Position[]): Position[] {
    const { color, position } = piece;
    const { row, col } = position;
    const moves: Position[] = [];
    const board = this.boardState();
    
    directions.forEach(dir => {
      let targetRow = row + dir.row;
      let targetCol = col + dir.col;
      
      while (this.isInBounds(targetRow, targetCol)) {
        const targetPiece = board.squares[targetRow][targetCol];
        
        if (!targetPiece) {
          // Empty square - we can move here
          moves.push({ row: targetRow, col: targetCol });
        } else if (targetPiece.color !== color) {
          // Enemy piece - we can capture it, but can't go further
          moves.push({ row: targetRow, col: targetCol });
          break;
        } else {
          // Friendly piece - can't move here or beyond
          break;
        }
        
        targetRow += dir.row;
        targetCol += dir.col;
      }
    });
    
    return moves;
  }

  // Check if a position is within the board boundaries
  private isInBounds(row: number, col: number): boolean {
    return row >= 0 && row < this.BOARD_SIZE && col >= 0 && col < this.BOARD_SIZE;
  }

  // Update game state (check, checkmate, stalemate)
  private updateGameState(): void {
    // For now, just reset isCheck, isCheckmate, isStalemate
    // In a complete implementation, we would check these conditions
    this.boardState.update(state => ({
      ...state,
      isCheck: false,
      isCheckmate: false,
      isStalemate: false
    }));
  }

  // Reset the game to the starting position
  resetGame(): void {
    this.boardState.set({
      squares: this.initializeBoard(),
      currentPlayer: 'white',
      moveHistory: [],
      whiteKingPosition: { row: 0, col: 4 },
      blackKingPosition: { row: 7, col: 4 },
      isCheck: false,
      isCheckmate: false,
      isStalemate: false,
      selectedPiece: null,
      legalMoves: []
    });
  }
} 