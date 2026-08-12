import type { GameState, Side } from '../../types';
import type { MCTSCandidateAction } from '../mcts/mcts';
import { BOARD_CONFIG } from '../../config/board';

/**
 * Maps discrete candidate actions to/from a 64-dimensional discrete policy vocabulary index.
 */
export function encodeCandidateIndex(action: MCTSCandidateAction, state: GameState, actingSide: Side): number {
  if (action.moves.length === 0 && !action.throwTargetPieceId) {
    return 0; // Anchor
  }

  const captainCell = actingSide === 'AI' ? BOARD_CONFIG.aiScoringCell : BOARD_CONFIG.playerScoringCell;
  if (action.throwTargetPieceId && action.moves.length === 0) {
    const targetPiece = state.pieces.find(p => p.id === action.throwTargetPieceId);
    if (targetPiece?.isCaptain) {
      return 1; // Direct Strike to Captain
    }
  }

  // Map primary destination cell (c, r) into indices 2..61
  const targetCell = action.moves[0]?.destCell || (action.throwTargetPieceId ? state.pieces.find(p => p.id === action.throwTargetPieceId)?.cell : captainCell);
  if (targetCell) {
    const rf = actingSide === 'PLAYER' ? 10 - targetCell.row : targetCell.row;
    const cellIdx = (rf % 6) * 10 + (targetCell.col % 10);
    return Math.max(2, Math.min(61, 2 + cellIdx));
  }

  return 62; // Fallback / Emergency
}
