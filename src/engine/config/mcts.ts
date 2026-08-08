export type MCTSTier = 'T1' | 'T2' | 'T3' | 'T4' | 'CUSTOM';

export interface MCTSTierConfig {
  tier: MCTSTier;
  iterations: number;
  rolloutDepth: number;
  ismctsSamples: number;
  explorationConstant: number;
  label: string;
  description: string;
}

/**
 * MCTS Tier Hierarchy Specification (v3.2):
 * - T1 (baselined to former T4): 10,000 iterations, 8 rollout depth, 10 hand samples.
 * - T2: Advanced depth (20,000 iterations, 10 rollout depth, 15 hand samples).
 * - T3: Grandmaster deep lookahead (35,000 iterations, 12 rollout depth, 20 hand samples).
 * - T4: Deep Combine Engine (50,000 iterations, 15 rollout depth, 25 hand samples).
 * - CUSTOM: User-tunable sliders across all 4 parameters.
 */
export const MCTS_TIERS: Record<MCTSTier, MCTSTierConfig> = {
  T1: {
    tier: 'T1',
    iterations: 10000,
    rolloutDepth: 8,
    ismctsSamples: 10,
    explorationConstant: 1.414,
    label: 'Standard Cadet (T1)',
    description: 'Base tactical search (~10,000 rollouts, 8-turn depth, 10 hand samples).',
  },
  T2: {
    tier: 'T2',
    iterations: 20000,
    rolloutDepth: 10,
    ismctsSamples: 15,
    explorationConstant: 1.414,
    label: 'Tactician (T2)',
    description: 'Advanced depth with expanded hand samples (~20,000 rollouts, 10-turn depth, 15 hand samples).',
  },
  T3: {
    tier: 'T3',
    iterations: 35000,
    rolloutDepth: 12,
    ismctsSamples: 20,
    explorationConstant: 1.414,
    label: 'Grandmaster (T3)',
    description: 'Deep positional foresight and lane denial (~35,000 rollouts, 12-turn depth, 20 hand samples).',
  },
  T4: {
    tier: 'T4',
    iterations: 50000,
    rolloutDepth: 15,
    ismctsSamples: 25,
    explorationConstant: 1.414,
    label: 'Deep Combine Engine (T4)',
    description: 'Maximum tactical foresight and joint piece coordination (~50,000 rollouts, 15-turn depth, 25 hand samples).',
  },
  CUSTOM: {
    tier: 'CUSTOM',
    iterations: 20000,
    rolloutDepth: 10,
    ismctsSamples: 15,
    explorationConstant: 1.414,
    label: 'Custom User Config',
    description: 'User-specified search depth, sample size, iterations & exploration constant.',
  },
};

/**
 * Dense Evaluation Weights:
 * The goal term (+1000) dominates, while ballProgress (x40) creates a dense gradient pulling the ball toward the Captain.
 */
export const MCTS_EVALUATION_WEIGHTS = {
  goal: 1000.0,
  ballProgress: 40.0,
  cleanScoringLane: 25.0,
  carrierSafety: 10.0,
  energyDiff: 3.0,
  control: 5.0,
  spacing: 2.0,
  hub: 2.0,
};
