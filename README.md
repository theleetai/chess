# Chess Game

A modern chess game built with Angular 19 and TailwindCSS.

## Features

### Core Chess Logic
- Complete implementation of chess rules
- Legal move validation
- Check and checkmate detection
- Stalemate detection
- Algebraic notation for moves
- Drag and drop support for pieces

### Advanced Chess Features
- **Pawn Promotion**: When a pawn reaches the other side, a modal appears with options to promote to Queen, Rook, Bishop, or Knight
- **Piece Threats**: Pieces are highlighted in red when threatened by the currently selected piece
- **Game History**: Full move history with the ability to replay the game
- **Evaluation Bar**: Simple evaluation bar showing the current advantage
- **Game Controls**: Options to resign, undo moves, or get hints
- **Player Avatars**: Visual representation of players and bot

### Game Modes
- Player vs Player
- Player vs Bot
- Player vs AI (coming soon)

## Technical Implementation

The game is built using a well-structured, component-based architecture:

### Core Services
- **GameService**: Manages the chess board state, move validation, and game logic
- **BotService**: Implements AI for computer opponent
- **GameStateService**: Tracks game mode and state

### Key Components
- **ChessBoardComponent**: Main board UI and interaction logic
- **MainMenuComponent**: Game entry point with mode selection
- **SettingsComponent**: Game configuration options

### Models
- **Board**: Represents the game state
- **Piece**: Represents chess pieces with their properties
- **Position**: Coordinates on the board
- **Move**: Represents a chess move with source, destination, and special properties

## Getting Started

1. Clone the repository
2. Install dependencies with `npm install`
3. Run the development server with `npm run dev`
4. Open your browser to `http://localhost:4200`

## Avatar Images

The game uses avatar images for players and the bot. You can generate these by running:

```
node src/download-avatars.js
```

This will download placeholder avatars from the UI Avatars API.
