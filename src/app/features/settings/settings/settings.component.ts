import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ChessEngineService, EngineType } from '../../../core/services/chess-engine.service';
import { GameStateService } from '../../../core/services/game-state.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css']
})
export class SettingsComponent implements OnInit {
  private router = inject(Router);
  private engineService = inject(ChessEngineService);
  private gameStateService = inject(GameStateService);
  
  // Engine settings
  engineType: EngineType = 'local';
  engineDepth: number = 10;
  
  // Eval bar settings
  evalBarVisibility: 'always' | 'after-game' | 'never' = 'after-game';
  showMoveAnalysis: boolean = true;
  
  ngOnInit(): void {
    // Load current engine settings
    this.engineType = this.engineService.engineType;
    this.engineDepth = this.engineService.engineDepth;
    
    // Load eval bar settings
    this.evalBarVisibility = this.gameStateService.showEvalBar();
    this.showMoveAnalysis = this.gameStateService.showMoveAnalysis();
  }

  goBack(): void {
    this.router.navigate(['/']);
  }
  
  // Update engine settings
  updateEngineSettings(): void {
    this.engineService.engineType = this.engineType;
    this.engineService.engineDepth = this.engineDepth;
  }
  
  // Update eval bar settings
  updateEvalBarSettings(): void {
    this.gameStateService.setEvalBarVisibility(this.evalBarVisibility);
  }
  
  // Toggle move analysis
  toggleMoveAnalysis(): void {
    this.showMoveAnalysis = !this.showMoveAnalysis;
    this.gameStateService.setMoveAnalysisVisibility(this.showMoveAnalysis);
  }
} 