import type { GameState, Side } from '../types';
import type { SeededRNG } from '../rng';
import type { AIEngine, AIEngineMode, AIPlannedTurnResult, AIEngineTelemetry } from './interface';
import { selectPosture } from './mcts/posture';
import { evaluateStage0Cards, evaluateStage2Cards } from './mcts/cardSearch';
import { generateJointCandidateActions } from './mcts/mcts';
import { resolveCandidateThrowAction, formatActionDescription } from './actionHelpers';

export class EpsilonGreedyAIEngine implements AIEngine {
  readonly mode: AIEngineMode;
  readonly label: string;
  readonly wrappedEngine: AIEngine;
  readonly exploitRate: number;

  constructor(wrappedEngine: AIEngine, exploitRate = 0.75) {
    this.wrappedEngine = wrappedEngine;
    this.exploitRate = exploitRate;
    this.mode = wrappedEngine.mode;
    this.label = `${wrappedEngine.label} [Epsilon ${Math.round(exploitRate * 100)}%]`;
  }

  /**
   * Async variant: on exploit, delegates to the wrapped engine's
   * planTurnAsync (falling back to sync planTurn) so ORT-Web works
   * transparently through the epsilon wrapper. On explore, runs the
   * random-action branch synchronously and resolves — no NN needed.
   */
  async planTurnAsync(
    state: GameState,
    rng: SeededRNG,
    actingSide: Side = 'AI'
  ): Promise<AIPlannedTurnResult & { telemetry?: AIEngineTelemetry }> {
    if (rng.nextFloat() < this.exploitRate) {
      if (this.wrappedEngine.planTurnAsync) {
        return this.wrappedEngine.planTurnAsync(state, rng, actingSide);
      }
      return this.wrappedEngine.planTurn(state, rng, actingSide);
    }
    // Exploration branch is genuinely sync — no NN forward pass to await.
    return this.planTurnSyncExplore(state, rng, actingSide);
  }

  planTurn(
    state: GameState,
    rng: SeededRNG,
    actingSide: Side = 'AI'
  ): AIPlannedTurnResult & { telemetry?: AIEngineTelemetry } {
    if (rng.nextFloat() < this.exploitRate) {
      return this.wrappedEngine.planTurn(state, rng, actingSide);
    }
    return this.planTurnSyncExplore(state, rng, actingSide);
  }

  /**
   * The random-exploration branch, factored out so both sync `planTurn`
   * and async `planTurnAsync` share it. Caller has already consumed one
   * `rng.nextFloat()` for the exploit-vs-explore decision; this method
   * draws exactly one `rng.nextInt()` for the random-action pick, so
   * seeded matches stay bit-identical.
   */
  private planTurnSyncExplore(
    state: GameState,
    rng: SeededRNG,
    actingSide: Side = 'AI'
  ): AIPlannedTurnResult & { telemetry?: AIEngineTelemetry } {
    const startTime = Date.now();
    const posture = selectPosture(state, actingSide);
    const stage0Card = evaluateStage0Cards(state, actingSide);
    const stage2Card = evaluateStage2Cards(state, actingSide);
    const allCandidates = generateJointCandidateActions(state, posture, actingSide);

    const randIdx = allCandidates.length > 0 ? rng.nextInt(0, allCandidates.length - 1) : 0;
    const randomAction = allCandidates[randIdx] || { moves: [] };

    const throwAction = resolveCandidateThrowAction(randomAction, state, actingSide);
    const durationMs = Math.max(1, Date.now() - startTime);
    const bestActionDescription = formatActionDescription(randomAction, throwAction, 'Random Epsilon Exploration');

    return {
      posture,
      stage0Card: randomAction.stage0Card || stage0Card,
      moves: randomAction.moves,
      throwAction,
      stage2Card: randomAction.stage2Card || stage2Card,
      stats: {
        iterations: 1,
        nodesEvaluated: allCandidates.length,
        bestScore: 0,
        timeMs: durationMs,
        candidateCount: allCandidates.length,
        bestActionDescription,
      },
      telemetry: {
        engineType: this.mode,
        turnLatencyMs: durationMs,
      },
    };
  }
}

/**
 * Wraps any AIEngine (MCTS or NN) with an epsilon-greedy strategy:
 * - For exploitRate (default 0.75 or 75%) of turns, follows the guidance of the wrapped engine.
 * - The remainder (25%) of the time, selects a random legal joint action for exploration.
 */
export function wrapWithEpsilonGreedy(wrappedEngine: AIEngine, exploitRate = 0.75): AIEngine {
  return new EpsilonGreedyAIEngine(wrappedEngine, exploitRate);
}
