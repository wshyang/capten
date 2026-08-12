import type { GameState, Side } from '../../types';
import { BOARD_CONFIG, areCellsEqual } from '../../config/board';

/**
 * Full-State 32-Channel Spatial Feature Encoder for CNN ($11 \times 11 \times 32$ Tensor)
 * Canonicalizes board orientation so Row 0 is ALWAYS the enemy Captain's goal line
 * and Row 10 is ALWAYS our home goal line (by flipping row coordinates when actingSide === 'PLAYER').
 *
 * Channels:
 *  0..11: Spatial base (Pieces, Captains, Ball, Blocker, Energy, AoC maps, Score Diff)
 * 12..19: Piece physical & status attributes (Rest streak, movedLastTurn, OVERCLOCK, STEADY_HANDS, SCREEN, CLAMP)
 * 20..31: Global Momentum economy, 3-card hand features, active enchantments, match clock
 */
export function encodeStateTensor(state: GameState, actingSide: Side = 'AI', numChannels = 32): Float32Array {
  const cols = 11;
  const rows = 11;
  const channels = numChannels;
  const tensor = new Float32Array(cols * rows * channels);

  const enemySide: Side = actingSide === 'AI' ? 'PLAYER' : 'AI';
  const flipRow = (r: number) => (actingSide === 'PLAYER' ? 10 - r : r);

  const ourPieces = state.pieces.filter(p => p.side === actingSide);
  const enemyPieces = state.pieces.filter(p => p.side === enemySide);

  const ourCaptainCell = actingSide === 'AI' ? BOARD_CONFIG.aiScoringCell : BOARD_CONFIG.playerScoringCell;
  const enemyCaptainCell = actingSide === 'AI' ? BOARD_CONFIG.playerScoringCell : BOARD_CONFIG.aiScoringCell;

  const getIdx = (c: number, r: number, ch: number) => {
    const rf = flipRow(r);
    return (rf * cols + c) * channels + ch;
  };

  const ourMomentumNorm = Math.min(1.0, (state.momentum[actingSide] || 0) / 10.0);
  const enemyMomentumNorm = Math.min(1.0, (state.momentum[enemySide] || 0) / 10.0);

  const ourHand = state.hands[actingSide] || [];
  const handCard1Norm = ourHand[0] ? Math.min(1.0, ourHand[0].momentumCost / 3.0) : 0;
  const handCard2Norm = ourHand[1] ? Math.min(1.0, ourHand[1].momentumCost / 3.0) : 0;
  const handCard3Norm = ourHand[2] ? Math.min(1.0, ourHand[2].momentumCost / 3.0) : 0;

  const isRestartNorm = state.isRestartPhase?.[actingSide] ? 1.0 : 0.0;
  const threadedNorm = state.temporaryState?.threadedPassActive?.[actingSide] ? 1.0 : 0.0;
  const insuranceNorm = state.temporaryState?.insuranceActive?.[actingSide] ? 1.0 : 0.0;
  const longBombNorm = state.temporaryState?.longBombActive?.[actingSide] ? 1.0 : 0.0;
  const noLookNorm = state.temporaryState?.noLookPassActive?.[actingSide] ? 1.0 : 0.0;

  const turnNorm = Math.min(1.0, (state.turn || 1) / (state.config.board?.maxTurns || 40));
  const discardDiffNorm = Math.max(
    -1.0,
    Math.min(1.0, ((state.discardPiles[actingSide]?.length || 0) - (state.discardPiles[enemySide]?.length || 0)) / 20.0)
  );
  const scoreDiff = (state.score[actingSide] - state.score[enemySide]) / 3.0;
  const scoreDiffNorm = Math.max(-1.0, Math.min(1.0, scoreDiff));

  const ourSideIdx = actingSide === 'PLAYER' ? 0 : 1;
  const enemySideIdx = actingSide === 'PLAYER' ? 1 : 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Channel 2: Our Captain
      if (areCellsEqual({ col: c, row: r }, ourCaptainCell)) {
        tensor[getIdx(c, r, 2)] = 1.0;
      }
      // Channel 3: Enemy Captain
      if (areCellsEqual({ col: c, row: r }, enemyCaptainCell)) {
        tensor[getIdx(c, r, 3)] = 1.0;
      }

      // Channel 9 & 10: Watercolor AoC control maps
      tensor[getIdx(c, r, 9)] = Math.min(1.0, (state.controlMap[c]?.[r]?.[ourSideIdx] || 0) / 2.0);
      tensor[getIdx(c, r, 10)] = Math.min(1.0, (state.controlMap[c]?.[r]?.[enemySideIdx] || 0) / 2.0);

      // Channel 11: Score difference broadcast
      tensor[getIdx(c, r, 11)] = scoreDiffNorm;

      // Channel 20..31: Global economy, hand & enchantment broadcast planes
      tensor[getIdx(c, r, 20)] = ourMomentumNorm;
      tensor[getIdx(c, r, 21)] = enemyMomentumNorm;
      tensor[getIdx(c, r, 22)] = handCard1Norm;
      tensor[getIdx(c, r, 23)] = handCard2Norm;
      tensor[getIdx(c, r, 24)] = handCard3Norm;
      tensor[getIdx(c, r, 25)] = isRestartNorm;
      tensor[getIdx(c, r, 26)] = threadedNorm;
      tensor[getIdx(c, r, 27)] = insuranceNorm;
      tensor[getIdx(c, r, 28)] = longBombNorm;
      tensor[getIdx(c, r, 29)] = noLookNorm;
      tensor[getIdx(c, r, 30)] = turnNorm;
      tensor[getIdx(c, r, 31)] = discardDiffNorm;
    }
  }

  // Populate friendly piece features (0, 4, 5, 7, 12, 14, 16, 17, 18)
  for (const p of ourPieces) {
    const { col, row } = p.cell;
    if (col >= 0 && col < cols && row >= 0 && row < rows) {
      tensor[getIdx(col, row, 0)] = 1.0;
      tensor[getIdx(col, row, 7)] = Math.min(1.0, p.energy / 10.0);
      tensor[getIdx(col, row, 12)] = Math.min(1.0, p.restStreak / 5.0);
      tensor[getIdx(col, row, 14)] = p.movedLastTurn ? 1.0 : 0.0;

      if (p.hasBall) tensor[getIdx(col, row, 4)] = 1.0;
      if (p.isBlocker) tensor[getIdx(col, row, 5)] = 1.0;

      if (p.buffs.some(b => b.type === 'OVERCLOCK')) tensor[getIdx(col, row, 16)] = 1.0;
      if (p.buffs.some(b => b.type === 'STEADY_HANDS')) tensor[getIdx(col, row, 17)] = 1.0;
      if (p.buffs.some(b => b.type === 'SCREEN')) tensor[getIdx(col, row, 18)] = 1.0;
    }
  }

  // Populate enemy piece features (1, 4, 6, 8, 13, 15, 19)
  for (const p of enemyPieces) {
    const { col, row } = p.cell;
    if (col >= 0 && col < cols && row >= 0 && row < rows) {
      tensor[getIdx(col, row, 1)] = 1.0;
      tensor[getIdx(col, row, 8)] = Math.min(1.0, p.energy / 10.0);
      tensor[getIdx(col, row, 13)] = Math.min(1.0, p.restStreak / 5.0);
      tensor[getIdx(col, row, 15)] = p.movedLastTurn ? 1.0 : 0.0;

      if (p.hasBall) tensor[getIdx(col, row, 4)] = 1.0;
      if (p.isBlocker) tensor[getIdx(col, row, 6)] = 1.0;
      if (p.buffs.some(b => b.type === 'CLAMP')) tensor[getIdx(col, row, 19)] = 1.0;
    }
  }

  if (channels >= 64) {
    const ourCaptain = ourCaptainCell;
    const enemyCaptain = enemyCaptainCell;
    const hasActiveCard = (id: string) => ourHand.some(c => c.id === id) ? 1.0 : 0.0;
    const cSetPlay = hasActiveCard('set_the_play');
    const cClamp = hasActiveCard('clamp');
    const cInsurance = hasActiveCard('insurance');
    const cNoLook = hasActiveCard('no_look_pass');
    const cLongBomb = hasActiveCard('long_bomb');
    const cSteady = hasActiveCard('steady_hands');
    const cRally = hasActiveCard('rally');
    const cIce = hasActiveCard('ice_in_the_veins');
    const cThreaded = hasActiveCard('threaded_pass');

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Channels 32..33: Distance-to-Goal Gradient Fields
        tensor[getIdx(c, r, 32)] = Math.hypot(c - ourCaptain.col, r - ourCaptain.row) / 11.0;
        tensor[getIdx(c, r, 33)] = Math.hypot(c - enemyCaptain.col, r - enemyCaptain.row) / 11.0;

        // Channel 34: Center Line Control Plane
        if (r === 5) tensor[getIdx(c, r, 34)] = 1.0;

        // Channels 35..36: 1-Turn Reachable grid
        const ourReachable = ourPieces.some(p => Math.hypot(p.cell.col - c, p.cell.row - r) <= p.energy);
        const enemyReachable = enemyPieces.some(p => Math.hypot(p.cell.col - c, p.cell.row - r) <= p.energy);
        if (ourReachable) tensor[getIdx(c, r, 35)] = 1.0;
        if (enemyReachable) tensor[getIdx(c, r, 36)] = 1.0;

        // Channels 37..38: Stamina remaining margin at (c,r)
        let maxOurMargin = 0;
        for (const p of ourPieces) {
          const dist = Math.hypot(p.cell.col - c, p.cell.row - r);
          if (dist <= p.energy) {
            maxOurMargin = Math.max(maxOurMargin, (p.energy - dist) / 10.0);
          }
        }
        tensor[getIdx(c, r, 37)] = maxOurMargin;

        let maxEnemyMargin = 0;
        for (const p of enemyPieces) {
          const dist = Math.hypot(p.cell.col - c, p.cell.row - r);
          if (dist <= p.energy) {
            maxEnemyMargin = Math.max(maxEnemyMargin, (p.energy - dist) / 10.0);
          }
        }
        tensor[getIdx(c, r, 38)] = maxEnemyMargin;

        // Channel 39: Receiver 1-step cut/pivot zone (distance <= 1.42 from friendly piece)
        const inReceiverZone = ourPieces.some(p => !p.isCaptain && Math.hypot(p.cell.col - c, p.cell.row - r) <= 1.42);
        if (inReceiverZone) tensor[getIdx(c, r, 39)] = 1.0;

        // Channel 40: Interception danger map (enemy piece within shading distance)
        const inInterceptionZone = enemyPieces.some(p => Math.hypot(p.cell.col - c, p.cell.row - r) <= 2.83);
        if (inInterceptionZone) tensor[getIdx(c, r, 40)] = 1.0;

        // Channels 41..48: Advanced Piece Status & Rest Streak broadcast
        // Channels 49..63: Active Hand Card One-Hots
        tensor[getIdx(c, r, 49)] = cSetPlay;
        tensor[getIdx(c, r, 50)] = cClamp;
        tensor[getIdx(c, r, 51)] = cInsurance;
        tensor[getIdx(c, r, 52)] = cNoLook;
        tensor[getIdx(c, r, 53)] = cLongBomb;
        tensor[getIdx(c, r, 54)] = cSteady;
        tensor[getIdx(c, r, 55)] = cRally;
        tensor[getIdx(c, r, 56)] = cIce;
        tensor[getIdx(c, r, 57)] = cThreaded;
      }
    }
  }

  return tensor;
}
