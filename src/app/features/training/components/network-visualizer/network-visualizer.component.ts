import { Component, Input, OnChanges, SimpleChanges, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-network-visualizer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="network-visualizer">
      <div class="network-controls">
        <div class="layer-info">
          <span class="layer-count">{{ layerCount }} Layers</span>
          <span class="param-count">{{ parameterCount }} Parameters</span>
        </div>
        <button 
          class="btn btn-outline btn-sm"
          (click)="refreshNetwork()"
        >
          <i class="fas fa-sync"></i> Refresh
        </button>
      </div>
      
      <div class="network-container" #networkContainer>
        <svg class="network-svg" [attr.width]="svgWidth" [attr.height]="svgHeight" [attr.viewBox]="'0 0 ' + svgWidth + ' ' + svgHeight">
          <!-- Network Architecture -->
          <g class="layers">
            <g 
              class="layer" 
              *ngFor="let layer of networkLayers; let i = index"
              [attr.transform]="'translate(' + (i * layerSpacing + layerPadding) + ', 0)'"
            >
              <!-- Layer Background -->
              <rect 
                class="layer-bg"
                [attr.width]="layerWidth"
                [attr.height]="svgHeight - 60"
                [attr.y]="30"
                rx="8"
              ></rect>
              
              <!-- Layer Label -->
              <text 
                class="layer-label"
                [attr.x]="layerWidth / 2"
                [attr.y]="20"
                text-anchor="middle"
              >
                {{ layer.name }}
              </text>
              
              <!-- Neurons -->
              <g class="neurons">
                <circle
                  class="neuron"
                  *ngFor="let neuron of layer.neurons; let j = index"
                  [attr.cx]="layerWidth / 2"
                  [attr.cy]="getNeuronY(i, j)"
                  [attr.r]="neuronRadius"
                  [attr.fill]="getNeuronColor(i, j)"
                  [attr.opacity]="getNeuronOpacity(i, j)"
                ></circle>
              </g>
              
              <!-- Layer Stats -->
              <text 
                class="layer-stats"
                [attr.x]="layerWidth / 2"
                [attr.y]="svgHeight - 10"
                text-anchor="middle"
              >
                {{ layer.neurons.length }} units
              </text>
            </g>
            
            <!-- Connections -->
            <g class="connections">
              <line
                class="connection"
                *ngFor="let connection of connections"
                [attr.x1]="connection.x1"
                [attr.y1]="connection.y1"
                [attr.x2]="connection.x2"
                [attr.y2]="connection.y2"
                [attr.stroke-width]="getConnectionWidth(connection.weight)"
                [attr.opacity]="getConnectionOpacity(connection.weight)"
              ></line>
            </g>
          </g>
        </svg>
        
        <!-- Legend -->
        <div class="network-legend">
          <div class="legend-item">
            <div class="legend-color" style="background: #61dafb;"></div>
            <span>Input Layer</span>
          </div>
          <div class="legend-item">
            <div class="legend-color" style="background: #28a745;"></div>
            <span>Hidden Layers</span>
          </div>
          <div class="legend-item">
            <div class="legend-color" style="background: #ffc107;"></div>
            <span>Output Layer</span>
          </div>
          <div class="legend-item">
            <div class="legend-color activation-high"></div>
            <span>High Activation</span>
          </div>
          <div class="legend-item">
            <div class="legend-color activation-low"></div>
            <span>Low Activation</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./network-visualizer.component.css']
})
export class NetworkVisualizerComponent implements OnChanges, AfterViewInit {
  @Input() weights: any[] = [];
  @Input() activations: Map<string, Float32Array> = new Map();
  
  @ViewChild('networkContainer', { static: false }) networkContainer!: ElementRef;
  
  // Network visualization properties
  networkLayers: any[] = [];
  connections: any[] = [];
  layerCount = 0;
  parameterCount = 0;
  
  // SVG dimensions and layout
  svgWidth = 800;
  svgHeight = 400; // Will be calculated dynamically
  layerSpacing = 150;
  layerPadding = 50;
  layerWidth = 80;
  neuronRadius = 6;
  neuronSpacing = 20;
  
