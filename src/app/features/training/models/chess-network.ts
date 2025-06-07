import { Injectable } from '@angular/core';
import * as tf from '@tensorflow/tfjs';
// Add GPU backend imports
import '@tensorflow/tfjs-backend-webgl';
import { Board } from '../../../core/models/board.model';
import { Piece, PieceColor, PieceType } from '../../../core/models/piece.model';

export interface NetworkPrediction {
  policy: Float32Array; // Policy probabilities for all possible moves (4096 for 64x64 from-to moves)
  value: number; // Position evaluation (-1 to 1)
}

export interface TrainingExample {
  boardState: Float32Array; // Encoded board state
  policyTarget: Float32Array; // MCTS-improved policy
  valueTarget: number; // Game outcome
}

@Injectable({
  providedIn: 'root'
})
export class ChessNetwork {
  private model: tf.LayersModel | null = null;
  private inputShape = [8, 8, 14]; // 8x8 board, 14 channels (6 piece types x 2 colors + 2 extra)
  private policyOutputSize = 4096; // 64x64 possible moves (from square to square)
  private isTraining = false;
  private learningRate: number = 0.001;
  private l2Regularization: number = 0.0001;
  private backendInitialized = false;

  constructor() {
    this.initializeBackend().then(() => {
      this.buildModel();
    });
  }

  // Initialize TensorFlow.js backend with GPU support
  private async initializeBackend(): Promise<void> {
    if (this.backendInitialized) return;

    console.log('Initializing TensorFlow.js backend...');
    
    try {
      // Try to set WebGL (GPU) backend first
      await tf.setBackend('webgl');
      await tf.ready();
      
      console.log(`TensorFlow.js backend: ${tf.getBackend()}`);
      console.log('GPU acceleration enabled via WebGL backend');
      
      // Log GPU information if available
      const backendInstance = tf.backend() as any;
      if (backendInstance && backendInstance.gpgpu) {
        console.log('WebGL GPU details:', {
          maxTextureSize: backendInstance.gpgpu.gl.getParameter(backendInstance.gpgpu.gl.MAX_TEXTURE_SIZE),
          vendor: backendInstance.gpgpu.gl.getParameter(backendInstance.gpgpu.gl.VENDOR),
          renderer: backendInstance.gpgpu.gl.getParameter(backendInstance.gpgpu.gl.RENDERER)
        });
      }
      
    } catch (error) {
      console.warn('Failed to initialize WebGL backend, falling back to CPU:', error);
      
      try {
        // Fallback to CPU backend
        await tf.setBackend('cpu');
        await tf.ready();
        console.log('Using CPU backend as fallback');
      } catch (cpuError) {
        console.error('Failed to initialize any backend:', cpuError);
      }
    }
    
    this.backendInitialized = true;
  }

  // Get current backend information
  getBackendInfo(): { backend: string; isGPU: boolean; memoryInfo?: any } {
    const backend = tf.getBackend();
    const isGPU = backend === 'webgl';
    
    let memoryInfo;
    try {
      memoryInfo = tf.memory();
    } catch (error) {
      memoryInfo = { error: 'Memory info not available' };
    }
    
    return {
      backend,
      isGPU,
      memoryInfo
    };
  }

  // Method to configure hyperparameters
  configure(learningRate: number = 0.001, l2Regularization: number = 0.0001): void {
    this.learningRate = learningRate;
    this.l2Regularization = l2Regularization;
    if (this.model) {
      this.rebuildModel();
    }
  }

  private rebuildModel(): void {
    if (this.model) {
      this.model.dispose();
    }
    this.buildModel();
  }

