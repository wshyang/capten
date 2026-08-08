import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import { getReachableCells } from '../src/engine/movement';

describe('Player Movement Staging & Grid Cell Selection (§5 & §8)', () => {
  it('stages a legal move when selecting a piece and clicking a reachable empty cell', () => {
    let state = createInitialState(42);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });

    // p_2 starts at (2, 3) with full energy (5.0)
    const p2 = state.pieces.find(p => p.id === 'p_2')!;
    expect(p2.cell).toEqual({ col: 2, row: 3 });

    // Reachable cells for p_2
    const reachable = getReachableCells(p2, state.pieces, state.temporaryState);
    expect(reachable.length).toBeGreaterThan(0);
    expect(reachable.some(r => r.cell.col === 2 && r.cell.row === 4)).toBe(true);

    // Stage move to (2, 4)
    state = gameReducer(state, { type: 'STAGE_MOVE', pieceId: 'p_2', destCell: { col: 2, row: 4 } });
    expect(state.plannedMoves.length).toBe(1);
    expect(state.plannedMoves[0].pieceId).toBe('p_2');
    expect(state.plannedMoves[0].destCell).toEqual({ col: 2, row: 4 });
    expect(state.plannedMoves[0].cost).toBeCloseTo(1.0, 2);

    // Unstage move
    state = gameReducer(state, { type: 'UNSTAGE_MOVE', pieceId: 'p_2' });
    expect(state.plannedMoves.length).toBe(0);
  });

  it('allows staging multiple player pieces and replaces move if same piece stages again', () => {
    let state = createInitialState(43);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });

    // Stage p_2 to (2, 4)
    state = gameReducer(state, { type: 'STAGE_MOVE', pieceId: 'p_2', destCell: { col: 2, row: 4 } });
    // Stage p_3 to (8, 4)
    state = gameReducer(state, { type: 'STAGE_MOVE', pieceId: 'p_3', destCell: { col: 8, row: 4 } });

    expect(state.plannedMoves.length).toBe(2);

    // Re-stage p_2 to (1, 3) (distance 1.0)
    state = gameReducer(state, { type: 'STAGE_MOVE', pieceId: 'p_2', destCell: { col: 1, row: 3 } });
    expect(state.plannedMoves.length).toBe(2);
    const p2Move = state.plannedMoves.find(m => m.pieceId === 'p_2')!;
    expect(p2Move.destCell).toEqual({ col: 1, row: 3 });
  });

  it('rejects moving the ball carrier or the stationary Captain', () => {
    let state = createInitialState(44);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });

    // Ball carrier is p_1 at (5, 4)
    const carrier = state.pieces.find(p => p.hasBall)!;
    expect(carrier.id).toBe('p_1');

    // Trying to stage a move for the carrier is rejected
    state = gameReducer(state, { type: 'STAGE_MOVE', pieceId: carrier.id, destCell: { col: 5, row: 5 } });
    expect(state.plannedMoves.length).toBe(0);

    // Trying to stage a move for Captain is rejected
    const captain = state.pieces.find(p => p.isCaptain && p.side === 'PLAYER')!;
    state = gameReducer(state, { type: 'STAGE_MOVE', pieceId: captain.id, destCell: { col: 5, row: 9 } });
    expect(state.plannedMoves.length).toBe(0);
  });

  it('prevents two separate pieces from being staged into the exact same cell', () => {
    let state = createInitialState(45);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });

    // Stage p_2 to (2, 4)
    state = gameReducer(state, { type: 'STAGE_MOVE', pieceId: 'p_2', destCell: { col: 2, row: 4 } });
    expect(state.plannedMoves.length).toBe(1);
    expect(state.plannedMoves[0].pieceId).toBe('p_2');
    expect(state.plannedMoves[0].destCell).toEqual({ col: 2, row: 4 });

    // p_3 attempts to stage a move into the same cell (2, 4) -> must be rejected!
    state = gameReducer(state, { type: 'STAGE_MOVE', pieceId: 'p_3', destCell: { col: 2, row: 4 } });
    expect(state.plannedMoves.length).toBe(1);
    expect(state.plannedMoves.some(m => m.pieceId === 'p_3')).toBe(false);

    // Verify getReachableCells for p_3 filters out (2, 4) when plannedMoves are passed
    const p3 = state.pieces.find(p => p.id === 'p_3')!;
    const reachableForP3 = getReachableCells(
      p3,
      state.pieces,
      state.temporaryState,
      11,
      11,
      false,
      state.plannedMoves
    );
    expect(reachableForP3.some(r => r.cell.col === 2 && r.cell.row === 4)).toBe(false);
  });
});
