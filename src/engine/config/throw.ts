import type { Cell } from '../types';

export type ThrowType = 'FLAT' | 'LOB' | 'HIGH_LOB';

export interface ThrowConfig {
  captainHeight: number;
  blockerHeight: number;
  runnerHeight: number;
  lobCost: number;
  highLobCost: number;
  clearPerTier: number;
  maxRelief: number;
  catchPen: number;
  catchFloor: number;
  interceptEnergy: 'preThrow';
  overshootBallEnergy: 'preThrow';
  undershootPerTier: number;
  contestFactor: number;
  contestInclusive: boolean;
  throwinDrawNearest: boolean;
}

export const THROW_CONFIG: ThrowConfig = {
  captainHeight: 2,
  blockerHeight: 0,
  runnerHeight: 0,
  lobCost: 1.0,           // Extra energy surcharge for Lob (L=1)
  highLobCost: 2.0,      // Extra energy surcharge for High Lob (L=2)
  clearPerTier: 0.25,     // Interception relief per height tier cleared (25% per tier)
  maxRelief: 0.50,        // Maximum clear relief cap (50% max relief; blocker retains 50% control)
  catchPen: 0.35,        // Catch reliability penalty per tier of mismatch
  catchFloor: 0.15,      // Minimum catch reliability floor (15%)
  interceptEnergy: 'preThrow',
  overshootBallEnergy: 'preThrow',
  undershootPerTier: 1,  // Cells short per tier of undershoot
  contestFactor: 0.20,   // Undershoot race: opponent contests if within +20% distance
  contestInclusive: true,
  throwinDrawNearest: true,
};

export const LOFT_BY_TYPE: Record<ThrowType, number> = {
  FLAT: 0,
  LOB: 1,
  HIGH_LOB: 2,
};

/**
 * Returns the extra energy surcharge for a given throw type.
 */
export function getLoftSurcharge(type: ThrowType, config: ThrowConfig = THROW_CONFIG): number {
  switch (type) {
    case 'FLAT':
      return 0.0;
    case 'LOB':
      return config.lobCost;
    case 'HIGH_LOB':
      return config.highLobCost;
    default:
      return 0.0;
  }
}

/**
 * Calculates total throw energy cost: (distance / 3.0) + loft surcharge.
 */
export function calculateTotalThrowCost(
  from: Cell,
  to: Cell,
  type: ThrowType = 'FLAT',
  config: ThrowConfig = THROW_CONFIG,
  divisor = 3.0
): number {
  const dist = Math.hypot(to.col - from.col, to.row - from.row);
  const baseCost = dist / divisor;
  const surcharge = getLoftSurcharge(type, config);
  return baseCost + surcharge;
}

/**
 * CLEAR / loft relief: A higher ball flies over lower defenders.
 * relief(L, hd) = clamp(CLEAR_PER_TIER * (L - hd), 0, MAX_RELIEF)
 */
export function calculateClearRelief(
  loft: number,
  defenderHeight: number,
  config: ThrowConfig = THROW_CONFIG
): number {
  const heightDiff = loft - defenderHeight;
  if (heightDiff <= 0) return 0.0;
  const raw = config.clearPerTier * heightDiff;
  return Math.min(config.maxRelief, Math.max(0.0, raw));
}

/**
 * Effective control factor after CLEAR relief.
 * f_effective = f * (1 - relief)
 */
export function calculateEffectiveControl(f: number, relief: number): number {
  return f * (1.0 - relief);
}

/**
 * Interception probability using PRE-THROW energy (E_att).
 * p_cell = (f_effective * E_def) / (f_effective * E_def + E_att)
 */
export function calculateInterceptionProbability(
  fEffective: number,
  defEnergy: number,
  preThrowEnergy: number
): number {
  if (fEffective <= 0 || defEnergy <= 0) return 0.0;
  if (preThrowEnergy <= 0) return 1.0;
  const numerator = fEffective * defEnergy;
  const denominator = numerator + preThrowEnergy;
  if (denominator <= 0) return 1.0;
  const p = numerator / denominator;
  return Math.min(1.0, Math.max(0.0, p));
}

/**
 * Reception CATCH reliability:
 * catch(L, hr) = clamp(1 - CATCH_PEN * |L - hr|, CATCH_FLOOR, 1.0)
 */
export function calculateCatchProbability(
  loft: number,
  receiverHeight: number,
  config: ThrowConfig = THROW_CONFIG
): number {
  const mismatch = Math.abs(loft - receiverHeight);
  const raw = 1.0 - config.catchPen * mismatch;
  return Math.min(1.0, Math.max(config.catchFloor, Number(raw.toFixed(4))));
}
