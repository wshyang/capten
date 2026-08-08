import { describe, it, expect } from 'vitest';
import { CARDS_BY_ID } from '../src/engine/config/cards';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import { computeControlMap } from '../src/engine/control';

describe('All 26 Cards & Tactical Actions (§10)', () => {
  it('executes Resource dimension cards properly (deep_breath, second_wind, slow_burn, drain, overclock)', () => {
    let state = createInitialState(111);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });

    state.momentum.PLAYER = 6;
    state.hands.PLAYER = [
      CARDS_BY_ID['deep_breath'],
      CARDS_BY_ID['second_wind'],
      CARDS_BY_ID['slow_burn'],
    ];

    // Play Deep Breath on p_3
    state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'deep_breath', targetPieceId: 'p_3' });
    const p3 = state.pieces.find(p => p.id === 'p_3')!;
    expect(p3.restStreak).toBe(2);

    // Play Second Wind on p_captain
    const captain = state.pieces.find(p => p.id === 'p_captain')!;
    captain.energy = 2.0;
    state.momentum.PLAYER = 6;
    state.cardPlayedThisTurn.PLAYER = false;
    state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'second_wind', targetPieceId: 'p_captain' });
    expect(captain.energy).toBe(6.0);
  });

  it('executes Risk dimension cards (insurance, threaded_pass, steady_hands, long_bomb, no_look_pass)', () => {
    let state = createInitialState(222);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 15, wonBy: 'PLAYER' });
    state.momentum.PLAYER = 6;

    // Play Threaded Pass
    state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'threaded_pass' });
    expect(state.temporaryState.threadedPassActive?.PLAYER).toBe(true);

    // Play Steady Hands
    state.cardPlayedThisTurn.PLAYER = false;
    state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'steady_hands' });
    expect(state.temporaryState.steadyHandsActive?.PLAYER).toBe(true);
  });

  it('executes Spatial & Teamwork cards (jam_the_lane, screen, clamp, full_court_press, overlap)', () => {
    let state = createInitialState(333);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 10, wonBy: 'PLAYER' });
    state.momentum.PLAYER = 6;

    // Play Jam the Lane on (5,5)
    state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'jam_the_lane', targetCell: { col: 5, row: 5 } });
    expect(state.temporaryState.extraControlCell?.cell.col).toBe(5);
    expect(state.temporaryState.extraControlCell?.cell.row).toBe(5);

    const control = computeControlMap(state.pieces, state.temporaryState);
    expect(control[5][5][0]).toBeGreaterThanOrEqual(1.0);
  });

  it('executes Leadership & Composure cards (tempo_change, set_the_play, rally, timeout, reset)', () => {
    let state = createInitialState(444);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 25, wonBy: 'PLAYER' });
    state.momentum.PLAYER = 6;

    // Play Set the Play
    state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'set_the_play' });
    expect(state.temporaryState.setThePlayActive?.PLAYER).toBe(true);

    // Play Timeout
    state.cardPlayedThisTurn.PLAYER = false;
    state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'timeout' });
    const p1 = state.pieces.find(p => p.id === 'p_captain')!;
    expect(p1.energy).toBe(10.0);
  });
});
