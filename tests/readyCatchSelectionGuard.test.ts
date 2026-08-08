import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';

describe('Ready Catch UI Selection Guard & State Isolation (§Selection Guard)', () => {
  it('strictly isolates player ball carrier from enemy carrier possession', () => {
    let state = createInitialState(112233);
    // Player wins jump ball -> ball holder is p_1
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });
    expect(state.ballHolderId).toBe('p_1');

    const friendlyCarrier = state.pieces.find(p => p.side === 'PLAYER' && p.hasBall);
    expect(friendlyCarrier?.id).toBe('p_1');

    // Turn over ball to AI via holding foul
    state = gameReducer(state, { type: 'END_PLAYER_TURN' });
    expect(state.phase).toBe('AI_TURN');
    expect(state.ballHolderId).toBe('ai_1');

    // When AI has the ball, friendly player carrier MUST be null/undefined
    const playerCarrierAfterTurnover = state.pieces.find(p => p.side === 'PLAYER' && p.hasBall);
    expect(playerCarrierAfterTurnover).toBeUndefined();

    // AI carrier is active
    const aiCarrier = state.pieces.find(p => p.side === 'AI' && p.hasBall);
    expect(aiCarrier?.id).toBe('ai_1');
  });

  it('prohibits selecting enemy pieces as throwers or carriers during player turns', () => {
    let state = createInitialState(445566);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'AI' });
    expect(state.ballHolderId).toBe('ai_1');

    // Player attempts to stage a throw from enemy carrier ai_1
    state = gameReducer(state, { type: 'STAGE_THROW', targetPieceId: 'p_1', targetCell: { col: 5, row: 4 } });
    expect(state.plannedThrow).toBeNull();
  });
});
