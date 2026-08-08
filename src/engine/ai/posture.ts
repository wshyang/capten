import type { GameState, Posture } from '../types';

export function selectAIPosture(state: GameState): Posture {
  const aiPieces = state.pieces.filter(p => p.side === 'AI');
  const aiHasBall = aiPieces.some(p => p.hasBall);
  const playerPieces = state.pieces.filter(p => p.side === 'PLAYER');
  const playerCarrier = playerPieces.find(p => p.hasBall);

  // When AI has possession, aggressively attack and drive pieces into enemy territory!
  if (aiHasBall) {
    return 'ALL_OUT_ATTACK';
  }

  if (playerCarrier) {
    if (playerCarrier.cell.row >= 4) {
      return 'LOCK_DEFENCE';
    }
    if (playerCarrier.energy < 4.0) {
      return 'COLLAPSE_ON_BALL';
    }
    return 'SPREAD_CONTROL';
  }

  return 'BALANCED';
}
