import { Component, Input, OnChanges, SimpleChanges, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as d3 from 'd3';

export interface HeatmapData {
  row: number;
  col: number;
  value: number;
  normalized: number; // 0-1 normalized value
}

@Component({
  selector: 'app-board-heatmap',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="board-heatmap-container">
      <div class="heatmap-title">
        <h4 class="text-sm font-semibold text-gray-700">{{ title }}</h4>
        <div class="flex items-center space-x-2 text-xs text-gray-500">
          <span>Min: {{ minValue.toFixed(3) }}</span>
          <div class="heatmap-legend" #legend></div>
          <span>Max: {{ maxValue.toFixed(3) }}</span>
        </div>
      </div>
      <div class="heatmap-board" #heatmapBoard></div>
    </div>
  `,
  styles: [`
    .board-heatmap-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin: 1rem 0;
    }
    
    .heatmap-title {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-bottom: 0.5rem;
    }
    
    .heatmap-legend {
      width: 100px;
      height: 10px;
      margin: 0 0.5rem;
    }
    
    .heatmap-board {
      position: relative;
    }
    
    .square {
      stroke: #444;
      stroke-width: 1;
      cursor: pointer;
    }
    
    .square:hover {
      stroke: #fff;
      stroke-width: 2;
    }
    
    .square-label {
      font-size: 10px;
      font-weight: bold;
      text-anchor: middle;
      pointer-events: none;
      fill: #333;
    }
    
    .coordinate-label {
      font-size: 8px;
      text-anchor: middle;
      fill: #666;
    }
  `]
})
export class BoardHeatmapComponent implements OnChanges, AfterViewInit {
  @Input() data: HeatmapData[] = [];
  @Input() title: string = 'Board Heatmap';
  @Input() width: number = 300;
  @Input() height: number = 300;
  @Input() showValues: boolean = false;
  @Input() showCoordinates: boolean = true;
  @Input() colorScheme: string = 'Blues'; // d3 color schemes
  
  @ViewChild('heatmapBoard', { static: false }) heatmapBoard!: ElementRef;
  @ViewChild('legend', { static: false }) legend!: ElementRef;
  
  private svg: any;
  private colorScale: any;
  private squareSize: number = 0; // Initialize with default value
  
  minValue: number = 0;
  maxValue: number = 1;
  
  ngAfterViewInit(): void {
    this.squareSize = Math.min(this.width, this.height) / 8;
    this.initializeSvg();
    this.createColorScale();
    this.createLegend();
    this.renderHeatmap();
  }
  
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] && this.svg) {
      this.updateMinMax();
      this.createColorScale();
      this.updateLegend();
      this.renderHeatmap();
    }
  }
  
  private initializeSvg(): void {
    const boardSize = this.squareSize * 8;
    const margin = { top: 20, right: 20, bottom: 20, left: 20 };
    
    d3.select(this.heatmapBoard.nativeElement).selectAll('*').remove();
    
    this.svg = d3.select(this.heatmapBoard.nativeElement)
      .append('svg')
      .attr('width', boardSize + margin.left + margin.right)
      .attr('height', boardSize + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);
      
    // Add coordinate labels if enabled
    if (this.showCoordinates) {
      this.addCoordinateLabels();
    }
  }
  
  private addCoordinateLabels(): void {
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const ranks = ['1', '2', '3', '4', '5', '6', '7', '8'];
    
    // File labels (bottom)
    this.svg.selectAll('.file-label')
      .data(files)
      .enter()
      .append('text')
      .attr('class', 'coordinate-label file-label')
      .attr('x', (d: string, i: number) => i * this.squareSize + this.squareSize / 2)
      .attr('y', 8 * this.squareSize + 15)
      .text((d: string) => d);
    
    // Rank labels (left)
    this.svg.selectAll('.rank-label')
      .data(ranks)
      .enter()
      .append('text')
      .attr('class', 'coordinate-label rank-label')
      .attr('x', -10)
      .attr('y', (d: string, i: number) => (7 - i) * this.squareSize + this.squareSize / 2 + 3)
      .text((d: string) => d);
  }
  
  private updateMinMax(): void {
    if (this.data.length === 0) {
      this.minValue = 0;
      this.maxValue = 1;
      return;
    }
    
    this.minValue = Math.min(...this.data.map(d => d.value));
    this.maxValue = Math.max(...this.data.map(d => d.value));
    
    // Avoid division by zero
    if (this.minValue === this.maxValue) {
      this.maxValue = this.minValue + 1;
    }
  }
  
  private createColorScale(): void {
    this.updateMinMax();
    
    // Create color scale based on scheme
    let colorRange: string[];
    switch (this.colorScheme) {
      case 'Blues':
        colorRange = ['#f7fbff', '#08519c'];
        break;
      case 'Reds':
        colorRange = ['#fff5f0', '#a50f15'];
        break;
      case 'Greens':
        colorRange = ['#f7fcf5', '#006d2c'];
        break;
      case 'Oranges':
        colorRange = ['#fff5eb', '#a63603'];
        break;
      case 'Viridis':
        colorRange = ['#440154', '#21908c', '#fde725'];
        break;
      default:
        colorRange = ['#f7fbff', '#08519c'];
    }
    
    this.colorScale = d3.scaleLinear<string>()
      .domain([this.minValue, this.maxValue])
      .range(colorRange);
  }
  
  private createLegend(): void {
    const legendWidth = 100;
    const legendHeight = 10;
    
    d3.select(this.legend.nativeElement).selectAll('*').remove();
    
    const legendSvg = d3.select(this.legend.nativeElement)
      .append('svg')
      .attr('width', legendWidth)
      .attr('height', legendHeight);
    
    // Create gradient
    const gradient = legendSvg.append('defs')
      .append('linearGradient')
      .attr('id', 'legend-gradient')
      .attr('x1', '0%')
      .attr('x2', '100%')
      .attr('y1', '0%')
      .attr('y2', '0%');
    
    // Add color stops
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
      const value = this.minValue + (this.maxValue - this.minValue) * (i / steps);
      gradient.append('stop')
        .attr('offset', `${(i / steps) * 100}%`)
        .attr('stop-color', this.colorScale(value));
    }
    
    // Add rectangle with gradient
    legendSvg.append('rect')
      .attr('width', legendWidth)
      .attr('height', legendHeight)
      .style('fill', 'url(#legend-gradient)');
  }
  
  private updateLegend(): void {
    this.createLegend();
  }
  
  private renderHeatmap(): void {
    // Create data map for quick lookup
    const dataMap = new Map<string, HeatmapData>();
    this.data.forEach(d => {
      dataMap.set(`${d.row}-${d.col}`, d);
    });
    
    // Generate all board squares
    const squares: any[] = [];
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const key = `${row}-${col}`;
        const data = dataMap.get(key);
        squares.push({
          row,
          col,
          value: data ? data.value : 0,
          normalized: data ? data.normalized : 0
        });
      }
    }
    
    // Bind data to squares
    const squareSelection = this.svg.selectAll('.square')
      .data(squares, (d: any) => `${d.row}-${d.col}`);
    
    // Enter new squares
    const enterSelection = squareSelection.enter()
      .append('rect')
      .attr('class', 'square')
      .attr('x', (d: any) => d.col * this.squareSize)
      .attr('y', (d: any) => (7 - d.row) * this.squareSize) // Flip vertically
      .attr('width', this.squareSize)
      .attr('height', this.squareSize)
      .on('mouseover', (event: any, d: any) => this.onSquareHover(event, d))
      .on('mouseout', () => this.onSquareLeave());
    
    // Update all squares (enter + existing)
    squareSelection.merge(enterSelection)
      .transition()
      .duration(300)
      .style('fill', (d: any) => this.colorScale(d.value))
      .style('opacity', (d: any) => d.value > 0 ? 0.8 : 0.1);
    
    // Remove old squares
    squareSelection.exit().remove();
    
    // Add value labels if enabled
    if (this.showValues) {
      this.addValueLabels(squares);
    }
  }
  
  private addValueLabels(squares: any[]): void {
    const labelSelection = this.svg.selectAll('.square-label')
      .data(squares.filter((d: any) => d.value > 0), (d: any) => `${d.row}-${d.col}`);
    
    labelSelection.enter()
      .append('text')
      .attr('class', 'square-label')
      .attr('x', (d: any) => d.col * this.squareSize + this.squareSize / 2)
      .attr('y', (d: any) => (7 - d.row) * this.squareSize + this.squareSize / 2 + 3)
      .merge(labelSelection)
      .text((d: any) => d.value > 0 ? d.value.toFixed(2) : '');
    
    labelSelection.exit().remove();
  }
  
  private onSquareHover(event: any, d: any): void {
    // Create tooltip data
    const tooltipData = [{ value: d.value, position: `${String.fromCharCode(97 + d.col)}${d.row + 1}` }];
    
    // Select existing tooltip or create new one
    let tooltip = d3.select('body').selectAll('.heatmap-tooltip')
      .data(tooltipData);
    
    // Enter selection
    const tooltipEnter = tooltip.enter()
      .append('div')
      .attr('class', 'heatmap-tooltip')
      .style('position', 'absolute')
      .style('background', 'rgba(0, 0, 0, 0.8)')
      .style('color', 'white')
      .style('padding', '8px')
      .style('border-radius', '4px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('z-index', '1000')
      .style('opacity', 0);
    
    // Update + enter selection
    const merged = tooltip.merge(tooltipEnter as any);
    
    // Set content and position
    merged
      .html((d: any) => `Position: ${d.position}<br/>Value: ${d.value.toFixed(3)}`)
      .style('left', (event.pageX + 10) + 'px')
      .style('top', (event.pageY - 10) + 'px');
    
    // Animate opacity
    merged
      .transition()
      .duration(200)
      .style('opacity', 1);
  }
  
  private onSquareLeave(): void {
    d3.select('body').selectAll('.heatmap-tooltip')
      .transition()
      .duration(200)
      .style('opacity', 0)
      .remove();
  }
  
  // Public methods for external control
  setColorScheme(scheme: string): void {
    this.colorScheme = scheme;
    if (this.svg) {
      this.createColorScale();
      this.updateLegend();
      this.renderHeatmap();
    }
  }
  
  toggleValues(): void {
    this.showValues = !this.showValues;
    if (this.svg) {
      this.renderHeatmap();
    }
  }
  
  clear(): void {
    this.data = [];
    if (this.svg) {
      this.renderHeatmap();
    }
  }
} 