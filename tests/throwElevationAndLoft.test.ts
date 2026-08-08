import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import {
  calculateTotalThrowCost,
  calculateClearRelief,
  calculateEffectiveControl,
  calculateInterceptionProbability,
  calculateCatchProbability,
  THROW_CONFIG,
} from '../src/engine/config/throw';

const FAST_CONFIG = {
  mcts: {
    tier: 'CUSTOM' as const,
    iterations: 50,
    rolloutDepth: 2,
    ismctsSamples: 1,
    explorationConstant: 1.414,
  },
};

describe('Throw Types, Elevation & Pre-Throw Energy Interception (§4, §6, §7)', () => {
  it('calculates total throw energy cost as (distance / 3) + loft surcharge', () => {
    const from = { col: 5, row: 4 };
    const to = { col: 5, row: 10 };
    const dist = 6.0;

    // Flat: distance/3 + 0 = 2.0e
    const costFlat = calculateTotalThrowCost(from, to, 'FLAT', THROW_CONFIG);
    expect(costFlat).toBeCloseTo(dist / 3.0, 3);

    // Lob: distance/3 + 1 = 3.0e
    const costLob = calculateTotalThrowCost(from, to, 'LOB', THROW_CONFIG);
    expect(costLob).toBeCloseTo((dist / 3.0) + THROW_CONFIG.lobCost, 3);

    // High Lob: distance/3 + 2 = 4.0e
    const costHighLob = calculateTotalThrowCost(from, to, 'HIGH_LOB', THROW_CONFIG);
    expect(costHighLob).toBeCloseTo((dist / 3.0) + THROW_CONFIG.highLobCost, 3);
  });

  it('rejects throws where thrower current energy is less than total throw cost', () => {
    let state = createInitialState(111, FAST_CONFIG);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });

    const carrier = state.pieces.find(p => p.hasBall)!;
    carrier.energy = 2.5; // Carrier only has 2.5e

    // High lob to (5, 10) costs 4.0e (6/3 + 2). Carrier with 2.5e cannot afford it!
    state = gameReducer(state, {
      type: 'STAGE_THROW',
      targetPieceId: 'p_captain',
      targetCell: { col: 5, row: 10 },
      throwType: 'HIGH_LOB',
    });
    expect(state.plannedThrow).toBeNull(); // Rejected!

    // Flat throw to (5, 10) costs 2.0e <= 2.5e. Carrier CAN afford it!
    state = gameReducer(state, {
      type: 'STAGE_THROW',
      targetPieceId: 'p_captain',
      targetCell: { col: 5, row: 10 },
      throwType: 'FLAT',
    });
    expect(state.plannedThrow).toBeDefined();
    expect(state.plannedThrow?.throwType).toBe('FLAT');
  });

  it('evaluates interception roulette using PRE-THROW energy (E_att) rather than post-throw', () => {
    const preThrowEnergy = 10.0;
    const postThrowEnergy = 6.0;

    const fEffective = 0.5;
    const defEnergy = 6.0;

    // PRE-THROW probability: (0.5 * 6) / (0.5 * 6 + 10.0) = 3 / 13 = ~0.2308
    const pPreThrow = calculateInterceptionProbability(fEffective, defEnergy, preThrowEnergy);
    expect(pPreThrow).toBeCloseTo(3.0 / (3.0 + 10.0), 4);

    // Old post-throw probability would have been: 3 / (3 + 6.0) = 3/9 = 0.3333
    const pOldPostThrow = calculateInterceptionProbability(fEffective, defEnergy, postThrowEnergy);
    expect(pOldPostThrow).toBeCloseTo(3.0 / 9.0, 4);

    // Assert that PRE-throw energy provides superior ball security invariant (§6)
    expect(pPreThrow).toBeLessThan(pOldPostThrow);
  });

  it('applies CLEAR relief over lower defenders based on loft height L', () => {
    const blockerHeight = 0; // Ground blocker hd = 0

    // Flat (L=0, hd=0) -> relief = 0.0
    const reliefFlat = calculateClearRelief(0, blockerHeight, THROW_CONFIG);
    expect(reliefFlat).toBe(0.0);
    expect(calculateEffectiveControl(1.0, reliefFlat)).toBe(1.0);

    // Lob (L=1, hd=0) -> relief = 0.25
    const reliefLob = calculateClearRelief(1, blockerHeight, THROW_CONFIG);
    expect(reliefLob).toBeCloseTo(0.25, 3);
    expect(calculateEffectiveControl(1.0, reliefLob)).toBeCloseTo(0.75, 3);

    // High Lob (L=2, hd=0) -> relief = 0.50 (Blocker retains 50% effective control!)
    const reliefHighLob = calculateClearRelief(2, blockerHeight, THROW_CONFIG);
    expect(reliefHighLob).toBeCloseTo(0.50, 3);
    expect(calculateEffectiveControl(1.0, reliefHighLob)).toBeCloseTo(0.50, 3);
  });

  it('matches the exact Catch-Reliability Matrix values across all lofts and receiver heights (§7)', () => {
    const groundHeight = 0;
    const captainHeight = 2;

    // 1. Ground Receiver (hr = 0):
    // Flat (L=0) -> 1.00
    expect(calculateCatchProbability(0, groundHeight, THROW_CONFIG)).toBe(1.00);
    // Lob (L=1) -> 0.65
    expect(calculateCatchProbability(1, groundHeight, THROW_CONFIG)).toBeCloseTo(0.65, 3);
    // High Lob (L=2) -> 0.30 (overshoot risk!)
    expect(calculateCatchProbability(2, groundHeight, THROW_CONFIG)).toBeCloseTo(0.30, 3);

    // 2. Captain on Stool (hr = 2):
    // Flat (L=0) -> 0.30 (undershoot risk!)
    expect(calculateCatchProbability(0, captainHeight, THROW_CONFIG)).toBeCloseTo(0.30, 3);
    // Lob (L=1) -> 0.65
    expect(calculateCatchProbability(1, captainHeight, THROW_CONFIG)).toBeCloseTo(0.65, 3);
    // High Lob (L=2) -> 1.00 (perfect catch on stool!)
    expect(calculateCatchProbability(2, captainHeight, THROW_CONFIG)).toBe(1.00);
  });
});
