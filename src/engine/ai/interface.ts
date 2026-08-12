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

  /**
   * Synchronous planner. MCTS and epsilon-random engines are genuinely sync
   * (pure JS + tfjs `dataSync()`). NN engines running on the browser via
   * ONNX Runtime Web MAY throw here — always prefer `planTurnAsync` in
   * async contexts (like the reducer's caller in App.tsx).
   */
  planTurn(
    state: GameState,
    rng: SeededRNG,
    actingSide?: Side
  ): AIPlannedTurnResult & { telemetry?: AIEngineTelemetry };

  /**
   * Async planner. Engines that need async inference (ONNX Runtime Web,
   * WebGPU, remote inference) override this. Default implementations just
   * wrap the sync `planTurn` — see `wrapSyncAsAsync` below.
   */
  planTurnAsync?(
    state: GameState,
    rng: SeededRNG,
    actingSide?: Side
  ): Promise<AIPlannedTurnResult & { telemetry?: AIEngineTelemetry }>;
}

/**
 * Uniform accessor for the async planner. Every engine has an async view
 * even if it only implemented the sync one. Callers in App.tsx and the
 * `asyncTurnRunner` orchestrator should always go through this helper so
 * we do not accidentally block the main thread on a sync branch that
 * hasn't been converted yet.
 */
export function planTurnAsyncOf(
  engine: AIEngine
): (state: GameState, rng: SeededRNG, actingSide?: Side) =>
     Promise<AIPlannedTurnResult & { telemetry?: AIEngineTelemetry }> {
  if (engine.planTurnAsync) {
    return engine.planTurnAsync.bind(engine);
  }
  return (state, rng, actingSide) =>
    Promise.resolve(engine.planTurn(state, rng, actingSide));
}
