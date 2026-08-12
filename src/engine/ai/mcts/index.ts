import type { GameState, Side } from '../../types';
import type { SeededRNG } from '../../rng';
import type { AIEngine, AIEngineMode, AIPlannedTurnResult } from '../interface';
import { runSeededMCTS } from './mcts';

export class MCTSEngine implements AIEngine {
  readonly mode: AIEngineMode = 'MCTS_ONLY';
  readonly label = 'Deterministic PUCT/PIMC MCTS';

  planTurn(
    state: GameState,
    rng: SeededRNG,
    actingSide?: Side
  ): AIPlannedTurnResult {
    return runSeededMCTS(state, rng, actingSide);
  }
}

export const defaultMCTSEngine = new MCTSEngine();
