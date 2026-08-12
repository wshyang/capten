import type { Cell, Piece, ActiveTemporaryState } from './types';
import { isInsideBoard, areCellsEqual, BOARD_CONFIG, isInDefenseCircle } from './config/board';

export function getEffectiveMoveCost(
  from: Cell,
  to: Cell,
  piece: Piece,
  temporaryState?: ActiveTemporaryState
): number {
  const baseCost = Math.hypot(to.col - from.col, to.row - from.row);
  let cost = baseCost;

  const slowBurn = piece.buffs.find(b => b.type === 'SLOW_BURN');
  if (slowBurn) {
    cost = Math.max(0.5, cost - 0.5);
  }

  const overclock = piece.buffs.find(b => b.type === 'OVERCLOCK');
  if (overclock) {
    cost = cost * 0.5;
  }

  if (temporaryState?.setThePlayActive?.[piece.side]) {
    cost = Math.max(0.5, cost - 0.8);
  }

  return cost;
}

/**
 * Checks if the straight line between from and to is blocked by any piece.
 * Uses fine-grained continuous ray-sampling across arbitrary Euclidean angles.
 */
export function isPathBlocked(from: Cell, to: Cell, pieces: Piece[]): boolean {
  const dx = to.col - from.col;
  const dy = to.row - from.row;
  const distance = Math.hypot(dx, dy);
  if (distance <= 1.0) return false;

  const steps = Math.max(12, Math.ceil(distance * 10));
  const seen = new Set<string>();
  const fromKey = `${from.col},${from.row}`;
  const toKey = `${to.col},${to.row}`;

  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const curCol = Math.round(from.col + dx * t);
    const curRow = Math.round(from.row + dy * t);
    const key = `${curCol},${curRow}`;

    if (key !== fromKey && key !== toKey && !seen.has(key)) {
      seen.add(key);
      const isOccupied = pieces.some(p => areCellsEqual(p.cell, { col: curCol, row: curRow }));
      if (isOccupied) {
        return true;
      }
    }
  }

  return false;
}

