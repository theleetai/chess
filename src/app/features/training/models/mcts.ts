import * as tf from '@tensorflow/tfjs';
import { Board } from '../../../core/models/board.model';
import { Move, Piece, Position, PieceColor } from '../../../core/models/piece.model';
import { ChessNetwork } from './chess-network';
import { GameService } from '../../../core/services/game.service';

export interface MCTSNode {
  id: string;
  board: Board;
  parent: MCTSNode | null;
  children: Map<string, MCTSNode>;
  move: Move | null; // Move that led to this position
  
  // MCTS statistics
  visitCount: number;
  totalValue: number;
  priorProbability: number;
  
  // Game state
  isTerminal: boolean;
  gameResult: number | null; // 1 for white win, -1 for black win, 0 for draw
}

export interface MCTSSearchResult {
  bestMove: Move;
  visitCounts: Map<string, number>;
  rootValue: number;
  policyProbabilities: Float32Array;
}

export class MCTS {
  private nodeCache: Map<string, MCTSNode> = new Map();
  private gameService = new GameService();
  
  constructor(
    private network: ChessNetwork,
    private cPuct: number = 1.0, // Exploration constant
    private addDirichletNoise: boolean = false,
    private dirichletAlpha: number = 0.3,
    private dirichletEpsilon: number = 0.25
  ) {}

  // Main MCTS search algorithm
  async search(
    rootBoard: Board, 
    numSimulations: number,
    temperature: number = 1.0
  ): Promise<MCTSSearchResult> {
    
    const rootNode = await this.getOrCreateNode(rootBoard, null, null);
    
    // Expand root node first
    await this.expandNode(rootNode);
    
    if (rootNode.children.size === 0) {
      throw new Error('No legal moves available');
    }
    
    // Run simulations
    for (let i = 0; i < numSimulations; i++) {
      await this.simulate(rootNode);
    }
    
    const bestMove = this.selectBestMove(rootNode, temperature);
    const visitCounts = this.getVisitCounts(rootNode);
    const policyProbabilities = this.getPolicyProbabilities(rootNode, rootBoard);
    
    return {
      bestMove,
      visitCounts,
      rootValue: rootNode.totalValue / Math.max(rootNode.visitCount, 1),
      policyProbabilities
    };
  }

  // Single MCTS simulation
  private async simulate(node: MCTSNode): Promise<void> {
    const path: MCTSNode[] = [];
    let current = node;

    // Selection phase - traverse tree using UCB1
    while (current.children.size > 0 && !current.isTerminal) {
      path.push(current);
      current = this.selectChild(current);
    }

    // Expansion and evaluation phase
    let value: number;
    
    if (current.isTerminal) {
      value = current.gameResult!;
    } else {
      // Expand node if it has been visited before
      if (current.visitCount > 0) {
        await this.expandNode(current);
        
        // If expansion created children, select one
        if (current.children.size > 0) {
          current = this.selectChild(current);
          path.push(current);
        }
      }
      
      // Evaluate position with neural network
      value = await this.evaluatePosition(current);
    }

    // Backpropagation phase
    this.backpropagate(path, value);
  }

  // Select child using UCB1 formula
  private selectChild(node: MCTSNode): MCTSNode {
    let bestChild: MCTSNode | null = null;
    let bestValue = -Infinity;

    for (const [_, child] of node.children) {
      const ucbValue = this.calculateUCB(child, node.visitCount);
      
      if (ucbValue > bestValue) {
        bestValue = ucbValue;
        bestChild = child;
      }
    }

    return bestChild!;
  }

  // Calculate Upper Confidence Bound
  private calculateUCB(node: MCTSNode, parentVisits: number): number {
    if (node.visitCount === 0) {
      return Infinity; // Prioritize unvisited nodes
    }

    const exploitation = node.totalValue / node.visitCount;
    const exploration = this.cPuct * node.priorProbability * 
                       Math.sqrt(parentVisits) / (1 + node.visitCount);
    
    return exploitation + exploration;
  }

