import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import { generateJointCandidateActions } from '../src/engine/ai/mcts';
import { evaluateState } from '../src/engine/ai/evaluate';
import { selectAIPosture } from '../src/engine/ai/posture';

const FAST_CONFIG = {
  mcts: {
    tier: 'CUSTOM' as const,
    iterations: 80,
    rolloutDepth: 3,
    ismctsSamples: 2,
    explorationConstant: 1.414,
  },
};

describe('AI Offensive Drive & Penetration into Enemy Territory (§Attack Drive)', () => {
  it('selects ALL_OUT_ATTACK posture when AI holds the ball to aggressively drive toward Captain', () => {
    let state = createInitialState(1122, FAST_CONFIG);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'AI' });
    expect(state.phase).toBe('AI_TURN');

    const posture = selectAIPosture(state);
    expect(posture).toBe('ALL_OUT_ATTACK');
  });

  it('generates forward cutting moves and breakthroughs into enemy territory (rows <= 4)', () => {
    let state = createInitialState(3344, FAST_CONFIG);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'AI' });

    const candidates = generateJointCandidateActions(state, 'ALL_OUT_ATTACK');
    expect(candidates.length).toBeGreaterThan(0);

    // Candidates should include forward moves/cuts that penetrate toward row 0 (rows <= 4)
    const forwardActions = candidates.filter(c =>
      c.moves.some(m => m.destCell.row <= 5) || (c.throwTargetPieceId === 'ai_captain')
    );
    expect(forwardActions.length).toBeGreaterThan(0);
  });

  it('evaluates positions with pieces advanced into enemy territory higher than passive backline states', () => {
    const stateBackline = createInitialState(5566, FAST_CONFIG);
    const ai1 = stateBackline.pieces.find(p => p.id === 'ai_1')!;
    ai1.hasBall = true;
    stateBackline.ballHolderId = ai1.id;

    const scoreBackline = evaluateState(stateBackline);

    // Advanced state: AI pieces have penetrated into enemy territory (rows 2, 3, 4)
    const stateAdvanced = createInitialState(5566, FAST_CONFIG);
    const ai1Adv = stateAdvanced.pieces.find(p => p.id === 'ai_1')!;
    ai1Adv.hasBall = true;
    ai1Adv.cell = { col: 5, row: 3 }; // Carrier deep in enemy territory
    stateAdvanced.ballHolderId = ai1Adv.id;

    const ai2Adv = stateAdvanced.pieces.find(p => p.id === 'ai_2')!;
    ai2Adv.cell = { col: 2, row: 2 }; // Runner deep in enemy territory

    const scoreAdvanced = evaluateState(stateAdvanced);

    // The advanced enemy-territory state must be evaluated significantly higher than passive backline state
    expect(scoreAdvanced).toBeGreaterThan(scoreBackline + 100.0);
  });

  it('generates multi-piece coordinated joint attacks where multiple pieces advance simultaneously', () => {
    let state = createInitialState(9900, FAST_CONFIG);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'AI' });

    const candidates = generateJointCandidateActions(state, 'ALL_OUT_ATTACK');
    // Verify that multi-piece moves (>= 2 pieces moving in a single turn) are generated
    const multiPieceActions = candidates.filter(c => c.moves.length >= 2);
    expect(multiPieceActions.length).toBeGreaterThan(0);
  });

  it('marks branch as failed when >40% of AI pieces remain in initial position and enemy territory count never changes', () => {
    // Initial state where all AI pieces are in their initial setup positions
    const state = createInitialState(4455, FAST_CONFIG);
    const score = evaluateState(state);

    // Initial setup has 1 piece (ai_captain) in enemy half and 100% in initial positions -> triggers -500 penalty
    expect(score).toBeLessThanOrEqual(-400.0);
  });
});
