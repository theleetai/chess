import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ChessEngineService, EngineType } from '../../../core/services/chess-engine.service';

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
  
  // Engine settings
  engineType: EngineType = 'local';
  engineDepth: number = 10;
  
  ngOnInit(): void {
    // Load current engine settings
    this.engineType = this.engineService.engineType;
    this.engineDepth = this.engineService.engineDepth;
  }

  goBack(): void {
    this.router.navigate(['/']);
  }
  
  // Update engine settings
  updateEngineSettings(): void {
    this.engineService.engineType = this.engineType;
    this.engineService.engineDepth = this.engineDepth;
  }
} 