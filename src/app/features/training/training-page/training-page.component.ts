import { Component, OnInit, OnDestroy, inject, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import * as tfvis from '@tensorflow/tfjs-vis';

import { TrainingService, TrainingConfig, TrainingMetrics, TrainingState } from '../services/training.service';
import { SelfPlayService, SelfPlayStats, GameInstance } from '../services/self-play.service';
import { ChessNetwork } from '../models/chess-network';
import { HeatmapData } from '../components/board-heatmap/board-heatmap.component';
import { NetworkVisualizerComponent } from '../components/network-visualizer/network-visualizer.component';
import { TrainingBoardComponent } from '../components/training-board/training-board.component';
import { GameService } from '../../../core/services/game.service';

@Component({
  selector: 'app-training-page',
  standalone: true,
  imports: [CommonModule, FormsModule, NetworkVisualizerComponent, TrainingBoardComponent],
  templateUrl: './training-page.component.html',
  styleUrls: ['./training-page.component.css']
})
export class TrainingPageComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private trainingService = inject(TrainingService);
  private selfPlayService = inject(SelfPlayService);
  
  @ViewChild('metricsContainer', { static: false }) metricsContainer!: ElementRef;
  @ViewChild('eloContainer', { static: false }) eloContainer!: ElementRef;
  
  // Training state
  trainingState: TrainingState = {
    isTraining: false,
    isPaused: false,
    config: {
      numParallelGames: 4,
      mctsSimulations: 50,
      temperature: 1.0,
      temperatureDecayMoves: 10,
      learningRate: 0.001,
      batchSize: 32,
      bufferSize: 10000,
      trainingInterval: 10,
      cPuct: 1.0,
      dirichletAlpha: 0.3,
      dirichletEpsilon: 0.25
    },
    metrics: [],
    currentEpoch: 0,
    totalBatches: 0,
    lastTrainingTime: 0
  };
  
  selfPlayStats: SelfPlayStats = {
    gamesCompleted: 0,
    gamesInProgress: 0,
    totalMoves: 0,
    whiteWins: 0,
    blackWins: 0,
    draws: 0,
    averageGameLength: 0,
    examplesGenerated: 0
  };
  
  // Visualization data
  heatmapData: HeatmapData[] = [];
  networkWeights: any[] = [];
  layerActivations: Map<string, Float32Array> = new Map();
  
  // UI state
  selectedGameId: string = '';
  activeGames: GameInstance[] = [];
  showNetworkViz: boolean = false;
  showGameDetails: boolean = false;
  showGameVisuals: boolean = true;
  showPerformanceHint: boolean = false;
  maxVisibleGames: number = 4;
  
  // Subscriptions
  private subscriptions: Subscription[] = [];
  
  // Empty heatmap for inactive games
  emptyHeatmap = new Map<string, number>();
  
  // Chart objects
  private metricsChart: any;
  private eloChart: any;
  
  ngOnInit(): void {
    this.initializeSubscriptions();
    this.initializeVisualization();
    this.updateNetworkWeights();
  }
  
  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.cleanupVisualization();
  }
  
  private initializeSubscriptions(): void {
    // Training state subscription
    const trainingSub = this.trainingService.state$.subscribe(state => {
      this.trainingState = state;
    });
    this.subscriptions.push(trainingSub);
    
    // Self-play stats subscription
    const statsSub = this.selfPlayService.stats$.subscribe(stats => {
      this.selfPlayStats = stats;
      this.updateActiveGames();
      this.updateEloChart();
    });
    this.subscriptions.push(statsSub);
    
    // Training metrics subscription
    const metricsSub = this.trainingService.metrics$.subscribe(metrics => {
      this.updateMetricsChart(metrics);
    });
    this.subscriptions.push(metricsSub);
  }
  
  private initializeVisualization(): void {
    // Use setTimeout to ensure DOM elements are ready
    setTimeout(() => {
      try {
        this.createMetricsChart();
        this.createEloChart();
      } catch (error) {
        console.warn('Failed to initialize charts, continuing without them:', error);
      }
    }, 100);
  }
  
  private cleanupVisualization(): void {
    if (this.metricsChart) {
      tfvis.visor().close();
    }
  }
  
  // Training control methods
  startTraining(): void {
    this.trainingService.startTraining(this.trainingState.config);
    
    // Provide immediate feedback
    this.trainingState.isTraining = true;
    this.trainingState.isPaused = false;
    
    // Initialize charts immediately to show loading state
    this.initializeChartsWithLoadingState();
    
    // Start some initial games for immediate visualization
    this.initializeImmediateGames();
  }
  
  pauseTraining(): void {
    this.trainingService.pauseTraining();
  }
  
  stopTraining(): void {
    this.trainingService.stopTraining();
  }
  
  resetTraining(): void {
    this.trainingService.resetTraining();
    this.clearCharts();
  }
  
  // Configuration methods
  updateConfig(): void {
    this.trainingService.updateConfig(this.trainingState.config);
  }
  
  onConfigChange(field: keyof TrainingConfig, event: any): void {
    const value = event.target ? event.target.value : event;
    
    // Convert string values to appropriate types
    let convertedValue: any = value;
    
    if (field === 'numParallelGames' || field === 'batchSize' || field === 'mctsSimulations' || field === 'bufferSize') {
      convertedValue = parseInt(value, 10);
      
      // Validate ranges for specific fields
      if (field === 'numParallelGames') {
        convertedValue = Math.max(1, Math.min(10, convertedValue));
      } else if (field === 'batchSize') {
        convertedValue = Math.max(16, Math.min(512, convertedValue));
      } else if (field === 'mctsSimulations') {
        convertedValue = Math.max(10, Math.min(1000, convertedValue));
      } else if (field === 'bufferSize') {
        convertedValue = Math.max(1000, Math.min(100000, convertedValue));
      }
    } else if (field === 'learningRate' || field === 'temperature') {
      convertedValue = parseFloat(value);
      
      // Validate ranges for float fields
      if (field === 'learningRate') {
        convertedValue = Math.max(0.0001, Math.min(0.1, convertedValue));
      } else if (field === 'temperature') {
        convertedValue = Math.max(0.1, Math.min(2.0, convertedValue));
      }
    }
    
    // Only update if the converted value is valid
    if (!isNaN(convertedValue) && isFinite(convertedValue)) {
      this.trainingState.config[field] = convertedValue;
      this.updateConfig();
    }
  }
  
  // Visualization methods
  private createMetricsChart(): void {
    if (!this.metricsContainer?.nativeElement) return;

    try {
      // Create initial data for all three series to match the series labels
      const initialPoint = [{ x: 0, y: 0 }];
      
      this.metricsChart = tfvis.render.linechart(this.metricsContainer.nativeElement, {
        values: [initialPoint, initialPoint, initialPoint], // Three data series
        series: ['Total Loss', 'Policy Loss', 'Value Loss']
      }, {
        width: 350,
        height: 200,
        xLabel: 'Training Batch',
        yLabel: 'Loss Value'
      });
    } catch (error) {
      console.error('Error creating metrics chart:', error);
    }
  }
  
  private createEloChart(): void {
    if (!this.eloContainer?.nativeElement) return;

    try {
      this.eloChart = tfvis.render.linechart(this.eloContainer.nativeElement, {
        values: [
          { x: 0, y: 1200 } // Initial dummy data point with reasonable Elo starting value
        ],
        series: ['Estimated Elo']
      }, {
        width: 350,
        height: 200,
        xLabel: 'Training Batch',
        yLabel: 'Elo Rating'
      });
    } catch (error) {
      console.error('Error creating Elo chart:', error);
    }
  }
  
  private updateMetricsChart(newMetrics: TrainingMetrics): void {
    if (!this.metricsContainer?.nativeElement || !newMetrics) return;

    try {
      // Update metrics data
      const recentMetrics = this.trainingService.getRecentMetrics(100);
      
      const totalLossData = recentMetrics.map(m => ({ x: m.batchesTrained, y: m.totalLoss }));
      const policyLossData = recentMetrics.map(m => ({ x: m.batchesTrained, y: m.policyLoss }));
      const valueLossData = recentMetrics.map(m => ({ x: m.batchesTrained, y: m.valueLoss }));
      
      // Validate data before rendering
      const isValidData = (data: { x: number, y: number }[]) => 
        data.length > 0 && data.every(point => 
          typeof point.x === 'number' && 
          typeof point.y === 'number' && 
          !isNaN(point.x) && 
          !isNaN(point.y) && 
          isFinite(point.x) && 
          isFinite(point.y)
        );

      if (isValidData(totalLossData) && isValidData(policyLossData) && isValidData(valueLossData)) {
        tfvis.render.linechart(this.metricsContainer.nativeElement, {
          values: [totalLossData, policyLossData, valueLossData], // All three series
          series: ['Total Loss', 'Policy Loss', 'Value Loss']
        }, {
          width: 350,
          height: 200,
          xLabel: 'Training Batch',
          yLabel: 'Loss Value'
        });
      }
    } catch (error) {
      console.error('Error updating metrics chart:', error);
    }
  }
  
  private updateEloChart(): void {
    if (!this.eloContainer?.nativeElement) return;

    try {
      const recentMetrics = this.trainingService.getRecentMetrics(100);
      
      if (recentMetrics.length === 0) {
        // Show initial dummy data
        tfvis.render.linechart(this.eloContainer.nativeElement, {
          values: [{ x: 0, y: 1200 }],
          series: ['Estimated Elo']
        }, {
          width: 350,
          height: 200,
          xLabel: 'Training Batch',
          yLabel: 'Elo Rating'
        });
        return;
      }

      const eloData = recentMetrics.map(metric => ({
        x: metric.batchesTrained,
        y: this.calculateEloAtBatch(metric.batchesTrained)
      }));

      // Filter valid data points
      const validEloData = eloData.filter(point => 
        typeof point.x === 'number' && 
        typeof point.y === 'number' && 
        !isNaN(point.x) && 
        !isNaN(point.y) && 
        isFinite(point.x) && 
        isFinite(point.y) &&
        point.y >= 800 && 
        point.y <= 3000
      );

      if (validEloData.length > 0) {
        tfvis.render.linechart(this.eloContainer.nativeElement, {
          values: validEloData,
          series: ['Estimated Elo']
        }, {
          width: 350,
          height: 200,
          xLabel: 'Training Batch',
          yLabel: 'Elo Rating'
        });
      }
    } catch (error) {
      console.error('Error updating Elo chart:', error);
    }
  }
  
  private calculateEloAtBatch(batchNumber: number): number {
    // More robust Elo calculation with bounds checking
    if (!isFinite(batchNumber) || batchNumber < 0) {
      return 1200; // Default starting Elo
    }
    
    const baseElo = 1200;
    const maxIncrease = 800; // Maximum Elo increase
    const growthRate = 0.001; // How fast Elo grows
    
    const eloIncrease = maxIncrease * (1 - Math.exp(-growthRate * batchNumber));
    const finalElo = baseElo + eloIncrease;
    
    // Ensure Elo stays within reasonable bounds
    return Math.max(800, Math.min(3000, finalElo));
  }
  
  private clearCharts(): void {
    if (this.metricsContainer?.nativeElement) {
      this.metricsContainer.nativeElement.innerHTML = '';
    }
    
    if (this.eloContainer?.nativeElement) {
      this.eloContainer.nativeElement.innerHTML = '';
    }
    
    this.metricsChart = null;
    this.eloChart = null;
  }
  
  // Game monitoring methods
  private updateActiveGames(): void {
    const allGames = this.selfPlayService.getActiveGames();
    
    // Keep only the last 20 games for performance
    // Prioritize: in-progress games first, then most recent completed games
    const inProgressGames = allGames.filter(g => !g.isFinished);
    const completedGames = allGames.filter(g => g.isFinished)
      .sort((a, b) => parseInt(b.id.split('_')[1]) - parseInt(a.id.split('_')[1]))
      .slice(0, Math.max(0, 20 - inProgressGames.length));
    
    this.activeGames = [...inProgressGames, ...completedGames];
    
    // Update performance hint
    this.showPerformanceHint = allGames.length > 10;
    
    // If we have a selected game but it's no longer in our visible list, clear selection
    if (this.selectedGameId && !this.activeGames.find(g => g.id === this.selectedGameId)) {
      this.selectedGameId = '';
    }
  }
  
  selectGame(gameId: string): void {
    this.selectedGameId = gameId;
    this.updateGameVisualization();
  }
  
  private updateGameVisualization(): void {
    if (!this.selectedGameId) return;
    
    const game = this.selfPlayService.getGame(this.selectedGameId);
    if (!game || game.gameHistory.length === 0) return;
    
    // Get the last position's visit counts for heatmap
    const lastPosition = game.gameHistory[game.gameHistory.length - 1];
    this.updateHeatmapFromVisitCounts(lastPosition.visitCounts);
  }
  
  private updateHeatmapFromVisitCounts(visitCounts: Map<string, number>): void {
    this.heatmapData = [];
    const maxVisits = Math.max(...Array.from(visitCounts.values()));
    
    if (maxVisits === 0) return;
    
    visitCounts.forEach((count, moveKey) => {
      // Parse move string: "fromRow,fromCol-toRow,toCol"
      const parts = moveKey.split('-');
      if (parts.length === 2) {
        const [fromRow, fromCol] = parts[0].split(',').map(Number);
        const [toRow, toCol] = parts[1].split(',').map(Number);
        
        // Add both from and to positions
        this.heatmapData.push({
          row: fromRow,
          col: fromCol,
          value: count,
          normalized: count / maxVisits
        });
        
        this.heatmapData.push({
          row: toRow,
          col: toCol,
          value: count * 0.7, // Slightly lower for destination
          normalized: (count * 0.7) / maxVisits
        });
      }
    });
  }
  
  // Network visualization methods
  toggleNetworkViz(): void {
    this.showNetworkViz = !this.showNetworkViz;
    if (this.showNetworkViz) {
      this.updateNetworkWeights();
    }
  }
  
  private updateNetworkWeights(): void {
    try {
      const network = this.trainingService.getNetwork();
      if (network && network.modelReady) {
        const weights = network.getWeights();
        // Validate weights before setting
        if (weights && weights.length > 0) {
          this.networkWeights = weights;
          console.log(`Updated network weights: ${weights.length} tensors`);
        } else {
          console.warn('No valid network weights available');
          this.networkWeights = [];
        }
      } else {
        console.warn('Network not ready for weight extraction');
        this.networkWeights = [];
      }
    } catch (error) {
      console.error('Error updating network weights:', error);
      this.networkWeights = [];
    }
  }
  
  async updateLayerActivations(): Promise<void> {
    try {
      const network = this.trainingService.getNetwork();
      if (!network || !network.modelReady) {
        console.warn('Network not ready for activation extraction');
        this.layerActivations.clear();
        return;
      }

      // Get a sample board state (could be from current game or create a default one)
      const sampleBoard = this.getSampleBoardState();
      if (!sampleBoard) {
        console.warn('No sample board state available');
        this.layerActivations.clear();
        return;
      }

      const boardEncoding = network.encodeBoardState(sampleBoard);
      
      // Get activations for different layers
      const layerNames = ['conv2d_1', 'conv2d_2', 'dense_1', 'dense_2']; // Example layer names
      const activations = new Map<string, Float32Array>();
      
      for (const layerName of layerNames) {
        try {
          const activation = await network.getActivations(boardEncoding, layerName);
          if (activation) {
            activations.set(layerName, activation);
          }
        } catch (error) {
          console.warn(`Failed to get activations for layer ${layerName}:`, error);
        }
      }
      
      this.layerActivations = activations;
      console.log(`Updated activations for ${activations.size} layers`);
    } catch (error) {
      console.error('Error updating layer activations:', error);
      this.layerActivations.clear();
    }
  }
  
  private getSampleBoardState(): any {
    // Try to get a board state from active games
    if (this.activeGames.length > 0) {
      const game = this.activeGames[0];
      return game.gameService?.board();
    }
    
    // If no active games, create a sample initial board state
    try {
      const tempGameService = new GameService();
      tempGameService.resetGame();
      return tempGameService.board();
    } catch (error) {
      console.error('Failed to create sample board state:', error);
      return null;
    }
  }
  
  // Utility methods
  formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString();
  }
  
  formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
  
  getWinRate(): number {
    const total = this.selfPlayStats.whiteWins + this.selfPlayStats.blackWins + this.selfPlayStats.draws;
    if (total === 0) return 0;
    return ((this.selfPlayStats.whiteWins + this.selfPlayStats.draws * 0.5) / total) * 100;
  }
  
  getTrainingSpeed(): number {
    if (this.trainingState.totalBatches === 0 || this.trainingState.lastTrainingTime === 0) return 0;
    
    const now = Date.now();
    const timeDiff = now - this.trainingState.lastTrainingTime;
    const recentBatches = this.trainingState.metrics.slice(-10).length;
    
    if (timeDiff === 0) return 0;
    return (recentBatches / timeDiff) * 1000 * 60; // batches per minute
  }
  
  getCurrentElo(): number {
    return this.trainingService.calculateEloEstimate();
  }
  
  getBufferUsage(): number {
    const bufferSize = this.trainingService.getBufferSize();
    const maxSize = this.trainingState.config.bufferSize;
    return (bufferSize / maxSize) * 100;
  }
  
  returnToMenu(): void {
    this.router.navigate(['/']);
  }
  
  // Save and load methods
  async saveModel(): Promise<void> {
    try {
      await this.trainingService.saveModel();
      alert('Model saved successfully!');
    } catch (error) {
      console.error('Error saving model:', error);
      alert('Error saving model. Check the console for details.');
    }
  }
  
  async loadModel(): Promise<void> {
    try {
      await this.trainingService.loadModel();
      this.updateNetworkWeights();
      alert('Model loaded successfully!');
    } catch (error) {
      console.error('Error loading model:', error);
      alert('Error loading model. Check the console for details.');
    }
  }
  
  // Export training data
  exportTrainingData(): void {
    const data = {
      trainingState: this.trainingState,
      selfPlayStats: this.selfPlayStats,
      timestamp: Date.now()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `chess-training-data-${Date.now()}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
  }
  
  // Toggle game visuals for performance
  toggleGameVisuals(): void {
    this.showGameVisuals = !this.showGameVisuals;
  }
  
  // Get visible games (limited for performance)
  getVisibleGames(): GameInstance[] {
    if (!this.showGameVisuals) {
      return [];
    }
    
    // Return the games, limited to maxVisibleGames for performance
    return this.activeGames.slice(0, this.maxVisibleGames);
  }
  
  // Get game board state
  getGameBoard(gameId: string) {
    const game = this.activeGames.find(g => g.id === gameId);
    if (!game) {
      return null;
    }
    
    // Always get the current board state from the game service
    return game.gameService.board();
  }
  
  // Check if game is selected
  isGameSelected(gameId: string): boolean {
    return this.selectedGameId === gameId;
  }
  
  // Get game move count
  getGameMoveCount(game: GameInstance): number {
    return game.moveCount || 0;
  }
  
  // Get game result text
  getGameResultText(game: GameInstance): string {
    if (!game.isFinished) return 'In Progress';
    
    if (game.result === 1) return 'White Wins';
    if (game.result === -1) return 'Black Wins';
    if (game.result === 0) return 'Draw';
    
    return 'Unknown';
  }
  
  // Track by function for ngFor performance
  trackByGameId(index: number, game: GameInstance): string {
    return game.id;
  }
  
  // Get heatmap for selected game
  getGameHeatmap(gameId: string): Map<string, number> {
    const game = this.activeGames.find(g => g.id === gameId);
    if (!game || game.gameHistory.length === 0) {
      return this.emptyHeatmap;
    }
    
    const lastPosition = game.gameHistory[game.gameHistory.length - 1];
    return lastPosition.visitCounts || this.emptyHeatmap;
  }
  
  private initializeChartsWithLoadingState(): void {
    // Clear chart containers
    if (this.metricsContainer?.nativeElement) {
      this.metricsContainer.nativeElement.innerHTML = '';
    }
    
    if (this.eloContainer?.nativeElement) {
      this.eloContainer.nativeElement.innerHTML = '';
    }
    
    // Show immediate placeholder data
    setTimeout(() => {
      this.createMetricsChart();
      this.createEloChart();
    }, 100);
  }
  
  private initializeImmediateGames(): void {
    // Start a small number of games immediately for visualization
    const immediateGames = Math.min(this.trainingState.config.numParallelGames, 2);
    
    // Create some initial game instances for immediate display
    for (let i = 0; i < immediateGames; i++) {
      const gameId = `preview_${Date.now()}_${i}`;
      // These will be replaced by actual training games shortly
      this.selfPlayService.startSelfPlay(1, 50, 1.0, 10).then(() => {
        this.updateActiveGames();
      });
    }
    
    // Force an immediate update
    this.updateActiveGames();
  }
} 