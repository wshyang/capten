import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import { generateJointCandidateActions } from '../src/engine/ai/mcts';
import { evaluateState } from '../src/engine/ai/evaluate';
import { CARDS_BY_ID } from '../src/engine/config/cards';

const FAST_CONFIG = {
  mcts: {
    tier: 'CUSTOM' as const,
    iterations: 40,
    rolloutDepth: 2,
    ismctsSamples: 1,
    explorationConstant: 1.414,
  },
};

describe('AI Card Target Logging & Bouncer Pass Avoidance (§Card Log & §Bouncer Risk)', () => {
  it('indicates card target (targetPieceId / targetCell) in event log details when AI plays cards', () => {
    let state = createInitialState(12345, FAST_CONFIG);
    // AI receives ball
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'AI' });
    expect(state.phase).toBe('AI_TURN');

    // Give AI a targeted card (e.g. drain) and momentum
    state.momentum.AI = 5;
    state.hands.AI = [CARDS_BY_ID['drain'], CARDS_BY_ID['overclock']];

    // Run AI turn to plan actions
    state = gameReducer(state, { type: 'RUN_AI_TURN' });
    expect(state.phase).toBe('AI_PLANNED_REVIEW');
    expect(state.aiPlannedActions).toBeDefined();

    // Start player turn to execute AI planned cards & moves
    state = gameReducer(state, { type: 'START_PLAYER_TURN' });

    // Verify CARD_PLAYED event has target details
    const cardEvents = state.eventLog.filter(e => e.type === 'CARD_PLAYED' && e.side === 'AI');
    expect(cardEvents.length).toBeGreaterThan(0);

    for (const ev of cardEvents) {
      expect(ev.details.cardId).toBeDefined();
      expect(ev.details.cardName).toBeDefined();
      // If card targets a piece (e.g. drain or overclock), targetPieceId must be populated
      const card = CARDS_BY_ID[ev.details.cardId];
      if (card && (card.targetType === 'ENEMY_PIECE' || card.targetType === 'FRIENDLY_PIECE')) {
        expect(ev.details.targetPieceId).toBeDefined();
      }
    }
  });

  it('avoids passing to the bouncer (ai_blocker) when outfield runners or Captain are available', () => {
    const state = createInitialState(777, FAST_CONFIG);
    // Ensure AI carrier has the ball
    const aiCarrier = state.pieces.find(p => p.id === 'ai_1')!;
    aiCarrier.hasBall = true;
    state.ballHolderId = aiCarrier.id;

    const candidates = generateJointCandidateActions(state, 'BALANCED');
    expect(candidates.length).toBeGreaterThan(0);

    // Candidates should prioritize passes to Captain or outfield teammates (ai_2, ai_3, etc.)
    const passTargets = candidates.map(c => c.throwTargetPieceId).filter(Boolean);
    expect(passTargets.length).toBeGreaterThan(0);

    // Since outfield teammates (ai_2, ai_3, ai_4, ai_5) and Captain exist, bouncer (ai_blocker) must NOT be targeted
    const bouncerPasses = candidates.filter(c => c.throwTargetPieceId === 'ai_blocker');
    expect(bouncerPasses.length).toBe(0);
  });

  it('heavily penalizes states where the bouncer holds the ball near the opposing captain', () => {
    const stateNormal = createInitialState(888, FAST_CONFIG);
    const aiRunner = stateNormal.pieces.find(p => p.id === 'ai_1')!; // at (5, 6)
    aiRunner.hasBall = true;
    stateNormal.ballHolderId = aiRunner.id;

    const scoreNormal = evaluateState(stateNormal);

    // Now consider a dangerous state where ai_blocker at (5, 9) holds the ball right next to player captain at (5, 10)
    const stateBouncer = createInitialState(888, FAST_CONFIG);
    const aiBlocker = stateBouncer.pieces.find(p => p.id === 'ai_blocker')!;
    aiBlocker.hasBall = true;
    stateBouncer.ballHolderId = aiBlocker.id;

    const scoreBouncer = evaluateState(stateBouncer);

    // The bouncer state must be heavily penalized compared to normal outfield carrier state
    expect(scoreBouncer).toBeLessThan(scoreNormal - 200.0);
  });

  it('strictly rejects staging throws when an enemy piece holds the ball', () => {
    let state = createInitialState(444, FAST_CONFIG);
    // AI wins jump ball and receives ball
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'AI' });
    expect(state.ballHolderId).toBe('ai_1');

    // If player attempts to stage throw from enemy carrier ai_1 to player piece p_1
    state = gameReducer(state, { type: 'STAGE_THROW', targetPieceId: 'p_1', targetCell: { col: 5, row: 4 } });
    expect(state.plannedThrow).toBeNull();
  });
});
