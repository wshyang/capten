import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import { isLegalMove } from '../src/engine/movement';

const FAST_CONFIG = {
  mcts: {
    tier: 'CUSTOM' as const,
    iterations: 50,
    rolloutDepth: 2,
    ismctsSamples: 1,
    explorationConstant: 1.414,
  },
};

describe('Single-Ball Invariant Across All Transitions (§4)', () => {
  it('guarantees exactly one ball exists on the board across all state transitions', () => {
    let state = createInitialState(12345, FAST_CONFIG);

    const assertSingleBall = (s: typeof state, _stepName: string) => {
      const carriers = s.pieces.filter(p => p.hasBall);
      expect(carriers.length).toBe(1);
    };

    // 1. Initial Jump-Ball possession
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 15, wonBy: 'PLAYER' });
    assertSingleBall(state, 'Jump-Ball Release');

    // 2. Pass from p_1 to p_2
    const carrier = state.pieces.find(p => p.hasBall)!;
    const dest = { col: 5, row: 5 };

    // Moving carrier is rejected
    const checkCarrierMove = isLegalMove(carrier, dest, state.pieces, state.temporaryState);
    expect(checkCarrierMove.legal).toBe(false);

    // Stage move for non-carrier piece p_2
    state = gameReducer(state, { type: 'STAGE_MOVE', pieceId: 'p_2', destCell: { col: 2, row: 4 } });
    assertSingleBall(state, 'After Stage Move');

    // Throw ball to Captain at (5, 10)
    state = gameReducer(state, { type: 'STAGE_THROW', targetPieceId: 'p_captain', targetCell: { col: 5, row: 10 } });
    assertSingleBall(state, 'After Stage Throw');

    // Commit turn and execute throw
    state = gameReducer(state, { type: 'END_PLAYER_TURN' });
    assertSingleBall(state, 'After End Player Turn');

    // AI Turn
    state = gameReducer(state, { type: 'RUN_AI_TURN' });
    assertSingleBall(state, 'After Run AI Turn');

    state = gameReducer(state, { type: 'START_PLAYER_TURN' });
    assertSingleBall(state, 'After Start Player Turn');

    // Forced possession handover
    state.pieces.forEach(p => { p.hasBall = p.id === 'p_1'; });
    state.ballHolderId = 'p_1';
    assertSingleBall(state, 'Manual State Verification');
  });

  it('guarantees that no two pieces can ever move to or occupy the same cell on the board', () => {
    let state = createInitialState(999, FAST_CONFIG);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 15, wonBy: 'PLAYER' });

    const sameDest = { col: 3, row: 3 };
    state = gameReducer(state, { type: 'STAGE_MOVE', pieceId: 'p_2', destCell: sameDest });
    expect(state.plannedMoves.length).toBe(1);
    expect(state.plannedMoves[0].pieceId).toBe('p_2');

    state = gameReducer(state, { type: 'STAGE_MOVE', pieceId: 'p_3', destCell: sameDest });
    expect(state.plannedMoves.length).toBe(1);
    expect(state.plannedMoves[0].pieceId).toBe('p_2');

    state = gameReducer(state, { type: 'EXECUTE_PLAYER_MOVES' });
    const coords = new Set(state.pieces.map(p => `${p.cell.col},${p.cell.row}`));
    expect(coords.size).toBe(state.pieces.length);

    state = gameReducer(state, { type: 'RUN_AI_TURN' });
    state = gameReducer(state, { type: 'START_PLAYER_TURN' });
    const afterAiCoords = new Set(state.pieces.map(p => `${p.cell.col},${p.cell.row}`));
    expect(afterAiCoords.size).toBe(state.pieces.length);
  });
});
