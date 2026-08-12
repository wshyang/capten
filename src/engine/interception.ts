import type {
  Cell,
  Piece,
  Side,
  ThrowPreviewData,
  ThrowResolution,
  InterceptionCheckCell,
  InterceptionRouletteAudit,
  ActiveTemporaryState,
  ThrowType,
} from './types';
import {
  THROW_CONFIG,
  LOFT_BY_TYPE,
  calculateTotalThrowCost,
  calculateClearRelief,
  calculateEffectiveControl,
  calculateInterceptionProbability,
  calculateCatchProbability,
} from './config/throw';
import { getControlAt, getNearestEnemyPiece } from './control';
import { SeededRNG } from './rng';
import {
  areCellsEqual,
  BOARD_CONFIG,
  isInsideBoard,
} from './config/board';

export function getThrowPathCells(from: Cell, to: Cell): Cell[] {
  if (areCellsEqual(from, to)) return [];

  const dx = to.col - from.col;
  const dy = to.row - from.row;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  const path: Cell[] = [];
  const seen = new Set<string>();
  const fromKey = `${from.col},${from.row}`;
  const toKey = `${to.col},${to.row}`;
  seen.add(fromKey);
  seen.add(toKey);

  if (absDy >= absDx && absDy > 0) {
    // Dominant row traversal: step row by row along the exact linear progression
    const stepR = Math.sign(dy);
    for (let r = from.row + stepR; r !== to.row; r += stepR) {
      const t = (r - from.row) / dy;
      const curCol = Math.round(from.col + dx * t);
      const key = `${curCol},${r}`;
      if (!seen.has(key)) {
        seen.add(key);
        path.push({ col: curCol, row: r });
      }
    }
  } else if (absDx > 0) {
    // Dominant column traversal: step column by column along the exact linear progression
    const stepC = Math.sign(dx);
    for (let c = from.col + stepC; c !== to.col; c += stepC) {
      const t = (c - from.col) / dx;
      const curRow = Math.round(from.row + dy * t);
      const key = `${c},${curRow}`;
      if (!seen.has(key)) {
        seen.add(key);
        path.push({ col: c, row: curRow });
      }
    }
  }

  return path;
}

/**
 * Checks whether a piece is an eligible throw recipient under the 1-step receiving rule:
 * - Stationary piece (0 steps): eligible.
 * - Staged move of max 1 cell (distance <= 1.42, i.e. 1 orthogonal or diagonal step): eligible!
 * - Staged move of > 1 cell (> 1.42 distance): ineligible (cannot run and catch).
 */
export function isEligibleRecipient(
  piece: Piece,
  plannedMoves?: { pieceId: string; destCell: Cell; cost: number }[]
): { eligible: boolean; targetCell: Cell; moveDist: number } {
  if (piece.isCaptain) {
    return { eligible: true, targetCell: piece.cell, moveDist: 0 };
  }

  const planned = plannedMoves?.find(m => m.pieceId === piece.id);
  if (!planned) {
    if (piece.movedLastTurn) {
      return { eligible: false, targetCell: piece.cell, moveDist: 99 };
    }
    return { eligible: true, targetCell: piece.cell, moveDist: 0 };
  }

  const moveDist = Math.hypot(planned.destCell.col - piece.cell.col, planned.destCell.row - piece.cell.row);
  const eligible = moveDist <= BOARD_CONFIG.maxRecipientMoveDistance;

  return {
    eligible,
    targetCell: planned.destCell,
    moveDist,
  };
}