  private buildModel(): void {
    // Input layer - encoded board state
    const input = tf.input({ shape: this.inputShape, name: 'board_input' });

    // Convolutional layers for spatial feature extraction
    let conv = tf.layers.conv2d({
      filters: 128,
      kernelSize: 3,
      padding: 'same',
      activation: 'relu',
      kernelRegularizer: tf.regularizers.l2({ l2: this.l2Regularization }),
      name: 'conv1'
    }).apply(input) as tf.SymbolicTensor;

    conv = tf.layers.batchNormalization({ name: 'bn1' }).apply(conv) as tf.SymbolicTensor;

    // Residual blocks
    for (let i = 0; i < 8; i++) {
      conv = this.residualBlock(conv, 128, `res_${i}`);
    }

    // Policy head
    let policyConv = tf.layers.conv2d({
      filters: 32,
      kernelSize: 1,
      activation: 'relu',
      kernelRegularizer: tf.regularizers.l2({ l2: this.l2Regularization }),
      name: 'policy_conv'
    }).apply(conv) as tf.SymbolicTensor;

    policyConv = tf.layers.batchNormalization({ name: 'policy_bn' }).apply(policyConv) as tf.SymbolicTensor;

    const policyFlat = tf.layers.flatten({ name: 'policy_flatten' }).apply(policyConv) as tf.SymbolicTensor;
    
    const policyOutput = tf.layers.dense({
      units: this.policyOutputSize,
      activation: 'softmax',
      kernelRegularizer: tf.regularizers.l2({ l2: this.l2Regularization }),
      name: 'policy_output'
    }).apply(policyFlat) as tf.SymbolicTensor;

    // Value head
    let valueConv = tf.layers.conv2d({
      filters: 8,
      kernelSize: 1,
      activation: 'relu',
      kernelRegularizer: tf.regularizers.l2({ l2: this.l2Regularization }),
      name: 'value_conv'
    }).apply(conv) as tf.SymbolicTensor;

    valueConv = tf.layers.batchNormalization({ name: 'value_bn' }).apply(valueConv) as tf.SymbolicTensor;

    const valueFlat = tf.layers.flatten({ name: 'value_flatten' }).apply(valueConv) as tf.SymbolicTensor;
    
    const valueHidden = tf.layers.dense({
      units: 256,
      activation: 'relu',
      kernelRegularizer: tf.regularizers.l2({ l2: this.l2Regularization }),
      name: 'value_hidden'
    }).apply(valueFlat) as tf.SymbolicTensor;

    const valueOutput = tf.layers.dense({
      units: 1,
      activation: 'tanh',
      name: 'value_output'
    }).apply(valueHidden) as tf.SymbolicTensor;

    // Create the model
    this.model = tf.model({
      inputs: input,
      outputs: [policyOutput, valueOutput],
      name: 'chess_network'
    });

    // Compile with custom loss functions
    this.model.compile({
      optimizer: tf.train.adam(this.learningRate),
      loss: {
        policy_output: 'categoricalCrossentropy',
        value_output: 'meanSquaredError'
      },
      metrics: ['accuracy']
    });
  }

  private residualBlock(input: tf.SymbolicTensor, filters: number, blockName: string): tf.SymbolicTensor {
    let conv1 = tf.layers.conv2d({
      filters,
      kernelSize: 3,
      padding: 'same',
      activation: 'relu',
      kernelRegularizer: tf.regularizers.l2({ l2: this.l2Regularization }),
      name: `${blockName}_conv1`
    }).apply(input) as tf.SymbolicTensor;

    conv1 = tf.layers.batchNormalization({ name: `${blockName}_bn1` }).apply(conv1) as tf.SymbolicTensor;

    let conv2 = tf.layers.conv2d({
      filters,
      kernelSize: 3,
      padding: 'same',
      kernelRegularizer: tf.regularizers.l2({ l2: this.l2Regularization }),
      name: `${blockName}_conv2`
    }).apply(conv1) as tf.SymbolicTensor;

    conv2 = tf.layers.batchNormalization({ name: `${blockName}_bn2` }).apply(conv2) as tf.SymbolicTensor;

    // Skip connection
    const output = tf.layers.add({ name: `${blockName}_add` }).apply([input, conv2]) as tf.SymbolicTensor;
    
    return tf.layers.activation({ activation: 'relu', name: `${blockName}_relu` }).apply(output) as tf.SymbolicTensor;
  }

