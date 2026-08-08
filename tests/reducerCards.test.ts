import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import { CARDS_BY_ID } from '../src/engine/config/cards';

describe('Reducer Card State Transitions (§10 & §11)', () => {
  it('handles all 26 card effects in reducer correctly', () => {
    let state = createInitialState(999);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 15, wonBy: 'PLAYER' });
    state.momentum.PLAYER = 6;

    // Anchor
    state.hands.PLAYER = [CARDS_BY_ID['anchor']];
    state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'anchor', targetPieceId: 'p_3' });
    let p3 = state.pieces.find(p => p.id === 'p_3')!;
    expect(p3.buffs.some(b => b.type === 'ANCHOR')).toBe(true);

    // Screen
    state.momentum.PLAYER = 6;
    state.cardPlayedThisTurn.PLAYER = false;
    state.hands.PLAYER = [CARDS_BY_ID['screen']];
    state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'screen', targetPieceId: 'p_3' });
    p3 = state.pieces.find(p => p.id === 'p_3')!;
    expect(p3.buffs.some(b => b.type === 'SCREEN')).toBe(true);

    // Ice in the veins
    state.momentum.PLAYER = 6;
    state.cardPlayedThisTurn.PLAYER = false;
    state.hands.PLAYER = [CARDS_BY_ID['ice_in_the_veins']];
    state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'ice_in_the_veins' });
    expect(state.temporaryState.negateDebuff?.PLAYER).toBe(true);

    // Overlap
    state.momentum.PLAYER = 6;
    state.cardPlayedThisTurn.PLAYER = false;
    state.hands.PLAYER = [CARDS_BY_ID['overlap']];
    state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'overlap', targetPieceId: 'p_3' });
    p3 = state.pieces.find(p => p.id === 'p_3')!;
    expect(p3.buffs.some(b => b.type === 'OVERLAP')).toBe(true);

    // Full Court Press
    state.momentum.PLAYER = 6;
    state.cardPlayedThisTurn.PLAYER = false;
    state.hands.PLAYER = [CARDS_BY_ID['full_court_press']];
    state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'full_court_press' });
    expect(state.temporaryState.negateDebuff?.PLAYER).toBe(true);

    // Reset
    state.momentum.PLAYER = 6;
    state.cardPlayedThisTurn.PLAYER = false;
    state.hands.PLAYER = [CARDS_BY_ID['reset']];
    state.pieces = state.pieces.map(p => p.id === 'p_3' ? { ...p, energy: 2.0 } : p);
    state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'reset', targetPieceId: 'p_3' });
    p3 = state.pieces.find(p => p.id === 'p_3')!;
    expect(p3.energy).toBe(10.0);
  });
});
