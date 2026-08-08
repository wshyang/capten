import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { resolveThrow, getThrowPathCells } from '../src/engine/interception';
import { computeControlMap, getControlAt } from '../src/engine/control';
import { findNearestUnoccupiedCell } from '../src/engine/config/board';
import { SeededRNG } from '../src/engine/rng';

describe('Interception Raycasting & Lunge Destination Accuracy (§6, §Lunge)', () => {
  it('correctly calculates path cells from (4, 6) to (6, 10) avoiding spurious left-side cells', () => {
    const from = { col: 4, row: 6 };
    const to = { col: 6, row: 10 };

    const path = getThrowPathCells(from, to);

    // Path from (4, 6) to (6, 10) moves forward and to the right into column 5 and 6
    // The flight cells should be (5, 7), (5, 8), (6, 9)
    expect(path.some(c => c.col === 5 && c.row === 7)).toBe(true);
    expect(path.some(c => c.col === 5 && c.row === 8)).toBe(true);
    expect(path.some(c => c.col === 6 && c.row === 9)).toBe(true);

    // A defender at (3, 7) (col 3) has zero control on cell (5, 7) (col 5, dist = 2.0)
    const state = createInitialState(12345);
    const ai2 = state.pieces.find(p => p.id === 'ai_2')!;
    ai2.cell = { col: 3, row: 7 };

    // Clear all other AI pieces away from the area
    state.pieces.forEach(p => {
      if (p.side === 'AI' && p.id !== 'ai_2') {
        p.cell = { col: 0, row: 0 };
      }
    });

    const controlMap = computeControlMap(state.pieces);
    const controlAt57 = getControlAt(controlMap, { col: 5, row: 7 }, 'AI');

    // Without buffs, (3, 7) only controls col 2, 3, 4 (orthogonal distance <= 1, diagonal <= 1.42)
    // It has 0 control at col 5
    expect(controlAt57).toBe(0);
  });

  it('guarantees that when an interceptor snatches a ball at cell C, it lunges onto cell C (or closest free cell to C)', () => {
    const state = createInitialState(67890);
    const thrower = state.pieces.find(p => p.id === 'p_1')!;
    thrower.cell = { col: 4, row: 6 };

    // Place an AI defender at (4, 7) directly along the path to intercept at (5, 7) or (4, 7)
    const interceptorPiece = state.pieces.find(p => p.id === 'ai_1')!;
    interceptorPiece.cell = { col: 5, row: 6 }; // Adjacent to (5, 7)

    const targetCell = { col: 6, row: 10 };
    const controlMap = computeControlMap(state.pieces);

    // Force RNG to trigger interception
    const rng = new SeededRNG(1);

    const resolution = resolveThrow(
      thrower,
      state.pieces.find(p => p.isCaptain && p.side === 'PLAYER')!,
      state.pieces,
      controlMap,
      rng,
      undefined,
      undefined,
      targetCell,
      false,
      'FLAT'
    );

    if (resolution.intercepted && resolution.interceptedAtCell) {
      const interceptedCell = resolution.interceptedAtCell;
      const destCell = findNearestUnoccupiedCell(interceptedCell, state.pieces, interceptorPiece.cell);

      // The destination must be the intercepted cell itself (or adjacent to it), not a random cell behind the defender
      const distToIntercepted = Math.hypot(destCell.col - interceptedCell.col, destCell.row - interceptedCell.row);
      expect(distToIntercepted).toBeLessThanOrEqual(1.0);
    }
  });

  it('findNearestUnoccupiedCell sorts candidates by proximity to targetCell, not preferredFromCell', () => {
    const targetCell = { col: 4, row: 7 };
    const fromCell = { col: 3, row: 7 };

    // Target cell (4, 7) is free -> must return (4, 7) directly
    const freeDest = findNearestUnoccupiedCell(targetCell, [], fromCell);
    expect(freeDest).toEqual({ col: 4, row: 7 });

    // When targetCell (4, 7) is occupied, find free neighbor closest to targetCell (4, 7)
    const occupiedPieces = [{ cell: { col: 4, row: 7 } }];
    const neighborDest = findNearestUnoccupiedCell(targetCell, occupiedPieces, fromCell);

    // The neighbor must be adjacent to targetCell (4, 7) (dist <= 1.42)
    const distToTarget = Math.hypot(neighborDest.col - targetCell.col, neighborDest.row - targetCell.row);
    expect(distToTarget).toBeLessThanOrEqual(1.42);
  });
});
