import type { Card, GameState, Side } from '../../types';
import { ALL_CARDS } from '../../config/cards';
import { SeededRNG } from '../../rng';

export function determinizePlayerHand(state: GameState, rng: SeededRNG, actingSide: Side = 'AI'): Card[] {
  const hiddenSide: Side = actingSide === 'AI' ? 'PLAYER' : 'AI';
  const ourSide: Side = actingSide;
  const hiddenHandCount = state.hands[hiddenSide].length;
  if (hiddenHandCount === 0) return [];

  const knownCardIds = new Set<string>([
    ...state.hands[ourSide].map(c => c.id),
    ...state.discardPiles.PLAYER.map(c => c.id),
    ...state.discardPiles.AI.map(c => c.id),
  ]);

  const pool = ALL_CARDS.filter(c => !knownCardIds.has(c.id));
  const shuffled = rng.shuffle(pool);

  return shuffled.slice(0, hiddenHandCount);
}

/**
 * Pillar IV: Archetype-Clustered PIMC (Parallel Information-Set MCTS)
 * Generates pre-clustered opponent hidden hands across Aggressive, Control, and Recovery archetypes
 * to eliminate hidden-hand churn across MCTS iterations while ensuring robustness.
 */
export function generateArchetypeClusters(
  state: GameState,
  rng: SeededRNG,
  actingSide: Side = 'AI',
  count = 10
): Card[][] {
  const hiddenSide: Side = actingSide === 'AI' ? 'PLAYER' : 'AI';
  const ourSide: Side = actingSide;
  const hiddenHandCount = state.hands[hiddenSide].length;
  if (hiddenHandCount === 0) {
    return Array.from({ length: count }, () => []);
  }

  const knownCardIds = new Set<string>([
    ...state.hands[ourSide].map(c => c.id),
    ...state.discardPiles.PLAYER.map(c => c.id),
    ...state.discardPiles.AI.map(c => c.id),
  ]);

  const pool = ALL_CARDS.filter(c => !knownCardIds.has(c.id));
  if (pool.length === 0) {
    return Array.from({ length: count }, () => []);
  }

  const aggressiveIds = new Set(['overclock', 'surge', 'no_look_pass', 'threaded_pass', 'long_bomb', 'set_the_play', 'give_and_go']);
  const controlIds = new Set(['clamp', 'drain', 'jam_the_lane', 'bait', 'full_court_press', 'slow_burn', 'screen']);
  const recoveryIds = new Set(['deep_breath', 'second_wind', 'anchor', 'reset', 'timeout', 'steady_hands', 'insurance', 'ice_in_the_veins', 'rally']);

  const sampleWithBias = (preferredIds: Set<string>): Card[] => {
    const preferred = pool.filter(c => preferredIds.has(c.id));
    const others = pool.filter(c => !preferredIds.has(c.id));
    const combined = [...rng.shuffle(preferred), ...rng.shuffle(others)];
    return combined.slice(0, hiddenHandCount);
  };

  const clusters: Card[][] = [];
  if (count >= 1) clusters.push(sampleWithBias(aggressiveIds));
  if (count >= 2) clusters.push(sampleWithBias(controlIds));
  if (count >= 3) clusters.push(sampleWithBias(recoveryIds));

  for (let i = clusters.length; i < count; i++) {
    const shuffled = rng.shuffle(pool);
    clusters.push(shuffled.slice(0, hiddenHandCount));
  }

  return clusters;
}

// Legacy wrapper for call sites that haven't migrated yet
export function determinizeForActingSide(state: GameState, rng: SeededRNG, actingSide: Side): Card[] {
  return determinizePlayerHand(state, rng, actingSide);
}
