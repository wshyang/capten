import type { GameState, Cell, Posture, ThrowType, Side } from '../types';
import { SeededRNG } from '../rng';
import type { CardDecision } from './mcts/cardSearch';

export type { CardDecision };

export type AIEngineMode =
  | 'MCTS_ONLY'
  | 'MCTS_WITH_NN_SHADOW'
  | 'NN_ACTIVE'
  | 'HYBRID_ALPHAZERO'
  | 'EPSILON_GREEDY_NN'
  | 'EPSILON_GREEDY_MCTS';

export interface AIEngineTelemetry {
  engineType: AIEngineMode;
  turnLatencyMs: number;
  shadowValuePrediction?: number;
  shadowValueDivergence?: number;
  shadowPolicyKL?: number;
  shadowTopActionAgreed?: boolean;
}

export interface AIPlannedTurnResult {
  posture: Posture;
  stage0Card: CardDecision;
  moves: { pieceId: string; destCell: Cell; cost: number }[];
  throwAction?: { throwerId: string; targetPieceId: string; targetCell: Cell; throwType?: ThrowType };
  stage2Card: CardDecision;
  stats: {
    iterations: number;
    nodesEvaluated: number;
    bestScore: number;
    timeMs: number;
    candidateCount: number;
    bestActionDescription: string;
  };
}

export interface AIEngine {
  readonly mode: AIEngineMode;
  readonly label: string;

  planTurn(
    state: GameState,
    rng: SeededRNG,
    actingSide?: Side
  ): AIPlannedTurnResult & { telemetry?: AIEngineTelemetry };
}