  // Encode board state to network input format
  encodeBoardState(board: Board): Float32Array {
    const encoded = new Float32Array(8 * 8 * 14);
    
    // Clear the array
    encoded.fill(0);

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = board.squares[row][col];
        if (piece) {
          const channelOffset = this.getPieceChannelOffset(piece.type, piece.color);
          const index = (row * 8 + col) * 14 + channelOffset;
          encoded[index] = 1.0;
        }
      }
    }

    // Add game state information
    const gameStateOffset = 8 * 8 * 12; // After piece channels
    
    // Current player (channel 12)
    const currentPlayerChannel = gameStateOffset;
    if (board.currentPlayer === 'white') {
      for (let i = 0; i < 64; i++) {
        encoded[currentPlayerChannel + i * 14] = 1.0;
      }
    }

    // Castling rights (channel 13)
    const castlingChannel = gameStateOffset + 1;
    const castlingRights = this.encodeCastlingRights(board);
    for (let i = 0; i < 64; i++) {
      encoded[castlingChannel + i * 14] = castlingRights;
    }

    return encoded;
  }

  private getPieceChannelOffset(type: PieceType, color: PieceColor): number {
    const pieceTypeIndex = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'].indexOf(type);
    const colorOffset = color === 'white' ? 0 : 6;
    return pieceTypeIndex + colorOffset;
  }

  private encodeCastlingRights(board: Board): number {
    let rights = 0;
    if (!board.whiteKingMoved) {
      if (!board.whiteKingsideRookMoved) rights += 0.25;
      if (!board.whiteQueensideRookMoved) rights += 0.25;
    }
    if (!board.blackKingMoved) {
      if (!board.blackKingsideRookMoved) rights += 0.25;
      if (!board.blackQueensideRookMoved) rights += 0.25;
    }
    return rights;
  }

  // Forward pass through the network
  async predict(boardState: Float32Array): Promise<NetworkPrediction> {
    if (!this.model) {
      throw new Error('Model not initialized');
    }

    const inputTensor = tf.tensor4d(boardState, [1, 8, 8, 14]);
    
    try {
      const predictions = this.model.predict(inputTensor) as tf.Tensor[];
      const [policyTensor, valueTensor] = predictions;
      
      const policy = await policyTensor.data() as Float32Array;
      const value = await valueTensor.data() as Float32Array;

      return {
        policy,
        value: value[0]
      };
    } finally {
      inputTensor.dispose();
    }
  }

  // Batch prediction for multiple board states
  async predictBatch(boardStates: Float32Array[]): Promise<NetworkPrediction[]> {
    if (!this.model || boardStates.length === 0) {
      return [];
    }

    const batchSize = boardStates.length;
    const batchInput = new Float32Array(batchSize * 8 * 8 * 14);
    
    // Copy all board states into batch tensor
    for (let i = 0; i < batchSize; i++) {
      batchInput.set(boardStates[i], i * 8 * 8 * 14);
    }

    const inputTensor = tf.tensor4d(batchInput, [batchSize, 8, 8, 14]);
    
    try {
      const predictions = this.model.predict(inputTensor) as tf.Tensor[];
      const [policyTensor, valueTensor] = predictions;
      
      const policies = await policyTensor.data() as Float32Array;
      const values = await valueTensor.data() as Float32Array;

      const results: NetworkPrediction[] = [];
      for (let i = 0; i < batchSize; i++) {
        const policyStart = i * this.policyOutputSize;
        const policy = policies.slice(policyStart, policyStart + this.policyOutputSize);
        results.push({
          policy,
          value: values[i]
        });
      }

      return results;
    } finally {
      inputTensor.dispose();
    }
  }

  // Train the network on a batch of examples
  async trainBatch(examples: TrainingExample[]): Promise<{ policyLoss: number; valueLoss: number; totalLoss: number }> {
    if (!this.model || examples.length === 0) {
      return { policyLoss: 0, valueLoss: 0, totalLoss: 0 };
    }

    // Check if training is already in progress
    if (this.isTraining) {
      console.warn('Training already in progress, skipping batch');
      return { policyLoss: 0, valueLoss: 0, totalLoss: 0 };
    }

    const batchSize = examples.length;
    
    // Prepare input tensors
    const boardStates = new Float32Array(batchSize * 8 * 8 * 14);
    const policyTargets = new Float32Array(batchSize * this.policyOutputSize);
    const valueTargets = new Float32Array(batchSize);

    for (let i = 0; i < batchSize; i++) {
      boardStates.set(examples[i].boardState, i * 8 * 8 * 14);
      policyTargets.set(examples[i].policyTarget, i * this.policyOutputSize);
      valueTargets[i] = examples[i].valueTarget;
    }

    const inputTensor = tf.tensor4d(boardStates, [batchSize, 8, 8, 14]);
    const policyTensor = tf.tensor2d(policyTargets, [batchSize, this.policyOutputSize]);
    const valueTensor = tf.tensor2d(valueTargets, [batchSize, 1]);

    try {
      this.isTraining = true;
      
      const history = await this.model.fit(inputTensor, {
        'policy_output': policyTensor,
        'value_output': valueTensor
      }, {
        epochs: 1,
        verbose: 0,
        batchSize: batchSize
      });

      const logs = history.history;
      const policyLoss = Array.isArray(logs['policy_output_loss']) ? logs['policy_output_loss'][0] : logs['policy_output_loss'];
      const valueLoss = Array.isArray(logs['value_output_loss']) ? logs['value_output_loss'][0] : logs['value_output_loss'];
      const totalLoss = Array.isArray(logs['loss']) ? logs['loss'][0] : logs['loss'];

      return {
        policyLoss: policyLoss as number,
        valueLoss: valueLoss as number,
        totalLoss: totalLoss as number
      };
    } catch (error) {
      console.error('Error during model training:', error);
      return { policyLoss: 0, valueLoss: 0, totalLoss: 0 };
    } finally {
      this.isTraining = false;
      inputTensor.dispose();
      policyTensor.dispose();
      valueTensor.dispose();
    }
  }

  // Get model weights for visualization
  getWeights(): tf.Tensor[] {
    if (!this.model) return [];
    return this.model.getWeights();
  }

  // Get layer activations for visualization
  async getActivations(boardState: Float32Array, layerName: string): Promise<Float32Array | null> {
    if (!this.model) return null;

    const layerModel = tf.model({
      inputs: this.model.input,
      outputs: this.model.getLayer(layerName).output
    });

    const inputTensor = tf.tensor4d(boardState, [1, 8, 8, 14]);
    
    try {
      const activations = layerModel.predict(inputTensor) as tf.Tensor;
      return await activations.data() as Float32Array;
    } finally {
      inputTensor.dispose();
      layerModel.dispose();
    }
  }

  // Update learning rate
  setLearningRate(newLearningRate: number): void {
    this.learningRate = newLearningRate;
    
    if (this.model) {
      // Recompile the model with new learning rate
      this.model.compile({
        optimizer: tf.train.adam(this.learningRate),
        loss: {
          policy_output: 'categoricalCrossentropy',
          value_output: 'meanSquaredError'
        },
        metrics: ['accuracy']
      });
    }
  }

  // Save model
  async saveModel(path: string = 'localstorage://chess-model'): Promise<void> {
    if (this.model) {
      await this.model.save(path);
    }
  }

  // Load model
  async loadModel(path: string = 'localstorage://chess-model'): Promise<void> {
    try {
      this.model = await tf.loadLayersModel(path);
    } catch (error) {
      console.warn('Could not load saved model, using fresh model:', error);
      this.buildModel();
    }
  }

  // Get model summary
  getSummary(): string {
    return this.model?.summary() || 'Model not initialized';
  }

  get modelReady(): boolean {
    return this.model !== null && !this.isTraining;
  }
} 