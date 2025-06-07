import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject, interval, Subscription } from 'rxjs';
import { ChessNetwork, TrainingExample } from '../models/chess-network';
import { SelfPlayService, SelfPlayStats } from './self-play.service';

export interface TrainingConfig {
  // Self-play parameters
  numParallelGames: number;
  mctsSimulations: number;
  temperature: number;
  temperatureDecayMoves: number;
  
  // Training parameters
  learningRate: number;
  batchSize: number;
  bufferSize: number;
  trainingInterval: number; // Train every N moves
  
  // Exploration parameters
  cPuct: number;
  dirichletAlpha: number;
  dirichletEpsilon: number;
}

export interface TrainingMetrics {
  epoch: number;
  batchesTrained: number;
  policyLoss: number;
  valueLoss: number;
  totalLoss: number;
  learningRate: number;
  timestamp: number;
}

export interface TrainingState {
  isTraining: boolean;
  isPaused: boolean;
  config: TrainingConfig;
  metrics: TrainingMetrics[];
  currentEpoch: number;
  totalBatches: number;
  lastTrainingTime: number;
}

@Injectable({
  providedIn: 'root'
})
export class TrainingService {
  private trainingState: TrainingState;
  private trainingSubscription?: Subscription;
  private selfPlaySubscription?: Subscription;
  private currentStats: SelfPlayStats;
  
  // Observables for state management
  private stateSubject = new BehaviorSubject<TrainingState>({
    isTraining: false,
    isPaused: false,
    config: this.getDefaultConfig(),
    metrics: [],
    currentEpoch: 0,
    totalBatches: 0,
    lastTrainingTime: 0
  });
  
  private metricsSubject = new Subject<TrainingMetrics>();
  
  public state$ = this.stateSubject.asObservable();
  public metrics$ = this.metricsSubject.asObservable();
  
  constructor(
    private selfPlayService: SelfPlayService,
    private network: ChessNetwork
  ) {
    this.trainingState = this.stateSubject.value;
    
    // Initialize current stats and subscribe to updates
    this.currentStats = {
      gamesCompleted: 0,
      gamesInProgress: 0,
      totalMoves: 0,
      whiteWins: 0,
      blackWins: 0,
      draws: 0,
      averageGameLength: 0,
      examplesGenerated: 0
    };
    
    // Subscribe to stats updates
    this.selfPlayService.stats$.subscribe(stats => {
      this.currentStats = stats;
    });
    
    this.initializeNetwork();
  }
  
  private async initializeNetwork(): Promise<void> {
    try {
      await this.network.loadModel();
      console.log('Neural network loaded successfully');
    } catch (error) {
      console.log('Starting with fresh neural network');
    }
  }
  
  // Start the training process
  async startTraining(config: Partial<TrainingConfig> = {}): Promise<void> {
    if (this.trainingState.isTraining) {
      console.warn('Training already in progress');
      return;
    }
    
    // Update configuration
    this.updateConfig(config);
    
    // Reset training state
    this.trainingState = {
      ...this.trainingState,
      isTraining: true,
      isPaused: false,
      currentEpoch: 0,
      totalBatches: 0,
      metrics: [],
      lastTrainingTime: Date.now()
    };
    
    // Emit immediate state update
    this.stateSubject.next(this.trainingState);
    
    console.log('Starting RL training with config:', this.trainingState.config);
    
    // Emit initial placeholder metrics for immediate feedback
    const initialMetrics: TrainingMetrics = {
      epoch: 0,
      batchesTrained: 0,
      policyLoss: 0,
      valueLoss: 0,
      totalLoss: 0,
      learningRate: this.trainingState.config.learningRate,
      timestamp: Date.now()
    };
    
    this.trainingState.metrics.push(initialMetrics);
    this.metricsSubject.next(initialMetrics);
    
    // Start self-play data generation
    this.startSelfPlayLoop();
    
    // Start training loop
    this.startTrainingLoop();
  }
  
  // Pause training
  pauseTraining(): void {
    if (!this.trainingState.isTraining) return;
    
    this.trainingState.isPaused = !this.trainingState.isPaused;
    this.stateSubject.next(this.trainingState);
    
    if (this.trainingState.isPaused) {
      console.log('Training paused');
    } else {
      console.log('Training resumed');
    }
  }
  
  // Stop training
  stopTraining(): void {
    if (!this.trainingState.isTraining) return;
    
    console.log('Stopping training...');
    
    // Stop self-play
    this.selfPlayService.stopAllGames();
    
    // Stop training loop
    if (this.trainingSubscription) {
      this.trainingSubscription.unsubscribe();
      this.trainingSubscription = undefined;
    }
    
    if (this.selfPlaySubscription) {
      this.selfPlaySubscription.unsubscribe();
      this.selfPlaySubscription = undefined;
    }
    
    this.trainingState.isTraining = false;
    this.trainingState.isPaused = false;
    this.stateSubject.next(this.trainingState);
    
    // Save the model
    this.saveModel();
  }
  
  // Reset training
  resetTraining(): void {
    this.stopTraining();
    
    // Clear replay buffer
    this.selfPlayService.clearBuffer();
    
    // Reset network configuration
    this.network.configure(this.trainingState.config.learningRate);
    
    // Reset metrics
    this.trainingState.metrics = [];
    this.trainingState.currentEpoch = 0;
    this.trainingState.totalBatches = 0;
    this.stateSubject.next(this.trainingState);
    
    console.log('Training reset');
  }
  
