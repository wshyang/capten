import type { GameState, Posture, Side } from '../../types';
import { BOARD_CONFIG } from '../../config/board';

export function selectPosture(state: GameState, actingSide: Side = 'AI'): Posture {
  const ourSide: Side = actingSide;
  const enemySide: Side = actingSide === 'AI' ? 'PLAYER' : 'AI';

  const ourPieces = state.pieces.filter(p => p.side === ourSide);
  const enemyPieces = state.pieces.filter(p => p.side === enemySide);

  const ourHasBall = ourPieces.some(p => p.hasBall);
  const enemyCarrier = enemyPieces.find(p => p.hasBall);

  // When we have possession, aggressively attack and drive pieces into enemy territory!
  if (ourHasBall) {
    return 'ALL_OUT_ATTACK';
  }

  if (enemyCarrier) {
    // Determine if enemy is deep in our half (distance to our captain) — symmetric threshold
    const ourScoringCell = actingSide === 'AI' ? BOARD_CONFIG.aiScoringCell : BOARD_CONFIG.playerScoringCell;
    const distToOurCaptain = Math.hypot(
      enemyCarrier.cell.col - ourScoringCell.col,
      enemyCarrier.cell.row - ourScoringCell.row
    );
    // Symmetric: within 6 cells of our captain is "deep" — covers both sides (row >=4 for AI case ≈ dist <=6)
    if (distToOurCaptain <= 6) {
      return 'LOCK_DEFENCE';
    }
    if (enemyCarrier.energy < 4.0) {
      return 'COLLAPSE_ON_BALL';
    }
    return 'SPREAD_CONTROL';
  }

  return 'BALANCED';
}

// Backwards compatibility alias
export function selectAIPosture(state: GameState, actingSide: Side = 'AI'): Posture {
  return selectPosture(state, actingSide);
}
