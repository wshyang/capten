/**
 * Game Balance Variations
 * 
 * This module implements different balance variations to address the issue
 * where "Direct Throw to Captain" is overwhelmingly dominant (26,000x better than alternatives).
 * 
 * Variations:
 * 1. Distance-Based Throw Difficulty - Exponential cost + interception risk
 * 7. Interception Bonus for Defense - Reward defensive positioning
 */

import type { Cell, Piece } from './types';

export interface BalanceConfig {
  // Variation 1: Distance-based difficulty
  useExponentialThrowCost: boolean;
  throwCostExponent: number; // Default: 1.5
  distanceInterceptionFactor: number; // Default: 0.02 (2% per cell)
  
  // Variation 7: Defensive interception bonus
  useDefensiveInterceptionBonus: boolean;
  defensiveProximityThreshold: number; // Default: 2.0 cells
  defensiveBonusPerCell: number; // Default: 0.10 (10% per cell)
  blockerDefensiveBonusMultiplier: number; // Default: 0.5 (50% reduction for blockers)
}

export const BASELINE_CONFIG: BalanceConfig = {
  useExponentialThrowCost: false,
  throwCostExponent: 1.0,
  distanceInterceptionFactor: 0.0,
  useDefensiveInterceptionBonus: false,
  defensiveProximityThreshold: 0.0,
  defensiveBonusPerCell: 0.0,
  blockerDefensiveBonusMultiplier: 1.0,
};

export const BALANCED_CONFIG_V1_V7: BalanceConfig = {
  useExponentialThrowCost: true,
  throwCostExponent: 1.6,  // Slightly increased to further discourage long throws
  distanceInterceptionFactor: 0.025,  // Slightly increased for more risk
  useDefensiveInterceptionBonus: false,  // Removed - redundant with extended AoC
  defensiveProximityThreshold: 0.0,
  defensiveBonusPerCell: 0.0,
  blockerDefensiveBonusMultiplier: 1.0,
};

/**
 * Calculate throw energy cost with optional exponential scaling
 */
export function calculateThrowCost(
  from: Cell,
  to: Cell,
  config: BalanceConfig = BASELINE_CONFIG
): number {
  const distance = Math.hypot(to.col - from.col, to.row - from.row);
  
  if (config.useExponentialThrowCost) {
    // Exponential: (distance^exponent) / 3
    return Math.pow(distance, config.throwCostExponent) / 3;
  } else {
    // Linear: distance / 3 (original)
    return distance / 3;
  }
}

/**
 * Calculate distance-based interception chance
 */
export function calculateDistanceInterceptionChance(
  from: Cell,
  to: Cell,
  config: BalanceConfig = BASELINE_CONFIG
): number {
  if (!config.useExponentialThrowCost) {
    return 0.0; // Only applies with exponential cost
  }
  
  const distance = Math.hypot(to.col - from.col, to.row - from.row);
  return config.distanceInterceptionFactor * distance;
}

/**
 * Get throw path cells for visualization and debugging
 */
export function getThrowPathCells(from: Cell, to: Cell): Cell[] {
  const path: Cell[] = [];
  const distance = Math.hypot(to.col - from.col, to.row - from.row);
  const steps = Math.ceil(distance * 2); // 2 samples per cell
  
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const col = from.col + (to.col - from.col) * t;
    const row = from.row + (to.row - from.row) * t;
    path.push({ col: Math.round(col), row: Math.round(row) });
  }
  
  return path;
}

/**
 * Calculate total interception chance combining all factors
 */
export function calculateTotalInterceptionChance(
  from: Cell,
  to: Cell,
  _defenders: Piece[],
  baseInterceptionChance: number,
  config: BalanceConfig = BASELINE_CONFIG
): number {
  // Start with base chance
  let totalChance = baseInterceptionChance;
  
  // Add distance-based chance
  const distanceChance = calculateDistanceInterceptionChance(from, to, config);
  totalChance += distanceChance;
  
  // Cap at 95% (always allow some chance of success)
  return Math.min(totalChance, 0.95);
}

/**
 * Analyze throw difficulty for debugging
 */
export function analyzeThrowDifficulty(
  from: Cell,
  to: Cell,
  _defenders: Piece[],
  config: BalanceConfig = BASELINE_CONFIG
): {
  distance: number;
  energyCost: number;
  distanceInterception: number;
  totalInterception: number;
  pathCells: Cell[];
} {
  const distance = Math.hypot(to.col - from.col, to.row - from.row);
  const energyCost = calculateThrowCost(from, to, config);
  const distanceInterception = calculateDistanceInterceptionChance(from, to, config);
  const totalInterception = distanceInterception;
  const pathCells = getThrowPathCells(from, to);
  
  return {
    distance,
    energyCost,
    distanceInterception,
    totalInterception,
    pathCells,
  };
}
