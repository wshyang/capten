import type { Cell, Side } from '../types';
import { BOARD_CONFIG } from '../config/board';

/**
 * Returns the scoring cell (captain stool) for the acting side.
 * AI scores at (5,0) top, PLAYER scores at (5,10) bottom.
 */
export function getOurScoringCell(actingSide: Side): Cell {
  return actingSide === 'AI' ? BOARD_CONFIG.aiScoringCell : BOARD_CONFIG.playerScoringCell;
}

export function getEnemyScoringCell(actingSide: Side): Cell {
  return actingSide === 'AI' ? BOARD_CONFIG.playerScoringCell : BOARD_CONFIG.aiScoringCell;
}

export function getOurInitialPositions(actingSide: Side) {
  return actingSide === 'AI' ? BOARD_CONFIG.aiPiecesStart : BOARD_CONFIG.playerPiecesStart;
}

/**
 * Whether a cell is in the attacking half (enemy territory) for the acting side.
 * AI attacks toward row 0, so enemy half is rows 0-4. PLAYER attacks toward row 10, so enemy half is rows 6-10.
 */
export function isInAttackingHalf(cell: Cell, actingSide: Side): boolean {
  return actingSide === 'AI' ? cell.row <= 4 : cell.row >= 6;
}

/**
 * Pocket value based on distance to our scoring cell — symmetric.
 * Sweet spot is dist 2-3, then 1/4, then 0, then 5.
 */
export function pocketValue(cell: Cell, actingSide: Side): number {
  const scoring = getOurScoringCell(actingSide);
  const dist = Math.abs(cell.row - scoring.row);
  if (dist === 2 || dist === 3) return 50;
  if (dist === 1 || dist === 4) return 38;
  if (dist === 0) return 28;
  if (dist === 5) return 15;
  // Fallback: negative distance to scoring cell (closer is better)
  return -Math.hypot(cell.col - scoring.col, cell.row - scoring.row);
}

/**
 * Compute step toward our scoring cell for rollout / movement simulation.
 * Returns delta row direction: -1 for AI (toward 0), +1 for PLAYER (toward 10).
 */
export function attackDirection(actingSide: Side): number {
  return actingSide === 'AI' ? -1 : 1;
}

/**
 * Check if a cell is within a threshold distance of our scoring cell.
 */
export function isAdvanced(cell: Cell, actingSide: Side, threshold = 5): boolean {
  const scoring = getOurScoringCell(actingSide);
  return Math.hypot(cell.col - scoring.col, cell.row - scoring.row) <= threshold;
}
