import { Injectable } from '@angular/core';
import * as tf from '@tensorflow/tfjs';
// Add GPU backend imports
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-webgpu';
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

    try {
      console.log('Available backends:', tf.engine().registryFactory);
      
      // Try to initialize WebGPU first (better for dedicated GPU)
      if (await this.tryWebGPU()) {
        console.log('Successfully initialized WebGPU backend');
        await this.optimizeGPUSettings();
        this.backendInitialized = true;
        return;
      }

      // Fallback to optimized WebGL
      if (await this.tryOptimizedWebGL()) {
        console.log('Successfully initialized optimized WebGL backend');
        await this.optimizeGPUSettings();
        this.backendInitialized = true;
        return;
      }

      // Final fallback to CPU
      console.warn('GPU backends failed, falling back to CPU');
      await tf.setBackend('cpu');
      this.backendInitialized = true;

    } catch (error) {
      console.error('Backend initialization failed:', error);
      await tf.setBackend('cpu');
      this.backendInitialized = true;
    }
  }

  private async tryWebGPU(): Promise<boolean> {
    try {
      // Check if WebGPU is supported
      if (!navigator.gpu) {
        console.log('WebGPU not supported by browser');
        return false;
      }

      // Try to get a GPU adapter (this will prefer discrete GPU)
      const adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance' // Request high-performance (discrete) GPU
      });

      if (!adapter) {
        console.log('No WebGPU adapter available');
        return false;
      }

      console.log('WebGPU adapter found:', {
        limits: adapter.limits
      });

      // Set WebGPU backend
      await tf.setBackend('webgpu');
      await tf.ready();
      
      return tf.getBackend() === 'webgpu';
    } catch (error) {
      console.warn('WebGPU initialization failed:', error);
      return false;
    }
  }

  private async tryOptimizedWebGL(): Promise<boolean> {
    try {
      // Set WebGL backend with optimization flags
      await tf.setBackend('webgl');
      await tf.ready();

      // Apply WebGL optimizations through environment flags
      tf.env().set('WEBGL_FORCE_F16_TEXTURES', true);
      tf.env().set('WEBGL_RENDER_FLOAT32_CAPABLE', true);
      tf.env().set('WEBGL_FLUSH_THRESHOLD', -1);
      tf.env().set('WEBGL_PACK', true);
      tf.env().set('WEBGL_SIZE_UPLOAD_UNIFORM', 4);

      // Check if we can detect the GPU being used
      this.logGPUInfo();

      return tf.getBackend() === 'webgl';
    } catch (error) {
      console.warn('WebGL initialization failed:', error);
      return false;
    }
  }

  private async optimizeGPUSettings(): Promise<void> {
    try {
      // Set memory growth to prevent memory fragmentation
      tf.env().set('WEBGL_DELETE_TEXTURE_THRESHOLD', 0);
      tf.env().set('WEBGL_FORCE_F16_TEXTURES', true);
      tf.env().set('WEBGL_PACK', true);
      
      // Enable automatic memory cleanup
      tf.env().set('IS_BROWSER', true);
      
      // Optimize for training workloads
      tf.env().set('WEBGL_RENDER_FLOAT32_CAPABLE', true);
      tf.env().set('WEBGL_RENDER_FLOAT32_ENABLED', true);

      console.log('GPU optimization settings applied');
    } catch (error) {
      console.warn('Failed to apply GPU optimizations:', error);
    }
  }

  private logGPUInfo(): void {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
          const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
          
          console.log('WebGL GPU Info:', {
            renderer,
            vendor,
            version: gl.getParameter(gl.VERSION),
            shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
            maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
            maxVertexTextures: gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS),
            maxFragmentTextures: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)
          });

          // Check if this looks like a dedicated GPU
          const isDedicatedGPU = renderer.toLowerCase().includes('nvidia') || 
                                renderer.toLowerCase().includes('amd') || 
                                renderer.toLowerCase().includes('radeon') ||
                                renderer.toLowerCase().includes('geforce');
          
          if (isDedicatedGPU) {
            console.log('✅ Using dedicated GPU:', renderer);
          } else {
            console.warn('⚠️ May be using integrated GPU:', renderer);
            console.log('💡 To use dedicated GPU, ensure:');
            console.log('  - Nvidia Control Panel > Manage 3D Settings > Program Settings');
            console.log('  - Add your browser and set to "High-performance NVIDIA processor"');
          }
        }
      }
    } catch (error) {
      console.warn('Could not get GPU info:', error);
    }
  }

  // Get current backend information
  getBackendInfo(): { backend: string; isGPU: boolean; memoryInfo?: any; gpuDetails?: any } {
    const backend = tf.getBackend();
    const isGPU = backend === 'webgl' || backend === 'webgpu';
    
    let gpuDetails: any = {};
    let memoryInfo: any = {};

    try {
      // Get memory information
      if (isGPU) {
        memoryInfo = tf.memory();
        
        // Get GPU-specific details
        if (backend === 'webgl') {
          const canvas = document.createElement('canvas');
          const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
          
          if (gl) {
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
              gpuDetails = {
                renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL),
                vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
                version: gl.getParameter(gl.VERSION),
                maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
                isDedicatedGPU: this.checkIfDedicatedGPU(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
              };
            }
          }
        } else if (backend === 'webgpu') {
          gpuDetails = {
            backend: 'WebGPU',
            isDedicatedGPU: true, // WebGPU generally has better access to dedicated GPU
            status: 'High-performance backend active'
          };
        }

        // Add environment flags status
        gpuDetails.optimizations = {
          f16Textures: tf.env().getBool('WEBGL_FORCE_F16_TEXTURES'),
          float32Capable: tf.env().getBool('WEBGL_RENDER_FLOAT32_CAPABLE'),
          packEnabled: tf.env().getBool('WEBGL_PACK'),
          flushThreshold: tf.env().getNumber('WEBGL_FLUSH_THRESHOLD')
        };
      }
    } catch (error) {
      console.warn('Could not get detailed GPU info:', error);
    }

    return {
      backend,
      isGPU,
      memoryInfo,
      gpuDetails
    };
  }

  private checkIfDedicatedGPU(renderer: string): boolean {
    const dedicatedGPUIndicators = [
      'nvidia', 'geforce', 'quadro', 'tesla',
      'amd', 'radeon', 'rx ', 'vega',
      'intel arc', 'intel xe'
    ];
    
    const rendererLower = renderer.toLowerCase();
    return dedicatedGPUIndicators.some(indicator => rendererLower.includes(indicator));
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
    if (!this.model) {
      throw new Error('Model not initialized');
    }

    if (examples.length === 0) {
      throw new Error('No training examples provided');
    }

    // Optimize batch size for GPU memory
    const optimalBatchSize = this.getOptimalBatchSize(examples.length);
    
    try {
      // Process in optimal batches to maximize GPU utilization
      if (examples.length > optimalBatchSize) {
        return await this.trainLargeBatch(examples, optimalBatchSize);
      }

      return await this.trainSingleBatch(examples);
    } catch (error) {
      console.error('Training batch failed:', error);
      // Clean up any GPU memory that might be stuck
      tf.dispose();
      throw error;
    }
  }

  private async trainSingleBatch(examples: TrainingExample[]): Promise<{ policyLoss: number; valueLoss: number; totalLoss: number }> {
    // Convert training data to tensors with memory optimization
    const boardStates = tf.tidy(() => {
      const boards: number[][][][] = [];
      for (const example of examples) {
        const board = Array.from(example.boardState);
        const shaped = [];
        for (let i = 0; i < 8; i++) {
          const row = [];
          for (let j = 0; j < 8; j++) {
            const channels = [];
            for (let k = 0; k < 14; k++) {
              channels.push(board[i * 8 * 14 + j * 14 + k]);
            }
            row.push(channels);
          }
          shaped.push(row);
        }
        boards.push(shaped);
      }
      return tf.tensor4d(boards, [examples.length, 8, 8, 14]);
    });

    const policyTargets = tf.tidy(() => {
      const policies = examples.map(ex => Array.from(ex.policyTarget));
      return tf.tensor2d(policies, [examples.length, this.policyOutputSize]);
    });

    const valueTargets = tf.tidy(() => {
      const values = examples.map(ex => ex.valueTarget);
      return tf.tensor2d(values, [examples.length, 1]);
    });

    try {
      this.isTraining = true;

      // Create optimizer
      const optimizer = tf.train.adam(this.learningRate);
      
      // Define the loss function
      const lossFn = () => {
        return tf.tidy(() => {
          const predictions = this.model!.apply(boardStates, { training: true }) as tf.Tensor[];
          const policyPred = predictions[0];
          const valuePred = predictions[1];

          // Calculate losses with regularization
          const policyLoss = tf.losses.softmaxCrossEntropy(policyTargets, policyPred);
          const valueLoss = tf.losses.meanSquaredError(valueTargets, valuePred);

          // Add L2 regularization
          const regularizationLoss = tf.tidy(() => {
            return this.model!.getWeights()
              .filter(w => w.shape.length > 1) // Only regularize weights, not biases
              .map(w => tf.sum(tf.square(w)))
              .reduce((sum, l2) => tf.add(sum, l2), tf.scalar(0));
          });

          const totalLoss = tf.add(
            tf.add(policyLoss, valueLoss),
            tf.mul(regularizationLoss, this.l2Regularization)
          );

          return totalLoss as tf.Scalar;
        });
      };

      // Perform the training step and capture individual losses
      let policyLossVal: number = 0;
      let valueLossVal: number = 0;
      let totalLossVal: number = 0;

      // Calculate losses for reporting first
      const predictions = this.model!.apply(boardStates, { training: true }) as tf.Tensor[];
      const policyPred = predictions[0];
      const valuePred = predictions[1];

      const policyLoss = tf.losses.softmaxCrossEntropy(policyTargets, policyPred);
      const valueLoss = tf.losses.meanSquaredError(valueTargets, valuePred);

      // Get loss values
      [policyLossVal, valueLossVal] = await Promise.all([
        policyLoss.data().then(data => data[0]),
        valueLoss.data().then(data => data[0])
      ]);

      // Perform optimization
      const totalLoss = await optimizer.minimize(lossFn, true);
      if (totalLoss) {
        totalLossVal = await totalLoss.data().then(data => data[0]);
        totalLoss.dispose();
      } else {
        totalLossVal = policyLossVal + valueLossVal;
      }

      // Clean up temporary tensors
      policyLoss.dispose();
      valueLoss.dispose();
      optimizer.dispose();

      return {
        policyLoss: policyLossVal,
        valueLoss: valueLossVal,
        totalLoss: totalLossVal
      };

    } finally {
      // Clean up input tensors
      boardStates.dispose();
      policyTargets.dispose();
      valueTargets.dispose();
      this.isTraining = false;

      // Force garbage collection on GPU
      if (tf.getBackend() === 'webgl' || tf.getBackend() === 'webgpu') {
        await tf.nextFrame();
      }
    }
  }

  private async trainLargeBatch(examples: TrainingExample[], batchSize: number): Promise<{ policyLoss: number; valueLoss: number; totalLoss: number }> {
    let totalPolicyLoss = 0;
    let totalValueLoss = 0;
    let totalLoss = 0;
    let batchCount = 0;

    // Process in smaller batches to avoid GPU memory issues
    for (let i = 0; i < examples.length; i += batchSize) {
      const batchExamples = examples.slice(i, i + batchSize);
      const batchResult = await this.trainSingleBatch(batchExamples);
      
      totalPolicyLoss += batchResult.policyLoss;
      totalValueLoss += batchResult.valueLoss;
      totalLoss += batchResult.totalLoss;
      batchCount++;

      // Allow UI to update between batches
      await tf.nextFrame();
    }

    return {
      policyLoss: totalPolicyLoss / batchCount,
      valueLoss: totalValueLoss / batchCount,
      totalLoss: totalLoss / batchCount
    };
  }

  private getOptimalBatchSize(exampleCount: number): number {
    const backend = tf.getBackend();
    const memoryInfo = tf.memory();
    
    // Estimate based on available memory and backend
    let baseBatchSize = 32;
    
    if (backend === 'webgpu') {
      baseBatchSize = 64; // WebGPU can handle larger batches
    } else if (backend === 'webgl') {
      // Check available memory (fallback to numBytes if numBytesInGPU not available)
      const availableMemory = (memoryInfo as any).numBytesInGPU || memoryInfo.numBytes || 0;
      if (availableMemory > 1000000000) { // > 1GB
        baseBatchSize = 48;
      } else if (availableMemory > 500000000) { // > 500MB
        baseBatchSize = 32;
      } else {
        baseBatchSize = 16; // Conservative for low memory
      }
    } else {
      baseBatchSize = 16; // CPU fallback
    }

    // Don't exceed the number of examples
    return Math.min(baseBatchSize, exampleCount);
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

  // Download model as file
  async downloadModel(filename?: string): Promise<void> {
    if (!this.model) {
      throw new Error('No model to download');
    }
    
    const saveName = filename || `chess-model-${Date.now()}`;
    await this.model.save(`downloads://${saveName}`);
    
    // Log instructions for user
    console.log(`Model downloaded as ${saveName}.json and ${saveName}.weights.bin`);
    console.log('To load the model, select the .json file when prompted.');
  }

  // Load model from file
  async loadModelFromFile(file: File): Promise<void> {
    if (!this.backendInitialized) {
      await this.initializeBackend();
    }
    
    try {
      // Check if this is a JSON file
      if (!file.name.endsWith('.json')) {
        throw new Error('Please select the .json file (not the .weights.bin file)');
      }
      
      // Create a URL for the JSON file
      const jsonUrl = URL.createObjectURL(file);
      
      // Load the model - TensorFlow.js will automatically look for the weights file
      // in the same directory or with the same base name
      this.model = await tf.loadLayersModel(jsonUrl);
      
      // Clean up the object URL
      URL.revokeObjectURL(jsonUrl);
      
      console.log('Model loaded successfully from file');
    } catch (error) {
      console.error('Error loading model from file:', error);
      throw new Error(`Failed to load model: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    return this.model !== null && this.backendInitialized;
  }

  // GPU Performance Benchmark
  async benchmarkGPU(): Promise<{ backend: string; opsPerSecond: number; memoryEfficiency: number; isOptimal: boolean }> {
    if (!this.backendInitialized) {
      await this.initializeBackend();
    }

    const backend = tf.getBackend();
    console.log(`🔧 Benchmarking ${backend} performance...`);

    const startTime = performance.now();
    const startMemory = tf.memory();

    try {
      // Create test tensors similar to our model operations
      const batchSize = 32;
      const testInput = tf.randomNormal([batchSize, 8, 8, 14]);
      
      // Simulate model operations
      const operations = 100;
      let result: tf.Tensor = testInput;

      for (let i = 0; i < operations; i++) {
        result = tf.tidy(() => {
          // Simulate convolution operations
          const conv = tf.conv2d(result as tf.Tensor4D, tf.randomNormal([3, 3, result.shape[3] || 14, 32]), 1, 'same');
          const relu = tf.relu(conv);
          const norm = tf.batchNorm(relu, tf.randomNormal([32]), tf.randomNormal([32]), tf.randomNormal([32]), tf.randomNormal([32]));
          return norm;
        });
      }

      // Wait for all operations to complete
      await result.data();
      
      const endTime = performance.now();
      const endMemory = tf.memory();

      // Calculate metrics
      const totalTime = endTime - startTime;
      const opsPerSecond = (operations * batchSize * 1000) / totalTime;
      const memoryUsed = endMemory.numBytes - startMemory.numBytes;
      const memoryEfficiency = memoryUsed > 0 ? (batchSize * operations) / (memoryUsed / 1024 / 1024) : 0;

      // Determine if performance is optimal
      const isOptimal = this.isPerformanceOptimal(backend, opsPerSecond, memoryEfficiency);

      // Cleanup
      testInput.dispose();
      result.dispose();

      const benchmarkResult = {
        backend,
        opsPerSecond: Math.round(opsPerSecond),
        memoryEfficiency: Math.round(memoryEfficiency * 100) / 100,
        isOptimal
      };

      console.log('🏁 Benchmark Results:', benchmarkResult);
      
      if (!isOptimal) {
        this.provideBenchmarkRecommendations(benchmarkResult);
      }

      return benchmarkResult;

    } catch (error) {
      console.error('Benchmark failed:', error);
      return {
        backend,
        opsPerSecond: 0,
        memoryEfficiency: 0,
        isOptimal: false
      };
    }
  }

  private isPerformanceOptimal(backend: string, opsPerSecond: number, memoryEfficiency: number): boolean {
    // Performance thresholds based on backend
    const thresholds = {
      webgpu: { minOps: 10000, minMemEff: 5 },
      webgl: { minOps: 5000, minMemEff: 3 },
      cpu: { minOps: 1000, minMemEff: 1 }
    };

    const threshold = thresholds[backend as keyof typeof thresholds] || thresholds.cpu;
    return opsPerSecond >= threshold.minOps && memoryEfficiency >= threshold.minMemEff;
  }

  private provideBenchmarkRecommendations(result: any): void {
    console.log('💡 Performance Optimization Recommendations:');
    
    if (result.backend === 'cpu') {
      console.log('  - GPU acceleration is not available or failed to initialize');
      console.log('  - Check if your browser supports WebGL/WebGPU');
      console.log('  - Ensure hardware acceleration is enabled in browser settings');
    } else if (result.backend === 'webgl') {
      if (result.opsPerSecond < 5000) {
        console.log('  - Performance is below optimal for WebGL');
        console.log('  - Try enabling "Use hardware acceleration when available" in browser settings');
        console.log('  - For Nvidia users: Set browser to use "High-performance NVIDIA processor" in Nvidia Control Panel');
        console.log('  - Close other GPU-intensive applications');
      }
      if (result.memoryEfficiency < 3) {
        console.log('  - Memory efficiency is low, consider reducing batch sizes');
        console.log('  - Enable F16 textures if supported by your GPU');
      }
    } else if (result.backend === 'webgpu') {
      if (result.opsPerSecond < 10000) {
        console.log('  - WebGPU performance is below expected levels');
        console.log('  - Ensure your GPU drivers are up to date');
        console.log('  - Check if power management is set to high performance');
      }
    }

    console.log('  - Monitor GPU temperature and throttling');
    console.log('  - Consider upgrading GPU drivers');
    console.log('  - Use dedicated GPU settings in OS power management');
  }

  // Add a new method to load from multiple files
  async loadModelFromFiles(jsonFile: File, weightsFile: File): Promise<void> {
    if (!this.backendInitialized) {
      await this.initializeBackend();
    }
    
    try {
      // Validate file types
      if (!jsonFile.name.endsWith('.json')) {
        throw new Error('First file must be the model JSON file');
      }
      if (!weightsFile.name.endsWith('.bin')) {
        throw new Error('Second file must be the weights binary file');
      }
      
      // Create object URLs for both files
      const jsonUrl = URL.createObjectURL(jsonFile);
      const weightsUrl = URL.createObjectURL(weightsFile);
      
      try {
        // Load the model with explicit weights URL
        this.model = await tf.loadLayersModel(tf.io.browserFiles([jsonFile, weightsFile]));
        console.log('Model loaded successfully from both files');
      } finally {
        // Clean up object URLs
        URL.revokeObjectURL(jsonUrl);
        URL.revokeObjectURL(weightsUrl);
      }
    } catch (error) {
      console.error('Error loading model from files:', error);
      throw new Error(`Failed to load model: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
} 