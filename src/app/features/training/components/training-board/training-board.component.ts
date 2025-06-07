import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Board } from '../../../../core/models/board.model';
import { Piece } from '../../../../core/models/piece.model';

@Component({
  selector: 'app-training-board',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './training-board.component.html',
  styleUrls: ['./training-board.component.css']
})
export class TrainingBoardComponent implements OnInit, OnChanges {
  @Input() board: Board | null = null;
  @Input() showVisuals: boolean = true;
  @Input() gameId: string = '';
  @Input() isSelected: boolean = false;
  @Input() heatmapData: Map<string, number> = new Map();
  @Input() showHeatmap: boolean = false;

  // Create helper arrays for the template
  boardRows = Array(8).fill(0).map((_, i) => 7 - i);
  boardCols = Array(8).fill(0).map((_, i) => i);

  ngOnInit(): void {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['board'] && this.board) {
      // Board updated - component will re-render automatically
    }
  }

  // Get the piece at a position
  getPieceAt(row: number, col: number): Piece | null {
    if (!this.board) return null;
    return this.board.squares[row][col];
  }

  // Get the square color (light or dark)
  getSquareColor(row: number, col: number): string {
    return (row + col) % 2 === 0 ? 'bg-green-800' : 'bg-green-500';
  }

  // Get square classes including heatmap
  getSquareClasses(row: number, col: number): string {
    let classes = this.getSquareColor(row, col);
    
    if (this.isSelected) {
      classes += ' ring-2 ring-blue-400';
    }

    // Add heatmap intensity if enabled
    if (this.showHeatmap && this.heatmapData.size > 0) {
      const key = `${row},${col}`;
      const intensity = this.heatmapData.get(key) || 0;
      if (intensity > 0) {
        const opacity = Math.min(intensity / 100, 1); // Normalize to 0-1
        classes += ` heatmap-square heatmap-intensity-${Math.floor(opacity * 10)}`;
      }
    }

    return classes;
  }

  // Check if a position was part of the last move
  isLastMove(row: number, col: number): boolean {
    if (!this.board?.lastMove) return false;
    
    const lastMove = this.board.lastMove;
    return (
      (lastMove.from.row === row && lastMove.from.col === col) ||
      (lastMove.to.row === row && lastMove.to.col === col)
    );
  }

  // Get current player indicator
  getCurrentPlayerText(): string {
    if (!this.board) return '';
    return this.board.currentPlayer === 'white' ? 'White to move' : 'Black to move';
  }

  // Get game status
  getGameStatus(): string {
    if (!this.board) return '';
    
    if (this.board.isCheckmate) {
      const winner = this.board.currentPlayer === 'white' ? 'Black' : 'White';
      return `${winner} wins!`;
    }
    
    if (this.board.isStalemate) {
      return 'Draw by stalemate';
    }
    
    if (this.board.isCheck) {
      return `${this.board.currentPlayer} in check`;
    }
    
    return this.getCurrentPlayerText();
  }

  // Get move count
  getMoveCount(): number {
    if (!this.board) return 0;
    return Math.floor(this.board.moveHistory.length / 2) + 1;
  }

  // Get heatmap intensity for a square
  getHeatmapIntensity(row: number, col: number): number {
    if (!this.showHeatmap) return 0;
    const key = `${row},${col}`;
    return this.heatmapData.get(key) || 0;
  }
} 