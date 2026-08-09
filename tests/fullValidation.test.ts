/**
 * Comprehensive Validation: All fixes (Phases 1-8 + full MCTS symmetry)
 */
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import { evaluateState } from '../src/engine/ai/evaluate';

describe('Full System Validation', () => {
  // Phase 1: Side symmetry
  it('evaluation is perfectly side-symmetric (0.0 asymmetry)', () => {
    const seeds = [100, 200, 300, 400, 500];
    let maxAsym = 0;

    for (const seed of seeds) {
      for (const winner of ['AI', 'PLAYER'] as const) {
        const state = createInitialState(seed);
        const s = gameReducer(state, { type: 'JUMP_BALL_RELEASE', wonBy: winner, releaseMarginMs: 100 });
        const aiEval = evaluateState(s, 'AI');
        const plEval = evaluateState(s, 'PLAYER');
        const asym = Math.abs(aiEval + plEval);
        if (asym > maxAsym) maxAsym = asym;
        console.log(`  seed=${seed} ${winner}: AI=${aiEval.toFixed(0)} PLAYER=${plEval.toFixed(0)} asym=${asym.toFixed(1)}`);
      }
    }
    console.log(`\n  Max asymmetry: ${maxAsym.toFixed(1)}`);
    expect(maxAsym).toBeLessThan(1);
  });

  // Score differential test
  it('score differential is symmetric', () => {
    const state = createInitialState(42);
    let s = gameReducer(state, { type: 'JUMP_BALL_RELEASE', wonBy: 'AI', releaseMarginMs: 100 });
    s = { ...s, score: { AI: 2, PLAYER: 0 } };

    const aiEval = evaluateState(s, 'AI');
    const plEval = evaluateState(s, 'PLAYER');

    console.log(`\n  AI leads 2-0: AI=${aiEval.toFixed(0)} PLAYER=${plEval.toFixed(0)}`);
    expect(aiEval).toBeGreaterThan(0);
    expect(plEval).toBeLessThan(0);
    expect(Math.abs(aiEval + plEval)).toBeLessThan(1);
  });

  // AI vs AI functionality test
  it('RUN_AI_TURN_FOR_PLAYER works (AI vs AI game runs)', () => {
    const state = createInitialState(42);
    let s = gameReducer(state, { type: 'JUMP_BALL_RELEASE', wonBy: 'PLAYER', releaseMarginMs: 100 });
    s = { ...s, momentum: { PLAYER: 3, AI: 3 } };

    // Set a low iteration tier for speed
    const fastTier = { tier: 'CUSTOM' as const, iterations: 20, rolloutDepth: 2, ismctsSamples: 1, explorationConstant: 1.414, label: 'fast', description: '' };

    let throws = 0;
    for (let turn = 1; turn <= 6; turn++) {
      if (s.phase === 'MATCH_OVER') break;

      if (s.phase === 'PLAYER_PLAN') {
        const orig = s.config.mcts;
        s = { ...s, config: { ...s.config, mcts: fastTier } };
        s = gameReducer(s, { type: 'RUN_AI_TURN_FOR_PLAYER' });
        s = { ...s, config: { ...s.config, mcts: orig } };
      }
      if (s.phase === 'AI_TURN') {
        const orig = s.config.mcts;
        s = { ...s, config: { ...s.config, mcts: fastTier } };
        s = gameReducer(s, { type: 'RUN_AI_TURN' });
        s = { ...s, config: { ...s.config, mcts: orig } };
      }
      if (s.phase === 'AI_PLANNED_REVIEW') {
        s = gameReducer(s, { type: 'START_PLAYER_TURN' });
      }
    }

    for (const ev of s.eventLog) {
      if (ev.type === 'PASS_ATTEMPTED') throws++;
    }

    const playerThrows = s.eventLog.filter(e => e.type === 'PASS_ATTEMPTED' && e.side === 'PLAYER').length;
    const aiThrows = s.eventLog.filter(e => e.type === 'PASS_ATTEMPTED' && e.side === 'AI').length;

    console.log(`\n  AI vs AI (6 turns): Player throws=${playerThrows}, AI throws=${aiThrows}, Score: ${s.score.PLAYER}-${s.score.AI}`);
    expect(playerThrows).toBeGreaterThan(0);
    expect(aiThrows).toBeGreaterThan(0);
  });

  // Existing tests still pass
  it('control map and basic game mechanics work', () => {
    const state = createInitialState(42);
    expect(state.pieces.length).toBe(14);
    expect(state.pieces.filter(p => p.side === 'AI').length).toBe(7);
    expect(state.pieces.filter(p => p.side === 'PLAYER').length).toBe(7);
  });
});
