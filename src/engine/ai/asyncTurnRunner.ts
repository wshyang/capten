/**
 * src/engine/ai/asyncTurnRunner.ts
 *
 * Path-B (async) orchestrator for AI turns. Called from App.tsx's effect
 * that watches `state.phase === 'AI_TURN'`. Runs the configured engine
 * off the reducer's synchronous critical path — necessary because ONNX
 * Runtime Web's `session.run()` has no sync API — and dispatches
 * `APPLY_AI_TURN_RESULT` with the pre-computed plan.
 *
 * Even for engines that are genuinely sync (MCTS, epsilon-random), this
 * path works: `planTurnAsyncOf` wraps sync `planTurn` in a resolved
 * Promise. There is one small behaviour difference vs the legacy
 * synchronous `RUN_AI_TURN` dispatch: the AI plan now lands in state on
 * a subsequent microtask instead of the same synchronous dispatch, which
 * gives React a chance to paint the "AI thinking" UI between the click
 * and the plan appearing. That is the desired behaviour.
 */

import type { Dispatch } from 'react';
import type { GameState, GameAction, Side } from '../types';
import { createRNG } from '../rng';
import { getAIEngine } from './index';
import { planTurnAsyncOf } from './interface';

export interface AsyncTurnRunnerOptions {
  /** Which side the plan is for (defaults to 'AI'). */
  side?: Side;
}

/**
 * Plans an AI turn off the sync path, then dispatches
 * `APPLY_AI_TURN_RESULT`. Errors are caught and logged so a failed
 * inference cannot deadlock the game — worst case, the engine
 * dispatches an empty plan and the game moves on.
 */
export async function planAndDispatchAITurn(
  state: GameState,
  dispatch: Dispatch<GameAction>,
  opts: AsyncTurnRunnerOptions = {},
): Promise<void> {
  const side: Side = opts.side ?? 'AI';
  const rng = createRNG(state.rngState);

  const mode = side === 'AI'
    ? (state.config.ai?.aiEngineMode || state.config.ai?.defaultEngineMode || 'MCTS_ONLY')
    : (state.config.ai?.playerEngineMode || state.config.ai?.defaultEngineMode || 'MCTS_ONLY');

  const engine = getAIEngine(mode, state.config.ai?.epsilonExploitRate ?? 0.75);
  const planAsync = planTurnAsyncOf(engine);

  try {
    const result = await planAsync(state, rng, side);
    dispatch({
      type: 'APPLY_AI_TURN_RESULT',
      side,
      result,
      rngStateAfter: rng.getState(),
    });
  } catch (err) {
    // Async inference failure — most likely ORT-Web WASM download blocked
    // or a shape mismatch in the .onnx artefact. Log loudly and dispatch
    // an empty plan so the game does not deadlock in AI_TURN.
    console.error('[asyncTurnRunner] AI turn planning failed:', err);
    dispatch({
      type: 'APPLY_AI_TURN_RESULT',
      side,
      result: {
        posture: 'BALANCED',
        stage0Card: { card: null, evaluatedDelta: 0 },
        moves: [],
        stage2Card: { card: null, evaluatedDelta: 0 },
        stats: {
          iterations: 0,
          nodesEvaluated: 0,
          bestScore: 0,
          timeMs: 0,
          candidateCount: 0,
          bestActionDescription: 'FAILED: async inference error, no plan produced',
        },
      },
      rngStateAfter: rng.getState(),
    });
  }
}
