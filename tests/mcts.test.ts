import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { runSeededMCTS } from '../src/engine/ai/mcts';
import { createRNG } from '../src/engine/rng';

describe('Deterministic MCTS AI (§9 Acceptance Criteria)', () => {
  it('produces identical search results given the same seed', () => {
    const seed = 54321;
    const state1 = createInitialState(seed);
    const rng1 = createRNG(seed);
    const result1 = runSeededMCTS(state1, rng1);

    const state2 = createInitialState(seed);
    const rng2 = createRNG(seed);
    const result2 = runSeededMCTS(state2, rng2);

    expect(result1.posture).toBe(result2.posture);
    expect(result1.moves.length).toBe(result2.moves.length);
    expect(result1.stats.nodesEvaluated).toBe(result2.stats.nodesEvaluated);
    expect(result1.stage0Card.card?.id).toBe(result2.stage0Card.card?.id);
    expect(result1.stage2Card.card?.id).toBe(result2.stage2Card.card?.id);
  });
});
