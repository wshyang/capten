import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { createRNG } from '../src/engine/rng';
import { getAIEngine, wrapWithEpsilonGreedy, defaultMCTSEngine, NNEngine } from '../src/engine/ai/index';

describe('Epsilon-Greedy AI Engine Wrapper (§AI.Epsilon)', () => {
  it('should wrap MCTS and NN engines and implement the AIEngine contract', () => {
    const wrappedMCTS = wrapWithEpsilonGreedy(defaultMCTSEngine, 0.75);
    expect(wrappedMCTS.mode).toBe(defaultMCTSEngine.mode);
    expect(wrappedMCTS.label).toContain('[Epsilon 75%]');

    const nnEngine = new NNEngine('NN_ACTIVE');
    const wrappedNN = wrapWithEpsilonGreedy(nnEngine, 0.80);
    expect(wrappedNN.mode).toBe('NN_ACTIVE');
    expect(wrappedNN.label).toContain('[Epsilon 80%]');
  });

  it('should be retrievable via getAIEngine using EPSILON_GREEDY_NN and EPSILON_GREEDY_MCTS modes', () => {
    const engNN = getAIEngine('EPSILON_GREEDY_NN', 0.75);
    const engMCTS = getAIEngine('EPSILON_GREEDY_MCTS', 0.75);

    expect(engNN.label).toContain('[Epsilon 75%]');
    expect(engMCTS.label).toContain('[Epsilon 75%]');
  });

  it('should execute purely random exploration when exploitRate is 0.0', () => {
    const state = createInitialState(1234);
    const rng = createRNG(42);
    const alwaysRandom = wrapWithEpsilonGreedy(defaultMCTSEngine, 0.0);

    const res = alwaysRandom.planTurn(state, rng, 'AI');
    expect(res.stats.bestActionDescription).toContain('(Random Epsilon Exploration)');
  });

  it('should execute purely greedy wrapped policy when exploitRate is 1.0', () => {
    const state = createInitialState(1234);
    const rng = createRNG(42);
    const alwaysGreedy = wrapWithEpsilonGreedy(defaultMCTSEngine, 1.0);

    const res = alwaysGreedy.planTurn(state, rng, 'AI');
    expect(res.stats.bestActionDescription).not.toContain('(Random Epsilon Exploration)');
  });
});
