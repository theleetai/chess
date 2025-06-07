import { Component, OnInit, OnDestroy, inject, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { GameStateService } from '../../../core/services/game-state.service';
import { AIService } from '../../../core/services/ai.service';
import { Subscription, interval } from 'rxjs';

@Component({
  selector: 'app-player-vs-ai',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './player-vs-ai.component.html',
  styleUrls: ['./player-vs-ai.component.css']
})
export class PlayerVsAIComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private gameStateService = inject(GameStateService);
  private aiService = inject(AIService);
  
  @ViewChild('fileInput', { static: false }) fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('multiFileInput', { static: false }) multiFileInput!: ElementRef<HTMLInputElement>;
  
  // Component state
  isModelLoaded = false;
  isLoadingModel = false;
  modelFileName = '';
  errorMessage = '';
  successMessage = '';
  
  // Loading method toggle
  loadingMethod: 'single' | 'multiple' = 'single';
  
  // Multiple file handling
  selectedJsonFile: File | null = null;
  selectedWeightsFile: File | null = null;
  
  // AI status
  isAIThinking = false;
  aiMoveSubscription?: Subscription;
  
  ngOnInit(): void {
    // Set the game mode but don't start the game yet
    this.gameStateService.setGameMode('player-vs-ai');
  }
  
  ngOnDestroy(): void {
    // Clean up subscriptions
    if (this.aiMoveSubscription) {
      this.aiMoveSubscription.unsubscribe();
    }
    
    // Dispose of AI model
    this.aiService.dispose();
  }
  
  // Switch loading method
  setLoadingMethod(method: 'single' | 'multiple'): void {
    this.loadingMethod = method;
    this.clearMessages();
    this.resetFileSelection();
  }
  
  // Reset file selection
  private resetFileSelection(): void {
    this.selectedJsonFile = null;
    this.selectedWeightsFile = null;
    this.modelFileName = '';
    if (this.fileInput) {
      this.fileInput.nativeElement.value = '';
    }
    if (this.multiFileInput) {
      this.multiFileInput.nativeElement.value = '';
    }
  }
  
  // Clear messages
  private clearMessages(): void {
    this.errorMessage = '';
    this.successMessage = '';
  }
  
  // Trigger single file input click
  selectModelFile(): void {
    this.fileInput.nativeElement.click();
  }
  
  // Trigger multiple file input click
  selectMultipleFiles(): void {
    this.multiFileInput.nativeElement.click();
  }
  
  // Handle single file selection
  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (!file) {
      return;
    }
    
    // Validate file type (should be .json for TensorFlow.js models)
    if (!file.name.endsWith('.json')) {
      this.errorMessage = 'Please select a valid model file (.json). Make sure to select the JSON file, not the weights.bin file.';
      return;
    }
    
    this.isLoadingModel = true;
    this.clearMessages();
    this.modelFileName = file.name;
    
    try {
      await this.aiService.loadModelFromFile(file);
      this.isModelLoaded = true;
      this.successMessage = 'AI model loaded successfully! You can now start a game.';
      console.log('AI model loaded successfully');
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Failed to load model file. Please check if it\'s a valid TensorFlow.js model.';
      this.isModelLoaded = false;
      this.modelFileName = '';
      console.error('Error loading model:', error);
    } finally {
      this.isLoadingModel = false;
    }
  }
  
  // Handle multiple files selection
  onMultipleFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    
    if (files.length !== 2) {
      this.errorMessage = 'Please select exactly 2 files: the .json model file and the .weights.bin file.';
      return;
    }
    
    // Sort files by extension
    const jsonFile = files.find(f => f.name.endsWith('.json'));
    const weightsFile = files.find(f => f.name.endsWith('.bin'));
    
    if (!jsonFile || !weightsFile) {
      this.errorMessage = 'Please select one .json file and one .weights.bin file.';
      return;
    }
    
    this.selectedJsonFile = jsonFile;
    this.selectedWeightsFile = weightsFile;
    this.clearMessages();
  }
  
  // Load multiple files
  async loadMultipleFiles(): Promise<void> {
    if (!this.selectedJsonFile || !this.selectedWeightsFile) {
      this.errorMessage = 'Please select both JSON and weights files first.';
      return;
    }
    
    this.isLoadingModel = true;
    this.clearMessages();
    this.modelFileName = `${this.selectedJsonFile.name} + ${this.selectedWeightsFile.name}`;
    
    try {
      await this.aiService.loadModelFromFiles(this.selectedJsonFile, this.selectedWeightsFile);
      this.isModelLoaded = true;
      this.successMessage = 'AI model loaded successfully from both files! You can now start a game.';
      console.log('AI model loaded successfully from multiple files');
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Failed to load model files.';
      this.isModelLoaded = false;
      this.modelFileName = '';
      console.error('Error loading model from multiple files:', error);
    } finally {
      this.isLoadingModel = false;
    }
  }
  
  // Start the game with AI
  startGameWithAI(): void {
    if (!this.isModelLoaded) {
      this.errorMessage = 'Please load an AI model first';
      return;
    }
    
    // Set up AI move monitoring
    this.setupAIMoveHandler();
    
    // Navigate to the game board
    this.router.navigate(['/game']);
  }
  
  // Set up AI move handling
  private setupAIMoveHandler(): void {
    // Monitor game state for AI turns
    this.aiMoveSubscription = interval(1000).subscribe(async () => {
      if (this.aiService.isReady && !this.isAIThinking) {
        // Check if it's AI's turn (assuming AI plays black)
        const gameMode = this.gameStateService.currentMode();
        if (gameMode === 'player-vs-ai') {
          await this.checkAndMakeAIMove();
        }
      }
    });
  }
  
  // Check if AI should move and make the move
  private async checkAndMakeAIMove(): Promise<void> {
    try {
      this.isAIThinking = true;
      
      // Small delay to simulate thinking
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const moveSuccess = await this.aiService.makeAIMove();
      
      if (!moveSuccess) {
        console.log('AI could not make a move');
      }
    } catch (error) {
      console.error('Error making AI move:', error);
    } finally {
      this.isAIThinking = false;
    }
  }
  
  // Return to main menu
  returnToMenu(): void {
    this.router.navigate(['/']);
  }
  
  // Get AI status text
  getAIStatusText(): string {
    if (this.isLoadingModel) {
      return 'Loading AI model...';
    } else if (this.isModelLoaded) {
      return `AI Ready: ${this.modelFileName}`;
    } else {
      return 'No AI model loaded';
    }
  }
  
  // Get AI status class
  getAIStatusClass(): string {
    if (this.isLoadingModel) {
      return 'text-yellow-400';
    } else if (this.isModelLoaded) {
      return 'text-green-400';
    } else {
      return 'text-red-400';
    }
  }
  
  // Get files display text for multiple file method
  getMultipleFilesText(): string {
    if (this.selectedJsonFile && this.selectedWeightsFile) {
      return `${this.selectedJsonFile.name} + ${this.selectedWeightsFile.name}`;
    } else if (this.selectedJsonFile || this.selectedWeightsFile) {
      return '1 file selected (need 2 files total)';
    } else {
      return 'No files selected';
    }
  }
} 