import type { GameState, Side } from '../types';
import { previewThrow, resolveThrow, getThrowPathCells } from '../interception';
import { computeControlMap } from '../control';
import { BOARD_CONFIG, areCellsEqual } from '../config/board';
import { evaluateState } from './evaluate';
import { SeededRNG } from '../rng';
import { isInAttackingHalf } from './sideHelpers';

/**
 * Patch v3.1 §F: Goal-Seeking Rule-Cascade Rollout Policy
 * Denoised leaf — deterministic geometry + soft stagnation, sampled throw with variance reduction.
 * Side-agnostic, quiet geometry, sharp throws.
 */

export function simulateCascadeRollout(
  state: GameState,
  depth: number,
  rng: SeededRNG,
  actingSide: Side = 'AI'
): number {
  const simState = cloneStateForSimulation(state);

  const ourSide: Side = actingSide;
  const enemySide: Side = actingSide === 'AI' ? 'PLAYER' : 'AI';
  const ourScoringCell = actingSide === 'AI' ? BOARD_CONFIG.aiScoringCell : BOARD_CONFIG.playerScoringCell;
  const enemyScoringCell = actingSide === 'AI' ? BOARD_CONFIG.playerScoringCell : BOARD_CONFIG.aiScoringCell;

  for (let step = 0; step < depth; step++) {
    if (simState.matchResult.isOver) break;

    const ourPieces = simState.pieces.filter(p => p.side === ourSide);
    const enemyPieces = simState.pieces.filter(p => p.side === enemySide);
    const ourCarrier = ourPieces.find(p => p.hasBall);
    const ourCaptain = ourPieces.find(p => p.isCaptain) || { cell: ourScoringCell, id: ourSide === 'AI' ? 'ai_captain' : 'p_captain' };
    const enemyCarrier = simState.pieces.find(p => p.side === enemySide && p.hasBall);
    const enemyCaptain = simState.pieces.find(p => p.isCaptain && p.side === enemySide) || { cell: enemyScoringCell, id: enemySide === 'AI' ? 'ai_captain' : 'p_captain' };
    const controlMap = computeControlMap(simState.pieces, simState.temporaryState);

    if (ourCarrier) {
      // ===== OUR OFFENSE: deterministic cuts toward our scoring cell =====
      const mobileTeammates = ourPieces.filter(p => p.id !== ourCarrier.id && !p.isCaptain && !p.isBlocker && p.energy >= 1.0);
      for (const teammate of mobileTeammates) {
        const dCol = Math.sign(5 - teammate.cell.col);
        const distToGoal = Math.abs(teammate.cell.row - ourScoringCell.row);
        const attackDir = ourSide === 'AI' ? -1 : 1;
        // Deterministic: always step if not at goal (no rng)
        let dRow = 0;
        if (distToGoal >= 1) {
          dRow = attackDir;
        }
        const targetCol = Math.max(0, Math.min(10, teammate.cell.col + dCol));
        const targetRow = Math.max(0, Math.min(10, teammate.cell.row + dRow));
        const cost = Math.hypot(targetCol - teammate.cell.col, targetRow - teammate.cell.row);

        if (cost > 0 && teammate.energy >= cost) {
          const occupied = simState.pieces.some(p => p.cell.col === targetCol && p.cell.row === targetRow);
          if (!occupied) {
            teammate.cell = { col: targetCol, row: targetRow };
            teammate.energy = Math.max(0, teammate.energy - cost);
            teammate.movedLastTurn = true;
          }
        }
      }

      // Carrier attempts forward scoring throws — sampled (sharp) but geometry is quiet
      const fullCaptainPiece = simState.pieces.find(p => p.id === ourCaptain.id) || ourCarrier;
      const captainPreview = previewThrow(ourCarrier, ourCaptain.cell, simState.pieces, controlMap, simState.temporaryState);
      
      let passExecuted = false;

      if (captainPreview.isClean || captainPreview.cumulativeCaptureRisk < 0.6) {
        const res = resolveThrow(ourCarrier, fullCaptainPiece, simState.pieces, controlMap, rng, simState.temporaryState);
        if (!res.intercepted) {
          ourCarrier.hasBall = false;
          fullCaptainPiece.hasBall = true;
          if (res.scored) {
            simState.score[ourSide] += 1;
            if (simState.score[ourSide] >= simState.config.board.pointsToWin) {
              simState.matchResult.isOver = true;
              break;
            }
          }
        } else if (res.interceptedByPieceId) {
          ourCarrier.hasBall = false;
          const interceptor = simState.pieces.find(p => p.id === res.interceptedByPieceId);
          if (interceptor) {
            interceptor.hasBall = true;
            if (res.interceptedAtCell && !interceptor.isCaptain) {
              const cost = Math.hypot(res.interceptedAtCell.col - interceptor.cell.col, res.interceptedAtCell.row - interceptor.cell.row);
              interceptor.energy = Math.max(0, interceptor.energy - cost);
              interceptor.cell = { ...res.interceptedAtCell };
              interceptor.movedLastTurn = true;
            }
          }
        }
        passExecuted = true;
      }

      if (passExecuted) continue;

      // Priority 2: Pass forward to teammate — sampled
      const outfieldTeammates = ourPieces.filter(
        p => p.id !== ourCarrier.id && !p.isCaptain && !p.isBlocker
      );
      const forwardTeammates = [...outfieldTeammates].sort((a, b) => {
        const dA = Math.hypot(a.cell.col - ourScoringCell.col, a.cell.row - ourScoringCell.row);
        const dB = Math.hypot(b.cell.col - ourScoringCell.col, b.cell.row - ourScoringCell.row);
        return dA - dB;
      });

      for (const receiver of forwardTeammates) {
        const res = resolveThrow(ourCarrier, receiver, simState.pieces, controlMap, rng, simState.temporaryState);
        if (!res.intercepted) {
          ourCarrier.hasBall = false;
          receiver.hasBall = true;
          passExecuted = true;
          break;
        } else if (res.interceptedByPieceId) {
          ourCarrier.hasBall = false;
          const interceptor = simState.pieces.find(p => p.id === res.interceptedByPieceId);
          if (interceptor) interceptor.hasBall = true;
          passExecuted = true;
          break;
        }
      }

      // Priority 3: Emergency blocker — sampled
      if (!passExecuted) {
        const bouncerPiece = ourPieces.find(p => p.isBlocker);
        if (bouncerPiece && bouncerPiece.id !== ourCarrier.id) {
          const res = resolveThrow(ourCarrier, bouncerPiece, simState.pieces, controlMap, rng, simState.temporaryState);
          if (!res.intercepted) {
            ourCarrier.hasBall = false;
            bouncerPiece.hasBall = true;
            passExecuted = true;
          }
        }
      }

      if (passExecuted) continue;
    } else if (enemyCarrier) {
      // ===== ENEMY OFFENSE + OUR DEFENSE — sampled throw, deterministic defense =====
      const fullEnemyCaptain = simState.pieces.find(p => p.id === enemyCaptain.id) || enemyCarrier;

      const enemyThrowPreview = previewThrow(
        enemyCarrier,
        enemyCaptain.cell,
        simState.pieces,
        controlMap,
        simState.temporaryState,
        undefined,
        !!simState.isRestartPhase?.[enemySide]
      );

      if (!simState.isRestartPhase?.[enemySide] && (enemyThrowPreview.isClean || enemyThrowPreview.cumulativeCaptureRisk < 0.6)) {
        const res = resolveThrow(enemyCarrier, fullEnemyCaptain, simState.pieces, controlMap, rng, simState.temporaryState);
        if (!res.intercepted) {
          enemyCarrier.hasBall = false;
          fullEnemyCaptain.hasBall = true;
          if (res.scored) {
            simState.score[enemySide] += 1;
            if (simState.score[enemySide] >= simState.config.board.pointsToWin) {
              simState.matchResult.isOver = true;
              simState.matchResult.winner = enemySide;
              break;
            }
          }
        } else if (res.interceptedByPieceId) {
          enemyCarrier.hasBall = false;
          const interceptor = simState.pieces.find(p => p.id === res.interceptedByPieceId);
          if (interceptor) {
            interceptor.hasBall = true;
            if (res.interceptedAtCell && !interceptor.isCaptain) {
              const cost = Math.hypot(res.interceptedAtCell.col - interceptor.cell.col, res.interceptedAtCell.row - interceptor.cell.row);
              interceptor.energy = Math.max(0, interceptor.energy - cost);
              interceptor.cell = { ...res.interceptedAtCell };
              interceptor.movedLastTurn = true;
            }
          }
        }
      }

      // Our defenders move deterministically onto enemy ray
      const passRay = getThrowPathCells(enemyCarrier.cell, enemyCaptain.cell);
      for (const p of ourPieces) {
        if (p.isCaptain || p.energy < 1.0) continue;

        let targetRayCell = enemyCarrier.cell;
        let minRayDist = Infinity;
        for (const rayCell of passRay) {
          const d = Math.hypot(rayCell.col - p.cell.col, rayCell.row - p.cell.row);
          if (d < minRayDist) {
            minRayDist = d;
            targetRayCell = rayCell;
          }
        }

        const dCol = Math.sign(targetRayCell.col - p.cell.col);
        const dRow = Math.sign(targetRayCell.row - p.cell.row);
        const targetCol = Math.max(0, Math.min(10, p.cell.col + dCol));
        const targetRow = Math.max(0, Math.min(10, p.cell.row + dRow));
        const cost = Math.hypot(targetCol - p.cell.col, targetRow - p.cell.row);

        if (cost > 0 && p.energy >= cost) {
          const occupied = simState.pieces.some(q => q.cell.col === targetCol && q.cell.row === targetRow);
          if (!occupied) {
            p.cell = { col: targetCol, row: targetRow };
            p.energy = Math.max(0, p.energy - cost);
            p.movedLastTurn = true;
          }
        }
      }
    }
  }

  // Soft stagnation — gradual, not -800 cliff
  const finalOurPieces = simState.pieces.filter(p => p.side === ourSide);
  const initialPositions = ourSide === 'AI' ? BOARD_CONFIG.aiPiecesStart : BOARD_CONFIG.playerPiecesStart;
  const sameInitialCount = finalOurPieces.filter(p => {
    const init = initialPositions.find(x => x.id === p.id);
    return init && areCellsEqual(init.cell, p.cell);
  }).length;
  const pctInInitial = sameInitialCount / (finalOurPieces.length || 7);

  const enemyHalfPieces = finalOurPieces.filter(p => isInAttackingHalf(p.cell, ourSide)).length;
  const initialEnemyHalfPieces = initialPositions.filter(p => isInAttackingHalf(p.cell, ourSide)).length;

  let stagnationPenalty = 0;
  if (pctInInitial > 0.30) {
    stagnationPenalty -= (pctInInitial - 0.30) * 1500;
  }
  if (enemyHalfPieces <= initialEnemyHalfPieces) {
    stagnationPenalty -= 200;
  }
  if (stagnationPenalty < -50 && !simState.matchResult.isOver) {
    return evaluateState(simState, actingSide) + stagnationPenalty;
  }

  return evaluateState(simState, actingSide);
}

function cloneStateForSimulation(state: GameState): GameState {
  return {
    ...state,
    score: { ...state.score },
    momentum: { ...state.momentum },
    pieces: state.pieces.map(p => ({
      ...p,
      cell: { ...p.cell },
      buffs: [...p.buffs],
    })),
    matchResult: { ...state.matchResult },
  };
}
