import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import { MCTS_TIERS } from '../src/engine/config/mcts';

describe('Custom User-Specified MCTS Depth & Tier Hierarchy (§9.8)', () => {
  it('calibrates T1 to former T4 strength and sets new higher T2, T3 and T4 values', () => {
    // 1. T1 takes former T4 strength (10,000 iters, 8 depth, 10 samples)
    expect(MCTS_TIERS['T1'].iterations).toBe(10000);
    expect(MCTS_TIERS['T1'].rolloutDepth).toBe(8);
    expect(MCTS_TIERS['T1'].ismctsSamples).toBe(10);

    // 2. T2 scales to 20,000 iters, 10 depth, 15 samples
    expect(MCTS_TIERS['T2'].iterations).toBe(20000);
    expect(MCTS_TIERS['T2'].rolloutDepth).toBe(10);
    expect(MCTS_TIERS['T2'].ismctsSamples).toBe(15);

    // 3. New higher T3 Grandmaster (35,000 iters, 12 depth, 20 samples)
    expect(MCTS_TIERS['T3'].iterations).toBe(35000);
    expect(MCTS_TIERS['T3'].rolloutDepth).toBe(12);
    expect(MCTS_TIERS['T3'].ismctsSamples).toBe(20);

    // 4. New higher T4 Deep Combine Engine (50,000 iters, 15 depth, 25 samples)
    expect(MCTS_TIERS['T4'].iterations).toBe(50000);
    expect(MCTS_TIERS['T4'].rolloutDepth).toBe(15);
    expect(MCTS_TIERS['T4'].ismctsSamples).toBe(25);

    // 5. CUSTOM tier exists with user configurable parameters
    expect(MCTS_TIERS['CUSTOM']).toBeDefined();
    expect(MCTS_TIERS['CUSTOM'].tier).toBe('CUSTOM');
  });

  it('allows user to specify custom rollout depth (e.g. 8) and sample size (e.g. 5) and preserves it across turns', () => {
    let state = createInitialState(987);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });

    // User specifies custom depth, sample size, and iterations
    state.config.mcts = {
      ...state.config.mcts,
      tier: 'CUSTOM',
      rolloutDepth: 8,
      ismctsSamples: 5,
      iterations: 3500,
      explorationConstant: 1.8,
    };

    // End player turn and transition through AI turn
    state = gameReducer(state, { type: 'END_PLAYER_TURN' });

    // Verify CUSTOM tier parameters are preserved without being overwritten by adaptive defaults
    expect(state.config.mcts.tier).toBe('CUSTOM');
    expect(state.config.mcts.rolloutDepth).toBe(8);
    expect(state.config.mcts.ismctsSamples).toBe(5);
    expect(state.config.mcts.iterations).toBe(3500);
    expect(state.config.mcts.explorationConstant).toBe(1.8);
    expect(state.aiStatus.adaptiveTier).toBe('CUSTOM');
    expect(state.aiStatus.adaptiveRolloutDepth).toBe(8);
    expect(state.aiStatus.adaptiveSamples).toBe(5);
  });
});
