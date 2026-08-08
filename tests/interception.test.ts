import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { previewThrow, resolveThrow, getThrowPathCells } from '../src/engine/interception';
import { computeControlMap } from '../src/engine/control';
import { SeededRNG } from '../src/engine/rng';
import { areCellsEqual } from '../src/engine/config/board';

describe('Area of Control & Interception (§6 Acceptance Criteria)', () => {
  it('strictly excludes the destination cell from in-flight trajectory to prevent collision with recipient', () => {
    const from = { col: 5, row: 4 }; // Thrower cell
    const to = { col: 2, row: 3 };   // Recipient cell

    const path = getThrowPathCells(from, to);

    // Path must NOT include from (thrower) or to (recipient)
    expect(path.some(c => areCellsEqual(c, from))).toBe(false);
    expect(path.some(c => areCellsEqual(c, to))).toBe(false);

    // Immediate adjacent throws have 0 intermediate flight cells
    const adjacentPath = getThrowPathCells({ col: 5, row: 4 }, { col: 5, row: 5 });
    expect(adjacentPath.length).toBe(0);
  });

  it('refunds clean passes crossing 0 enemy control cells (net-zero energy cost)', () => {
    const state = createInitialState(777);
    const rng = new SeededRNG(777);
    const controlMap = computeControlMap(state.pieces);

    // p_1 is at (2,3), p_3 is at (5,4).
    const thrower = state.pieces.find(p => p.id === 'p_1')!;
    const receiver = state.pieces.find(p => p.id === 'p_3')!;

    const preview = previewThrow(thrower, receiver.cell, state.pieces, controlMap);
    expect(preview.isClean).toBe(true);
    expect(preview.cumulativeCaptureRisk).toBe(0);

    const resolution = resolveThrow(thrower, receiver, state.pieces, controlMap, rng);
    expect(resolution.isClean).toBe(true);
    expect(resolution.refunded).toBe(true);
    expect(resolution.throwEnergyPaid).toBe(0);
    expect(resolution.postThrowEnergy).toBe(thrower.energy);
    expect(resolution.intercepted).toBe(false);
  });

  it('evaluates roulette cell-by-cell on pre-throw energy and never sums probabilities', () => {
    const state = createInitialState(888);
    const controlMap = computeControlMap(state.pieces);

    const thrower = state.pieces.find(p => p.id === 'p_3')!; // at (5,4)
    const targetCell = { col: 5, row: 8 }; // crosses ai_3 at (5,6)

    const preview = previewThrow(thrower, targetCell, state.pieces, controlMap);
    expect(preview.isClean).toBe(false);
    expect(preview.cumulativeCaptureRisk).toBeGreaterThan(0);
    expect(preview.cumulativeCaptureRisk).toBeLessThanOrEqual(1.0);

    // Verify formula: p_cell = (f_effective * E_def) / (f_effective * E_def + E_att) using PRE-THROW energy
    for (const check of preview.pathCells) {
      if (check.enemyControlFactor > 0) {
        const expectedP = (check.effectiveControl * check.nearestEnemyEnergy) /
          (check.effectiveControl * check.nearestEnemyEnergy + preview.preThrowEnergy);
        expect(check.captureProbability).toBeCloseTo(expectedP, 4);
      }
    }
  });

  it('sets p_cell = 1.0 when thrower pre-throw energy is 0 through enemy control', () => {
    const state = createInitialState(999);
    const thrower = state.pieces.find(p => p.id === 'p_3')!;
    const targetCell = { col: 5, row: 8 };
    thrower.energy = 0; // pre-throw energy is 0

    const controlMap = computeControlMap(state.pieces);
    const preview = previewThrow(thrower, targetCell, state.pieces, controlMap);

    expect(preview.preThrowEnergy).toBe(0);
    const enemyControlledCell = preview.pathCells.find(c => c.enemyControlFactor > 0);
    if (enemyControlledCell) {
      expect(enemyControlledCell.captureProbability).toBe(1.0);
    }
  });
});
