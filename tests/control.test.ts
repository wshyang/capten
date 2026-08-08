import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { computeControlMap, getControlAt, getNearestEnemyPiece } from '../src/engine/control';

describe('3D Area of Control (AoC) Field Generation (§7)', () => {
  it('computes concentric field layers (1.0 self, 0.5 orthogonal, 0.25 diagonal) with additive stacking', () => {
    const state = createInitialState(101);
    const controlMap = computeControlMap(state.pieces);

    // p_3 is at (5,4)
    expect(getControlAt(controlMap, { col: 5, row: 4 }, 'PLAYER')).toBeGreaterThanOrEqual(1.0);
    expect(getControlAt(controlMap, { col: 5, row: 3 }, 'PLAYER')).toBeGreaterThanOrEqual(0.5);
    expect(getControlAt(controlMap, { col: 4, row: 3 }, 'PLAYER')).toBeGreaterThanOrEqual(0.25);
  });

  it('correctly derives nearest enemy piece in proximity for interception calculations', () => {
    const state = createInitialState(202);
    const nearestAI = getNearestEnemyPiece(state.pieces, { col: 5, row: 5 }, 'AI');
    expect(nearestAI).toBeDefined();
    expect(nearestAI?.id).toBe('ai_1');
  });
});
