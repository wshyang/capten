// @vitest-environment jsdom
/**
 * test/jsdom/asyncAITurn.test.tsx
 *
 * Verifies the Path-B async orchestrator dispatches APPLY_AI_TURN_RESULT
 * with a valid plan when configured for the ONNX backend, using the
 * mocked onnxruntime-web (see test/jsdom/setupOnnxMock.ts).
 *
 * This is the safety net for the async refactor: it proves the
 *   AI_TURN → planAndDispatchAITurn(...) → APPLY_AI_TURN_RESULT → AI_PLANNED_REVIEW
 * chain works end-to-end without deadlocking or crashing.
 */

import { describe, it, expect } from 'vitest';
import { createInitialState } from '../../src/engine/setup';
import { gameReducer } from '../../src/engine/reducer';
import { planAndDispatchAITurn } from '../../src/engine/ai/asyncTurnRunner';
import type { GameState, GameAction } from '../../src/engine/types';

/**
 * Fast-forward a fresh match into AI_TURN by resolving the jump-ball in
 * the AI's favour. Returns the resulting state.
 */
function stateInAITurn(inferenceBackend: 'tfjs' | 'onnx'): GameState {
  let s = createInitialState(4242, {
    ai: {
      aiEngineMode: 'NN_ACTIVE',
      playerEngineMode: 'NN_ACTIVE',
      defaultEngineMode: 'NN_ACTIVE',
      nnModelSize: '32',
      inferenceBackend,
    },
  });
  s = gameReducer(s, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 0, wonBy: 'AI' });
  expect(s.phase).toBe('AI_TURN');
  return s;
}

describe('jsdom: async AI turn orchestrator (Path B)', () => {
  it('dispatches APPLY_AI_TURN_RESULT and lands in AI_PLANNED_REVIEW (tfjs backend)', async () => {
    let s = stateInAITurn('tfjs');
    const dispatched: GameAction[] = [];
    const capturedDispatch = (action: GameAction) => {
      dispatched.push(action);
      s = gameReducer(s, action);
    };

    await planAndDispatchAITurn(s, capturedDispatch as any, { side: 'AI' });

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].type).toBe('APPLY_AI_TURN_RESULT');
    expect(s.phase).toBe('AI_PLANNED_REVIEW');
    expect(s.aiPlannedActions).toBeDefined();
    expect(s.aiStatus.lastSearchStats).toBeDefined();
  });

  it('dispatches APPLY_AI_TURN_RESULT and lands in AI_PLANNED_REVIEW (onnx backend, mocked ORT)', async () => {
    let s = stateInAITurn('onnx');
    const dispatched: GameAction[] = [];
    const capturedDispatch = (action: GameAction) => {
      dispatched.push(action);
      s = gameReducer(s, action);
    };

    await planAndDispatchAITurn(s, capturedDispatch as any, { side: 'AI' });

    expect(dispatched).toHaveLength(1);
    const action = dispatched[0];
    expect(action.type).toBe('APPLY_AI_TURN_RESULT');
    if (action.type === 'APPLY_AI_TURN_RESULT') {
      // The mocked ORT returns a uniform policy, so a valid plan should
      // still come out (best action = candidates[0], value = 0).
      expect(action.result).toBeDefined();
      expect(action.result.stats.candidateCount).toBeGreaterThan(0);
      // Description should indicate we went through the ONNX path.
      expect(action.result.stats.bestActionDescription).toMatch(/ONNX|CNN Policy/);
    }
    expect(s.phase).toBe('AI_PLANNED_REVIEW');
  });

  it('does not deadlock if the async engine throws (dispatches empty-plan fallback)', async () => {
    // Point the config at NN_ACTIVE + onnx so the async path is taken.
    // We simulate a broken engine by mutating state.rngState to something
    // the engine cannot use — actually the runner catches any throw and
    // dispatches a fallback plan. We just prove that guarantee.
    let s = stateInAITurn('onnx');
    // Corrupt rngState so createRNG throws inside the runner (defensive)
    (s as unknown as { rngState: unknown }).rngState = undefined;
    const dispatched: GameAction[] = [];
    const capturedDispatch = (action: GameAction) => {
      dispatched.push(action);
      // Do not apply — we only care that a dispatch happened.
    };

    await planAndDispatchAITurn(s, capturedDispatch as any, { side: 'AI' });
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].type).toBe('APPLY_AI_TURN_RESULT');
  });
});
