import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { GameService } from '../../../core/services/game.service';
import { GameStateService } from '../../../core/services/game-state.service';
import { Piece, PieceColor, PieceType, Position } from '../../../core/models/piece.model';
import { Board } from '../../../core/models/board.model';

interface ChessOpening {
  id: string;
  name: string;
  moves: string;
  fen?: string;
}

@Component({
  selector: 'app-game-builder',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './game-builder.component.html',
  styleUrls: ['./game-builder.component.css']
})
export class GameBuilderComponent implements OnInit {
  private router = inject(Router);
  private gameService = inject(GameService);
  private gameStateService = inject(GameStateService);
  
  // Chess board setup
  boardRows = Array(8).fill(0).map((_, i) => 7 - i);
  boardCols = Array(8).fill(0).map((_, i) => i);
  
  // Piece palette for selection
  availablePieces: { type: PieceType, color: PieceColor, image: string }[] = [];
  
  // Currently selected piece for placement
  selectedPieceType: PieceType | null = null;
  selectedPieceColor: PieceColor = 'white';
  
  // Drag and drop handling
  draggedPiece: { row: number, col: number } | null = null;
  
  // Board status
  isValidBoard: boolean = false;
  validationMessage: string = '';
  
  // Starting player
  startingPlayer: PieceColor = 'white';
  
  // Chess openings modal
  showOpeningsModal = false;
  
  // Sample chess openings
  chessOpenings: ChessOpening[] = [
    { id: 'sicilian', name: 'Sicilian Defense', moves: '1. e4 c5' },
    { id: 'french', name: 'French Defense', moves: '1. e4 e6' },
    { id: 'ruy-lopez', name: 'Ruy Lopez (Spanish Opening)', moves: '1. e4 e5 2. Nf3 Nc6 3. Bb5' },
    { id: 'queens-gambit', name: 'Queen\'s Gambit', moves: '1. d4 d5 2. c4' },
    { id: 'kings-indian', name: 'King\'s Indian Defense', moves: '1. d4 Nf6 2. c4 g6' },
    { id: 'italian', name: 'Italian Game', moves: '1. e4 e5 2. Nf3 Nc6 3. Bc4' },
    { id: 'english', name: 'English Opening', moves: '1. c4' },
    { id: 'dutch', name: 'Dutch Defense', moves: '1. d4 f5' },
    { id: 'scandinavian', name: 'Scandinavian Defense', moves: '1. e4 d5' }
  ];
  
  ngOnInit(): void {
    // Initialize the board based on game mode
    if (this.gameStateService.currentMode() === 'creative') {
      // For creative mode, start with a filled board
      this.loadStandardSetup();
    } else {
      // For custom game mode, start with an empty board
      this.gameService.createEmptyBoard();
    }
    
    // Fill the palette with available pieces
    this.initializePiecePalette();
  }
  
  // Initialize the piece palette for selection
  private initializePiecePalette(): void {
    const pieceTypes: PieceType[] = ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king'];
    const pieceColors: PieceColor[] = ['white', 'black'];
    
    this.availablePieces = [];
    
    for (const color of pieceColors) {
      for (const type of pieceTypes) {
        this.availablePieces.push({
          type,
          color,
          image: `assets/chess-pieces/${color.charAt(0).toUpperCase() + color.slice(1)}_${type.charAt(0).toUpperCase() + type.slice(1)}.png`
        });
      }
    }
  }
  
  // Get the current board state
  get board(): Board {
    return this.gameService.board();
  }
  
  // Get the piece at a position
  getPieceAt(row: number, col: number): Piece | null {
    return this.board.squares[row][col];
  }
  
  // Get the square color (light/dark)
  getSquareColor(row: number, col: number): string {
    return (row + col) % 2 === 0 ? 'bg-green-800' : 'bg-green-500';
  }
  
  // Select a piece type and color for placement
  selectPiece(type: PieceType, color: PieceColor): void {
    this.selectedPieceType = type;
    this.selectedPieceColor = color;
  }
  
  // Place a piece on the board
  placePiece(row: number, col: number): void {
    if (!this.selectedPieceType) return;
    
    // Place the selected piece
    this.gameService.placePiece(this.selectedPieceType, this.selectedPieceColor, row, col);
    
    // Validate the board
    this.validateBoard();
  }
  
