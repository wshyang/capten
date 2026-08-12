import type { GameState, Side, Piece, Cell, ThrowType } from '../../types';
import { MCTS_EVALUATION_WEIGHTS } from '../../config/mcts';
import { computeControlMap, getControlAt } from '../../control';
import { BOARD_CONFIG } from '../../config/board';
import { previewThrow, getThrowPathCells } from '../../interception';
import { calculateTotalThrowCost, THROW_CONFIG } from '../../config/throw';

// ═══════════════════════════════════════════════════════════════════
// INLINE THROW EVALUATION (single-pass, no double-counting)
// ═══════════════════════════════════════════════════════════════════

interface ThrowTargetInfo {
  target: Piece;
  cev: number;
  cleanBonus: number;
  risk: number;
  isClean: boolean;
}

function quickThrowEval(
  carrier: Piece, target: Piece, pieces: Piece[], controlMap: number[][][],
  temporaryState: any, scoringCell: Cell, enemyScoringCell: Cell, currentMomentum: number
): ThrowTargetInfo {
  const throwType: ThrowType = target.isCaptain ? 'HIGH_LOB' : 'FLAT';
  const preview = previewThrow(carrier, target.cell, pieces, controlMap, temporaryState, undefined, false, throwType);
  const passCompletionProb = (1.0 - preview.cumulativeCaptureRisk) * preview.catchRate;

  let cev: number;
  if (target.isCaptain) {
    cev = passCompletionProb;
  } else {
    const distToCaptain = Math.hypot(target.cell.col - scoringCell.col, target.cell.row - scoringCell.row);
    const onwardQuality = Math.max(0.05, Math.min(0.6, 0.7 - distToCaptain * 0.08));
    cev = passCompletionProb * onwardQuality;
  }

  const cleanBonus = preview.isClean
    ? preview.throwCost + (target.isCaptain ? 2.0 * (1 + 0.2 * currentMomentum) : 0) : 0;

  let worstDanger = 0;
  for (const checkCell of preview.pathCells) {
    if (checkCell.captureProbability <= 0) continue;
    const distToOurCaptain = Math.hypot(checkCell.cell.col - enemyScoringCell.col, checkCell.cell.row - enemyScoringCell.row);
    const danger = Math.max(0, 1.0 - distToOurCaptain / 10.0);
    if (danger > worstDanger) worstDanger = danger;
  }
  const risk = preview.cumulativeCaptureRisk * worstDanger;

  return { target, cev, cleanBonus, risk, isClean: preview.isClean };
}

