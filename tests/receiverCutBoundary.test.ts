import { describe, it, expect } from 'vitest';
import { isEligibleRecipient } from '../src/engine/interception';
import { createInitialState } from '../src/engine/setup';

describe('Receiver 1-Step Cut Boundary Limit (§8 Invariant)', () => {
  it('allows stationary receivers (0 distance) to catch', () => {
    const state = createInitialState(100);
    const p2 = state.pieces.find(p => p.id === 'p_2')!;
    const check = isEligibleRecipient(p2, []);
    expect(check.eligible).toBe(true);
    expect(check.moveDist).toBe(0);
  });

  it('allows 1 orthogonal step (dist = 1.0 <= 1.42) to catch', () => {
    const state = createInitialState(100);
    const p2 = state.pieces.find(p => p.id === 'p_2')!; // (2,3)
    const staged = [{ pieceId: 'p_2', destCell: { col: 2, row: 4 }, cost: 1.0 }]; // dist = 1.0
    const check = isEligibleRecipient(p2, staged);
    expect(check.eligible).toBe(true);
    expect(check.moveDist).toBeCloseTo(1.0, 3);
  });

  it('allows 1 diagonal step (dist = sqrt(2) approx 1.414 <= 1.42) to catch', () => {
    const state = createInitialState(100);
    const p2 = state.pieces.find(p => p.id === 'p_2')!; // (2,3)
    const staged = [{ pieceId: 'p_2', destCell: { col: 3, row: 4 }, cost: Math.hypot(1, 1) }]; // dist = 1.414
    const check = isEligibleRecipient(p2, staged);
    expect(check.eligible).toBe(true);
    expect(check.moveDist).toBeCloseTo(1.414, 3);
  });

  it('strictly rejects multi-cell movement (dist = 2.0 > 1.42) from catching in same turn', () => {
    const state = createInitialState(100);
    const p2 = state.pieces.find(p => p.id === 'p_2')!; // (2,3)
    const staged = [{ pieceId: 'p_2', destCell: { col: 2, row: 5 }, cost: 2.0 }]; // dist = 2.0
    const check = isEligibleRecipient(p2, staged);
    expect(check.eligible).toBe(false);
    expect(check.moveDist).toBeCloseTo(2.0, 3);
  });

  it('strictly rejects knight-hop or long diagonal movement (dist = sqrt(5) approx 2.236 > 1.42)', () => {
    const state = createInitialState(100);
    const p2 = state.pieces.find(p => p.id === 'p_2')!; // (2,3)
    const staged = [{ pieceId: 'p_2', destCell: { col: 3, row: 5 }, cost: Math.hypot(1, 2) }]; // dist = 2.236
    const check = isEligibleRecipient(p2, staged);
    expect(check.eligible).toBe(false);
    expect(check.moveDist).toBeGreaterThan(1.42);
  });
});
