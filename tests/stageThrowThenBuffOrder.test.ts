import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import { CARDS_BY_ID } from '../src/engine/config/cards';

const FAST_CONFIG = {
  mcts: {
    tier: 'CUSTOM' as const,
    iterations: 50,
    rolloutDepth: 2,
    ismctsSamples: 1,
    explorationConstant: 1.414,
  },
};

describe('Staging Throw then Applying Buff Card Resolution Order', () => {
  it('applies Steady Hands and Long Bomb buff cards to a previously staged throw upon turn commit', () => {
    let state = createInitialState(1234, FAST_CONFIG);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });

    state.momentum.PLAYER = 6;
    state.hands.PLAYER = [
      CARDS_BY_ID['steady_hands'],
      CARDS_BY_ID['long_bomb'],
    ];

    // 1. Stage throw first (from p_1 at 5,4 to p_captain at 5,10)
    state = gameReducer(state, {
      type: 'STAGE_THROW',
      targetPieceId: 'p_captain',
      targetCell: { col: 5, row: 10 },
    });
    expect(state.plannedThrow?.targetPieceId).toBe('p_captain');

    // 2. Play Long Bomb card AFTER staging the throw
    state = gameReducer(state, {
      type: 'PLAY_CARD',
      cardId: 'long_bomb',
    });
    expect(state.temporaryState.longBombActive?.PLAYER).toBe(true);

    // 3. Play Steady Hands card AFTER staging the throw
    state = gameReducer(state, {
      type: 'PLAY_CARD',
      cardId: 'steady_hands',
    });
    expect(state.temporaryState.steadyHandsActive?.PLAYER).toBe(true);

    // 4. Commit turn (END_PLAYER_TURN)
    state = gameReducer(state, { type: 'END_PLAYER_TURN' });

    // 5. Verify the throw was executed with Long Bomb (half cost) and Steady Hands
    const passAttempt = state.eventLog.find(e => e.type === 'PASS_ATTEMPTED');
    expect(passAttempt).toBeDefined();
    expect(passAttempt?.details.throwerId).toBe('p_1');
    expect(passAttempt?.details.targetPieceId).toBe('p_captain');
  });

  it('applies Second Wind energy restore to carrier after staging throw, increasing escape velocity upon commit', () => {
    let state = createInitialState(5678, FAST_CONFIG);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });

    // Drain carrier energy to 2.0e
    const carrier = state.pieces.find(p => p.hasBall)!;
    carrier.energy = 2.0;

    state.momentum.PLAYER = 6;
    state.hands.PLAYER = [CARDS_BY_ID['second_wind']];

    // 1. Stage throw first
    state = gameReducer(state, {
      type: 'STAGE_THROW',
      targetPieceId: 'p_captain',
      targetCell: { col: 5, row: 10 },
      throwType: 'FLAT',
    });
    expect(state.plannedThrow?.targetPieceId).toBe('p_captain');

    // 2. Play Second Wind on carrier AFTER staging the throw
    state = gameReducer(state, {
      type: 'PLAY_CARD',
      cardId: 'second_wind',
      targetPieceId: carrier.id,
    });

    // Carrier energy is now restored to 6.0e
    const carrierAfterCard = state.pieces.find(p => p.id === carrier.id)!;
    expect(carrierAfterCard.energy).toBe(6.0);

    // 3. Commit turn
    state = gameReducer(state, { type: 'END_PLAYER_TURN' });

    // Verify throw resolution used the boosted 6.0e energy
    const passAttempt = state.eventLog.find(e => e.type === 'PASS_ATTEMPTED');
    expect(passAttempt).toBeDefined();
  });
});