export function previewThrow(
  thrower: Piece,
  targetCell: Cell,
  pieces: Piece[],
  controlMap: number[][][],
  temporaryState?: ActiveTemporaryState,
  plannedMoves?: { pieceId: string; destCell?: Cell; cost?: number }[],
  isRestartPass?: boolean,
  throwType: ThrowType = 'FLAT',
  balanceConfig?: any
): ThrowPreviewData {
  const enemySide: Side = thrower.side === 'PLAYER' ? 'AI' : 'PLAYER';
  const throwDist = Math.hypot(targetCell.col - thrower.cell.col, targetCell.row - thrower.cell.row);

  let throwCost = calculateTotalThrowCost(thrower.cell, targetCell, throwType, THROW_CONFIG, 3.0, balanceConfig);
  if (temporaryState?.longBombActive?.[thrower.side]) {
    throwCost /= 2.0;
  }

  const loft = LOFT_BY_TYPE[throwType] ?? 0;
  const postThrowEnergy = Math.max(0, thrower.energy - throwCost);
  const preThrowEnergy = thrower.energy; // §6: Interception uses PRE-THROW energy!

  let effectiveEatt = preThrowEnergy;
  if (temporaryState?.steadyHandsActive?.[thrower.side]) {
    effectiveEatt *= 1.5;
  }
  if (temporaryState?.teamEnergyInterceptionBoost?.side === thrower.side) {
    effectiveEatt *= temporaryState.teamEnergyInterceptionBoost.multiplier;
  }

  const isNoLook = !!temporaryState?.noLookPassActive?.[thrower.side] && throwDist <= 4.5;
  const pathCells = getThrowPathCells(thrower.cell, targetCell);

  const targetPiece = pieces.find(p => areCellsEqual(p.cell, targetCell));
  const catcherHeight = targetPiece?.height ?? (targetPiece?.isCaptain ? THROW_CONFIG.captainHeight : 0);
  const catchRate = isNoLook ? 1.0 : calculateCatchProbability(loft, catcherHeight, THROW_CONFIG);

  const planned = plannedMoves?.find(m => m.pieceId === targetPiece?.id);
  const moveDist = planned && targetPiece && planned.destCell
    ? Math.hypot(planned.destCell.col - targetPiece.cell.col, planned.destCell.row - targetPiece.cell.row)
    : 0;
  const targetMovedThisTurn = targetPiece
    ? (targetPiece.movedLastTurn || moveDist > BOARD_CONFIG.maxRecipientMoveDistance)
    : false;

  const checkCells: InterceptionCheckCell[] = [];
  let prodSurvival = 1.0;
  let crossedEnemyControlCount = 0;
  let skippedFirstEnemy = false;

  // Compute clear relief for a ground defender (hd = 0)
  const clearRelief = calculateClearRelief(loft, THROW_CONFIG.blockerHeight, THROW_CONFIG);

  for (const cell of pathCells) {
    const enemyFactor = getControlAt(controlMap, cell, enemySide);
    const nearestEnemy = getNearestEnemyPiece(pieces, cell, enemySide);
    const defEnergy = nearestEnemy ? nearestEnemy.energy : 0;
    const defHeight = nearestEnemy?.height ?? 0;

    let pCell = 0;

    if (enemyFactor > 0) {
      crossedEnemyControlCount++;

      if (temporaryState?.threadedPassActive?.[thrower.side] && !skippedFirstEnemy) {
        skippedFirstEnemy = true;
        pCell = 0;
      } else if (isNoLook) {
        pCell = 0;
      } else if (effectiveEatt <= 0) {
        pCell = 1.0;
      } else {
        const relief = calculateClearRelief(loft, defHeight, THROW_CONFIG);
        const fEffective = calculateEffectiveControl(enemyFactor, relief);
        pCell = calculateInterceptionProbability(fEffective, defEnergy, effectiveEatt);
        
        // Base AoC system already rewards defenders for being near the throw path
        // (they must be within ~1 cell to control cells on the path)
        // No additional defensive proximity bonus needed - it would be double-counting
      }
    }

    prodSurvival *= (1.0 - pCell);

    checkCells.push({
      cell,
      enemyControlFactor: enemyFactor,
      nearestEnemyPieceId: nearestEnemy ? nearestEnemy.id : null,
      nearestEnemyEnergy: defEnergy,
      captureProbability: isRestartPass ? 0 : pCell,
      clearRelief: calculateClearRelief(loft, defHeight, THROW_CONFIG),
      effectiveControl: calculateEffectiveControl(enemyFactor, calculateClearRelief(loft, defHeight, THROW_CONFIG)),
    });
  }

  const isClean = crossedEnemyControlCount === 0 || !!isRestartPass;
  const cumulativeCaptureRisk = isNoLook || !!isRestartPass ? 0 : (1.0 - prodSurvival);

  return {
    fromCell: thrower.cell,
    targetCell,
    throwType,
    loft,
    catcherHeight,
    distance: throwDist,
    throwCost,
    postThrowEnergy,
    preThrowEnergy,
    clearRelief,
    catchRate,
    isClean,
    pathCells: checkCells,
    cumulativeCaptureRisk,
    isNoLookPass: isNoLook,
    targetMovedThisTurn,
  };
}

