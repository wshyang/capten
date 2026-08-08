import type { Cell } from '../types';

export const BOARD_CONFIG = {
  cols: 11,
  rows: 11,
  centerCell: { col: 5, row: 5 } as Cell,

  // PATCH v3.1 §B:
  // Player (PLAYER) attacks UP toward row 10. Player's Captain sits on PLAYER_SCORING_CELL (5, 10).
  // AI attacks DOWN toward row 0. AI's Captain sits on AI_SCORING_CELL (5, 0).
  playerScoringCell: { col: 5, row: 10 } as Cell,
  aiScoringCell: { col: 5, row: 0 } as Cell,

  // Start cell coordinates for 7 Player pieces (1 Captain on stool + 5 court players P1..P5 + 1 designated Blocker)
  // Center line player p_1 is stationed at (5, 4); Blocker p_blocker is stationed in AI defense circle at (5, 1)
  playerPiecesStart: [
    { id: 'p_captain', isCaptain: true, isBlocker: false, height: 2, cell: { col: 5, row: 10 } },
    { id: 'p_1', isCaptain: false, isBlocker: false, height: 0, cell: { col: 5, row: 4 } }, // Center line player!
    { id: 'p_2', isCaptain: false, isBlocker: false, height: 0, cell: { col: 2, row: 3 } },
    { id: 'p_3', isCaptain: false, isBlocker: false, height: 0, cell: { col: 8, row: 3 } },
    { id: 'p_4', isCaptain: false, isBlocker: false, height: 0, cell: { col: 8, row: 2 } },
    { id: 'p_5', isCaptain: false, isBlocker: false, height: 0, cell: { col: 2, row: 2 } },
    { id: 'p_blocker', isCaptain: false, isBlocker: true, height: 0, cell: { col: 5, row: 1 } }, // Designated Blocker inside AI Captain circle!
  ],

  // Start cell coordinates for 7 AI pieces (1 Captain on stool + 5 court players A1..A5 + 1 designated Blocker)
  // Center line player ai_1 is stationed at (5, 6); Blocker ai_blocker is stationed in Player defense circle at (5, 9)
  aiPiecesStart: [
    { id: 'ai_captain', isCaptain: true, isBlocker: false, height: 2, cell: { col: 5, row: 0 } },
    { id: 'ai_1', isCaptain: false, isBlocker: false, height: 0, cell: { col: 5, row: 6 } }, // Center line player!
    { id: 'ai_2', isCaptain: false, isBlocker: false, height: 0, cell: { col: 2, row: 7 } },
    { id: 'ai_3', isCaptain: false, isBlocker: false, height: 0, cell: { col: 8, row: 7 } },
    { id: 'ai_4', isCaptain: false, isBlocker: false, height: 0, cell: { col: 2, row: 8 } },
    { id: 'ai_5', isCaptain: false, isBlocker: false, height: 0, cell: { col: 8, row: 8 } },
    { id: 'ai_blocker', isCaptain: false, isBlocker: true, height: 0, cell: { col: 5, row: 9 } }, // Designated Blocker inside Player Captain circle!
  ],

  // Maximum distance a throw recipient may move (1 cell = max hypot(1,1) = 1.415)
  maxRecipientMoveDistance: 1.42,

  // Protected stool cells for Captain scoring targets
  playerScoringProtectedCells: [
    { col: 5, row: 10 },
  ],

  aiScoringProtectedCells: [
    { col: 5, row: 0 },
  ],

  pointsToWin: 3,
  maxTurns: 40,
  holdToScore: true,
  carrierMayPivotStep: false,
  holdingFoulEnforced: true,
};

export function areCellsEqual(a: Cell, b: Cell): boolean {
  return a.col === b.col && a.row === b.row;
}

export function cellDistance(a: Cell, b: Cell): number {
  return Math.hypot(a.col - b.col, a.row - b.row);
}

export function isInsideBoard(cell: Cell, cols = 11, rows = 11): boolean {
  return cell.col >= 0 && cell.col < cols && cell.row >= 0 && cell.row < rows;
}

/**
 * Finds the nearest legal unoccupied cell on the board to targetCell.
 * Ensures the single-occupancy invariant: no two pieces ever occupy the same cell!
 */