  // Start self-play loop
  private startSelfPlayLoop(): void {
    const runSelfPlay = async () => {
      if (!this.trainingState.isTraining || this.trainingState.isPaused) {
        return;
      }
      
      try {
        await this.selfPlayService.startSelfPlay(
          this.trainingState.config.numParallelGames,
          this.trainingState.config.mctsSimulations,
          this.trainingState.config.temperature,
          this.trainingState.config.temperatureDecayMoves
        );
      } catch (error) {
        console.error('Error in self-play:', error);
      }
    };
    
    // Start initial self-play
    runSelfPlay();
    
    // Set up periodic self-play generation
    this.selfPlaySubscription = interval(30000).subscribe(() => {
      if (this.trainingState.isTraining && !this.trainingState.isPaused) {
        runSelfPlay();
      }
    });
  }
  
  // Start training loop
  private startTrainingLoop(): void {
    // Clear any existing training subscription
    if (this.trainingSubscription) {
      this.trainingSubscription.unsubscribe();
    }
    
    this.trainingSubscription = interval(1000).subscribe(async () => {
      if (!this.trainingState.isTraining || this.trainingState.isPaused) {
        return;
      }
      
      // Check if network is ready for training
      if (!this.network.modelReady) {
        return;
      }
      
      // Check if we have enough data to train
      const bufferSize = this.selfPlayService.getBufferSize();
      if (bufferSize < this.trainingState.config.batchSize) {
        return;
      }
      
      // Train a batch
      await this.trainBatch();
    });
  }
  
  // Train a single batch
  private async trainBatch(): Promise<void> {
    try {
      // Sample training batch
      const batch = this.selfPlayService.sampleBatch(this.trainingState.config.batchSize);
      
      if (batch.length === 0) {
        return;
      }
      
      // Train the network
      const losses = await this.network.trainBatch(batch);
      
      // Update metrics
      const metrics: TrainingMetrics = {
        epoch: this.trainingState.currentEpoch,
        batchesTrained: this.trainingState.totalBatches + 1,
        policyLoss: losses.policyLoss,
        valueLoss: losses.valueLoss,
        totalLoss: losses.totalLoss,
        learningRate: this.trainingState.config.learningRate,
        timestamp: Date.now()
      };
      
      this.trainingState.totalBatches++;
      this.trainingState.metrics.push(metrics);
      this.trainingState.lastTrainingTime = Date.now();
      
      // Limit metrics history
      if (this.trainingState.metrics.length > 1000) {
        this.trainingState.metrics = this.trainingState.metrics.slice(-1000);
      }
      
      // Emit metrics
      this.metricsSubject.next(metrics);
      this.stateSubject.next(this.trainingState);
      
      // Save model periodically
      if (this.trainingState.totalBatches % 100 === 0) {
        await this.saveModel();
      }
      
    } catch (error) {
      console.error('Error training batch:', error);
    }
  }
  
  // Update training configuration
  updateConfig(config: Partial<TrainingConfig>): void {
    this.trainingState.config = {
      ...this.trainingState.config,
      ...config
    };
    
    // Update network learning rate if changed
    if (config.learningRate) {
      this.network.setLearningRate(config.learningRate);
    }
    
    // Update buffer size if changed
    if (config.bufferSize) {
      this.selfPlayService.setMaxBufferSize(config.bufferSize);
    }
    
    this.stateSubject.next(this.trainingState);
  }
  
  // Get default configuration
  private getDefaultConfig(): TrainingConfig {
    return {
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
    };
  }
  
  // Save the neural network model
  async saveModel(): Promise<void> {
    try {
      await this.network.saveModel();
      console.log('Model saved successfully');
    } catch (error) {
      console.error('Error saving model:', error);
    }
  }
  
  // Download the neural network model
  async downloadModel(filename?: string): Promise<void> {
    try {
      await this.network.downloadModel(filename);
      console.log('Model download started');
    } catch (error) {
      console.error('Error downloading model:', error);
      throw error;
    }
  }
  
  // Load a saved model
  async loadModel(): Promise<void> {
    try {
      await this.network.loadModel();
      console.log('Model loaded successfully');
    } catch (error) {
      console.error('Error loading model:', error);
    }
  }
  
  // Get network instance for backend information
  getNetwork(): ChessNetwork {
    return this.network;
  }
  
  // Get self-play statistics
  getSelfPlayStats(): SelfPlayStats {
    return this.currentStats;
  }
  
  // Get replay buffer size
  getBufferSize(): number {
    return this.selfPlayService.getBufferSize();
  }
  
  // Get recent metrics for chart updates
  getRecentMetrics(count: number = 100): TrainingMetrics[] {
    return this.trainingState.metrics.slice(-count);
  }
  
  // Calculate Elo rating estimate (simplified)
  calculateEloEstimate(): number {
    const stats = this.getSelfPlayStats();
    const totalGames = stats.whiteWins + stats.blackWins + stats.draws;
    
    if (totalGames === 0) return 1200; // Starting Elo
    
    const whiteWinRate = stats.whiteWins / totalGames;
    
    // Simple Elo calculation based on self-play balance
    // In reality, you'd compare against fixed opponents
    const balanceScore = 0.5 - Math.abs(whiteWinRate - 0.5);
    const baseElo = 1200;
    const maxGain = this.trainingState.totalBatches * 0.1;
    
    return Math.round(baseElo + balanceScore * 800 + maxGain);
  }
  
  // Get network summary
  getNetworkSummary(): string {
    return this.network.getSummary();
  }
  
  // Check if network is ready
  isNetworkReady(): boolean {
    return this.network.modelReady;
  }
} 