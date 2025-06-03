import { Injectable, inject } from '@angular/core';
import { Piece, Position, PieceColor } from '../models/piece.model';
import { GameService } from './game.service';
import { Board } from '../models/board.model';
import { BehaviorSubject, Observable } from 'rxjs';

// Define the PreMove interface
export interface PreMove {
  id: string;               // Unique identifier for this pre-move
  pieceId: string;          // Original piece identifier (row,col)
  from: Position;           // Starting position
  to: Position;             // Target position
  originalPosition: Position; // Original board position of the piece
}

@Injectable({
  providedIn: 'root'
})
export class PreMoveService {
  private gameService = inject(GameService);
  
  // Current active pre-move (while selecting)
  private activeMoveFromSubject = new BehaviorSubject<Position | null>(null);
  public activeFrom$ = this.activeMoveFromSubject.asObservable();
  
  // Pre-move queue
  private preMoveQueueSubject = new BehaviorSubject<PreMove[]>([]);
  public preMoveQueue$ = this.preMoveQueueSubject.asObservable();
  
  // Virtual piece positions (for visualization)
  private virtualPositionsSubject = new BehaviorSubject<Map<string, Position>>(new Map());
  public virtualPositions$ = this.virtualPositionsSubject.asObservable();
  
  // Processing flag to prevent multiple executions
  private processingPreMove = false;
  
  constructor() { }
  
  // Get current state
  get activeFrom(): Position | null {
    return this.activeMoveFromSubject.value;
  }
  
  get preMoveQueue(): PreMove[] {
    return this.preMoveQueueSubject.value;
  }
  
  get virtualPositions(): Map<string, Position> {
    return this.virtualPositionsSubject.value;
  }
  
  // Start a pre-move selection
  startPreMove(row: number, col: number): void {
    this.activeMoveFromSubject.next({ row, col });
  }
  
  // Set the destination for a pre-move
  setPreMoveDestination(row: number, col: number): void {
    if (!this.activeFrom) return;
    
    const fromRow = this.activeFrom.row;
    const fromCol = this.activeFrom.col;
    
    // Get the piece we're trying to move
    const board = this.gameService.board();
    const piece = board.squares[fromRow][fromCol];
    
    if (!piece || piece.color !== 'white') {
      this.activeMoveFromSubject.next(null);
      return;
    }
    
    // Check if this would be a valid piece move (only respect piece movement rules)
    if (!this.isValidPreMove(fromRow, fromCol, row, col)) {
      this.activeMoveFromSubject.next(null);
      return;
    }
    
    // Create a unique ID for this pre-move
    const id = crypto.randomUUID();
    const pieceId = `${fromRow},${fromCol}`;
    
    // Create a pre-move object
    const preMove: PreMove = {
      id,
      pieceId,
      from: { row: fromRow, col: fromCol },
      to: { row, col },
      originalPosition: { ...piece.position }
    };
    
    // Add to the queue
    const currentQueue = [...this.preMoveQueueSubject.value];
    currentQueue.push(preMove);
    this.preMoveQueueSubject.next(currentQueue);
    
    // Update virtual positions
    this.updateVirtualPositions();
    
    // Clear the active selection
    this.activeMoveFromSubject.next(null);
  }
  
  // Clear all pre-moves
  clearPreMoves(): void {
    this.activeMoveFromSubject.next(null);
    this.preMoveQueueSubject.next([]);
    this.virtualPositionsSubject.next(new Map());
  }
  
  // Cancel pre-moves for a specific piece
  cancelPreMovesForPiece(row: number, col: number): void {
    const pieceId = this.getPieceKey(row, col);
    
    // Filter out pre-moves that involve this piece
    const filteredPreMoves = this.preMoveQueue.filter(move => move.pieceId !== pieceId);
    
    // If we removed any pre-moves, update the queue
    if (filteredPreMoves.length !== this.preMoveQueue.length) {
      this.preMoveQueueSubject.next(filteredPreMoves);
      this.updateVirtualPositions();
    }
  }
  
  // Check if a position is part of a pre-move
  isPreMove(row: number, col: number): boolean {
    if (this.preMoveQueue.length === 0) return false;
    
    return this.preMoveQueue.some(move => 
      (move.from.row === row && move.from.col === col) || 
      (move.to.row === row && move.to.col === col)
    );
  }
  
  // Check if a position is the destination of a pre-move
  isPreMoveDestination(row: number, col: number): boolean {
    if (this.preMoveQueue.length === 0) return false;
    
    return this.preMoveQueue.some(move => move.to.row === row && move.to.col === col);
  }
  