  // Expand node by adding children for all legal moves
  private async expandNode(node: MCTSNode): Promise<void> {
    if (node.isTerminal || node.children.size > 0) {
      return;
    }

    const legalMoves = this.getLegalMoves(node.board);
    
    if (legalMoves.length === 0) {
      node.isTerminal = true;
      node.gameResult = this.evaluateTerminalPosition(node.board);
      return;
    }

    // Try to get network prediction, but use fallback if it fails
    let policyProbabilities: Float32Array | null = null;
    
    try {
      const boardEncoding = this.network.encodeBoardState(node.board);
      const prediction = await this.network.predict(boardEncoding);
      policyProbabilities = prediction.policy;
    } catch (error) {
      policyProbabilities = null;
    }
    
    // Create child nodes
    for (let i = 0; i < legalMoves.length; i++) {
      const move = legalMoves[i];
      const childBoard = this.applyMove(node.board, move);
      const childNode = await this.getOrCreateNode(childBoard, node, move);
      
      // Set prior probability from network policy or uniform distribution
      if (policyProbabilities) {
        const moveIndex = this.moveToIndex(move);
        childNode.priorProbability = policyProbabilities[moveIndex] || (1.0 / legalMoves.length);
      } else {
        // Uniform probability fallback
        childNode.priorProbability = 1.0 / legalMoves.length;
      }
      
      const moveKey = this.moveToString(move);
      node.children.set(moveKey, childNode);
    }

    // Add Dirichlet noise to root node for exploration
    if (this.addDirichletNoise && node.parent === null) {
      this.addDirichletNoiseToChildren(node);
    }
  }

  // Add Dirichlet noise for exploration at root
  private addDirichletNoiseToChildren(node: MCTSNode): void {
    const children = Array.from(node.children.values());
    const noise = this.sampleDirichlet(children.length, this.dirichletAlpha);
    
    children.forEach((child, index) => {
      child.priorProbability = (1 - this.dirichletEpsilon) * child.priorProbability + 
                              this.dirichletEpsilon * noise[index];
    });
  }

  // Sample from Dirichlet distribution
  private sampleDirichlet(size: number, alpha: number): number[] {
    const samples: number[] = [];
    let sum = 0;
    
    // Sample from Gamma distribution (approximation)
    for (let i = 0; i < size; i++) {
      const sample = this.sampleGamma(alpha, 1);
      samples.push(sample);
      sum += sample;
    }
    
    // Normalize to create Dirichlet sample
    return samples.map(s => s / sum);
  }

  // Approximate Gamma distribution sampling
  private sampleGamma(shape: number, scale: number): number {
    // Simple approximation using normal distribution for shape > 1
    if (shape >= 1) {
      const d = shape - 1/3;
      const c = 1 / Math.sqrt(9 * d);
      
      while (true) {
        const x = this.sampleNormal(0, 1);
        const v = (1 + c * x) ** 3;
        
        if (v > 0) {
          const u = Math.random();
          if (u < 1 - 0.0331 * x ** 4) {
            return d * v * scale;
          }
          if (Math.log(u) < 0.5 * x ** 2 + d * (1 - v + Math.log(v))) {
            return d * v * scale;
          }
        }
      }
    } else {
      // For shape < 1, use transformation
      return this.sampleGamma(shape + 1, scale) * Math.pow(Math.random(), 1 / shape);
    }
  }

  // Sample from normal distribution (Box-Muller transform)
  private sampleNormal(mean: number, stdDev: number): number {
    const u = Math.random();
    const v = Math.random();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return z * stdDev + mean;
  }