function evaluateAllThrowTargets(
  carrier: Piece, pieces: Piece[], controlMap: number[][][], temporaryState: any,
  scoringCell: Cell, enemyScoringCell: Cell, currentMomentum: number, isRestartPhase = false
): { best: ThrowTargetInfo | null; all: ThrowTargetInfo[] } {
  const side = carrier.side;
  const eligible = pieces.filter(p => p.side === side && p.id !== carrier.id && ((p.isCaptain && !isRestartPhase) || !p.movedLastTurn));
  const results: ThrowTargetInfo[] = [];

  for (const target of eligible) {
    const throwType: ThrowType = target.isCaptain ? 'HIGH_LOB' : 'FLAT';
    const throwCost = calculateTotalThrowCost(carrier.cell, target.cell, throwType, THROW_CONFIG);
    if (carrier.energy < throwCost) continue;
    results.push(quickThrowEval(carrier, target, pieces, controlMap, temporaryState, scoringCell, enemyScoringCell, currentMomentum));
  }

  results.sort((a, b) => (b.cev * 100 + b.cleanBonus * 15 - b.risk * 40) - (a.cev * 100 + a.cleanBonus * 15 - a.risk * 40));
  return { best: results.length > 0 ? results[0] : null, all: results };
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 3: Risk Appetite
// ═══════════════════════════════════════════════════════════════════

function computeRiskAppetite(ourScore: number, enemyScore: number, turn: number, maxTurns: number): number {
  const scoreDiff = ourScore - enemyScore;
  const turnsFraction = turn / maxTurns;
  if (turnsFraction > 0.75) {
    if (scoreDiff > 0) return 0.3;
    if (scoreDiff < 0) return 2.5;
    return 1.5;
  }
  if (turnsFraction > 0.4) {
    if (scoreDiff > 0) return 0.7;
    if (scoreDiff < 0) return 1.5;
    return 1.0;
  }
  return 1.0;
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 4: Non-Linear Momentum
// ═══════════════════════════════════════════════════════════════════

function momentumValue(m: number): number {
  if (m >= 3) return 45;
  if (m >= 2) return 25;
  if (m >= 1) return 10;
  return 0;
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 7: Dynamic Formation
// ═══════════════════════════════════════════════════════════════════

function positionalThreat(piece: Piece, scoringCell: Cell, controlMap: number[][][], enemySide: Side): number {
  const dist = Math.hypot(piece.cell.col - scoringCell.col, piece.cell.row - scoringCell.row);
  let pocketValue: number;
  if (dist <= 1.5) pocketValue = 40.0;
  else if (dist <= 3.5) pocketValue = 35.0;
  else if (dist <= 5.0) pocketValue = 25.0;
  else if (dist <= 7.0) pocketValue = 10.0;
  else pocketValue = 0;

  const enemyControl = getControlAt(controlMap, piece.cell, enemySide);
  return Math.max(0, pocketValue - enemyControl * 8.0);
}

// ═══════════════════════════════════════════════════════════════════
// SYMMETRIC CARRIER EVALUATION
// Called identically for both our carrier and enemy carrier.
// ═══════════════════════════════════════════════════════════════════

function evaluateCarrier(
  carrier: Piece, captain: Piece | { cell: Cell }, enemyCaptain: Piece | { cell: Cell },
  carrierPieces: Piece[], allPieces: Piece[], controlMap: number[][][],
  temporaryState: any, scoringCell: Cell, enemyScoringCell: Cell,
  initialPositions: { id: string; cell: Cell }[],
  momentum: number, isRestartPhase: boolean, weights: any,
  state: GameState, riskAppetite: number, enemySide: Side
): number {
  let score = 0;

  // Throw evaluation (single pass)
  const throwEval = evaluateAllThrowTargets(
    carrier, allPieces, controlMap, temporaryState, scoringCell, enemyScoringCell, momentum, isRestartPhase
  );

  // Ball progress & distance to captain
  const distToCaptain = Math.hypot(carrier.cell.col - captain.cell.col, carrier.cell.row - captain.cell.row);

  if (throwEval.best) {
    score += throwEval.best.cev * weights.ballProgress * 2.5 * riskAppetite;
    if (throwEval.best.cleanBonus > 0) score += throwEval.best.cleanBonus * weights.cleanScoringLane;
    score -= throwEval.best.risk * 40.0 * (2.0 - riskAppetite);

    // 1. Scoring Range Strike Urgency (+200.0 * cev): Massive boost when distToCaptain <= 4.0
    if (distToCaptain <= 4.0 && throwEval.best.target.isCaptain && throwEval.best.cev > 0.05) {
      score += 200.0 * throwEval.best.cev;
    }
  }

  // Option density
  const viable = throwEval.all.filter(t => t.cev > 0.1);
  const lanes = new Set(viable.map(t => (t.target.cell.col < 4 ? 0 : t.target.cell.col > 6 ? 2 : 1)));
  score += (viable.length * 0.7 + lanes.size * 3.0) * 8.0;

  if (state.config.board.holdingFoulEnforced && viable.length === 0) {
    score -= 600.0;
  }

  if (riskAppetite < 0.5) score += 20.0;

  // Ball progress
  score += (11.0 - distToCaptain) * weights.ballProgress * 0.5;

  // Carrier safety
  score += (carrier.energy / 10.0) * weights.carrierSafety;

  // Dynamic formation
  for (const p of carrierPieces) {
    if (p.isCaptain) continue;
    score += positionalThreat(p, scoringCell, controlMap, enemySide);
  }
  score += positionalThreat(carrier, scoringCell, controlMap, enemySide) * 0.5;

  // Blocker as weapon
  const distToEnemyCaptain = Math.hypot(carrier.cell.col - enemyCaptain.cell.col, carrier.cell.row - enemyCaptain.cell.row);
  if (carrier.isBlocker) {
    const captainPiece = carrierPieces.find(p => p.isCaptain);
    if (captainPiece) {
      const relayPreview = previewThrow(carrier, captainPiece.cell, allPieces, controlMap, temporaryState, undefined, false, 'HIGH_LOB');
      if (relayPreview.isClean || relayPreview.cumulativeCaptureRisk < 0.3) {
        score += relayPreview.catchRate * 80.0 * riskAppetite;
      } else {
        score -= relayPreview.cumulativeCaptureRisk * 60.0 * (2.0 - riskAppetite);
      }
    }
    score -= 30.0;
  } else if (distToEnemyCaptain <= 2.0 && !carrier.isCaptain) {
    score -= 80.0;
  }

  // Gradual stagnation
  let totalDisplacement = 0;
  for (const p of carrierPieces) {
    if (p.isCaptain) continue;
    const init = initialPositions.find(x => x.id === p.id);
    if (init) totalDisplacement += Math.hypot(p.cell.col - init.cell.col, p.cell.row - init.cell.row);
  }
  const turn = state.turn || 1;
  const mobileCount = Math.max(1, carrierPieces.filter(p => !p.isCaptain).length);
  const expectedDisplacement = Math.min(mobileCount * 3.0, turn * 1.5);
  const developmentDeficit = Math.max(0, expectedDisplacement - totalDisplacement);
  score -= developmentDeficit * 8.0;

  return score;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN EVALUATION — Side-Symmetric
// ═══════════════════════════════════════════════════════════════════

export function evaluateState(state: GameState, actingSide: Side = 'AI'): number {
  if (state.matchResult.isOver) {
    if (state.matchResult.winner === actingSide) return 100000;
    if (state.matchResult.winner && state.matchResult.winner !== actingSide) return -100000;
    return 0;
  }

  const weights = state.config.mcts.weights || MCTS_EVALUATION_WEIGHTS;
  let totalScore = 0;

  const ourSide = actingSide;
  const enemySide: Side = actingSide === 'AI' ? 'PLAYER' : 'AI';
  const ourScoringCell = actingSide === 'AI' ? BOARD_CONFIG.aiScoringCell : BOARD_CONFIG.playerScoringCell;
  const enemyScoringCell = actingSide === 'AI' ? BOARD_CONFIG.playerScoringCell : BOARD_CONFIG.aiScoringCell;
  const ourInitialPositions = actingSide === 'AI' ? BOARD_CONFIG.aiPiecesStart : BOARD_CONFIG.playerPiecesStart;
  const enemyInitialPositions = actingSide === 'AI' ? BOARD_CONFIG.playerPiecesStart : BOARD_CONFIG.aiPiecesStart;

  // 1. Terminal Goal Term
  totalScore += (state.score[ourSide] - state.score[enemySide]) * weights.goal;

  const ourPieces = state.pieces.filter(p => p.side === ourSide);
  const enemyPieces = state.pieces.filter(p => p.side === enemySide);
  const ourCaptain = ourPieces.find(p => p.isCaptain) || { cell: ourScoringCell };
  const enemyCaptain = enemyPieces.find(p => p.isCaptain) || { cell: enemyScoringCell };
  const ourCarrier = ourPieces.find(p => p.hasBall);
  const enemyCarrier = enemyPieces.find(p => p.hasBall);

  const controlMap = computeControlMap(state.pieces, state.temporaryState);

  const maxTurns = state.config.board?.maxTurns || 40;
  const ourRisk = computeRiskAppetite(state.score[ourSide], state.score[enemySide], state.turn, maxTurns);
  const enemyRisk = computeRiskAppetite(state.score[enemySide], state.score[ourSide], state.turn, maxTurns);

  // 2. Carrier evaluation — SAME function for both sides
  if (ourCarrier) {
    totalScore += evaluateCarrier(
      ourCarrier, ourCaptain, enemyCaptain, ourPieces, state.pieces, controlMap,
      state.temporaryState, ourScoringCell, enemyScoringCell, ourInitialPositions,
      state.momentum[ourSide], !!state.isRestartPhase?.[ourSide], weights, state,
      ourRisk, enemySide
    );
  }

  if (enemyCarrier) {
    totalScore -= evaluateCarrier(
      enemyCarrier, enemyCaptain, ourCaptain, enemyPieces, state.pieces, controlMap,
      state.temporaryState, enemyScoringCell, ourScoringCell, enemyInitialPositions,
      state.momentum[enemySide], !!state.isRestartPhase?.[enemySide], weights, state,
      enemyRisk, ourSide
    );
  }

  // Defensive Blocker ray-blocking term (zero-sum)
  const calcBlockerDefense = (carrier: Piece | undefined, captain: Piece | { cell: Cell }, blocker: Piece | undefined) => {
    if (!carrier || !blocker) return 0;
    const ray = getThrowPathCells(carrier.cell, captain.cell);
    if (ray.length === 0) return 0;
    const minDistToRay = Math.min(...ray.map(c => Math.hypot(c.col - blocker.cell.col, c.row - blocker.cell.row)));
    return Math.max(0, (2.0 - minDistToRay) * 35.0);
  };
  const ourBlocker = ourPieces.find(p => p.isBlocker);
  const enemyBlocker = enemyPieces.find(p => p.isBlocker);
  totalScore += calcBlockerDefense(enemyCarrier, enemyCaptain, ourBlocker) - calcBlockerDefense(ourCarrier, ourCaptain, enemyBlocker);

  // Active Buffs & Debuffs valuation
  const evalPieceBuffs = (pieces: Piece[]) => pieces.reduce((sum, p) => {
    let bScore = 0;
    for (const b of p.buffs) {
      if (b.type === 'CLAMP') bScore -= 25 * b.durationTurns;
      if (b.type === 'SLOW_BURN') bScore -= 15 * b.durationTurns;
      if (b.type === 'OVERCLOCK') bScore += 20 * b.durationTurns;
      if (b.type === 'STEADY_HANDS') bScore += 18 * b.durationTurns;
      if (b.type === 'SCREEN') bScore += 15 * b.durationTurns;
    }
    return sum + bScore;
  }, 0);
  totalScore += evalPieceBuffs(ourPieces) - evalPieceBuffs(enemyPieces);

  // Card Hand Advantage valuation
  const ourHandVal = (state.hands[ourSide]?.length || 0) * 12.0;
  const enemyHandVal = (state.hands[enemySide]?.length || 0) * 12.0;
  totalScore += ourHandVal - enemyHandVal;

  // 3. Energy differential (symmetric)
  const ourEnergy = ourPieces.reduce((s, p) => s + p.energy, 0);
  const enemyEnergy = enemyPieces.reduce((s, p) => s + p.energy, 0);
  totalScore += (ourEnergy - enemyEnergy) * weights.energyDiff;

  // 4. Lane control (symmetric)
  let ourCtrl = 0, enemyCtrl = 0;
  for (let c = 3; c <= 7; c++) {
    for (let r = 1; r <= 9; r++) {
      ourCtrl += getControlAt(controlMap, { col: c, row: r }, ourSide);
      enemyCtrl += getControlAt(controlMap, { col: c, row: r }, enemySide);
    }
  }
  totalScore += (ourCtrl - enemyCtrl) * weights.control;

  // 5. Spacing (symmetric: both sides)
  const computeSpacing = (pieces: Piece[]) => {
    const mobile = pieces.filter(p => !p.isCaptain);
    let s = 0;
    for (let i = 0; i < mobile.length; i++)
      for (let j = i + 1; j < mobile.length; j++)
        s += Math.hypot(mobile[i].cell.col - mobile[j].cell.col, mobile[i].cell.row - mobile[j].cell.row);
    return s;
  };
  totalScore += (computeSpacing(ourPieces) - computeSpacing(enemyPieces)) / 3.0 * weights.spacing;

  // 6. Non-linear rest streak (symmetric)
  const calcRestScore = (pieces: Piece[]) => pieces.filter(p => !p.hasBall).reduce((s, p) => {
    const streak = p.movedLastTurn ? 0 : p.restStreak;
    return s + (streak >= 3 ? 12.0 : streak >= 2 ? 6.0 : streak * 2.0);
  }, 0);
  totalScore += (calcRestScore(ourPieces) - calcRestScore(enemyPieces)) * weights.hub;

  // 7. Non-linear momentum
  totalScore += momentumValue(state.momentum[ourSide]) - momentumValue(state.momentum[enemySide]);

  // Pillar V: Passing Chain Connectivity Waypoint (+25.0 zero-sum)
  const calcConnectivity = (carrier: Piece | undefined, pieces: Piece[], side: Side) => {
    if (!carrier) return 0;
    const inDefense = side === 'AI' ? carrier.cell.row >= 7 : carrier.cell.row <= 3;
    if (!inDefense) return 0;
    const openReceivers = pieces.filter(p => p.side === side && p.id !== carrier.id && !p.isCaptain && (side === 'AI' ? p.cell.row <= 6 : p.cell.row >= 4));
    let count = 0;
    for (const r of openReceivers) {
      const ray = getThrowPathCells(carrier.cell, r.cell);
      const blocked = ray.some(c => getControlAt(controlMap, c, side === 'AI' ? 'PLAYER' : 'AI') > 0.3);
      if (!blocked) count++;
    }
    return count >= 1 ? 25.0 : 0;
  };
  totalScore += calcConnectivity(ourCarrier, state.pieces, ourSide) - calcConnectivity(enemyCarrier, state.pieces, enemySide);

  // Pillar V: Weak-Side Escape Valve Waypoint (+18.0 zero-sum)
  const calcEscapeValve = (carrier: Piece | undefined, pieces: Piece[], side: Side) => {
    if (!carrier) return 0;
    const weakSideTeammates = pieces.filter(p => p.side === side && p.id !== carrier.id && !p.isCaptain && Math.abs(p.cell.col - carrier.cell.col) >= 4 && p.energy >= 2.0);
    return weakSideTeammates.length >= 1 ? 18.0 : 0;
  };
  totalScore += calcEscapeValve(ourCarrier, state.pieces, ourSide) - calcEscapeValve(enemyCarrier, state.pieces, enemySide);

  // Pillar V: Stamina Compounding Anchor Preservation Waypoint (+15.0 zero-sum)
  const calcAnchorPreservation = (pieces: Piece[]) => {
    const anchorCount = pieces.filter(p => !p.isCaptain && !p.hasBall && p.restStreak >= 2).length;
    return anchorCount >= 2 ? 15.0 : anchorCount * 6.0;
  };
  totalScore += calcAnchorPreservation(ourPieces) - calcAnchorPreservation(enemyPieces);

  // 8. Opponent response modeling (zero-sum)
  const calcOpponentResponse = (carrier: Piece | undefined, scCell: Cell, enScCell: Cell, mom: number, isRestart: boolean, enPieces: Piece[]) => {
    if (!carrier) return 0;
    const throwEval = evaluateAllThrowTargets(carrier, state.pieces, controlMap, state.temporaryState, scCell, enScCell, mom, isRestart);
    if (throwEval.best && throwEval.best.risk > 0.05) {
      const bestRelay = enPieces
        .filter(p => !p.isCaptain && !p.isBlocker)
        .reduce((best, p) => {
          const d = Math.hypot(p.cell.col - enScCell.col, p.cell.row - enScCell.row);
          return d < best ? d : best;
        }, 99);
      const counterThreat = Math.max(0, (8 - bestRelay) * 5.0);
      return throwEval.best.risk * counterThreat * 0.5;
    }
    return 0;
  };
  totalScore -= calcOpponentResponse(ourCarrier, ourScoringCell, enemyScoringCell, state.momentum[ourSide], !!state.isRestartPhase?.[ourSide], enemyPieces);
  totalScore += calcOpponentResponse(enemyCarrier, enemyScoringCell, ourScoringCell, state.momentum[enemySide], !!state.isRestartPhase?.[enemySide], ourPieces);

  // ── CYCLICAL PASSING & GRIDLOCK STAGNATION PENALTY (Anti-Cycle Rule) ──
  // Penalizes 2- or 3-sequence cyclical ball-passing in a gridlock where the ball is passed
  // back and forth among a cluster without advancing toward the opponent's goal.
  const calcCyclicalPassingPenalty = (side: Side) => {
    const sideScoringCell = side === 'AI' ? BOARD_CONFIG.aiScoringCell : BOARD_CONFIG.playerScoringCell;
    const passes = state.eventLog.filter(e => e.type === 'PASS_ATTEMPTED' && e.side === side);
    if (passes.length >= 1) {
      const last = passes[passes.length - 1].details;
      if (last && last.throwerId && last.targetPieceId && !last.targetPieceId.includes('captain')) {
        const throwerPiece = state.pieces.find(p => p.id === last.throwerId);
        if (throwerPiece) {
          const distToCapt = Math.hypot(throwerPiece.cell.col - sideScoringCell.col, throwerPiece.cell.row - sideScoringCell.row);
          if (distToCapt <= 4.0) {
            return 180.0; // Scoring Range Hesitation Penalty (-180.0)
          }
        }
      }
    }
    if (passes.length >= 2) {
      const len = passes.length;
      const last = passes[len - 1].details;
      const prev1 = passes[len - 2].details;
      const prev2 = len >= 3 ? passes[len - 3].details : null;

      if (last && prev1) {
        // 2-sequence cycle: X -> Y -> X
        if (last.targetPieceId === prev1.throwerId && last.throwerId === prev1.targetPieceId) {
          return 150.0;
        }
        // 3-sequence cycle: X -> Y -> Z -> X
        if (prev2 && last.targetPieceId === prev2.throwerId && last.throwerId === prev1.targetPieceId && prev1.throwerId === prev2.targetPieceId) {
          return 120.0;
        }
      }
    }
    return 0;
  };
  totalScore -= calcCyclicalPassingPenalty(ourSide);
  totalScore += calcCyclicalPassingPenalty(enemySide);

  return totalScore;
}
