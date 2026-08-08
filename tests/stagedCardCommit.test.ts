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

describe('Staged Card Lifecycle & Commit Resolution (§10)', () => {
  it('keeps the card in hand upon staging and only applies effect upon clicking Commit', () => {
    let state = createInitialState(1234, FAST_CONFIG);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });

    // Give player Second Wind (costs 2M, restores +4.0e)
    const secondWind = CARDS_BY_ID['second_wind'];
    state.hands.PLAYER = [secondWind];
    state.momentum.PLAYER = 5;

    // Piece p_2 starts with 5.0e, set to 2.0e
    const p2 = state.pieces.find(p => p.id === 'p_2')!;
    p2.energy = 2.0;

    // 1. Stage the card targeting p_2
    state = gameReducer(state, {
      type: 'STAGE_CARD',
      cardId: 'second_wind',
      targetPieceId: 'p_2',
    });

    // Card MUST remain in hand while staged!
    expect(state.hands.PLAYER.some(c => c.id === 'second_wind')).toBe(true);
    expect(state.plannedCards.length).toBe(1);
    expect(state.plannedCards[0].cardId).toBe('second_wind');
    expect(state.plannedCards[0].targetPieceId).toBe('p_2');

    // Effect has NOT been applied yet (energy is still 2.0e, momentum is still 5)
    const p2Before = state.pieces.find(p => p.id === 'p_2')!;
    expect(p2Before.energy).toBe(2.0);
    expect(state.momentum.PLAYER).toBe(5);

    // 2. Unstage the card
    state = gameReducer(state, {
      type: 'UNSTAGE_CARD',
      cardId: 'second_wind',
    });
    expect(state.plannedCards.length).toBe(0);
    expect(state.hands.PLAYER.some(c => c.id === 'second_wind')).toBe(true);

    // 3. Re-stage the card and commit turn
    state = gameReducer(state, {
      type: 'STAGE_CARD',
      cardId: 'second_wind',
      targetPieceId: 'p_2',
    });

    // End player turn (Commit!)
    state = gameReducer(state, { type: 'END_PLAYER_TURN' });

    // Now effect IS resolved upon Commit!
    const p2After = state.pieces.find(p => p.id === 'p_2')!;
    expect(p2After.energy).toBe(6.0); // 2.0 + 4.0 = 6.0
    expect(state.momentum.PLAYER).toBe(3); // 5 - 2 = 3
    expect(state.hands.PLAYER.some(c => c.id === 'second_wind')).toBe(false);
    expect(state.discardPiles.PLAYER.some(c => c.id === 'second_wind')).toBe(true);
    expect(state.plannedCards.length).toBe(0);

    // Event logged
    const cardEvent = state.eventLog.find(e => e.type === 'CARD_PLAYED' && e.details.cardId === 'second_wind');
    expect(cardEvent).toBeDefined();
    expect(cardEvent?.details.targetPieceId).toBe('p_2');
  });

  it('stages and resolves debuff cards targeting AI pieces upon commit', () => {
    let state = createInitialState(5678, FAST_CONFIG);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });

    // Give player Drain (costs 2M, drains 2.0e from enemy)
    const drain = CARDS_BY_ID['drain'];
    state.hands.PLAYER = [drain];
    state.momentum.PLAYER = 4;

    const ai1 = state.pieces.find(p => p.id === 'ai_1')!;
    ai1.energy = 5.0;

    // Stage Drain targeting ai_1
    state = gameReducer(state, {
      type: 'STAGE_CARD',
      cardId: 'drain',
      targetPieceId: 'ai_1',
    });

    expect(state.hands.PLAYER.length).toBe(1);
    expect(state.plannedCards[0].targetPieceId).toBe('ai_1');

    // Commit turn
    state = gameReducer(state, { type: 'END_PLAYER_TURN' });

    const ai1After = state.pieces.find(p => p.id === 'ai_1')!;
    // AI piece drained 2.0e upon commit (5.0 - 2.0 + regen)
    expect(ai1After.energy).toBeLessThanOrEqual(5.0);
    expect(state.discardPiles.PLAYER.some(c => c.id === 'drain')).toBe(true);
  });
});
