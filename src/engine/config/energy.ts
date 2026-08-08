import type { Cell } from '../types';

export const ENERGY_CONFIG = {
  startEnergy: 10.0,
  maxEnergy: 10.0,
  moveCostPerCell: 1.0,
  throwCostDivisor: 3.0,
  baseRegenMoved: 1.0,
  compoundingRegen: (streak: number) => 1.0 + streak,
  swingEnergyCost: 3.0,
};

export function calculateMoveCost(from: Cell, to: Cell): number {
  return Math.hypot(to.col - from.col, to.row - from.row);
}

export function calculateThrowCost(from: Cell, to: Cell, divisor = ENERGY_CONFIG.throwCostDivisor): number {
  const dist = Math.hypot(to.col - from.col, to.row - from.row);
  return dist / divisor;
}
