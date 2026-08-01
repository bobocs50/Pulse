// SOURCE: github.com/obro79/Rehabify/src/types/vision.ts
// Core types — steal directly, they're clean

export type ErrorSeverity = 'info' | 'warning' | 'error';

export interface FormError {
  type: string;
  message: string;
  severity: ErrorSeverity;
  timestamp: number;
  bodyPart?: string;
}

export interface FormAnalysis {
  isCorrect: boolean;
  phase: string;
  errors: FormError[];
  repCount: number;
  formScore: number;
  confidence?: number;
}

export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface LandmarkData {
  landmarks: Landmark[];
  worldLandmarks?: Landmark[];
  timestamp: number;
}

// Worker message types — their types, but they never implemented the worker
// We will actually use these
export interface VisionWorkerMessage {
  type: 'landmarks' | 'analysis' | 'error' | 'ready';
  landmarks?: LandmarkData;
  analysis?: FormAnalysis;
  error?: string;
}

export interface VisionWorkerCommand {
  type: 'init' | 'frame' | 'setExercise' | 'reset';
  frame?: ImageData;
  exerciseId?: string;
}
