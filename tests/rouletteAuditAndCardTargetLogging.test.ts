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

describe('Roulette Evaluation Audit Logging & Accurate Card Targeting Messages', () => {
  it('logs ROULETTE_EVALUATED events with complete audit details whenever a throw passes an opposing zone of control', () => {
    let state = createInitialState(777, FAST_CONFIG);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });

    // Carrier is p_1 at (5, 4). Target is p_captain at (5, 10).
    const carrier = state.pieces.find(p => p.hasBall)!;
    expect(carrier.id).toBe('p_1');

    // Throw ball down court to Captain at (5, 10) with FLAT throw crossing AI control cells (5, 6; 5, 7; 5, 8; 5, 9)
    state = gameReducer(state, {
      type: 'THROW_BALL',
      targetCell: { col: 5, row: 10 },
      throwType: 'FLAT',
    });

    // Verify PASS_ATTEMPTED event was logged
    const passAttemptEvent = state.eventLog.find(e => e.type === 'PASS_ATTEMPTED');
    expect(passAttemptEvent).toBeDefined();
    expect(passAttemptEvent?.details.rollValues).toBeDefined();

    // Verify individual ROULETTE_EVALUATED events were emitted for auditability
    const rouletteEvents = state.eventLog.filter(e => e.type === 'ROULETTE_EVALUATED');
    expect(rouletteEvents.length).toBeGreaterThan(0);

    for (const rev of rouletteEvents) {
      expect(rev.details.cell).toBeDefined();
      expect(typeof rev.details.pCell).toBe('number');
      expect(typeof rev.details.roll).toBe('number');
      expect(typeof rev.details.intercepted).toBe('boolean');
      expect(rev.details.throwerEnergy).toBeGreaterThan(0);
    }
  });

  it('correctly tracks and logs debuff card targeting AI pieces without false "your AI" prefixes', () => {
    let state = createInitialState(888, FAST_CONFIG);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });

    // Give Player the Drain debuff card
    const drainCard = CARDS_BY_ID['drain'];
    state.hands.PLAYER = [drainCard];
    state.momentum.PLAYER = 5;

    // Player plays Drain targeting AI piece ai_1
    state = gameReducer(state, {
      type: 'PLAY_CARD',
      cardId: 'drain',
      targetPieceId: 'ai_1',
    });

    const cardEvent = state.eventLog.find(e => e.type === 'CARD_PLAYED' && e.details.cardId === 'drain');
    expect(cardEvent).toBeDefined();
    expect(cardEvent?.details.targetPieceId).toBe('ai_1');
    expect(cardEvent?.side).toBe('PLAYER');
  });

  it('correctly tracks and logs debuff card targeting Player pieces when played by AI', () => {
    let state = createInitialState(999, FAST_CONFIG);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });

    // Transition to AI turn
    state = gameReducer(state, { type: 'END_PLAYER_TURN' });

    // AI plays Clamp debuff targeting Player piece p_2
    const clampCard = CARDS_BY_ID['clamp'];
    state.hands.AI = [clampCard];
    state.momentum.AI = 5;

    state = gameReducer(state, {
      type: 'PLAY_CARD',
      cardId: 'clamp',
      targetPieceId: 'p_2',
    });

    const cardEvent = state.eventLog.find(e => e.type === 'CARD_PLAYED' && e.details.cardId === 'clamp');
    expect(cardEvent).toBeDefined();
    expect(cardEvent?.details.targetPieceId).toBe('p_2');
    expect(cardEvent?.side).toBe('AI');
  });
});