  // Remove a piece from the board
  removePiece(row: number, col: number): void {
    const piece = this.getPieceAt(row, col);
    if (!piece) return;
    
    this.gameService.removePiece(row, col);
    
    // Validate the board
    this.validateBoard();
  }
  
  // Handle square click
  onSquareClick(row: number, col: number): void {
    // If we have a piece selected from the palette, place it
    if (this.selectedPieceType) {
      this.placePiece(row, col);
      return;
    }
    
    // If the square has a piece, remove it on right-click
    const piece = this.getPieceAt(row, col);
    if (piece) {
      // We'll handle right-click in the template with oncontextmenu
      return;
    }
  }
  
  // Handle drag start
  onDragStart(event: DragEvent, row: number, col: number): void {
    const piece = this.getPieceAt(row, col);
    if (!piece) {
      event.preventDefault();
      return;
    }
    
    this.draggedPiece = { row, col };
    
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', `${row},${col}`);
      event.dataTransfer.effectAllowed = 'move';
    }
  }
  
  // Handle drag over
  onDragOver(event: DragEvent, row: number, col: number): void {
    // Always allow drop in creative mode
    event.preventDefault();
  }
  
  // Handle drop
  onDrop(event: DragEvent, row: number, col: number): void {
    event.preventDefault();
    
    const data = event.dataTransfer?.getData('text/plain');
    
    // Check if this is a palette piece or a board piece
    if (data?.startsWith('palette:')) {
      // Handle palette piece drop
      const [_, type, color] = data.split(':');
      this.gameService.placePiece(type as PieceType, color as PieceColor, row, col);
      this.validateBoard();
    } else if (this.draggedPiece) {
      // Handle board piece drop (moving pieces around)
      const { row: fromRow, col: fromCol } = this.draggedPiece;
      const piece = this.getPieceAt(fromRow, fromCol);
      
      if (!piece) return;
      
      // Remove piece from old position
      this.gameService.removePiece(fromRow, fromCol);
      
      // Place at new position
      this.gameService.placePiece(piece.type, piece.color, row, col);
      
      this.draggedPiece = null;
      
      // Validate the board
      this.validateBoard();
    }
  }
  
  // Handle drag end
  onDragEnd(): void {
    this.draggedPiece = null;
  }
  
  // Validate the current board setup
  validateBoard(): void {
    const validation = this.gameService.validateCustomBoard();
    this.isValidBoard = validation.valid;
    this.validationMessage = validation.message;
  }
  
  // Clear the board
  clearBoard(): void {
    this.gameService.createEmptyBoard();
    this.isValidBoard = false;
    this.validationMessage = 'Board is empty';
  }
  
  // Load a standard chess setup
  loadStandardSetup(): void {
    // Clear first
    this.gameService.createEmptyBoard();
    
    // Place pawns
    for (let col = 0; col < 8; col++) {
      this.gameService.placePiece('pawn', 'white', 1, col);
      this.gameService.placePiece('pawn', 'black', 6, col);
    }
    
    // Place rooks
    this.gameService.placePiece('rook', 'white', 0, 0);
    this.gameService.placePiece('rook', 'white', 0, 7);
    this.gameService.placePiece('rook', 'black', 7, 0);
    this.gameService.placePiece('rook', 'black', 7, 7);
    
    // Place knights
    this.gameService.placePiece('knight', 'white', 0, 1);
    this.gameService.placePiece('knight', 'white', 0, 6);
    this.gameService.placePiece('knight', 'black', 7, 1);
    this.gameService.placePiece('knight', 'black', 7, 6);
    
    // Place bishops
    this.gameService.placePiece('bishop', 'white', 0, 2);
    this.gameService.placePiece('bishop', 'white', 0, 5);
    this.gameService.placePiece('bishop', 'black', 7, 2);
    this.gameService.placePiece('bishop', 'black', 7, 5);
    
    // Place queens
    this.gameService.placePiece('queen', 'white', 0, 3);
    this.gameService.placePiece('queen', 'black', 7, 3);
    
    // Place kings
    this.gameService.placePiece('king', 'white', 0, 4);
    this.gameService.placePiece('king', 'black', 7, 4);
    
    this.validateBoard();
  }
  
  // Set starting player
  setStartingPlayer(color: PieceColor): void {
    this.startingPlayer = color;
    this.gameService.setCurrentPlayer(color);
  }
  
  // Start the game with current setup
  startGame(): void {
    if (!this.isValidBoard) {
      return;
    }
    
    // Set starting player
    this.gameService.setCurrentPlayer(this.startingPlayer);
    
    // Start the game with proper mode
    if (this.gameStateService.currentMode() === 'creative') {
      this.gameStateService.setGameMode('custom');
    }
    
    if (!this.gameService.startFromCustomSetup()) {
      console.error('Failed to start custom game');
      return;
    }
    
    // Navigate to the game board
    this.router.navigate(['/game']);
  }
  
  // Return to main menu
  returnToMenu(): void {
    this.router.navigate(['/']);
  }
  
  // Check if we're in creative mode
  get isCreativeMode(): boolean {
    return this.gameStateService.currentMode() === 'creative';
  }
  
  // Open the chess openings dialog
  openOpeningsDialog(): void {
    this.showOpeningsModal = true;
  }
  
  // Load a specific opening position
  loadOpening(openingId: string): void {
    // Start with standard setup
    this.loadStandardSetup();
    
    // Apply opening moves based on ID
    switch(openingId) {
      case 'sicilian':
        // e4 c5
        this.movePiece(1, 4, 3, 4); // e2-e4
        this.movePiece(6, 2, 4, 2); // c7-c5
        break;
      case 'french':
        // e4 e6
        this.movePiece(1, 4, 3, 4); // e2-e4
        this.movePiece(6, 4, 4, 4); // e7-e6
        break;
      case 'ruy-lopez':
        // e4 e5 Nf3 Nc6 Bb5
        this.movePiece(1, 4, 3, 4); // e2-e4
        this.movePiece(6, 4, 4, 4); // e7-e5
        this.movePiece(0, 6, 2, 5); // g1-f3
        this.movePiece(7, 1, 5, 2); // b8-c6
        this.movePiece(0, 5, 2, 1); // f1-b5
        break;
      case 'queens-gambit':
        // d4 d5 c4
        this.movePiece(1, 3, 3, 3); // d2-d4
        this.movePiece(6, 3, 4, 3); // d7-d5
        this.movePiece(1, 2, 3, 2); // c2-c4
        break;
      case 'kings-indian':
        // d4 Nf6 c4 g6
        this.movePiece(1, 3, 3, 3); // d2-d4
        this.movePiece(7, 6, 5, 5); // g8-f6
        this.movePiece(1, 2, 3, 2); // c2-c4
        this.movePiece(6, 6, 4, 6); // g7-g6
        break;
      case 'italian':
        // e4 e5 Nf3 Nc6 Bc4
        this.movePiece(1, 4, 3, 4); // e2-e4
        this.movePiece(6, 4, 4, 4); // e7-e5
        this.movePiece(0, 6, 2, 5); // g1-f3
        this.movePiece(7, 1, 5, 2); // b8-c6
        this.movePiece(0, 5, 2, 2); // f1-c4
        break;
      case 'english':
        // c4
        this.movePiece(1, 2, 3, 2); // c2-c4
        break;
      case 'dutch':
        // d4 f5
        this.movePiece(1, 3, 3, 3); // d2-d4
        this.movePiece(6, 5, 4, 5); // f7-f5
        break;
      case 'scandinavian':
        // e4 d5
        this.movePiece(1, 4, 3, 4); // e2-e4
        this.movePiece(6, 3, 4, 3); // d7-d5
        break;
    }
    
    this.validateBoard();
    this.showOpeningsModal = false;
  }
  
  // Helper method to move pieces during openings setup
  private movePiece(fromRow: number, fromCol: number, toRow: number, toCol: number): void {
    const piece = this.board.squares[fromRow][fromCol];
    if (!piece) return;
    
    // Remove from original position
    this.gameService.removePiece(fromRow, fromCol);
    
    // Place at new position
    this.gameService.placePiece(piece.type, piece.color, toRow, toCol);
  }
  
  // Make the palette pieces draggable
  onPaletteDragStart(event: DragEvent, type: PieceType, color: PieceColor): void {
    this.selectedPieceType = type;
    this.selectedPieceColor = color;
    
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', `palette:${type}:${color}`);
      event.dataTransfer.effectAllowed = 'copy';
    }
  }
} 