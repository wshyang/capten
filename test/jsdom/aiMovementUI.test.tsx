// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { createInitialState, DEFAULT_CONFIG } from '../../src/engine/setup';
import { getAIEngine } from '../../src/engine/ai/index';
import { createRNG } from '../../src/engine/rng';
import { evaluateState } from '../../src/engine/ai/mcts/evaluate';
import { areCellsEqual } from '../../src/engine/config/board';

describe('jsdom: AI Movement UI & Conversation Bug Fixes', () => {
  it('should verify AI moves pieces from starting location when Player starts with ball (Turn 4 Bug Fix)', () => {
    // Simulate browser UI condition: localStorage is empty and fs cannot be read directly
    const state = createInitialState(4242);
    state.turn = 2;
    state.toAct = 'AI';
    state.phase = 'AI_TURN';

    // Player 1 has ball at (5, 4)
    state.pieces.forEach(p => {
      if (p.id === 'p_1') p.hasBall = true;
    });

    // Use default EPSILON_GREEDY_NN engine as configured in DEFAULT_CONFIG.ai
    const engine = getAIEngine('EPSILON_GREEDY_NN', DEFAULT_CONFIG.ai.epsilonExploitRate);
    const rng = createRNG(4242);
    const res = engine.planTurn(state, rng, 'AI');

    // Turn 4 Bug Fix: Ensure the AI does not sit idle at the starting location
    expect(res.moves.length).toBeGreaterThan(0);
    const firstMove = res.moves[0];
    const originalPiece = state.pieces.find(p => p.id === firstMove.pieceId);
    expect(originalPiece).toBeDefined();

    // Verify destination cell is NOT the starting cell
    expect(areCellsEqual(firstMove.destCell, originalPiece!.cell)).toBe(false);
  });

  it('should verify scoring hesitation diagnosis and surgical MCTS evaluation rules', () => {
    // When ball carrier is within scoring range (distToCaptain <= 4.0), evaluateState should strongly favor striking captain
    const stateStrike = createInitialState(4242);
    const ai1 = stateStrike.pieces.find(p => p.id === 'ai_1')!;
    ai1.cell = { col: 5, row: 2 }; // Distance 2 to ai_captain at (5, 0)
    ai1.hasBall = true;

    const evalStrike = evaluateState(stateStrike, 'AI');

    // Now test a state where within scoring range, carrier passed to a non-captain teammate instead (hesitation penalty)
    const stateHesitate = createInitialState(4242);
    const ai1H = stateHesitate.pieces.find(p => p.id === 'ai_1')!;
    const ai2H = stateHesitate.pieces.find(p => p.id === 'ai_2')!;
    ai1H.cell = { col: 5, row: 2 };
    ai1H.hasBall = false;
    ai2H.cell = { col: 4, row: 2 };
    ai2H.hasBall = true; // Passed around near goal line instead of scoring!

    stateHesitate.eventLog.push({
      id: 'ev_hesitate_1',
      turn: 1,
      type: 'PASS_ATTEMPTED',
      side: 'AI',
      details: {
        throwerId: 'ai_1',
        targetPieceId: 'ai_2',
        isClean: true,
      },
    });

    const evalHesitate = evaluateState(stateHesitate, 'AI');
    expect(evalStrike).toBeGreaterThan(evalHesitate);
  });

  it('should verify AI actively breaks into Player line when Player passes around at the start of the game', () => {
    const state = createInitialState(4242);
    state.turn = 2;
    state.toAct = 'AI';
    state.phase = 'AI_TURN';

    // Player passed ball to p_2 at (2, 3) at the start of the game
    state.pieces.forEach(p => {
      if (p.id === 'p_2') p.hasBall = true;
    });

    const engine = getAIEngine('EPSILON_GREEDY_NN', DEFAULT_CONFIG.ai.epsilonExploitRate);
    const rng = createRNG(100);
    const res = engine.planTurn(state, rng, 'AI');

    expect(res.moves.length).toBeGreaterThan(0);

    // Assert that at least one defender advanced forward toward the Player's line (row <= 6)
    const advancedDefender = res.moves.some(m => m.destCell.row <= 6);
    expect(advancedDefender).toBe(true);
  });
});
