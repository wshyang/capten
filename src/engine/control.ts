import type { Cell, Piece, Side, ActiveTemporaryState } from './types';
import { isInsideBoard } from './config/board';

export function computeControlMap(
  pieces: Piece[],
  temporaryState?: ActiveTemporaryState,
  cols = 11,
  rows = 11
): number[][][] {
  const map: number[][][] = Array.from({ length: cols }, () =>
    Array.from({ length: rows }, () => [0, 0])
  );

  const orthoOffsets = [
    { dc: 1, dr: 0 },
    { dc: -1, dr: 0 },
    { dc: 0, dr: 1 },
    { dc: 0, dr: -1 },
  ];

  const diagOffsets = [
    { dc: 1, dr: 1 },
    { dc: 1, dr: -1 },
    { dc: -1, dr: 1 },
    { dc: -1, dr: -1 },
  ];

  // Extended range (2 cells) for zone defense
  const extendedOrthoOffsets = [
    { dc: 2, dr: 0 },
    { dc: -2, dr: 0 },
    { dc: 0, dr: 2 },
    { dc: 0, dr: -2 },
  ];

  const extendedDiagOffsets = [
    { dc: 2, dr: 2 },
    { dc: 2, dr: -2 },
    { dc: -2, dr: 2 },
    { dc: -2, dr: -2 },
  ];

  // Knight moves (2+1 cells) for extended coverage
  const knightOffsets = [
    { dc: 2, dr: 1 }, { dc: 2, dr: -1 },
    { dc: -2, dr: 1 }, { dc: -2, dr: -1 },
    { dc: 1, dr: 2 }, { dc: 1, dr: -2 },
    { dc: -1, dr: 2 }, { dc: -1, dr: -2 },
  ];

  for (const piece of pieces) {
    const sideIdx = piece.side === 'PLAYER' ? 0 : 1;
    const { col, row } = piece.cell;

    let selfFactor = 1.0;
    let orthoFactor = 0.5;
    let diagFactor = 0.25;

    const screenBuff = piece.buffs.find(b => b.type === 'SCREEN');
    if (screenBuff) {
      selfFactor += 0.5;
      orthoFactor += 0.5;
      diagFactor += 0.5;
    }

    const clampBuff = piece.buffs.find(b => b.type === 'CLAMP');
    if (clampBuff) {
      selfFactor *= 0.5;
      orthoFactor *= 0.5;
      diagFactor *= 0.5;
    }

    const fullCourtBuff = piece.buffs.find(b => b.type === 'FULL_COURT_PRESS');
    const overlapBuff = piece.buffs.find(b => b.type === 'OVERLAP');
    if (overlapBuff) {
      selfFactor *= 1.5;
      orthoFactor *= 1.5;
      diagFactor *= 1.5;
    }

    if (isInsideBoard({ col, row }, cols, rows)) {
      map[col][row][sideIdx] += selfFactor;
    }

    for (const { dc, dr } of orthoOffsets) {
      const nc = col + dc;
      const nr = row + dr;
      if (isInsideBoard({ col: nc, row: nr }, cols, rows)) {
        map[nc][nr][sideIdx] += orthoFactor;
      }
    }

    for (const { dc, dr } of diagOffsets) {
      const nc = col + dc;
      const nr = row + dr;
      if (isInsideBoard({ col: nc, row: nr }, cols, rows)) {
        map[nc][nr][sideIdx] += diagFactor;
      }
    }

    // Extended range (2 cells) with reduced control factors
    // This provides zone defense capability without the need for a separate defensive proximity bonus
    const extendedOrthoFactor = orthoFactor * 0.5;  // 0.25 base (half of 1-cell orthogonal)
    const extendedDiagFactor = diagFactor * 0.5;    // 0.125 base (half of 1-cell diagonal)
    const knightFactor = diagFactor * 0.5;          // 0.125 base (same as extended diagonal)

    for (const { dc, dr } of extendedOrthoOffsets) {
      const nc = col + dc;
      const nr = row + dr;
      if (isInsideBoard({ col: nc, row: nr }, cols, rows)) {
        map[nc][nr][sideIdx] += extendedOrthoFactor;
      }
    }

    for (const { dc, dr } of extendedDiagOffsets) {
      const nc = col + dc;
      const nr = row + dr;
      if (isInsideBoard({ col: nc, row: nr }, cols, rows)) {
        map[nc][nr][sideIdx] += extendedDiagFactor;
      }
    }

    for (const { dc, dr } of knightOffsets) {
      const nc = col + dc;
      const nr = row + dr;
      if (isInsideBoard({ col: nc, row: nr }, cols, rows)) {
        map[nc][nr][sideIdx] += knightFactor;
      }
    }

    if (fullCourtBuff) {
      const extendedOffsets = [
        { dc: 2, dr: 0 }, { dc: -2, dr: 0 }, { dc: 0, dr: 2 }, { dc: 0, dr: -2 },
        { dc: 2, dr: 1 }, { dc: 2, dr: -1 }, { dc: -2, dr: 1 }, { dc: -2, dr: -1 },
        { dc: 1, dr: 2 }, { dc: -1, dr: 2 }, { dc: 1, dr: -2 }, { dc: -1, dr: -2 },
      ];
      for (const { dc, dr } of extendedOffsets) {
        const nc = col + dc;
        const nr = row + dr;
        if (isInsideBoard({ col: nc, row: nr }, cols, rows)) {
          map[nc][nr][sideIdx] += 0.25;
        }
      }
    }
  }

  if (temporaryState?.extraControlCell) {
    const { cell, side } = temporaryState.extraControlCell;
    const sIdx = side === 'PLAYER' ? 0 : 1;
    if (isInsideBoard(cell, cols, rows)) {
      map[cell.col][cell.row][sIdx] += 1.0;
    }
  }

  return map;
}

export function getControlAt(
  controlMap: number[][][],
  cell: Cell,
  side: Side
): number {
  const sideIdx = side === 'PLAYER' ? 0 : 1;
  if (!isInsideBoard(cell)) return 0;
  return controlMap[cell.col]?.[cell.row]?.[sideIdx] || 0;
}

export function getNearestEnemyPiece(
  pieces: Piece[],
  cell: Cell,
  enemySide: Side
): Piece | null {
  const enemyPieces = pieces.filter(p => p.side === enemySide);
  if (enemyPieces.length === 0) return null;

  // Filter for enemy pieces that actually project control onto this cell (dist <= 1.42, or with extended buffs)
  const controllingPieces = enemyPieces.filter(piece => {
    const d = Math.hypot(piece.cell.col - cell.col, piece.cell.row - cell.row);
    const hasScreen = piece.buffs.some(b => b.type === 'SCREEN');
    const hasFullCourt = piece.buffs.some(b => b.type === 'FULL_COURT_PRESS');
    const maxReach = hasFullCourt ? 2.83 : hasScreen ? 2.0 : 1.42;
    return d <= maxReach;
  });

  const candidates = controllingPieces.length > 0 ? controllingPieces : enemyPieces;

  let nearest: Piece | null = null;
  let minDist = Infinity;

  for (const piece of candidates) {
    const dist = Math.hypot(piece.cell.col - cell.col, piece.cell.row - cell.row);
    if (dist < minDist) {
      minDist = dist;
      nearest = piece;
    }
  }

  return nearest;
}
