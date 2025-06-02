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
    legalMoves: [],
    capturedWhitePieces: [],
    capturedBlackPieces: [],
    lastMove: null,
    whiteKingMoved: false,
    blackKingMoved: false,
    whiteKingsideRookMoved: false,
    whiteQueensideRookMoved: false,
    blackKingsideRookMoved: false,
    blackQueensideRookMoved: false
  });

  // Store the full game history for replay
  private gameHistory: Board[] = [];

  board = this.boardState.asReadonly();

  constructor() {
    // Initialize the game history with the initial state
    this.gameHistory = [this.createBoardCopy(this.boardState())];
  }

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

    // Check for castling
    if (selectedPiece.type === 'king' && Math.abs(selectedPiece.position.col - toCol) === 2) {
      move.isCastling = true;
    }

    // Check for en passant
    if (selectedPiece.type === 'pawn' && 
        toCol !== selectedPiece.position.col && 
        !capturedPiece) {
      move.isEnPassant = true;
      const enPassantRow = selectedPiece.position.row;
      const capturedPawnPiece = board.squares[enPassantRow][toCol];
      if (capturedPawnPiece && capturedPawnPiece.type === 'pawn') {
        move.capturedPiece = { ...capturedPawnPiece };
      }
    }

    // Check for promotion
    if (selectedPiece.type === 'pawn' && 
        ((selectedPiece.color === 'white' && toRow === 7) || 
         (selectedPiece.color === 'black' && toRow === 0))) {
      move.isPromotion = true;
      move.promotionPiece = 'queen'; // Auto-promote to queen for now
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
      
      // Handle captured piece
      let capturedWhitePieces = [...state.capturedWhitePieces];
      let capturedBlackPieces = [...state.capturedBlackPieces];
      
      if (move.capturedPiece) {
        if (move.capturedPiece.color === 'white') {
          capturedWhitePieces = [...capturedWhitePieces, move.capturedPiece];
        } else {
          capturedBlackPieces = [...capturedBlackPieces, move.capturedPiece];
        }
      }
      
      // Update piece position
      const movedPiece = { 
        ...newSquares[from.row][from.col]!,
        position: { row: to.row, col: to.col },
        hasMoved: true
      };
      
      // Handle promotion
      if (move.isPromotion && move.promotionPiece) {
        movedPiece.type = move.promotionPiece;
        movedPiece.image = `assets/chess-pieces/${movedPiece.color.charAt(0).toUpperCase() + movedPiece.color.slice(1)}_${move.promotionPiece.charAt(0).toUpperCase() + move.promotionPiece.slice(1)}.png`;
      }
      
      // Remove piece from old position
      newSquares[from.row][from.col] = null;
      
      // Place piece in new position
      newSquares[to.row][to.col] = movedPiece;
      
      // Handle en passant capture
      if (move.isEnPassant) {
        newSquares[from.row][to.col] = null; // Remove the captured pawn
      }
      
      // Handle castling
      if (move.isCastling) {
        const rookFromCol = to.col > from.col ? 7 : 0; // Kingside or queenside
        const rookToCol = to.col > from.col ? to.col - 1 : to.col + 1;
        
        const rook = newSquares[from.row][rookFromCol];
        if (rook) {
          newSquares[from.row][rookToCol] = {
            ...rook,
            position: { row: from.row, col: rookToCol },
            hasMoved: true
          };
          newSquares[from.row][rookFromCol] = null;
        }
      }

      // Update king position if king was moved
      let whiteKingPosition = state.whiteKingPosition;
      let blackKingPosition = state.blackKingPosition;
      
      // Update castling flags
      let whiteKingMoved = state.whiteKingMoved;
      let blackKingMoved = state.blackKingMoved;
      let whiteKingsideRookMoved = state.whiteKingsideRookMoved;
      let whiteQueensideRookMoved = state.whiteQueensideRookMoved;
      let blackKingsideRookMoved = state.blackKingsideRookMoved;
      let blackQueensideRookMoved = state.blackQueensideRookMoved;
      
      // Check if king moved
      if (piece.type === 'king') {
        if (piece.color === 'white') {
          whiteKingPosition = { ...to };
          whiteKingMoved = true;
        } else {
          blackKingPosition = { ...to };
          blackKingMoved = true;
        }
      }
      
      // Check if rook moved
      if (piece.type === 'rook') {
        const { row, col } = from;
        if (piece.color === 'white') {
          if (row === 0 && col === 0) {
            whiteQueensideRookMoved = true;
          } else if (row === 0 && col === 7) {
            whiteKingsideRookMoved = true;
          }
        } else {
          if (row === 7 && col === 0) {
            blackQueensideRookMoved = true;
          } else if (row === 7 && col === 7) {
            blackKingsideRookMoved = true;
          }
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
        legalMoves: [],
        capturedWhitePieces,
        capturedBlackPieces,
        lastMove: move,
        whiteKingMoved,
        blackKingMoved,
        whiteKingsideRookMoved,
        whiteQueensideRookMoved,
        blackKingsideRookMoved,
        blackQueensideRookMoved
      };
    });
    
    // Save current state to history for replay
    this.gameHistory.push(this.createBoardCopy(this.boardState()));
  }

  // Create a deep copy of a board state
  private createBoardCopy(board: Board): Board {
    // Create new arrays for squares
    const squaresCopy = board.squares.map(row => 
      row.map(piece => piece ? { ...piece } : null)
    );
    
    // Create copies of other arrays
    const moveHistoryCopy = [...board.moveHistory];
    const capturedWhitePiecesCopy = [...board.capturedWhitePieces];
    const capturedBlackPiecesCopy = [...board.capturedBlackPieces];
    
    // Create a new board object
    return {
      squares: squaresCopy,
      currentPlayer: board.currentPlayer,
      moveHistory: moveHistoryCopy,
      whiteKingPosition: { ...board.whiteKingPosition },
      blackKingPosition: { ...board.blackKingPosition },
      isCheck: board.isCheck,
      isCheckmate: board.isCheckmate,
      isStalemate: board.isStalemate,
      selectedPiece: null, // Don't copy selection state
      legalMoves: [], // Don't copy legal moves
      capturedWhitePieces: capturedWhitePiecesCopy,
      capturedBlackPieces: capturedBlackPiecesCopy,
      lastMove: board.lastMove ? { ...board.lastMove } : null,
      whiteKingMoved: board.whiteKingMoved,
      blackKingMoved: board.blackKingMoved,
      whiteKingsideRookMoved: board.whiteKingsideRookMoved,
      whiteQueensideRookMoved: board.whiteQueensideRookMoved,
      blackKingsideRookMoved: board.blackKingsideRookMoved,
      blackQueensideRookMoved: board.blackQueensideRookMoved
    };
  }

  // Get basic algebraic notation for a move
  private getMoveNotation(move: Move): string {
    const { from, to, piece, isPromotion, promotionPiece, isCastling, isEnPassant, capturedPiece } = move;
    
    // Handle castling notation
    if (isCastling) {
      return to.col > from.col ? 'O-O' : 'O-O-O';
    }
    
    const pieceSymbol = this.getPieceSymbol(piece.type);
    const fromSquare = this.squareToAlgebraic(from);
    const toSquare = this.squareToAlgebraic(to);
    
    let notation = pieceSymbol;
    
    // Add capture symbol if applicable
    if (capturedPiece || isEnPassant) {
      if (piece.type === 'pawn') {
        notation += fromSquare[0]; // Add file for pawn captures
      }
      notation += 'x';
    }
    
    notation += toSquare;
    
    // Add promotion piece
    if (isPromotion && promotionPiece) {
      notation += '=' + this.getPieceSymbol(promotionPiece);
    }
    
    // Check and checkmate will be added after the move is executed
    // and the board state is updated
    
    return notation;
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

  // Check if a position is under attack by a specific color
  isSquareUnderAttack(row: number, col: number, byColor: PieceColor, squares: (Piece | null)[][]): boolean {
    // Check for attacks from each enemy piece
    for (let r = 0; r < this.BOARD_SIZE; r++) {
      for (let c = 0; c < this.BOARD_SIZE; c++) {
        const piece = squares[r][c];
        if (piece && piece.color === byColor) {
          const attacks = this.calculateRawMoves(piece, squares, false);
          if (attacks.some(pos => pos.row === row && pos.col === col)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  // Calculate legal moves for a piece
  private calculateLegalMoves(piece: Piece): Position[] {
    const board = this.boardState();
    
    // Get all potential moves
    const potentialMoves = this.calculateRawMoves(piece, board.squares, true);
    
    // Filter out moves that would leave the king in check
    return potentialMoves.filter(move => {
      return this.isLegalMove(piece, move, board.squares);
    });
  }

  // Calculate raw moves without checking if they leave the king in check
  private calculateRawMoves(piece: Piece, squares: (Piece | null)[][], includeSpecialMoves: boolean): Position[] {
    const { type, color, position, hasMoved } = piece;
    
    let potentialMoves: Position[] = [];
    
    // Calculate potential moves based on piece type
    switch (type) {
      case 'pawn':
        potentialMoves = this.getPawnMoves(piece, squares, includeSpecialMoves);
        break;
      case 'rook':
        potentialMoves = this.getRookMoves(piece, squares);
        break;
      case 'knight':
        potentialMoves = this.getKnightMoves(piece, squares);
        break;
      case 'bishop':
        potentialMoves = this.getBishopMoves(piece, squares);
        break;
      case 'queen':
        potentialMoves = [
          ...this.getRookMoves(piece, squares),
          ...this.getBishopMoves(piece, squares)
        ];
        break;
      case 'king':
        potentialMoves = this.getKingMoves(piece, squares, includeSpecialMoves);
        break;
    }
    
    return potentialMoves;
  }

  // Check if a move is legal (doesn't leave king in check)
  private isLegalMove(piece: Piece, to: Position, squares: (Piece | null)[][]): boolean {
    // Create a deep copy of the board to simulate the move
    const tempSquares = squares.map(row => [...row]);
    const from = piece.position;
    
    // Simulate the move
    tempSquares[to.row][to.col] = { 
      ...piece, 
      position: { row: to.row, col: to.col }
    };
    tempSquares[from.row][from.col] = null;
    
    // Find the king position
    const kingPos = piece.type === 'king' 
        ? { row: to.row, col: to.col } 
        : (piece.color === 'white' ? this.boardState().whiteKingPosition : this.boardState().blackKingPosition);
    
    // Check if the king would be in check after this move
    const enemyColor = piece.color === 'white' ? 'black' : 'white';
    return !this.isSquareUnderAttack(kingPos.row, kingPos.col, enemyColor, tempSquares);
  }

  // Get potential moves for a pawn
  private getPawnMoves(piece: Piece, squares: (Piece | null)[][], includeSpecialMoves: boolean): Position[] {
    const { color, position, hasMoved } = piece;
    const { row, col } = position;
    const moves: Position[] = [];
    const direction = color === 'white' ? 1 : -1;
    
    // Forward move
    if (this.isInBounds(row + direction, col) && 
        !squares[row + direction][col]) {
      moves.push({ row: row + direction, col });
      
      // Double move from starting position
      if (!hasMoved && 
          this.isInBounds(row + 2 * direction, col) && 
          !squares[row + 2 * direction][col] &&
          !squares[row + direction][col]) {
        moves.push({ row: row + 2 * direction, col });
      }
    }
    
    // Capture moves
    const captureOffsets = [{ row: direction, col: -1 }, { row: direction, col: 1 }];
    
    captureOffsets.forEach(offset => {
      const captureRow = row + offset.row;
      const captureCol = col + offset.col;
      
      if (this.isInBounds(captureRow, captureCol)) {
        const targetPiece = squares[captureRow][captureCol];
        
        if (targetPiece && targetPiece.color !== color) {
          moves.push({ row: captureRow, col: captureCol });
        }
        
        // En passant
        if (includeSpecialMoves && !targetPiece) {
          const board = this.boardState();
          const lastMove = board.lastMove;
          
          if (lastMove && 
              lastMove.piece.type === 'pawn' &&
              lastMove.piece.color !== color &&
              Math.abs(lastMove.from.row - lastMove.to.row) === 2 &&
              lastMove.to.row === row &&
              lastMove.to.col === captureCol) {
            moves.push({ row: captureRow, col: captureCol });
          }
        }
      }
    });
    
    return moves;
  }

  // Get potential moves for a rook
  private getRookMoves(piece: Piece, squares: (Piece | null)[][]): Position[] {
    return this.getLinearMoves(piece, [
      { row: 1, col: 0 },
      { row: -1, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: -1 }
    ], squares);
  }

  // Get potential moves for a knight
  private getKnightMoves(piece: Piece, squares: (Piece | null)[][]): Position[] {
    const { color, position } = piece;
    const { row, col } = position;
    const moves: Position[] = [];
    
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
        const targetPiece = squares[targetRow][targetCol];
        
        if (!targetPiece || targetPiece.color !== color) {
          moves.push({ row: targetRow, col: targetCol });
        }
      }
    });
    
    return moves;
  }

  // Get potential moves for a bishop
  private getBishopMoves(piece: Piece, squares: (Piece | null)[][]): Position[] {
    return this.getLinearMoves(piece, [
      { row: 1, col: 1 },
      { row: 1, col: -1 },
      { row: -1, col: 1 },
      { row: -1, col: -1 }
    ], squares);
  }

  // Get potential moves for a king
  private getKingMoves(piece: Piece, squares: (Piece | null)[][], includeSpecialMoves: boolean): Position[] {
    const { color, position, hasMoved } = piece;
    const { row, col } = position;
    const moves: Position[] = [];
    
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
        const targetPiece = squares[targetRow][targetCol];
        
        if (!targetPiece || targetPiece.color !== color) {
          moves.push({ row: targetRow, col: targetCol });
        }
      }
    });
    
    // Castling
    if (includeSpecialMoves && !hasMoved) {
      // Kingside castling
      if (this.canCastle(color, row, true, squares)) {
        moves.push({ row, col: col + 2 });
      }
      
      // Queenside castling
      if (this.canCastle(color, row, false, squares)) {
        moves.push({ row, col: col - 2 });
      }
    }
    
    return moves;
  }

  // Check if castling is possible
  private canCastle(color: PieceColor, row: number, isKingside: boolean, squares: (Piece | null)[][]): boolean {
    const kingCol = 4;
    const rookCol = isKingside ? 7 : 0;
    
    // Check if rook and spaces between are in place
    const rook = squares[row][rookCol];
    if (!rook || rook.type !== 'rook' || rook.hasMoved) {
      return false;
    }
    
    // Check if squares between king and rook are empty
    const startCol = Math.min(kingCol, rookCol) + 1;
    const endCol = Math.max(kingCol, rookCol);
    
    for (let c = startCol; c < endCol; c++) {
      if (squares[row][c]) {
        return false;
      }
    }
    
    // Check if king passes through or ends up in check
    const enemyColor = color === 'white' ? 'black' : 'white';
    
    // Check king's current position
    if (this.isSquareUnderAttack(row, kingCol, enemyColor, squares)) {
      return false;
    }
    
    // Check squares the king passes through
    const step = isKingside ? 1 : -1;
    for (let c = kingCol + step; isKingside ? c <= kingCol + 2 : c >= kingCol - 2; c += step) {
      if (this.isSquareUnderAttack(row, c, enemyColor, squares)) {
        return false;
      }
    }
    
    return true;
  }

  // Helper for linear piece moves (rook, bishop, queen)
  private getLinearMoves(piece: Piece, directions: Position[], squares: (Piece | null)[][]): Position[] {
    const { color, position } = piece;
    const { row, col } = position;
    const moves: Position[] = [];
    
    directions.forEach(dir => {
      let targetRow = row + dir.row;
      let targetCol = col + dir.col;
      
      while (this.isInBounds(targetRow, targetCol)) {
        const targetPiece = squares[targetRow][targetCol];
        
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
    const board = this.boardState();
    const currentColor = board.currentPlayer;
    const kingPosition = currentColor === 'white' ? board.whiteKingPosition : board.blackKingPosition;
    const opponentColor = currentColor === 'white' ? 'black' : 'white';
    
    // Check if the king is in check
    const isCheck = this.isSquareUnderAttack(kingPosition.row, kingPosition.col, opponentColor, board.squares);
    
    // Check if there are any legal moves available
    let hasLegalMove = false;
    
    // Look for any legal move for the current player
    outerLoop: for (let row = 0; row < this.BOARD_SIZE; row++) {
      for (let col = 0; col < this.BOARD_SIZE; col++) {
        const piece = board.squares[row][col];
        if (piece && piece.color === currentColor) {
          const legalMoves = this.calculateLegalMoves(piece);
          if (legalMoves.length > 0) {
            hasLegalMove = true;
            break outerLoop;
          }
        }
      }
    }
    
    // Update game state
    this.boardState.update(state => ({
      ...state,
      isCheck,
      isCheckmate: isCheck && !hasLegalMove,
      isStalemate: !isCheck && !hasLegalMove
    }));
  }

  // Get all pieces that can attack a specific position
  getPiecesThreateningPosition(row: number, col: number, attackerColor: PieceColor): Piece[] {
    const board = this.boardState();
    const threateningPieces: Piece[] = [];
    
    for (let r = 0; r < this.BOARD_SIZE; r++) {
      for (let c = 0; c < this.BOARD_SIZE; c++) {
        const piece = board.squares[r][c];
        if (piece && piece.color === attackerColor) {
          const attacks = this.calculateRawMoves(piece, board.squares, false);
          if (attacks.some(pos => pos.row === row && pos.col === col)) {
            threateningPieces.push(piece);
          }
        }
      }
    }
    
    return threateningPieces;
  }

  // Check if a position is threatened by any piece
  isPositionThreatened(row: number, col: number): boolean {
    const board = this.boardState();
    const pieceAtPosition = board.squares[row][col];
    
    if (!pieceAtPosition) return false;
    
    const opponentColor = pieceAtPosition.color === 'white' ? 'black' : 'white';
    return this.isSquareUnderAttack(row, col, opponentColor, board.squares);
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
      legalMoves: [],
      capturedWhitePieces: [],
      capturedBlackPieces: [],
      lastMove: null,
      whiteKingMoved: false,
      blackKingMoved: false,
      whiteKingsideRookMoved: false,
      whiteQueensideRookMoved: false,
      blackKingsideRookMoved: false,
      blackQueensideRookMoved: false
    });
    
    // Reset game history
    this.gameHistory = [this.createBoardCopy(this.boardState())];
  }

  // Replay functionality: get board state at specific move
  getBoardAtMove(moveIndex: number): Board {
    if (moveIndex < 0 || moveIndex >= this.gameHistory.length) {
      return this.boardState();
    }
    
    return this.gameHistory[moveIndex];
  }
  
  // Set the current board to a specific move in the game history
  setReplayState(moveIndex: number): void {
    if (moveIndex < 0 || moveIndex >= this.gameHistory.length) {
      return;
    }
    
    const historyState = this.gameHistory[moveIndex];
    this.boardState.set(this.createBoardCopy(historyState));
  }

  // Get winner text
  getWinnerText(): string {
    const currentBoard = this.boardState();
    if (currentBoard.isCheckmate) {
      const winner = currentBoard.currentPlayer === 'white' ? 'Black' : 'White';
      return `${winner} wins by checkmate!`;
    } else if (currentBoard.isStalemate) {
      return "Game drawn by stalemate!";
    }
    return "";
  }
  
  // Move a piece with explicit promotion choice
  movePieceWithPromotion(from: Position, to: Position, promotionPiece: PieceType): boolean {
    const board = this.boardState();
    const piece = board.squares[from.row][from.col];

    if (!piece) return false;

    // Check if move is legal
    this.selectPiece(from.row, from.col);
    const isLegalMove = board.legalMoves.some(
      move => move.row === to.row && move.col === to.col
    );

    if (!isLegalMove) {
      this.clearSelection();
      return false;
    }

    // Create a move object
    const move: Move = {
      from,
      to,
      piece: { ...piece }
    };

    // Check for captured piece
    const capturedPiece = board.squares[to.row][to.col];
    if (capturedPiece) {
      move.capturedPiece = { ...capturedPiece };
    }

    // Set promotion data
    move.isPromotion = true;
    move.promotionPiece = promotionPiece;

    // Execute the move
    this.executeMove(move);
    
    // Check for game state (check, checkmate, stalemate)
    this.updateGameState();

    return true;
  }

  // Undo the last move
  undoMove(): boolean {
    if (this.gameHistory.length <= 1) {
      return false; // Can't undo the initial state
    }

    // Remove the last state from history
    this.gameHistory.pop();
    
    // Set the current state to the previous one
    const previousState = this.gameHistory[this.gameHistory.length - 1];
    this.boardState.set(this.createBoardCopy(previousState));
    
    return true;
  }

  // Get the current game state for saving
  getCurrentGameState(): { currentState: Board, history: Board[] } {
    return {
      currentState: this.createBoardCopy(this.boardState()),
      history: [...this.gameHistory]
    };
  }
  
  // Load a saved game state
  loadGameState(state: Board, history: Board[]): void {
    this.boardState.set(this.createBoardCopy(state));
    this.gameHistory = history.map(board => this.createBoardCopy(board));
  }
  
  // Custom game builder methods
  
  // Create an empty board with no pieces
  createEmptyBoard(): void {
    const emptyBoard = Array(this.BOARD_SIZE)
      .fill(null)
      .map(() => Array(this.BOARD_SIZE).fill(null));
      
    this.boardState.set({
      squares: emptyBoard,
      currentPlayer: 'white',
      moveHistory: [],
      whiteKingPosition: { row: -1, col: -1 }, // Invalid position initially
      blackKingPosition: { row: -1, col: -1 }, // Invalid position initially
      isCheck: false,
      isCheckmate: false,
      isStalemate: false,
      selectedPiece: null,
      legalMoves: [],
      capturedWhitePieces: [],
      capturedBlackPieces: [],
      lastMove: null,
      whiteKingMoved: false,
      blackKingMoved: false,
      whiteKingsideRookMoved: false,
      whiteQueensideRookMoved: false,
      blackKingsideRookMoved: false,
      blackQueensideRookMoved: false
    });
    
    // Reset game history
    this.gameHistory = [this.createBoardCopy(this.boardState())];
  }
  
  // Place a piece on the board during custom setup
  placePiece(type: PieceType, color: PieceColor, row: number, col: number): boolean {
    if (row < 0 || row >= this.BOARD_SIZE || col < 0 || col >= this.BOARD_SIZE) {
      return false; // Invalid position
    }
    
    this.boardState.update(state => {
      const newSquares = state.squares.map(r => [...r]);
      
      // Create the new piece
      const piece = this.createPiece(type, color, row, col);
      
      // Update king position if placing a king
      let whiteKingPosition = state.whiteKingPosition;
      let blackKingPosition = state.blackKingPosition;
      
      if (type === 'king') {
        if (color === 'white') {
          // Remove old white king if exists
          for (let r = 0; r < this.BOARD_SIZE; r++) {
            for (let c = 0; c < this.BOARD_SIZE; c++) {
              const p = newSquares[r][c];
              if (p && p.type === 'king' && p.color === 'white') {
                newSquares[r][c] = null;
              }
            }
          }
          whiteKingPosition = { row, col };
        } else {
          // Remove old black king if exists
          for (let r = 0; r < this.BOARD_SIZE; r++) {
            for (let c = 0; c < this.BOARD_SIZE; c++) {
              const p = newSquares[r][c];
              if (p && p.type === 'king' && p.color === 'black') {
                newSquares[r][c] = null;
              }
            }
          }
          blackKingPosition = { row, col };
        }
      }
      
      // Place the piece
      newSquares[row][col] = piece;
      
      return {
        ...state,
        squares: newSquares,
        whiteKingPosition,
        blackKingPosition
      };
    });
    
    // Update game history
    this.gameHistory = [this.createBoardCopy(this.boardState())];
    
    return true;
  }
  
  // Remove a piece from the board during custom setup
  removePiece(row: number, col: number): boolean {
    if (row < 0 || row >= this.BOARD_SIZE || col < 0 || col >= this.BOARD_SIZE) {
      return false; // Invalid position
    }
    
    const board = this.boardState();
    const piece = board.squares[row][col];
    
    if (!piece) {
      return false; // No piece to remove
    }
    
    this.boardState.update(state => {
      const newSquares = state.squares.map(r => [...r]);
      
      // Update king position if removing a king
      let whiteKingPosition = state.whiteKingPosition;
      let blackKingPosition = state.blackKingPosition;
      
      if (piece.type === 'king') {
        if (piece.color === 'white') {
          whiteKingPosition = { row: -1, col: -1 }; // Invalid position
        } else {
          blackKingPosition = { row: -1, col: -1 }; // Invalid position
        }
      }
      
      // Remove the piece
      newSquares[row][col] = null;
      
      return {
        ...state,
        squares: newSquares,
        whiteKingPosition,
        blackKingPosition
      };
    });
    
    // Update game history
    this.gameHistory = [this.createBoardCopy(this.boardState())];
    
    return true;
  }
  
  // Set the current player during custom setup
  setCurrentPlayer(color: PieceColor): void {
    this.boardState.update(state => ({
      ...state,
      currentPlayer: color
    }));
    
    // Update game history
    this.gameHistory = [this.createBoardCopy(this.boardState())];
  }
  
  // Validate custom board setup
  validateCustomBoard(): { valid: boolean, message: string } {
    const board = this.boardState();
    
    // Check for white king
    if (board.whiteKingPosition.row === -1) {
      return { valid: false, message: 'White king is missing' };
    }
    
    // Check for black king
    if (board.blackKingPosition.row === -1) {
      return { valid: false, message: 'Black king is missing' };
    }
    
    // Check if the current player's king is in check
    const currentColor = board.currentPlayer;
    const enemyColor = currentColor === 'white' ? 'black' : 'white';
    const kingPosition = currentColor === 'white' ? board.whiteKingPosition : board.blackKingPosition;
    
    // Check if the king is in check
    const isInCheck = this.isSquareUnderAttack(
      kingPosition.row, 
      kingPosition.col, 
      enemyColor, 
      board.squares
    );
    
    // Update check status but don't save it yet
    if (isInCheck) {
      return { valid: false, message: `${currentColor} king is in check` };
    }
    
    return { valid: true, message: 'Valid board setup' };
  }
  
  // Start a game from custom setup
  startFromCustomSetup(): boolean {
    const validation = this.validateCustomBoard();
    
    if (!validation.valid) {
      return false;
    }
    
    // Update game state (check, checkmate, stalemate)
    this.updateGameState();
    
    // Reset history to just the initial state
    this.gameHistory = [this.createBoardCopy(this.boardState())];
    
    return true;
  }
} 