export function resolveThrow(
  thrower: Piece,
  targetPiece: Piece,
  pieces: Piece[],
  controlMap: number[][][],
  rng: SeededRNG,
  temporaryState?: ActiveTemporaryState,
  plannedMoves?: { pieceId: string; destCell?: Cell; cost?: number }[],
  effectiveTargetCell?: Cell,
  isRestartPass?: boolean,
  throwType: ThrowType = 'FLAT',
  balanceConfig?: any
): ThrowResolution {
  const finalCell = effectiveTargetCell || targetPiece.cell;
  const preview = previewThrow(
    thrower,
    finalCell,
    pieces,
    controlMap,
    temporaryState,
    plannedMoves,
    isRestartPass,
    throwType,
    balanceConfig
  );
  const loft = LOFT_BY_TYPE[throwType] ?? 0;
  const catcherHeight = targetPiece.height ?? (targetPiece.isCaptain ? THROW_CONFIG.captainHeight : 0);
  const rollValues: InterceptionRouletteAudit[] = [];

  const throwEnergyPaid = preview.throwCost;
  const postThrowEnergy = preview.postThrowEnergy;
  const preThrowEnergy = preview.preThrowEnergy;

  const contestedMisses: Array<{ pieceId: string; cell: Cell; energyAfterMove: number }> = [];
  const attemptedInterceptors = new Set<string>();

  // 1. Check in-flight interception across path cells
  if (!preview.isClean && !preview.isNoLookPass) {
    let skippedFirst = false;

    for (const check of preview.pathCells) {
      let fEffective = check.effectiveControl ?? check.enemyControlFactor;

      if (temporaryState?.threadedPassActive?.[thrower.side] && !skippedFirst && check.enemyControlFactor > 0) {
        skippedFirst = true;
        fEffective = 0;
      }

      if (fEffective <= 0 || !check.nearestEnemyPieceId || attemptedInterceptors.has(check.nearestEnemyPieceId)) {
        rollValues.push({
          cell: check.cell,
          roll: 1.0,
          pCell: 0,
          intercepted: false,
          defPieceId: check.nearestEnemyPieceId || null,
          defEnergy: check.nearestEnemyEnergy,
          fEffective,
          clearRelief: check.clearRelief ?? 0,
          throwerEnergy: preThrowEnergy,
        });
        continue;
      }

      const candidateDef = pieces.find(p => p.id === check.nearestEnemyPieceId);
      if (candidateDef) {
        const currentDist = Math.hypot(candidateDef.cell.col - check.cell.col, candidateDef.cell.row - check.cell.row);
        const idxInPath = preview.pathCells.indexOf(check);
        const hasCloserLaterCell = preview.pathCells.slice(idxInPath + 1).some(
          laterCheck => Math.hypot(candidateDef.cell.col - laterCheck.cell.col, candidateDef.cell.row - laterCheck.cell.row) < currentDist - 0.01
        );
        if (hasCloserLaterCell) {
          rollValues.push({
            cell: check.cell,
            roll: 1.0,
            pCell: 0,
            intercepted: false,
            defPieceId: check.nearestEnemyPieceId || null,
            defEnergy: check.nearestEnemyEnergy,
            fEffective,
            clearRelief: check.clearRelief ?? 0,
            throwerEnergy: preThrowEnergy,
          });
          continue;
        }
      }

      // Stage 1: AoC shading probability of moving over to the intercept cell
      const pMove = Math.min(1.0, Math.max(0.0, fEffective));
      const moveRoll = rng.nextFloat();
      const movedToCell = !isRestartPass && moveRoll < pMove;

      if (!movedToCell) {
        rollValues.push({
          cell: check.cell,
          roll: moveRoll,
          pCell: pMove,
          intercepted: false,
          defPieceId: check.nearestEnemyPieceId || null,
          defEnergy: check.nearestEnemyEnergy,
          fEffective,
          clearRelief: check.clearRelief ?? 0,
          throwerEnergy: preThrowEnergy,
        });
        continue;
      }

      attemptedInterceptors.add(check.nearestEnemyPieceId!);

      // Defender moved to intercept cell: calculate movement energy cost and arrived energy
      const defPiece = pieces.find(p => p.id === check.nearestEnemyPieceId);
      const moveCost = defPiece ? Math.hypot(defPiece.cell.col - check.cell.col, defPiece.cell.row - check.cell.row) : 0;
      const arrivedDefEnergy = Math.max(0, check.nearestEnemyEnergy - moveCost);

      // Stage 2: 1:1 energy ratio evaluation between arrived energy and thrower escape velocity
      const pCatch = (arrivedDefEnergy > 0 || preThrowEnergy > 0)
        ? (arrivedDefEnergy / (arrivedDefEnergy + preThrowEnergy))
        : 0;
      const catchRoll = rng.nextFloat();
      const isInterceptedHere = catchRoll < pCatch;

      rollValues.push({
        cell: check.cell,
        roll: catchRoll,
        pCell: pCatch,
        intercepted: isInterceptedHere,
        defPieceId: check.nearestEnemyPieceId || null,
        defEnergy: arrivedDefEnergy,
        fEffective,
        clearRelief: check.clearRelief ?? 0,
        throwerEnergy: preThrowEnergy,
      });

      if (isInterceptedHere) {
        return {
          fromCell: thrower.cell,
          targetCell: finalCell,
          throwerId: thrower.id,
          intendedTargetPieceId: targetPiece.id,
          throwType,
          loft,
          catcherHeight,
          isClean: false,
          throwEnergyPaid,
          postThrowEnergy,
          preThrowEnergy,
          intercepted: true,
          interceptedAtCell: check.cell,
          interceptedByPieceId: check.nearestEnemyPieceId || undefined,
          interceptorArrivedEnergy: arrivedDefEnergy,
          contestedMisses,
          catchRoll: 1.0,
          catchSuccess: false,
          scored: false,
          rollValues,
          refunded: false,
        };
      } else {
        // Defender gambled and missed: record relocation to interception cell
        contestedMisses.push({
          pieceId: check.nearestEnemyPieceId!,
          cell: check.cell,
          energyAfterMove: arrivedDefEnergy,
        });
      }
    }
  }

  // 2. Ball reached target cell in-flight without interception! Now resolve CATCH reception (§7)
  const catchRate = preview.catchRate;
  const catchRoll = rng.nextFloat();
  const catchSuccess = preview.isNoLookPass || catchRoll < catchRate;

  if (catchSuccess) {
    const scored = targetPiece.isCaptain;
    return {
      fromCell: thrower.cell,
      targetCell: finalCell,
      throwerId: thrower.id,
      intendedTargetPieceId: targetPiece.id,
      throwType,
      loft,
      catcherHeight,
      isClean: preview.isClean,
      throwEnergyPaid: preview.isClean ? 0 : throwEnergyPaid,
      postThrowEnergy: preview.isClean ? thrower.energy : postThrowEnergy,
      preThrowEnergy,
      intercepted: false,
      contestedMisses,
      catchRoll,
      catchSuccess: true,
      scored,
      rollValues,
      refunded: preview.isClean,
    };
  }

  // 3. MISSED CATCH RESOLUTION (§8: Overshoot, Undershoot, or Fumble)
  const mismatch = loft - catcherHeight;
  const missedCatchResult = resolveMissedCatch(
    thrower,
    targetPiece,
    throwType,
    finalCell,
    pieces,
    controlMap,
    rng,
    mismatch,
    preThrowEnergy
  );

  return {
    fromCell: thrower.cell,
    targetCell: finalCell,
    throwerId: thrower.id,
    intendedTargetPieceId: targetPiece.id,
    throwType,
    loft,
    catcherHeight,
    isClean: preview.isClean,
    throwEnergyPaid,
    postThrowEnergy,
    preThrowEnergy,
    intercepted: false,
    catchRoll,
    catchSuccess: false,
    scored: false,
    missedCatchType: missedCatchResult.type,
    ballRestCell: missedCatchResult.landingCell,
    ballHolderId: missedCatchResult.ballHolderId,
    contestedMisses,
    rollValues,
    refunded: false,
  };
}

