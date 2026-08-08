import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import { calculateMoveCost, calculateThrowCost } from '../src/engine/config/energy';

const FAST_CONFIG = {
  mcts: {
    tier: 'CUSTOM' as const,
    iterations: 50,
    rolloutDepth: 2,
    ismctsSamples: 1,
    explorationConstant: 1.414,
  },
};

describe('Energy Economy (§5 Acceptance Criteria)', () => {
  it('calculates orthogonal move cost as 1.0 per cell and diagonal as sqrt(2)', () => {
    const costOrtho = calculateMoveCost({ col: 5, row: 4 }, { col: 5, row: 7 });
    expect(costOrtho).toBeCloseTo(3.0, 3);

    const costDiag = calculateMoveCost({ col: 2, row: 3 }, { col: 4, row: 5 });
    expect(costDiag).toBeCloseTo(Math.hypot(2, 2), 3);
  });

  it('calculates throw cost as distance / 3', () => {
    const cost = calculateThrowCost({ col: 5, row: 4 }, { col: 5, row: 1 });
    expect(cost).toBeCloseTo(3.0 / 3.0, 3);
  });

  it('compounds rest streak on stationary pieces (n=0 -> +1, n=1 -> +2, n=2 -> +3)', () => {
    let state = createInitialState(100, FAST_CONFIG);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 25, wonBy: 'PLAYER' });

    // p_2 is stationary at (2,3)
    const p2Before = state.pieces.find(p => p.id === 'p_2')!;
    p2Before.energy = 5.0;

    // Turn 1 completes
    state = gameReducer(state, { type: 'END_PLAYER_TURN' });
    state = gameReducer(state, { type: 'RUN_AI_TURN' });
    state = gameReducer(state, { type: 'START_PLAYER_TURN' });

    const p2Turn2 = state.pieces.find(p => p.id === 'p_2')!;
    expect(p2Turn2.restStreak).toBe(1);
    expect(p2Turn2.energy).toBeCloseTo(7.0, 1);

    // Turn 2 completes
    state = gameReducer(state, { type: 'END_PLAYER_TURN' });
    state = gameReducer(state, { type: 'RUN_AI_TURN' });
    state = gameReducer(state, { type: 'START_PLAYER_TURN' });

    const p2Turn3 = state.pieces.find(p => p.id === 'p_2')!;
    expect(p2Turn3.restStreak).toBe(2);
    expect(p2Turn3.energy).toBe(10.0);
  });

  it('resets rest streak to 0 when a piece moves', () => {
    let state = createInitialState(100, FAST_CONFIG);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 15, wonBy: 'PLAYER' });

    // Rest 1 turn for p_2 at (2,3) while passing from p_1 to p_3
    state = gameReducer(state, { type: 'STAGE_THROW', targetPieceId: 'p_3', targetCell: { col: 8, row: 3 } });
    state = gameReducer(state, { type: 'END_PLAYER_TURN' });
    state = gameReducer(state, { type: 'RUN_AI_TURN' });
    state = gameReducer(state, { type: 'START_PLAYER_TURN' });

    const p2 = state.pieces.find(p => p.id === 'p_2')!;
    expect(p2.restStreak).toBe(1);

    // Move p_2 from (2,3) to (2,4) - legal distance 1.0 <= 5.0 energy while passing from p_3 to p_1
    state = gameReducer(state, { type: 'MOVE_PIECE_DIRECT', pieceId: 'p_2', destCell: { col: 2, row: 4 } });
    state = gameReducer(state, { type: 'STAGE_THROW', targetPieceId: 'p_1', targetCell: { col: 5, row: 4 } });

    state = gameReducer(state, { type: 'END_PLAYER_TURN' });
    state = gameReducer(state, { type: 'RUN_AI_TURN' });
    state = gameReducer(state, { type: 'START_PLAYER_TURN' });

    const p2AfterMove = state.pieces.find(p => p.id === 'p_2')!;
    expect(p2AfterMove.restStreak).toBe(0);
  });
});