  ngAfterViewInit(): void {
    this.updateDimensions();
    this.initializeNetwork();
  }
  
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['weights'] || changes['activations']) {
      this.initializeNetwork();
    }
  }
  
  private updateDimensions(): void {
    if (this.networkContainer?.nativeElement) {
      const containerWidth = this.networkContainer.nativeElement.offsetWidth;
      this.svgWidth = Math.min(containerWidth - 20, 1200); // Allow wider networks
    }
  }
  
  private initializeNetwork(): void {
    // Create a sample network architecture for visualization
    this.networkLayers = [
      {
        name: 'Input',
        type: 'input',
        neurons: Array(64).fill(null).map((_, i) => ({ id: i, activation: Math.random() }))
      },
      {
        name: 'Conv1',
        type: 'hidden',
        neurons: Array(32).fill(null).map((_, i) => ({ id: i, activation: Math.random() }))
      },
      {
        name: 'Conv2',
        type: 'hidden',
        neurons: Array(16).fill(null).map((_, i) => ({ id: i, activation: Math.random() }))
      },
      {
        name: 'Dense',
        type: 'hidden',
        neurons: Array(8).fill(null).map((_, i) => ({ id: i, activation: Math.random() }))
      },
      {
        name: 'Output',
        type: 'output',
        neurons: Array(2).fill(null).map((_, i) => ({ id: i, activation: Math.random() }))
      }
    ];
    
    this.layerCount = this.networkLayers.length;
    this.parameterCount = this.calculateParameterCount();
    
    // Update spacing based on number of layers
    this.layerSpacing = Math.max(120, (this.svgWidth - this.layerPadding * 2) / Math.max(1, this.layerCount - 1));
    
    // Calculate height based on the largest layer
    const maxNeurons = Math.max(...this.networkLayers.map(layer => layer.neurons.length));
    this.svgHeight = Math.max(400, maxNeurons * this.neuronSpacing + 100); // Add padding
    
    // Generate connections between layers
    this.generateConnections();
  }
  
  private calculateParameterCount(): number {
    // Estimate parameter count for display
    let total = 0;
    for (let i = 0; i < this.networkLayers.length - 1; i++) {
      const currentLayer = this.networkLayers[i];
      const nextLayer = this.networkLayers[i + 1];
      total += currentLayer.neurons.length * nextLayer.neurons.length;
    }
    return total;
  }
  
  private generateConnections(): void {
    this.connections = [];
    
    for (let i = 0; i < this.networkLayers.length - 1; i++) {
      const currentLayer = this.networkLayers[i];
      const nextLayer = this.networkLayers[i + 1];
      
      const currentX = i * this.layerSpacing + this.layerPadding + this.layerWidth;
      const nextX = (i + 1) * this.layerSpacing + this.layerPadding;
      
      // Sample connections (show only a subset for performance)
      const maxConnectionsPerNeuron = Math.min(3, nextLayer.neurons.length);
      const maxSourceNeurons = Math.min(20, currentLayer.neurons.length);
      
      for (let j = 0; j < maxSourceNeurons; j++) {
        for (let k = 0; k < maxConnectionsPerNeuron; k++) {
          const targetIndex = Math.floor(k * nextLayer.neurons.length / maxConnectionsPerNeuron);
          this.connections.push({
            x1: currentX,
            y1: this.getNeuronY(i, j),
            x2: nextX,
            y2: this.getNeuronY(i + 1, targetIndex),
            weight: (Math.random() - 0.5) * 2 // Random weight between -1 and 1
          });
        }
      }
    }
  }
  
  getNeuronColor(layerIndex: number, neuronIndex: number): string {
    const layer = this.networkLayers[layerIndex];
    if (!layer) return '#6c757d';
    
    if (layer.type === 'input') return '#61dafb';
    if (layer.type === 'output') return '#ffc107';
    
    // Use activation value for hidden layers
    const activation = layer.neurons[neuronIndex]?.activation || 0;
    const intensity = Math.abs(activation);
    
    return activation > 0 
      ? `rgb(${Math.floor(255 * (1 - intensity))}, 255, ${Math.floor(255 * (1 - intensity))})`
      : `rgb(255, ${Math.floor(255 * (1 - intensity))}, ${Math.floor(255 * (1 - intensity))})`;
  }
  
  getNeuronY(layerIndex: number, neuronIndex: number): number {
    const layer = this.networkLayers[layerIndex];
    if (!layer) return 50;
    
    const neuronCount = layer.neurons.length;
    const availableHeight = this.svgHeight - 80; // Leave space for labels
    const startY = 40; // Start position from top
    
    if (neuronCount === 1) {
      // Center single neuron
      return this.svgHeight / 2;
    }
    
    // Distribute neurons evenly in available space
    const spacing = Math.min(this.neuronSpacing, availableHeight / (neuronCount - 1));
    const totalHeight = (neuronCount - 1) * spacing;
    const offsetY = startY + (availableHeight - totalHeight) / 2;
    
    return offsetY + (neuronIndex * spacing);
  }
  
  getNeuronOpacity(layerIndex: number, neuronIndex: number): number {
    const layer = this.networkLayers[layerIndex];
    if (!layer) return 0.5;
    
    // Base opacity
    let opacity = 0.8;
    
    // Adjust based on activation if available
    const activation = layer.neurons[neuronIndex]?.activation;
    if (activation !== undefined) {
      opacity = 0.3 + (Math.abs(activation) * 0.7);
    }
    
    return Math.max(0.2, Math.min(1, opacity));
  }
  
  getConnectionWidth(weight: number): number {
    return Math.max(0.5, Math.abs(weight) * 2);
  }
  
  getConnectionOpacity(weight: number): number {
    return Math.max(0.1, Math.abs(weight) * 0.5);
  }
  
  refreshNetwork(): void {
    // Update neuron activations with random values for demo
    for (const layer of this.networkLayers) {
      for (const neuron of layer.neurons) {
        neuron.activation = Math.random();
      }
    }
    
    // Regenerate connections with new weights
    this.generateConnections();
  }
} 