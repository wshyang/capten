import type { Card, GameState } from '../types';
import { ALL_CARDS } from '../config/cards';
import { SeededRNG } from '../rng';

export function determinizePlayerHand(state: GameState, rng: SeededRNG): Card[] {
  const playerHandCount = state.hands.PLAYER.length;
  if (playerHandCount === 0) return [];

  const knownCardIds = new Set<string>([
    ...state.hands.AI.map(c => c.id),
    ...state.discardPiles.PLAYER.map(c => c.id),
    ...state.discardPiles.AI.map(c => c.id),
  ]);

  const pool = ALL_CARDS.filter(c => !knownCardIds.has(c.id));
  const shuffled = rng.shuffle(pool);

  return shuffled.slice(0, playerHandCount);
}
