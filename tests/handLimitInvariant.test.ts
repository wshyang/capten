import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import { CARDS_BY_ID } from '../src/engine/config/cards';

describe('Hand Limit Invariant & Forced Cycle Tests (§11)', () => {
  it('rejects END_PLAYER_TURN when player hand exceeds 3 cards until discarded', () => {
    let state = createInitialState(3344);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });

    // Put 4 cards into player's hand
    state.hands.PLAYER = [
      CARDS_BY_ID['deep_breath'],
      CARDS_BY_ID['second_wind'],
      CARDS_BY_ID['slow_burn'],
      CARDS_BY_ID['drain'],
    ];

    expect(state.hands.PLAYER.length).toBe(4);

    // Attempting to end turn with 4 cards should be rejected
    const stateAttempt = gameReducer(state, { type: 'END_PLAYER_TURN' });
    expect(stateAttempt.phase).toBe('PLAYER_PLAN'); // Rejected, stays in PLAYER_PLAN

    // Discard 1 card
    state = gameReducer(state, { type: 'DISCARD_CARD', cardId: 'deep_breath' });
    expect(state.hands.PLAYER.length).toBe(3);

    // Now ending turn should succeed and switch to AI_TURN
    state = gameReducer(state, { type: 'END_PLAYER_TURN' });
    expect(state.phase).toBe('AI_TURN');
  });

  it('stages and resolves planned throws during turn commit', () => {
    let state = createInitialState(5566);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });

    // Stage throw to p_captain at (5, 10)
    state = gameReducer(state, { type: 'STAGE_THROW', targetPieceId: 'p_captain', targetCell: { col: 5, row: 10 } });
    expect(state.plannedThrow).not.toBeNull();
    expect(state.plannedThrow?.targetPieceId).toBe('p_captain');

    // Commit turn
    state = gameReducer(state, { type: 'END_PLAYER_TURN' });
    expect(state.plannedThrow).toBeNull(); // Reset after resolution
  });
});