export function isLegalMove(
  piece: Piece,
  destination: Cell,
  pieces: Piece[],
  temporaryState?: ActiveTemporaryState,
  cols = 11,
  rows = 11,
  carrierMayPivotStep = false,
  plannedMoves?: { pieceId: string; destCell: Cell }[]
): { legal: boolean; reason?: string; cost: number } {
  // Destination cannot be staged by another piece in the same turn
  if (plannedMoves && plannedMoves.some(m => m.pieceId !== piece.id && areCellsEqual(m.destCell, destination))) {
    return { legal: false, reason: 'Another piece is already staged to move into this cell.', cost: 0 };
  }

  // PATCH v3.1 §C: A piece holding the ball may NOT move to a different cell ("No running with the ball")
  if (piece.hasBall && !carrierMayPivotStep) {
    return { legal: false, reason: 'Ball-carrier cannot run with the ball. Advance is exclusively via passing.', cost: 0 };
  }

  // PATCH v3.1 §B: The Captain does not move (stationary scoring target on the stool)
  if (piece.isCaptain) {
    return { legal: false, reason: 'The Captain is a stationary target on the stool and does not move.', cost: 0 };
  }

  if (areCellsEqual(piece.cell, destination)) {
    return { legal: false, reason: 'Already on this cell', cost: 0 };
  }

  if (!isInsideBoard(destination, cols, rows)) {
    return { legal: false, reason: 'Cell is outside the court', cost: 0 };
  }

  // Destination cannot be occupied by any piece
  const destOccupied = pieces.some(p => areCellsEqual(p.cell, destination));
  if (destOccupied) {
    return { legal: false, reason: 'Destination cell is occupied by another piece', cost: 0 };
  }

  // Check enemy Captain stool/stand
  const enemyCaptainCell = piece.side === 'PLAYER'
    ? BOARD_CONFIG.aiScoringCell
    : BOARD_CONFIG.playerScoringCell;

  if (areCellsEqual(enemyCaptainCell, destination)) {
    return { legal: false, reason: "Cannot enter opponent's Captain stool/stand.", cost: 0 };
  }

  // Official Captain's Ball Defense Circle & Blocker Rule:
  // - Goal at (5, 10): Player Captain sits here. AI Blocker (ai_blocker) is stationed inside.
  // - Goal at (5, 0): AI Captain sits here. Player Blocker (p_blocker) is stationed inside.
  // - The designated blocker may only move in the cells that are in the opposing captain's zone of control,
  //   and may not move or lunge outside this permitted zone.
  // - Other field runners cannot enter the defense circles.
  const isInsidePlayerGoalCircle = isInDefenseCircle(destination, BOARD_CONFIG.playerScoringCell);
  const isInsideAIGoalCircle = isInDefenseCircle(destination, BOARD_CONFIG.aiScoringCell);

  if (piece.isBlocker) {
    const targetOpposingCaptain = piece.side === 'PLAYER'
      ? BOARD_CONFIG.aiScoringCell
      : BOARD_CONFIG.playerScoringCell;

    if (!isInDefenseCircle(destination, targetOpposingCaptain)) {
      return { legal: false, reason: "The designated Blocker may only move within the defense circle around the opposing Captain.", cost: 0 };
    }
  } else {
    if (piece.side === 'PLAYER') {
      // Player field runners cannot enter either defense circle
      if (isInsideAIGoalCircle && !areCellsEqual(destination, piece.cell)) {
        return { legal: false, reason: "Field runners cannot enter the opponent's defense circle.", cost: 0 };
      }
      if (isInsidePlayerGoalCircle && !areCellsEqual(destination, piece.cell)) {
        return { legal: false, reason: "Attacking field players cannot enter the goal circle around their Captain. Passes must be thrown from the court.", cost: 0 };
      }
    } else {
      // AI field runners cannot enter either defense circle
      if (isInsidePlayerGoalCircle && !areCellsEqual(destination, piece.cell)) {
        return { legal: false, reason: "Field runners cannot enter the opponent's defense circle.", cost: 0 };
      }
      if (isInsideAIGoalCircle && !areCellsEqual(destination, piece.cell)) {
        return { legal: false, reason: "Attacking field players cannot enter the goal circle around their Captain.", cost: 0 };
      }
    }
  }

  // Check Euclidean straight-line ray obstruction
  if (isPathBlocked(piece.cell, destination, pieces)) {
    return { legal: false, reason: 'Straight-line path is blocked by another piece', cost: 0 };
  }

  // Energy budget check via Pythagorean theorem: cost = hypot(dx, dy)
  const cost = getEffectiveMoveCost(piece.cell, destination, piece, temporaryState);
  if (cost > piece.energy + 0.001) {
    return { legal: false, reason: `Insufficient energy (requires ${cost.toFixed(1)}, has ${piece.energy.toFixed(1)})`, cost };
  }

  return { legal: true, cost };
}

/**
 * Returns all reachable empty cells on the 11x11 grid within energy reach (Pythagorean theorem).
 * Not limited to queen directions: any arbitrary straight-line angle is reachable if energy permits!
 */
export function getReachableCells(
  piece: Piece,
  pieces: Piece[],
  temporaryState?: ActiveTemporaryState,
  cols = 11,
  rows = 11,
  carrierMayPivotStep = false,
  plannedMoves?: { pieceId: string; destCell: Cell }[]
): { cell: Cell; cost: number }[] {
  if ((piece.hasBall && !carrierMayPivotStep) || piece.isCaptain) {
    return [];
  }

  const reachable: { cell: Cell; cost: number }[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const dest: Cell = { col: c, row: r };
      if (areCellsEqual(piece.cell, dest)) continue;

      const check = isLegalMove(piece, dest, pieces, temporaryState, cols, rows, carrierMayPivotStep, plannedMoves);
      if (check.legal) {
        reachable.push({ cell: dest, cost: check.cost });
      }
    }
  }

  const targetScoringCell = piece.side === 'AI' ? BOARD_CONFIG.playerScoringCell : BOARD_CONFIG.aiScoringCell;
  reachable.sort((a, b) => {
    if (Math.abs(a.cost - b.cost) > 0.001) return a.cost - b.cost;
    const distA = Math.hypot(a.cell.col - targetScoringCell.col, a.cell.row - targetScoringCell.row);
    const distB = Math.hypot(b.cell.col - targetScoringCell.col, b.cell.row - targetScoringCell.row);
    return distA - distB;
  });
  return reachable;
}
