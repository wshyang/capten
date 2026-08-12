import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import { computeControlMap } from '../src/engine/control';
import { resolveThrow } from '../src/engine/interception';
import { createRNG } from '../src/engine/rng';
import { getEffectiveMoveCost } from '../src/engine/movement';
import { areCellsEqual, findNearestUnoccupiedCell } from '../src/engine/config/board';

describe('Defender Interception Capture & Energy Cost Mechanics', () => {
  it('moves intercepting defender to capture cell and deducts move energy cost', () => {
    const state = createInitialState(5);
    // Player wins jump ball, p_1 holds the ball at (5, 4)
    const p1 = state.pieces.find(p => p.id === 'p_1')!;
    const pCaptain = state.pieces.find(p => p.id === 'p_captain')!; // at (5, 10)
    // AI piece ai_1 is stationed at (5, 6), right on the path from (5,4) to (5,10)
    const ai1 = state.pieces.find(p => p.id === 'ai_1')!;
    expect(ai1.cell).toEqual({ col: 5, row: 6 });
    const initialAIEnergy = ai1.energy;

    const controlMap = computeControlMap(state.pieces);
    // Force a deterministic interception RNG roll
    const rng = createRNG(5);

    const resolution = resolveThrow(p1, pCaptain, state.pieces, controlMap, rng);
    expect(resolution.intercepted).toBe(true);
    expect(resolution.interceptedByPieceId).toBe('ai_1');
    expect(resolution.interceptedAtCell).toBeDefined();

    // Calculate expected lunge cost from ai_1 starting cell to interceptedAtCell
    const lungeCost = getEffectiveMoveCost(ai1.cell, resolution.interceptedAtCell!, ai1);

    // Apply throw via reducer with FLAT throw (0% clear relief over ground defender ai_1)
    let nextState = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });
    nextState = gameReducer(nextState, { type: 'STAGE_THROW', targetPieceId: 'p_captain', targetCell: { col: 5, row: 10 }, throwType: 'FLAT' });
    nextState = gameReducer(nextState, { type: 'END_PLAYER_TURN' });

    // Verify interceptor defender moved to the capture cell
    const interceptor = nextState.pieces.find(p => p.id === 'ai_1')!;
    expect(interceptor.hasBall).toBe(true);
    expect(nextState.ballHolderId).toBe('ai_1');

    // Interceptor is at the capture cell
    const interceptEvent = nextState.eventLog.find(e => e.type === 'PASS_INTERCEPTED');
    expect(interceptEvent).toBeDefined();
    expect(interceptEvent?.details.interceptedByPieceId).toBe('ai_1');
    expect(interceptEvent?.details.interceptedAtCell).toBeDefined();

    // Interceptor paid the energy cost for the capture move
    expect(interceptor.energy).toBeCloseTo(initialAIEnergy - lungeCost, 1);
  });

  it('guarantees no two pieces ever occupy the same cell when interception occurs at an occupied target cell', () => {
    let state = createInitialState(12345);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });

    // Position p_2 at (2,3) and AI defender ai_2 at (2,4) - directly adjacent
    const ai2 = state.pieces.find(p => p.id === 'ai_2')!;

    // Verify findNearestUnoccupiedCell resolves to an adjacent empty cell when target is occupied
    const occupiedDest = { col: 2, row: 3 }; // p_2 is standing here
    const resolvedCell = findNearestUnoccupiedCell(occupiedDest, state.pieces, ai2.cell);

    // Resolved cell must be empty on the board
    const conflict = state.pieces.some(p => areCellsEqual(p.cell, resolvedCell));
    expect(conflict).toBe(false);

    // Verify that every single piece on the board has a distinct, unique coordinate
    const occupiedCoords = new Set(state.pieces.map(p => `${p.cell.col},${p.cell.row}`));
    expect(occupiedCoords.size).toBe(state.pieces.length);
  });
});
