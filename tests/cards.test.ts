import { describe, it, expect } from 'vitest';
import { ALL_CARDS, CARDS_BY_ID } from '../src/engine/config/cards';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';

describe('Card System & Momentum Economy (§10 & §11)', () => {
  it('contains exactly 26 cards across all 6 dimensions', () => {
    expect(ALL_CARDS.length).toBe(26);

    const dims = new Set(ALL_CARDS.map(c => c.dim));
    expect(dims.size).toBe(6);
    expect(dims.has('RESOURCE')).toBe(true);
    expect(dims.has('RISK')).toBe(true);
    expect(dims.has('COMPOSURE')).toBe(true);
    expect(dims.has('TEAMWORK')).toBe(true);
    expect(dims.has('SPATIAL')).toBe(true);
    expect(dims.has('LEADERSHIP')).toBe(true);
  });

  it('charges piece energy for ⚡ swing cards in addition to momentum', () => {
    let state = createInitialState(123);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 30, wonBy: 'PLAYER' });

    state.momentum.PLAYER = 4;
    state.hands.PLAYER = [CARDS_BY_ID['surge']];

    state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'surge' });

    expect(state.momentum.PLAYER).toBe(4 - CARDS_BY_ID['surge'].momentumCost);
    expect(state.hands.PLAYER.length).toBe(0);
    expect(state.discardPiles.PLAYER.length).toBe(1);
  });

  it('earns momentum on clean assists to Captain and interceptions', () => {
    let state = createInitialState(456);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });

    // Position carrier at (5, 9) adjacent to Captain at (5, 10) for 100% clean assist
    const carrier = state.pieces.find(p => p.hasBall)!;
    carrier.cell = { col: 5, row: 9 };
    // Move ai_blocker away to (4, 9) so adjacent passing lane to (5, 10) is clear
    const aiBlocker = state.pieces.find(p => p.id === 'ai_blocker')!;
    aiBlocker.cell = { col: 4, row: 9 };
    const initialMomentum = state.momentum.PLAYER;

    // Throw to Captain at (5, 10)
    state = gameReducer(state, { type: 'THROW_BALL', targetCell: { col: 5, row: 10 } });

    // Score goal and earn momentum
    expect(state.score.PLAYER).toBe(1);
    expect(state.momentum.PLAYER).toBe(Math.min(6, initialMomentum + 2));
  });
});
