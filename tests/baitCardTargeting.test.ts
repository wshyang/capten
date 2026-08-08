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

describe('Bait Card 2-Step Interactive Targeting & Displacement (§10)', () => {
  it('displaces targeted enemy piece 1 cell to the designated targetCell when Bait is played', () => {
    let state = createInitialState(777, FAST_CONFIG);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });

    state.momentum.PLAYER = 6;
    state.hands.PLAYER = [CARDS_BY_ID['bait']];

    // Enemy piece ai_1 is stationed at (5, 6)
    const ai1 = state.pieces.find(p => p.id === 'ai_1')!;
    expect(ai1.cell).toEqual({ col: 5, row: 6 });

    // Play Bait on ai_1, designated destination cell is (5, 7) (1 cell away)
    state = gameReducer(state, {
      type: 'PLAY_CARD',
      cardId: 'bait',
      targetPieceId: 'ai_1',
      targetCell: { col: 5, row: 7 },
    });

    // Verify ai_1 was baited and displaced to (5, 7)
    const ai1After = state.pieces.find(p => p.id === 'ai_1')!;
    expect(ai1After.cell).toEqual({ col: 5, row: 7 });
    expect(ai1After.movedLastTurn).toBe(true);

    // Verify CARD_PLAYED event was recorded in eventLog
    const cardEvent = state.eventLog.find(e => e.type === 'CARD_PLAYED' && e.details?.cardId === 'bait');
    expect(cardEvent).toBeDefined();
    expect(cardEvent?.details?.targetPieceId).toBe('ai_1');
    expect(cardEvent?.details?.targetCell).toEqual({ col: 5, row: 7 });
  });

  it('negates Bait displacement when enemy piece has Anchor buff or debuff negation is active', () => {
    let state = createInitialState(888, FAST_CONFIG);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });

    state.momentum.PLAYER = 6;
    state.hands.PLAYER = [CARDS_BY_ID['bait']];

    // Enemy piece ai_2 at (2, 7) has Anchor buff
    const ai2 = state.pieces.find(p => p.id === 'ai_2')!;
    ai2.buffs.push({ id: 'buff_anchor', type: 'ANCHOR', durationTurns: 1 });

    // Attempt to play Bait on anchored ai_2
    state = gameReducer(state, {
      type: 'PLAY_CARD',
      cardId: 'bait',
      targetPieceId: 'ai_2',
      targetCell: { col: 2, row: 6 },
    });

    // ai_2 position must remain unchanged at (2, 7) because of Anchor immunity
    const ai2After = state.pieces.find(p => p.id === 'ai_2')!;
    expect(ai2After.cell).toEqual({ col: 2, row: 7 });
  });
});