  // Evaluate position using neural network
  private async evaluatePosition(node: MCTSNode): Promise<number> {
    try {
      const boardEncoding = this.network.encodeBoardState(node.board);
      const prediction = await this.network.predict(boardEncoding);
      
      // Return value from perspective of current player
      return node.board.currentPlayer === 'white' ? prediction.value : -prediction.value;
    } catch (error) {
      // Simple material count fallback
      let materialValue = 0;
      const pieceValues = { 'pawn': 1, 'knight': 3, 'bishop': 3, 'rook': 5, 'queen': 9, 'king': 0 };
      
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const piece = node.board.squares[row][col];
          if (piece) {
            const value = pieceValues[piece.type];
            materialValue += piece.color === 'white' ? value : -value;
          }
        }
      }
      
      // Normalize and return from current player's perspective
      const normalizedValue = Math.tanh(materialValue / 10); // Normalize to [-1, 1]
      return node.board.currentPlayer === 'white' ? normalizedValue : -normalizedValue;
    }
  }

  // Backpropagate values up the tree
  private backpropagate(path: MCTSNode[], value: number): void {
    for (let i = path.length - 1; i >= 0; i--) {
      const node = path[i];
      node.visitCount++;
      
      // Flip value sign for alternating players
      const nodeValue = (path.length - i) % 2 === 1 ? value : -value;
      node.totalValue += nodeValue;
    }
  }

  // Select best move based on visit counts and temperature
  private selectBestMove(rootNode: MCTSNode, temperature: number): Move {
    const children = Array.from(rootNode.children.values());
    
    if (children.length === 0) {
      throw new Error('No legal moves available');
    }

    if (temperature === 0) {
      // Greedy selection
      let bestChild = children[0];
      for (const child of children) {
        if (child.visitCount > bestChild.visitCount) {
          bestChild = child;
        }
      }
      return bestChild.move!;
    } else {
      // Probabilistic selection based on visit counts
      const visitCounts = children.map(child => child.visitCount);
      const probabilities = this.softmax(visitCounts.map(count => Math.log(count + 1) / temperature));
      
      const randomValue = Math.random();
      let cumulativeProbability = 0;
      
      for (let i = 0; i < children.length; i++) {
        cumulativeProbability += probabilities[i];
        if (randomValue <= cumulativeProbability) {
          return children[i].move!;
        }
      }
      
      // Fallback to last child
      return children[children.length - 1].move!;
    }
  }

  // Softmax function
  private softmax(values: number[]): number[] {
    const maxValue = Math.max(...values);
    const expValues = values.map(v => Math.exp(v - maxValue));
    const sum = expValues.reduce((acc, val) => acc + val, 0);
    return expValues.map(exp => exp / sum);
  }

  // Get visit counts for all children
  private getVisitCounts(rootNode: MCTSNode): Map<string, number> {
    const visitCounts = new Map<string, number>();
    
    for (const [moveKey, child] of rootNode.children) {
      visitCounts.set(moveKey, child.visitCount);
    }
    
    return visitCounts;
  }

  // Get policy probabilities based on visit counts
  private getPolicyProbabilities(rootNode: MCTSNode, board: Board): Float32Array {
    const policy = new Float32Array(4096); // 64x64 possible moves
    const totalVisits = rootNode.visitCount;
    
    if (totalVisits === 0) return policy;
    
    for (const [_, child] of rootNode.children) {
      if (child.move) {
        const moveIndex = this.moveToIndex(child.move);
        policy[moveIndex] = child.visitCount / totalVisits;
      }
    }
    
    return policy;
  }

  // Get or create a node for the given board state
  private async getOrCreateNode(board: Board, parent: MCTSNode | null, move: Move | null): Promise<MCTSNode> {
    const boardKey = this.boardToString(board);
    
    if (this.nodeCache.has(boardKey)) {
      return this.nodeCache.get(boardKey)!;
    }

    const node: MCTSNode = {
      id: this.generateNodeId(),
      board: this.cloneBoard(board),
      parent,
      children: new Map(),
      move: move ? { ...move } : null,
      visitCount: 0,
      totalValue: 0,
      priorProbability: 0,
      isTerminal: board.isCheckmate || board.isStalemate,
      gameResult: this.evaluateTerminalPosition(board)
    };

    this.nodeCache.set(boardKey, node);
    return node;
  }

  // Convert move to string representation
  private moveToString(move: Move): string {
    return `${move.from.row},${move.from.col}-${move.to.row},${move.to.col}`;
  }

  // Convert move to index for policy vector
  private moveToIndex(move: Move): number {
    return move.from.row * 512 + move.from.col * 64 + move.to.row * 8 + move.to.col;
  }

  // Get legal moves for a board position
  private getLegalMoves(board: Board): Move[] {
    // Use the GameService to get legal moves
    const tempGameService = new GameService();
    tempGameService.loadGameState(board, [board]);
    
    const moves: Move[] = [];
    const currentPlayer = board.currentPlayer;
    
    // Check if game is already terminal
    if (board.isCheckmate || board.isStalemate) {
      return moves; // Return empty array for terminal positions
    }
    
    // Iterate through all squares to find pieces of the current player
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = board.squares[row][col];
        if (piece && piece.color === currentPlayer) {
          // Select this piece to get its legal moves
          tempGameService.selectPiece(row, col);
          const legalMoves = tempGameService.board().legalMoves;
          
          // Convert positions to moves
          for (const legalMove of legalMoves) {
            const targetPiece = board.squares[legalMove.row][legalMove.col];
            moves.push({
              from: { row, col },
              to: { row: legalMove.row, col: legalMove.col },
              piece: { ...piece },
              capturedPiece: targetPiece ? { ...targetPiece } : undefined
            });
          }
          
          // Clear selection
          tempGameService.clearSelection();
        }
      }
    }
    
    // If no legal moves found and game isn't terminal, something's wrong
    if (moves.length === 0 && !board.isCheckmate && !board.isStalemate) {
      console.warn('No legal moves found but game not terminal');
    }
    
    return moves;
  }
  
  // Apply a move to create a new board state
  private applyMove(board: Board, move: Move): Board {
    // Create a temporary game service instance
    const tempGameService = new GameService();
    tempGameService.loadGameState(board, [board]);
    
    // Execute the move
    tempGameService.selectPiece(move.from.row, move.from.col);
    const moveSuccessful = tempGameService.movePiece(move.to.row, move.to.col);
    
    if (!moveSuccessful) {
      console.error('Failed to apply move in MCTS:', move);
      return board; // Return original board if move fails
    }
    
    return tempGameService.board();
  }

  // Evaluate terminal position
  private evaluateTerminalPosition(board: Board): number | null {
    if (board.isCheckmate) {
      return board.currentPlayer === 'white' ? -1 : 1; // Current player loses
    } else if (board.isStalemate) {
      return 0; // Draw
    }
    return null; // Not terminal
  }

  // Clone board state
  private cloneBoard(board: Board): Board {
    const tempGameService = new GameService();
    tempGameService.loadGameState(board, [board]);
    return tempGameService.getCurrentGameState().currentState;
  }

  // Convert board to string for hashing
  private boardToString(board: Board): string {
    let result = '';
    
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = board.squares[row][col];
        if (piece) {
          result += `${piece.color[0]}${piece.type[0]}`;
        } else {
          result += '--';
        }
      }
    }
    
    result += board.currentPlayer[0];
    result += board.whiteKingMoved ? '1' : '0';
    result += board.blackKingMoved ? '1' : '0';
    result += board.whiteKingsideRookMoved ? '1' : '0';
    result += board.whiteQueensideRookMoved ? '1' : '0';
    result += board.blackKingsideRookMoved ? '1' : '0';
    result += board.blackQueensideRookMoved ? '1' : '0';
    
    return result;
  }

  // Generate unique node ID
  private generateNodeId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  // Clear the node cache to free memory
  clearCache(): void {
    this.nodeCache.clear();
  }

  // Get cache size for monitoring
  getCacheSize(): number {
    return this.nodeCache.size;
  }
} 