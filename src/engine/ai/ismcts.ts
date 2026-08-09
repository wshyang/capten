import type { Card, GameState, Side } from '../types';
import { ALL_CARDS } from '../config/cards';
import { SeededRNG } from '../rng';

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

// Legacy wrapper for call sites that haven't migrated yet
export function determinizeForActingSide(state: GameState, rng: SeededRNG, actingSide: Side): Card[] {
  return determinizePlayerHand(state, rng, actingSide);
}
