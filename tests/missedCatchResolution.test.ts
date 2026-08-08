import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { resolveThrow, resolveMissedCatch } from '../src/engine/interception';
import { computeControlMap } from '../src/engine/control';
import { SeededRNG } from '../src/engine/rng';

describe('Missed-Catch Resolution Engine (§8: Overshoot, Undershoot & Fumble)', () => {
  it('resolves Overshoot (m > 0): ball continues on trajectory and is grabbed or goes out of bounds', () => {
    const state = createInitialState(9988);
    const controlMap = computeControlMap(state.pieces);

    // Thrower p_1 at (5, 4), throws High Lob (L=2) to ground receiver p_2 at (2, 3) (hr=0) -> mismatch m = +2 (OVERSHOOT)
    const thrower = state.pieces.find(p => p.id === 'p_1')!;
    const receiver = state.pieces.find(p => p.id === 'p_2')!;
    receiver.height = 0;

    // Force RNG to fail catch roll (> 0.30)
    const rng = new SeededRNG(1);

    const resolution = resolveThrow(
      thrower,
      receiver,
      state.pieces,
      controlMap,
      rng,
      undefined,
      undefined,
      receiver.cell,
      false,
      'HIGH_LOB'
    );

    expect(resolution.loft).toBe(2);
    expect(resolution.catcherHeight).toBe(0);
    // When catch fails on overshoot, missedCatchType must be OVERSHOOT or OUT_OF_BOUNDS
    expect(resolution.catchSuccess).toBe(false);
    expect(resolution.missedCatchType).toBe('OVERSHOOT');
    expect(resolution.ballRestCell).toBeDefined();
    expect(resolution.ballHolderId).toBeDefined();
  });

  it('resolves Undershoot (m < 0): ball lands short and triggers contest race with loser bump', () => {
    const state = createInitialState(5544);

    // Thrower p_1 at (5, 4), throws Flat (L=0) to elevated Captain p_captain at (5, 10) (hr=2) -> mismatch m = -2 (UNDERSHOOT)
    const thrower = state.pieces.find(p => p.id === 'p_1')!;
    const receiver = state.pieces.find(p => p.id === 'p_captain')!;
    expect(receiver.height).toBe(2);

    // Move AI pieces away so pass is clean in flight
    const ai1 = state.pieces.find(p => p.id === 'ai_1')!;
    ai1.cell = { col: 1, row: 6 };
    const aiBlocker = state.pieces.find(p => p.id === 'ai_blocker')!;
    aiBlocker.cell = { col: 1, row: 9 };
    const controlMap = computeControlMap(state.pieces);

    // Force RNG roll to fail catch roll (> 0.30)
    const rng = new SeededRNG(44);

    const resolution = resolveThrow(
      thrower,
      receiver,
      state.pieces,
      controlMap,
      rng,
      undefined,
      undefined,
      receiver.cell,
      false,
      'FLAT'
    );

    expect(resolution.loft).toBe(0);
    expect(resolution.catcherHeight).toBe(2);
    expect(resolution.catchSuccess).toBe(false);
    expect(resolution.missedCatchType).toBe('UNDERSHOOT');

    // Ball landed short (|m| = 2 cells short along throw line)
    expect(resolution.ballRestCell).toBeDefined();
    expect(resolution.ballRestCell?.row).toBeLessThan(10);
    expect(resolution.ballHolderId).toBeDefined();
  });

  it('resolves Fumble (m = 0): matched-height catch failure drops in place on receiver cell as loose ball', () => {
    const state = createInitialState(3322);
    const controlMap = computeControlMap(state.pieces);

    // High Lob (L=2) to Captain (hr=2), mismatch m = 0
    const thrower = state.pieces.find(p => p.id === 'p_1')!;
    const receiver = state.pieces.find(p => p.id === 'p_captain')!;
    expect(receiver.height).toBe(2);

    const mockRng = new SeededRNG(1);

    // Directly test resolveMissedCatch with mismatch = 0 (Fumble in place)
    const missed = resolveMissedCatch(
      thrower,
      receiver,
      'HIGH_LOB',
      receiver.cell,
      state.pieces,
      controlMap,
      mockRng,
      0, // m = 0
      thrower.energy
    );

    expect(missed.type).toBe('FUMBLE');
    expect(missed.landingCell).toEqual(receiver.cell);

    // Also verify that a successful High Lob to Captain (catchRate = 1.00) completes and scores
    // Move defenders away so throw is clean
    const ai1 = state.pieces.find(p => p.id === 'ai_1')!;
    ai1.cell = { col: 1, row: 6 };
    const aiBlocker = state.pieces.find(p => p.id === 'ai_blocker')!;
    aiBlocker.cell = { col: 1, row: 9 };
    const cleanControl = computeControlMap(state.pieces);

    const resolution = resolveThrow(
      thrower,
      receiver,
      state.pieces,
      cleanControl,
      mockRng,
      undefined,
      undefined,
      receiver.cell,
      false,
      'HIGH_LOB'
    );

    expect(resolution.catchSuccess).toBe(true);
    expect(resolution.scored).toBe(true);
  });
});