  // Check if a piece has a pre-move
  hasPiecePreMove(row: number, col: number): boolean {
    const pieceId = this.getPieceKey(row, col);
    return this.preMoveQueue.some(move => move.pieceId === pieceId);
  }
  
  // Get virtual position of a piece after pre-moves
  getVirtualPosition(row: number, col: number): Position | undefined {
    const key = this.getPieceKey(row, col);
    return this.virtualPositions.get(key);
  }
  
  // Check if a position has a virtual piece on it
  hasVirtualPieceAt(row: number, col: number): boolean {
    for (const [_, pos] of this.virtualPositions) {
      if (pos.row === row && pos.col === col) {
        return true;
      }
    }
    return false;
  }
  
  // Get the piece that would be visualized at a position
  getVirtualPieceAt(row: number, col: number, board: Board): Piece | null {
    for (const [key, pos] of this.virtualPositions) {
      if (pos.row === row && pos.col === col) {
        const [origRow, origCol] = key.split(',').map(Number);
        return board.squares[origRow][origCol];
      }
    }
    return null;
  }
  
  // Get the original position of a virtual piece
  getOriginalPositionOfVirtualPieceAt(row: number, col: number): Position | null {
    for (const [key, pos] of this.virtualPositions) {
      if (pos.row === row && pos.col === col) {
        const [origRow, origCol] = key.split(',').map(Number);
        return { row: origRow, col: origCol };
      }
    }
    return null;
  }
  
  // Generate a unique key for a piece based on its position
  private getPieceKey(row: number, col: number): string {
    return `${row},${col}`;
  }
  
  // Update virtual positions based on the current pre-move queue
  private updateVirtualPositions(): void {
    const newVirtualPositions = new Map<string, Position>();
    
    // Process pre-moves in order to build up the virtual positions
    for (const move of this.preMoveQueue) {
      newVirtualPositions.set(move.pieceId, { row: move.to.row, col: move.to.col });
    }
    
    this.virtualPositionsSubject.next(newVirtualPositions);
  }
  
  // Execute the next pre-move in the queue
  executeNextPreMove(): boolean {
    const board = this.gameService.board();
    
    // Only execute if it's the player's turn (white) and we have pre-moves
    if (board.currentPlayer !== 'white' || this.preMoveQueue.length === 0) {
      return false;
    }
    
    if (this.processingPreMove) {
      return false; // Prevent concurrent execution
    }
    
    this.processingPreMove = true;
    
    try {
      // Get the next pre-move
      const preMove = this.preMoveQueue[0];
      
      // Get the piece at the original position
      const piece = board.squares[preMove.originalPosition.row][preMove.originalPosition.col];
      
      if (!piece) {
        // The piece is no longer at the original position, remove the pre-move
        this.cancelPreMovesForPiece(preMove.originalPosition.row, preMove.originalPosition.col);
        return false;
      }
      
      // Select the piece
      this.gameService.selectPiece(preMove.originalPosition.row, preMove.originalPosition.col);
      
      // Attempt to move the piece
      let moveSuccessful = false;
      
      // Check for pawn promotion
      if (piece.type === 'pawn' && 
          ((piece.color === 'white' && preMove.to.row === 7) || 
           ((piece.color as PieceColor) === 'black' && preMove.to.row === 0))) {
        // For simplicity, auto-promote to queen
        moveSuccessful = this.gameService.movePieceWithPromotion(
          preMove.originalPosition,
          preMove.to,
          'queen'
        );
      } else {
        moveSuccessful = this.gameService.movePiece(preMove.to.row, preMove.to.col);
      }
      
      // Remove this pre-move
      const updatedQueue = [...this.preMoveQueue];
      updatedQueue.shift();
      this.preMoveQueueSubject.next(updatedQueue);
      
      // Update virtual positions
      this.updateVirtualPositions();
      
      return moveSuccessful;
    } finally {
      this.processingPreMove = false;
    }
  }
  
  // Check if a pre-move follows basic piece movement rules
  isValidPreMove(fromRow: number, fromCol: number, toRow: number, toCol: number): boolean {
    const board = this.gameService.board();
    const piece = board.squares[fromRow][fromCol];
    
    if (!piece) return false;
    
    // Get legal moves for this piece
    this.gameService.selectPiece(fromRow, fromCol);
    const legalMoves = [...board.legalMoves]; // Create a copy
    this.gameService.clearSelection(); // Clear selection to not affect UI
    
    // Check if the target position is in the legal moves
    return legalMoves.some(move => move.row === toRow && move.col === toCol);
  }
} 