export function findNearestUnoccupiedCell(
  targetCell: Cell,
  pieces: { cell: Cell }[],
  preferredFromCell?: Cell,
  cols = 11,
  rows = 11
): Cell {
  // If targetCell is not occupied by any piece, it's immediately valid
  const isOccupied = pieces.some(p => areCellsEqual(p.cell, targetCell));
  if (!isOccupied) {
    return { ...targetCell };
  }

  // If occupied, search neighboring cells within board boundaries
  const candidates: { cell: Cell; distToTarget: number; distToFrom: number }[] = [];

  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dc === 0 && dr === 0) continue;
      const c = targetCell.col + dc;
      const r = targetCell.row + dr;
      if (c >= 0 && c < cols && r >= 0 && r < rows) {
        const candidate: Cell = { col: c, row: r };
        const occupied = pieces.some(p => areCellsEqual(p.cell, candidate));
        if (!occupied) {
          const distToTarget = Math.hypot(dc, dr);
          const distToFrom = preferredFromCell
            ? Math.hypot(c - preferredFromCell.col, r - preferredFromCell.row)
            : distToTarget;
          candidates.push({ cell: candidate, distToTarget, distToFrom });
        }
      }
    }
  }

  if (candidates.length > 0) {
    // Primary: closest to targetCell (the interception/landing point). Secondary: closest to fromCell.
    candidates.sort((a, b) => {
      if (Math.abs(a.distToTarget - b.distToTarget) > 0.01) {
        return a.distToTarget - b.distToTarget;
      }
      return a.distToFrom - b.distToFrom;
    });
    return candidates[0].cell;
  }

  return { ...targetCell };
}

/**
 * Finds the nearest legal unoccupied cell along the goal line (row 0 or row 10).
 * Allows restart throwers to inbound from anywhere along the goal line: (0,0 -> 10,0) or (0,10 -> 10,10).
 */
export function findNearestGoalLineCell(
  targetRow: number,
  preferredCol: number,
  pieces: { cell: Cell }[],
  cols = 11
): Cell {
  const centerCandidate = { col: preferredCol, row: targetRow };
  if (!pieces.some(p => areCellsEqual(p.cell, centerCandidate))) {
    return centerCandidate;
  }

  for (let offset = 1; offset < cols; offset++) {
    const leftCol = preferredCol - offset;
    if (leftCol >= 0) {
      const leftCell = { col: leftCol, row: targetRow };
      if (!pieces.some(p => areCellsEqual(p.cell, leftCell))) {
        return leftCell;
      }
    }
    const rightCol = preferredCol + offset;
    if (rightCol < cols) {
      const rightCell = { col: rightCol, row: targetRow };
      if (!pieces.some(p => areCellsEqual(p.cell, rightCell))) {
        return rightCell;
      }
    }
  }

  return { col: preferredCol, row: targetRow };
}

/**
 * Checks if a cell is within the designated Defense / Goal Circle around a Captain.
 * Defense Circle radius = 1.5 cells around Captain stool (5, 0) or (5, 10).
 * Official Captain's Ball Tournament Rule: Exactly ONE defender (the Blocker) is permitted inside with the Captain.
 */
export function isInDefenseCircle(cell: Cell, targetCaptainCell: Cell, radius = 1.5): boolean {
  return Math.hypot(cell.col - targetCaptainCell.col, cell.row - targetCaptainCell.row) <= radius;
}

/**
 * Finds the nearest legal unoccupied cell strictly within the designated defense circle.
 * Guarantees the blocker never lunges or lands outside its permitted zone!
 */
export function findNearestDefenseCircleCell(
  targetCaptainCell: Cell,
  pieces: { cell: Cell }[],
  preferredFromCell?: Cell,
  radius = 1.5,
  cols = 11,
  rows = 11
): Cell {
  const candidates: { cell: Cell; dist: number }[] = [];

  for (let dr = -Math.ceil(radius); dr <= Math.ceil(radius); dr++) {
    for (let dc = -Math.ceil(radius); dc <= Math.ceil(radius); dc++) {
      const c = targetCaptainCell.col + dc;
      const r = targetCaptainCell.row + dr;
      if (c >= 0 && c < cols && r >= 0 && r < rows) {
        const candidate = { col: c, row: r };
        // Must not be the Captain's stool itself
        if (areCellsEqual(candidate, targetCaptainCell)) continue;
        if (isInDefenseCircle(candidate, targetCaptainCell, radius)) {
          const isOccupied = pieces.some(p => areCellsEqual(p.cell, candidate));
          if (!isOccupied) {
            const dist = preferredFromCell
              ? Math.hypot(c - preferredFromCell.col, r - preferredFromCell.row)
              : Math.hypot(dc, dr);
            candidates.push({ cell: candidate, dist });
          }
        }
      }
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => a.dist - b.dist);
    return candidates[0].cell;
  }

  return preferredFromCell ? { ...preferredFromCell } : { col: targetCaptainCell.col, row: targetCaptainCell.row + (targetCaptainCell.row === 0 ? 1 : -1) };
}

export const MAX_DEFENDERS_IN_CIRCLE = 1;