export interface MissedCatchOutcome {
  type: 'OVERSHOOT' | 'UNDERSHOOT' | 'FUMBLE' | 'OUT_OF_BOUNDS';
  landingCell: Cell;
  ballHolderId?: string;
  details: Record<string, any>;
}

/**
 * Complete Missed-Catch Resolution Engine (§8):
 * - m > 0 (Overshoot): Ball continues on trajectory; grabs/overlap contest/out-of-bounds.
 * - m < 0 (Undershoot): Ball falls short |m| cells; race with +/-20% window and clash roulette with loser bump.
 * - m = 0 (Fumble): Drops in place on receiver cell as claimable loose ball.
 */
export function resolveMissedCatch(
  thrower: Piece,
  receiver: Piece,
  _throwType: ThrowType,
  targetCell: Cell,
  pieces: Piece[],
  controlMap: number[][][],
  rng: SeededRNG,
  mismatch: number,
  preThrowEnergy: number
): MissedCatchOutcome {
  const dx = targetCell.col - thrower.cell.col;
  const dy = targetCell.row - thrower.cell.row;
  const throwDist = Math.hypot(dx, dy);
  const unitX = throwDist > 0 ? dx / throwDist : 0;
  const unitY = throwDist > 0 ? dy / throwDist : 1;

  // ==================== 8.1 OVERSHOOT (m > 0) ====================
  if (mismatch > 0) {
    const eBall = preThrowEnergy; // Residual ball energy
    let curDist = throwDist;
    let stepCount = 0;

    while (stepCount < 12) {
      stepCount++;
      curDist += 1.0;
      const nextCol = Math.round(thrower.cell.col + unitX * curDist);
      const nextRow = Math.round(thrower.cell.row + unitY * curDist);
      const nextCell: Cell = { col: nextCol, row: nextRow };

      // Check if ball left the court -> Out of Bounds (§8.5)
      if (!isInsideBoard(nextCell)) {
        const exitCol = Math.max(0, Math.min(10, nextCol));
        const exitRow = Math.max(0, Math.min(10, nextRow));
        const exitCell: Cell = { col: exitCol, row: exitRow };

        // Opposing team piece closest to exit cell takes possession for throw-in
        const opposingSide: Side = thrower.side === 'PLAYER' ? 'AI' : 'PLAYER';
        const eligibleOpponents = pieces.filter(p => p.side === opposingSide && !p.isCaptain);
        eligibleOpponents.sort((a, b) => {
          const dA = Math.hypot(a.cell.col - exitCell.col, a.cell.row - exitCell.row);
          const dB = Math.hypot(b.cell.col - exitCell.col, b.cell.row - exitCell.row);
          if (Math.abs(dA - dB) > 0.01) return dA - dB;
          if (Math.abs(b.energy - a.energy) > 0.01) return b.energy - a.energy;
          return Math.abs(a.cell.col - 5) - Math.abs(b.cell.col - 5);
        });

        const throwInPiece = eligibleOpponents[0];

        return {
          type: 'OUT_OF_BOUNDS',
          landingCell: exitCell,
          ballHolderId: throwInPiece?.id,
          details: { exitCell, throwInPieceId: throwInPiece?.id, reason: 'Overshot court boundaries' },
        };
      }

      // Check pieces controlling this cell
      const playerControl = getControlAt(controlMap, nextCell, 'PLAYER');
      const aiControl = getControlAt(controlMap, nextCell, 'AI');

      // Overlap Contest (§8.4) if both sides project control
      if (playerControl > 0 && aiControl > 0) {
        const playerPiecesNear = pieces
          .filter(p => p.side === 'PLAYER' && Math.hypot(p.cell.col - nextCell.col, p.cell.row - nextCell.row) <= 1.5)
          .sort((a, b) => b.energy - a.energy);
        const aiPiecesNear = pieces
          .filter(p => p.side === 'AI' && Math.hypot(p.cell.col - nextCell.col, p.cell.row - nextCell.row) <= 1.5)
          .sort((a, b) => b.energy - a.energy);

        const wPlayer = playerControl * (playerPiecesNear[0]?.energy || 5.0);
        const wAI = aiControl * (aiPiecesNear[0]?.energy || 5.0);
        const totalW = wPlayer + wAI;

        if (totalW > 0) {
          const roll = rng.nextFloat();
          const playerWins = roll < (wPlayer / totalW);
          const winnerPiece = playerWins ? playerPiecesNear[0] : aiPiecesNear[0];

          if (winnerPiece) {
            return {
              type: 'OVERSHOOT',
              landingCell: nextCell,
              ballHolderId: winnerPiece.id,
              details: { grabbedAt: nextCell, reason: 'Overlap contest winner gathered overthrow' },
            };
          }
        }
      }

      // Single controlling side
      const controllingSide: Side | null = playerControl > 0 && aiControl > 0
        ? (playerControl > aiControl ? 'PLAYER' : aiControl > playerControl ? 'AI' : (rng.nextFloat() < 0.5 ? 'PLAYER' : 'AI'))
        : (playerControl > 0 ? 'PLAYER' : aiControl > 0 ? 'AI' : null);
      if (controllingSide) {
        const factor = controllingSide === 'PLAYER' ? playerControl : aiControl;
        const nearest = getNearestEnemyPiece(pieces, nextCell, controllingSide === 'PLAYER' ? 'AI' : 'PLAYER') ||
          pieces.find(p => p.side === controllingSide);
        const ePiece = nearest?.energy || 5.0;

        const pGrab = (factor * ePiece) / (factor * ePiece + eBall);
        const grabRoll = rng.nextFloat();

        if (grabRoll < pGrab && nearest) {
          return {
            type: 'OVERSHOOT',
            landingCell: nextCell,
            ballHolderId: nearest.id,
            details: { grabbedAt: nextCell, pieceId: nearest.id, reason: 'Overthrow grabbed in flight' },
          };
        }
      }
    }

    // Default fallback overshoot to exit boundary
    const clampedCol = Math.max(0, Math.min(10, Math.round(thrower.cell.col + unitX * (throwDist + 3))));
    const clampedRow = Math.max(0, Math.min(10, Math.round(thrower.cell.row + unitY * (throwDist + 3))));
    return {
      type: 'OUT_OF_BOUNDS',
      landingCell: { col: clampedCol, row: clampedRow },
      details: { reason: 'Overthrow ungathered' },
    };
  }

  // ==================== 8.2 UNDERSHOOT (m < 0) ====================
  if (mismatch < 0) {
    const cellsShort = Math.abs(mismatch) * THROW_CONFIG.undershootPerTier;
    const landDist = Math.max(0, throwDist - cellsShort);
    const landCol = Math.max(0, Math.min(10, Math.round(thrower.cell.col + unitX * landDist)));
    const landRow = Math.max(0, Math.min(10, Math.round(thrower.cell.row + unitY * landDist)));
    const landingCell: Cell = { col: landCol, row: landRow };

    // 1. Eligible pieces: Euclidean distance <= current movement energy
    const eligiblePlayer = pieces.filter(p => p.side === 'PLAYER' && !p.isCaptain && Math.hypot(p.cell.col - landCol, p.cell.row - landRow) <= p.energy + 0.01);
    const eligibleAI = pieces.filter(p => p.side === 'AI' && !p.isCaptain && Math.hypot(p.cell.col - landCol, p.cell.row - landRow) <= p.energy + 0.01);

    eligiblePlayer.sort((a, b) => Math.hypot(a.cell.col - landCol, a.cell.row - landRow) - Math.hypot(b.cell.col - landCol, b.cell.row - landRow));
    eligibleAI.sort((a, b) => Math.hypot(a.cell.col - landCol, a.cell.row - landRow) - Math.hypot(b.cell.col - landCol, b.cell.row - landRow));

    const champPlayer = eligiblePlayer[0];
    const champAI = eligibleAI[0];

    // Both sides have eligible pieces
    if (champPlayer && champAI) {
      const dPlayer = Math.hypot(champPlayer.cell.col - landCol, champPlayer.cell.row - landRow);
      const dAI = Math.hypot(champAI.cell.col - landCol, champAI.cell.row - landRow);
      const dNear = Math.min(dPlayer, dAI);
      const dFar = Math.max(dPlayer, dAI);

      const isContested = THROW_CONFIG.contestInclusive
        ? dFar <= dNear * (1.0 + THROW_CONFIG.contestFactor) + 0.001
        : dFar < dNear * (1.0 + THROW_CONFIG.contestFactor);

      if (isContested) {
        // CONTEST: Both move, pay energy, resolve clash roulette
        const ePlayer = Math.max(0.1, champPlayer.energy - dPlayer);
        const eAI = Math.max(0.1, champAI.energy - dAI);
        const pPlayerWin = ePlayer / (ePlayer + eAI);
        const clashRoll = rng.nextFloat();
        const playerWins = clashRoll < pPlayerWin;
        const winner = playerWins ? champPlayer : champAI;
        const loser = playerWins ? champAI : champPlayer;

        return {
          type: 'UNDERSHOOT',
          landingCell,
          ballHolderId: winner.id,
          details: {
            contested: true,
            winnerId: winner.id,
            loserId: loser.id,
            landingCell,
            dNear,
            dFar,
            reason: 'Undershoot race clash contest',
          },
        };
      } else {
        // UNCONTESTED: Nearer champion takes it
        const nearerChamp = Math.abs(dPlayer - dAI) < 0.001
          ? (rng.nextFloat() < 0.5 ? champPlayer : champAI)
          : (dPlayer < dAI ? champPlayer : champAI);
        return {
          type: 'UNDERSHOOT',
          landingCell,
          ballHolderId: nearerChamp.id,
          details: { contested: false, winnerId: nearerChamp.id, landingCell, reason: 'Undershoot uncontested race win' },
        };
      }
    }

    // Only one team has eligible piece
    if (champPlayer) {
      return {
        type: 'UNDERSHOOT',
        landingCell,
        ballHolderId: champPlayer.id,
        details: { contested: false, winnerId: champPlayer.id, landingCell, reason: 'Undershoot solo recovery' },
      };
    }
    if (champAI) {
      return {
        type: 'UNDERSHOOT',
        landingCell,
        ballHolderId: champAI.id,
        details: { contested: false, winnerId: champAI.id, landingCell, reason: 'Undershoot solo opponent takeaway' },
      };
    }

    // Neither piece can reach -> Loose ball on landing cell (§8.6)
    return {
      type: 'UNDERSHOOT',
      landingCell,
      details: { contested: false, isLooseBall: true, landingCell, reason: 'Undershoot untouched loose ball' },
    };
  }

  // ==================== 8.3 FUMBLE (m === 0) ====================
  // Ball dropped on receiver's own cell
  return {
    type: 'FUMBLE',
    landingCell: { ...receiver.cell },
    details: { receiverId: receiver.id, landingCell: receiver.cell, reason: 'Fumble dropped in place on receiver cell' },
  };
}
