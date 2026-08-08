import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import { previewThrow } from '../src/engine/interception';
import { computeControlMap } from '../src/engine/control';

describe('Throw 1-Step Recipient Rule & Staged Throw Tests', () => {
  it('allows throws to recipients that move up to 1 cell straight (orthogonal) or 1 cell diagonal', () => {
    let state = createInitialState(9988);
    // Player wins jump ball, p_1 gets the ball at (5, 4)
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });

    // 1. Stage a 1-step straight orthogonal move for p_2 from (2,3) to (2,4) - distance 1.0 cell
    state = gameReducer(state, { type: 'STAGE_MOVE', pieceId: 'p_2', destCell: { col: 2, row: 4 } });
    state = gameReducer(state, { type: 'STAGE_THROW', targetPieceId: 'p_2', targetCell: { col: 2, row: 4 } });
    expect(state.plannedThrow).not.toBeNull();
    expect(state.plannedThrow?.targetPieceId).toBe('p_2');
    expect(state.plannedThrow?.targetCell).toEqual({ col: 2, row: 4 });

    // 2. Stage a 1-step diagonal move for p_3 from (8,3) to (7,4) - dx=1, dy=1, distance sqrt(2) <= 1.42
    state = gameReducer(state, { type: 'STAGE_MOVE', pieceId: 'p_3', destCell: { col: 7, row: 4 } });
    state = gameReducer(state, { type: 'STAGE_THROW', targetPieceId: 'p_3', targetCell: { col: 7, row: 4 } });
    expect(state.plannedThrow?.targetPieceId).toBe('p_3');
    expect(state.plannedThrow?.targetCell).toEqual({ col: 7, row: 4 });

    // Unstage throw
    state = gameReducer(state, { type: 'UNSTAGE_THROW' });
    expect(state.plannedThrow).toBeNull();
  });

  it('resolves AI throw cleanly when AI receiver moves 1-step to catch the pass', () => {
    let state = createInitialState(7766);
    // AI wins jump ball, ai_1 gets the ball at (5, 6)
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'AI' });
    expect(state.ballHolderId).toBe('ai_1');

    // Simulate AI planned actions with a 1-step cut for ai_2 (from 2,7 to 2,6) and a throw to ai_2
    state.phase = 'AI_PLANNED_REVIEW';
    state.aiPlannedActions = {
      moves: [{ pieceId: 'ai_2', fromCell: { col: 2, row: 7 }, destCell: { col: 2, row: 6 }, cost: 1.0 }],
      throwAction: {
        throwerId: 'ai_1',
        fromCell: { col: 5, row: 6 },
        targetPieceId: 'ai_2',
        targetCell: { col: 2, row: 6 },
      },
    };

    // Trigger START_PLAYER_TURN to resolve AI planned moves and throw
    state = gameReducer(state, { type: 'START_PLAYER_TURN' });

    // AI receiver ai_2 should now be at (2, 6)
    const ai2 = state.pieces.find(p => p.id === 'ai_2')!;
    expect(ai2.cell).toEqual({ col: 2, row: 6 });

    // Ball must NOT be stuck on ai_1! Either ai_2 caught it, or a defender intercepted it
    expect(state.ballHolderId).not.toBeNull();
    const carrier = state.pieces.find(p => p.hasBall)!;
    expect(carrier.id).not.toBe('ai_1');
  });

  it('rejects throws to recipients that move more than 1 cell straight or diagonal (> 1.42 distance)', () => {
    let state = createInitialState(9988);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });

    // 1. Stage a 2-step straight move for p_2 from (2,3) to (2,5) - distance 2.0 cells (> 1.42)
    state = gameReducer(state, { type: 'STAGE_MOVE', pieceId: 'p_2', destCell: { col: 2, row: 5 } });
    state = gameReducer(state, { type: 'STAGE_THROW', targetPieceId: 'p_2', targetCell: { col: 2, row: 5 } });
    expect(state.plannedThrow).toBeNull(); // Rejected: moved > 1 cell!

    // 2. Stage a 2-step knight or multi-step move for p_3 from (8,3) to (6,4) - dx=2, dy=1, distance sqrt(5) > 1.42
    state = gameReducer(state, { type: 'STAGE_MOVE', pieceId: 'p_3', destCell: { col: 6, row: 4 } });
    state = gameReducer(state, { type: 'STAGE_THROW', targetPieceId: 'p_3', targetCell: { col: 6, row: 4 } });
    expect(state.plannedThrow).toBeNull(); // Rejected: moved > 1.42 cells!
  });

  it('rejects throws to pieces that moved last turn without rest in previewThrow', () => {
    const state = createInitialState(9977);
    const carrier = state.pieces.find(p => p.id === 'p_1')!;
    const receiver = state.pieces.find(p => p.id === 'p_2')!;
    receiver.movedLastTurn = true; // Flagged as in-motion

    const controlMap = computeControlMap(state.pieces);
    const preview = previewThrow(carrier, receiver.cell, state.pieces, controlMap);
    expect(preview.targetMovedThisTurn).toBe(true);
  });
});
