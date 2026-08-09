import type { GameState, Side } from '../types';
import { previewThrow, resolveThrow, getThrowPathCells } from '../interception';
import { computeControlMap } from '../control';
import { BOARD_CONFIG, areCellsEqual } from '../config/board';
import { evaluateState } from './evaluate';
import { SeededRNG } from '../rng';
import { isInAttackingHalf } from './sideHelpers';

/**
 * Patch v3.1 §F: Goal-Seeking Rule-Cascade Rollout Policy
 * Fast heuristic simulation policy for ultra-deep MCTS rollouts.
 * Now side-agnostic: all logic is expressed as ourSide vs enemySide.
 */
export function simulateCascadeRollout(
  state: GameState,
  depth: number,
  rng: SeededRNG,
  actingSide: Side = 'AI'
): number {
  const simState = cloneStateForSimulation(state);

  // Side-agnostic derived constants — computed once per rollout, not per step for id lookup,
  // but per-step we re-derive ourPieces etc because pieces move.
  const ourSide: Side = actingSide;
  const enemySide: Side = actingSide === 'AI' ? 'PLAYER' : 'AI';
  const ourScoringCell = actingSide === 'AI' ? BOARD_CONFIG.aiScoringCell : BOARD_CONFIG.playerScoringCell;
  const enemyScoringCell = actingSide === 'AI' ? BOARD_CONFIG.playerScoringCell : BOARD_CONFIG.aiScoringCell;

  for (let step = 0; step < depth; step++) {
    if (simState.matchResult.isOver) break;

    // Re-derive side partitions each step (pieces move)
    const ourPieces = simState.pieces.filter(p => p.side === ourSide);
    const enemyPieces = simState.pieces.filter(p => p.side === enemySide);
    const ourCarrier = ourPieces.find(p => p.hasBall);
    const ourCaptain = ourPieces.find(p => p.isCaptain) || { cell: ourScoringCell, id: ourSide === 'AI' ? 'ai_captain' : 'p_captain' };
    const enemyCarrier = simState.pieces.find(p => p.side === enemySide && p.hasBall);
    const enemyCaptain = simState.pieces.find(p => p.isCaptain && p.side === enemySide) || { cell: enemyScoringCell, id: enemySide === 'AI' ? 'ai_captain' : 'p_captain' };
    const controlMap = computeControlMap(simState.pieces, simState.temporaryState);

    if (ourCarrier) {
      // ===== OUR OFFENSE: mobile teammates cut forward into shooting pocket near our scoring cell =====
      const mobileTeammates = ourPieces.filter(p => p.id !== ourCarrier.id && !p.isCaptain && !p.isBlocker && p.energy >= 1.0);
      for (const teammate of mobileTeammates) {
        const dCol = Math.sign(5 - teammate.cell.col);
        // Step forward toward our scoring cell. AI moves row -1 (toward 0), PLAYER moves row +1 (toward 10).
        // Use distance to our scoring cell to determine if far from pocket.
        const distToGoal = Math.abs(teammate.cell.row - ourScoringCell.row);
        const attackDir = ourSide === 'AI' ? -1 : 1;
        // If far (>2 away from goal), step toward goal; if already in pocket (row 0-3 for AI / 7-10 for PLAYER), occasionally sneak one more
        let dRow = 0;
        if (distToGoal > 2) {
          dRow = attackDir;
        } else if (distToGoal > 0 && rng.nextFloat() < 0.3) {
          dRow = attackDir;
        }
        // Clamp and check occupancy implicitly via energy cost — board bounds 0-10
        const targetCol = Math.max(0, Math.min(10, teammate.cell.col + dCol));
        const targetRow = Math.max(0, Math.min(10, teammate.cell.row + dRow));
        const cost = Math.hypot(targetCol - teammate.cell.col, targetRow - teammate.cell.row);

        if (cost > 0 && teammate.energy >= cost) {
          teammate.cell = { col: targetCol, row: targetRow };
          teammate.energy = Math.max(0, teammate.energy - cost);
          teammate.movedLastTurn = true;
        }
      }

      // Carrier attempts forward scoring throws
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

      // Priority 2: Pass forward to teammate situated further forward in enemy territory (closer to our scoring cell)
      const outfieldTeammates = ourPieces.filter(
        p => p.id !== ourCarrier.id && !p.isCaptain && !p.isBlocker
      );
      // Sort by proximity to our scoring cell (closer = more forward)
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

      // Priority 3: Emergency pass to blocker ONLY if no outfield teammates exist or none could receive
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
      // ===== ENEMY OFFENSE SIMULATION + OUR DEFENSE =====
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

      // Our defenders move to interpose directly onto the enemy's passing ray
      const passRay = getThrowPathCells(enemyCarrier.cell, enemyCaptain.cell);
      for (const p of ourPieces) {
        if (p.isCaptain || p.energy < 1.0) continue;

        // Find the closest passing ray cell to step onto
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
          p.cell = { col: targetCol, row: targetRow };
          p.energy = Math.max(0, p.energy - cost);
          p.movedLastTurn = true;
        }
      }
    }
  }

  // Heuristic Stagnation & Formation Lock Failure Check (side-agnostic):
  // If at the end of the search depth, >40% of OUR pieces still occupy their initial position
  // AND the number of OUR pieces in the ENEMY half of the board never increased,
  // the branch is considered to have failed to develop an attack!
  const finalOurPieces = simState.pieces.filter(p => p.side === ourSide);
  const initialPositions = ourSide === 'AI' ? BOARD_CONFIG.aiPiecesStart : BOARD_CONFIG.playerPiecesStart;
  const sameInitialCount = finalOurPieces.filter(p => {
    const init = initialPositions.find(x => x.id === p.id);
    return init && areCellsEqual(init.cell, p.cell);
  }).length;
  const pctInInitial = sameInitialCount / (finalOurPieces.length || 7);

  const enemyHalfPieces = finalOurPieces.filter(p => isInAttackingHalf(p.cell, ourSide)).length;
  const initialEnemyHalfPieces = initialPositions.filter(p => isInAttackingHalf(p.cell, ourSide)).length;

  if (pctInInitial > 0.40 && enemyHalfPieces <= initialEnemyHalfPieces && !simState.matchResult.isOver) {
    // Stagnation penalty: our attack failed to develop — always negative from our perspective
    return -800.0;
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
