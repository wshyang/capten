import type { GameState, Side, Cell, ThrowType } from '../types';
import { BOARD_CONFIG } from '../config/board';

/**
 * Resolves the effective throw action details (thrower, target piece, target destination cell, and loft type)
 * for a candidate action across MCTS, NN, or Epsilon-Greedy AI engines.
 */
export function resolveCandidateThrowAction(
  action: {
    moves: { pieceId: string; destCell: Cell; cost: number }[];
    throwTargetPieceId?: string;
  },
  state: GameState,
  actingSide: Side
): { throwerId: string; targetPieceId: string; targetCell: Cell; throwType?: ThrowType } | undefined {
  if (!action.throwTargetPieceId) return undefined;
  const sidePieces = state.pieces.filter(p => p.side === actingSide);
  const carrier = sidePieces.find(p => p.hasBall);
  const targetPiece = sidePieces.find(p => p.id === action.throwTargetPieceId);
  const staged = action.moves.find(m => m.pieceId === action.throwTargetPieceId);
  const defaultCell = actingSide === 'AI' ? BOARD_CONFIG.aiScoringCell : BOARD_CONFIG.playerScoringCell;
  const effectiveCell = staged ? staged.destCell : (targetPiece ? targetPiece.cell : defaultCell);

  if (carrier && targetPiece) {
    return {
      throwerId: carrier.id,
      targetPieceId: targetPiece.id,
      targetCell: effectiveCell,
      throwType: targetPiece.isCaptain ? 'HIGH_LOB' : 'FLAT',
    };
  }
  return undefined;
}

/**
 * Formats a clean human-readable bestActionDescription string for telemetry and UI display
 * across MCTS, NN, or Epsilon-Greedy AI engines.
 */
export function formatActionDescription(
  action: {
    moves: { pieceId: string }[];
    throwTargetPieceId?: string;
    description?: string;
  },
  throwAction?: { targetPieceId: string },
  suffix = ''
): string {
  const fmtId = (id: string) => id.replace('ai_', 'A.').replace('p_', 'P.');
  const s = suffix ? ` (${suffix})` : '';
  if (throwAction && action.moves.length > 0) {
    return `Cut (${action.moves.map(m => fmtId(m.pieceId)).join(', ')}) & Pass to ${fmtId(throwAction.targetPieceId)}${s}`;
  }
  if (throwAction) {
    return `Direct Pass to ${fmtId(throwAction.targetPieceId)}${s}`;
  }
  if (action.moves.length > 0) {
    return `Formation Cut: ${action.moves.map(m => fmtId(m.pieceId)).join(', ')}${s}`;
  }
  return `Hold Position & Anchor${s}`;
}
