import type { GameState } from '../types';
import { previewThrow, resolveThrow, getThrowPathCells } from '../interception';
import { computeControlMap } from '../control';
import { BOARD_CONFIG, areCellsEqual } from '../config/board';
import { evaluateState } from './evaluate';
import { SeededRNG } from '../rng';

/**
 * Patch v3.1 §F: Goal-Seeking Rule-Cascade Rollout Policy
 * Fast heuristic simulation policy for ultra-deep MCTS rollouts.
 */
export function simulateCascadeRollout(
  state: GameState,
  depth: number,
  rng: SeededRNG
): number {
  const simState = cloneStateForSimulation(state);

  for (let step = 0; step < depth; step++) {
    if (simState.matchResult.isOver) break;

    const aiPieces = simState.pieces.filter(p => p.side === 'AI');
    const aiCarrier = aiPieces.find(p => p.hasBall);
    const aiCaptain = aiPieces.find(p => p.isCaptain) || { cell: BOARD_CONFIG.aiScoringCell, id: 'ai_captain' };
    const controlMap = computeControlMap(simState.pieces, simState.temporaryState);

    if (aiCarrier) {
      // 1. Mobile teammates cut forward into the attacking shooting pocket (rows 2-3) and baseline flank (rows 0-1)
      const mobileTeammates = aiPieces.filter(p => p.id !== aiCarrier.id && !p.isCaptain && !p.isBlocker && p.energy >= 1.0);
      for (const teammate of mobileTeammates) {
        const dCol = Math.sign(5 - teammate.cell.col);
        // Step forward toward row 2-3 (shooting sweet spot), or sneak to row 0 if already deep
        const dRow = teammate.cell.row > 2 ? -1 : (teammate.cell.row > 0 && rng.nextFloat() < 0.3 ? -1 : 0);
        const targetCol = Math.max(0, Math.min(10, teammate.cell.col + dCol));
        const targetRow = Math.max(0, Math.min(10, teammate.cell.row + dRow));
        const cost = Math.hypot(targetCol - teammate.cell.col, targetRow - teammate.cell.row);

        if (cost > 0 && teammate.energy >= cost) {
          teammate.cell = { col: targetCol, row: targetRow };
          teammate.energy = Math.max(0, teammate.energy - cost);
          teammate.movedLastTurn = true;
        }
      }

      // 2. Carrier attempts forward scoring throws
      const fullCaptainPiece = simState.pieces.find(p => p.id === aiCaptain.id) || aiCarrier;
      const captainPreview = previewThrow(aiCarrier, aiCaptain.cell, simState.pieces, controlMap, simState.temporaryState);
      
      let passExecuted = false;

      if (captainPreview.isClean || captainPreview.cumulativeCaptureRisk < 0.6) {
        const res = resolveThrow(aiCarrier, fullCaptainPiece, simState.pieces, controlMap, rng, simState.temporaryState);
        if (!res.intercepted) {
          aiCarrier.hasBall = false;
          fullCaptainPiece.hasBall = true;
          if (res.scored) {
            simState.score.AI += 1;
            if (simState.score.AI >= simState.config.board.pointsToWin) {
              simState.matchResult.isOver = true;
              break;
            }
          }
        } else if (res.interceptedByPieceId) {
          aiCarrier.hasBall = false;
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

      // Priority 2: Pass forward to teammate situated further forward in enemy territory (lower row index)
      const outfieldTeammates = aiPieces.filter(
        p => p.id !== aiCarrier.id && !p.isCaptain && !p.isBlocker && p.id !== 'ai_blocker'
      );
      const forwardTeammates = [...outfieldTeammates].sort((a, b) => a.cell.row - b.cell.row);

      for (const receiver of forwardTeammates) {
        const res = resolveThrow(aiCarrier, receiver, simState.pieces, controlMap, rng, simState.temporaryState);
        if (!res.intercepted) {
          aiCarrier.hasBall = false;
          receiver.hasBall = true;
          passExecuted = true;
          break;
        } else if (res.interceptedByPieceId) {
          aiCarrier.hasBall = false;
          const interceptor = simState.pieces.find(p => p.id === res.interceptedByPieceId);
          if (interceptor) interceptor.hasBall = true;
          passExecuted = true;
          break;
        }
      }

      // Priority 3: Emergency pass to bouncer ONLY if no outfield teammates exist or none could receive
      if (!passExecuted) {
        const bouncerPiece = aiPieces.find(p => p.isBlocker || p.id === 'ai_blocker');
        if (bouncerPiece && bouncerPiece.id !== aiCarrier.id) {
          const res = resolveThrow(aiCarrier, bouncerPiece, simState.pieces, controlMap, rng, simState.temporaryState);
          if (!res.intercepted) {
            aiCarrier.hasBall = false;
            bouncerPiece.hasBall = true;
            passExecuted = true;
          }
        }
      }

      if (passExecuted) continue;
    } else {
      // OFF-BALL DEFENCE & PLAYER OFFENSE SIMULATION
      const playerCarrier = simState.pieces.find(p => p.side === 'PLAYER' && p.hasBall);
      const playerCaptain = simState.pieces.find(p => p.isCaptain && p.side === 'PLAYER') || { cell: BOARD_CONFIG.playerScoringCell, id: 'p_captain' };

      if (playerCarrier) {
        // 1. Simulate Player's potential throw to Captain if not in baseline restart:
        const fullPlayerCaptain = simState.pieces.find(p => p.id === playerCaptain.id) || playerCarrier;
        const playerThrowPreview = previewThrow(
          playerCarrier,
          playerCaptain.cell,
          simState.pieces,
          controlMap,
          simState.temporaryState,
          undefined,
          !!simState.isRestartPhase?.PLAYER
        );

        if (!simState.isRestartPhase?.PLAYER && (playerThrowPreview.isClean || playerThrowPreview.cumulativeCaptureRisk < 0.6)) {
          const res = resolveThrow(playerCarrier, fullPlayerCaptain, simState.pieces, controlMap, rng, simState.temporaryState);
          if (!res.intercepted) {
            playerCarrier.hasBall = false;
            fullPlayerCaptain.hasBall = true;
            if (res.scored) {
              simState.score.PLAYER += 1;
              if (simState.score.PLAYER >= simState.config.board.pointsToWin) {
                simState.matchResult.isOver = true;
                simState.matchResult.winner = 'PLAYER';
                break;
              }
            }
          } else if (res.interceptedByPieceId) {
            playerCarrier.hasBall = false;
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

        // 2. AI Defenders move to interpose directly onto the player's passing ray
        const passRay = getThrowPathCells(playerCarrier.cell, playerCaptain.cell);
        for (const p of aiPieces) {
          if (p.isCaptain || p.energy < 1.0) continue;

          // Find the closest passing ray cell to step onto
          let targetRayCell = playerCarrier.cell;
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
  }

  // Heuristic Stagnation & Formation Lock Failure Check:
  // If at the end of the search depth, >40% of AI pieces still occupy their initial position
  // AND the number of AI pieces in the ENEMY half of the board (rows <= 4) never changed/increased,
  // the branch is considered to have failed to develop an attack!
  const finalAIPieces = simState.pieces.filter(p => p.side === 'AI');
  const initialPositions = BOARD_CONFIG.aiPiecesStart;
  const sameInitialCount = finalAIPieces.filter(p => {
    const init = initialPositions.find(x => x.id === p.id);
    return init && areCellsEqual(init.cell, p.cell);
  }).length;
  const pctInInitial = sameInitialCount / (finalAIPieces.length || 7);

  const enemyHalfPieces = finalAIPieces.filter(p => p.cell.row <= 4).length;
  const initialEnemyHalfPieces = initialPositions.filter(p => p.cell.row <= 4).length;

  if (pctInInitial > 0.40 && enemyHalfPieces <= initialEnemyHalfPieces && !simState.matchResult.isOver) {
    return -800.0; // Branch considered failed due to lack of forward enemy penetration
  }

  return evaluateState(simState);
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
