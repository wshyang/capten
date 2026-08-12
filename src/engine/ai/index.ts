import type { AIEngine, AIEngineMode } from './interface';
import { defaultMCTSEngine } from './mcts/index';
import { NNEngine } from './nn/index';
import { wrapWithEpsilonGreedy } from './epsilonGreedy';

export * from './interface';
export * from './actionHelpers';
export { MCTSEngine, defaultMCTSEngine } from './mcts/index';
export { NNEngine, defaultNNEngine } from './nn/index';
export { EpsilonGreedyAIEngine, wrapWithEpsilonGreedy } from './epsilonGreedy';

export function getAIEngine(mode: AIEngineMode = 'MCTS_ONLY', epsilonExploitRate = 0.75): AIEngine {
  switch (mode) {
    case 'MCTS_ONLY':
      return defaultMCTSEngine;
    case 'MCTS_WITH_NN_SHADOW':
    case 'NN_ACTIVE':
    case 'HYBRID_ALPHAZERO':
      return new NNEngine(mode);
    case 'EPSILON_GREEDY_NN':
      return wrapWithEpsilonGreedy(new NNEngine('NN_ACTIVE'), epsilonExploitRate);
    case 'EPSILON_GREEDY_MCTS':
      return wrapWithEpsilonGreedy(defaultMCTSEngine, epsilonExploitRate);
    default:
      return defaultMCTSEngine;
  }
}
