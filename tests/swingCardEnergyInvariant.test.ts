import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import { CARDS_BY_ID } from '../src/engine/config/cards';

describe('Swing Card Stamina Deduction Invariant (§10)', () => {
  it('deducts both momentum and 3.0e stamina from highest-energy piece when playing Swing Cards', () => {
    let state = createInitialState(999);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });

    state.momentum.PLAYER = 6;
    state.hands.PLAYER = [CARDS_BY_ID['surge']];

    // Find highest energy piece before surge
    const sortedBefore = state.pieces.filter(p => p.side === 'PLAYER').sort((a, b) => b.energy - a.energy);
    const highestBefore = sortedBefore[0];
    const initialEnergy = highestBefore.energy;

    state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'surge' });

    // Momentum deducted
    expect(state.momentum.PLAYER).toBe(6 - CARDS_BY_ID['surge'].momentumCost);
    // Surge then adds +2.0e to whole team, but the highest piece was first charged 3.0e
    const pieceAfter = state.pieces.find(p => p.id === highestBefore.id)!;
    expect(pieceAfter.energy).toBeCloseTo(Math.min(10.0, initialEnergy - 3.0 + 2.0), 1);
  });

  it('prohibits playing Swing Cards if team pieces have insufficient stamina (< 3.0e)', () => {
    let state = createInitialState(1234);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });

    state.momentum.PLAYER = 6;
    state.hands.PLAYER = [CARDS_BY_ID['full_court_press']];

    // Drain all player pieces below 3.0e
    state.pieces.forEach(p => {
      if (p.side === 'PLAYER') p.energy = 2.0;
    });

    state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'full_court_press' });

    // Card should NOT be played because stamina was insufficient
    expect(state.hands.PLAYER.length).toBe(1);
    expect(state.momentum.PLAYER).toBe(6);
  });
});
