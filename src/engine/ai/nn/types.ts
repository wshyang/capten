import type { AIEngineMode } from '../interface';

export interface NNEngineConfig {
  mode: AIEngineMode;
  modelPath?: string;
  useONNX?: boolean;
  shadowInferenceEnabled?: boolean;
}

export interface CNNStateTensorData {
  shape: [number, number, number]; // [11, 11, 18]
  data: Float32Array;
  actingSide: 'PLAYER' | 'AI';
  rowFlipped: boolean;
}
