import type { GameState, Side, Piece, Cell, ThrowType } from '../types';
import { MCTS_EVALUATION_WEIGHTS } from '../config/mcts';
import { computeControlMap, getControlAt } from '../control';
import { BOARD_CONFIG, areCellsEqual } from '../config/board';
import { previewThrow, getThrowPathCells } from '../interception';
import { calculateTotalThrowCost, THROW_CONFIG } from '../config/throw';

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
  scoringCell: Cell, enemyScoringCell: Cell, currentMomentum: number
): { best: ThrowTargetInfo | null; all: ThrowTargetInfo[] } {
  const side = carrier.side;
  const eligible = pieces.filter(p => p.side === side && p.id !== carrier.id && (p.isCaptain || !p.movedLastTurn));
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
  if (dist <= 1.5) pocketValue = 20.0;
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
    carrier, allPieces, controlMap, temporaryState, scoringCell, enemyScoringCell, momentum
  );

  if (throwEval.best) {
    score += throwEval.best.cev * weights.ballProgress * 2.5 * riskAppetite;
    if (throwEval.best.cleanBonus > 0) score += throwEval.best.cleanBonus * weights.cleanScoringLane;
    score -= throwEval.best.risk * 40.0 * (2.0 - riskAppetite);
  }

  // Option density
  const viable = throwEval.all.filter(t => t.cev > 0.1);
  const lanes = new Set(viable.map(t => Math.floor(t.target.cell.col / 4)));
  score += (viable.length * 0.7 + lanes.size * 3.0) * 8.0;

  if (riskAppetite < 0.5) score += 20.0;

  // Ball progress
  const distToCaptain = Math.hypot(carrier.cell.col - captain.cell.col, carrier.cell.row - captain.cell.row);
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

  // 6. Rest streak (symmetric)
  const ourRest = ourPieces.filter(p => !p.hasBall).reduce((s, p) => s + (p.movedLastTurn ? 0 : p.restStreak), 0);
  const enemyRest = enemyPieces.filter(p => !p.hasBall).reduce((s, p) => s + (p.movedLastTurn ? 0 : p.restStreak), 0);
  totalScore += (ourRest - enemyRest) * weights.hub;

  // 7. Non-linear momentum
  totalScore += momentumValue(state.momentum[ourSide]) - momentumValue(state.momentum[enemySide]);

  // 8. Opponent response modeling
  if (ourCarrier && !enemyCarrier) {
    const throwEval = evaluateAllThrowTargets(
      ourCarrier, state.pieces, controlMap, state.temporaryState,
      ourScoringCell, enemyScoringCell, state.momentum[ourSide]
    );
    if (throwEval.best && throwEval.best.risk > 0.05) {
      const enemyBestRelay = enemyPieces
        .filter(p => !p.isCaptain && !p.isBlocker)
        .reduce((best, p) => {
          const d = Math.hypot(p.cell.col - enemyScoringCell.col, p.cell.row - enemyScoringCell.row);
          return d < best ? d : best;
        }, 99);
      const counterThreat = Math.max(0, (8 - enemyBestRelay) * 5.0);
      totalScore -= throwEval.best.risk * counterThreat * 0.5;
    }
  }

  return totalScore;
}
