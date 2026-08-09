import type { GameState, GameAction, Side, Card, GameEvent, Piece, Cell, GamePhase, GameConfig, ThrowType } from './types';
import { SeededRNG } from './rng';
import { isLegalMove, getEffectiveMoveCost } from './movement';
import { resolveThrow } from './interception';
import { computeControlMap } from './control';
import { CARDS_BY_ID } from './config/cards';
import { calculateInterceptionMomentumEarn } from './config/momentum';
import { runSeededMCTS } from './ai/mcts';
import { getAIDiscardChoice } from './ai/cardSearch';
import { generateAptitudeReport } from './scoring';
import { createInitialState } from './setup';
import { areCellsEqual, findNearestUnoccupiedCell, findNearestDefenseCircleCell, BOARD_CONFIG } from './config/board';
import {
  LOFT_BY_TYPE,
  calculateTotalThrowCost,
} from './config/throw';

/**
 * Enforces the core invariant (§4): Ball is held by EXACTLY ONE piece at all times.
 */
function syncBallHolder(pieces: Piece[], explicitHolderId: string | null): Piece[] {
  let holderId = explicitHolderId;
  if (!holderId) {
    const current = pieces.find(p => p.hasBall);
    holderId = current ? current.id : (pieces.find(p => p.side === 'PLAYER' && !p.isCaptain)?.id || 'p_1');
  }

  return pieces.map(p => ({
    ...p,
    hasBall: p.id === holderId,
  }));
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  const rng = new SeededRNG(state.seed);
  rng.setState(state.rngState);

  switch (action.type) {
    case 'INIT_MATCH': {
      return createInitialState(action.seed ?? state.seed, action.configOverrides);
    }

    case 'JUMP_BALL_TICK': {
      if (state.phase !== 'JUMP_BALL') return state;
      return {
        ...state,
        jumpBall: {
          ...state.jumpBall,
          currentIndicator: action.indicator,
          cycleCount: state.jumpBall.cycleCount + 1,
        },
      };
    }

    case 'JUMP_BALL_PRESS': {
      if (state.phase !== 'JUMP_BALL') return state;
      return {
        ...state,
        jumpBall: {
          ...state.jumpBall,
          playerHeld: true,
        },
      };
    }

    case 'JUMP_BALL_RELEASE': {
      if (state.phase !== 'JUMP_BALL') return state;
      const wonBy = action.wonBy;
      // Center-line player (p_1 at 5,4 or ai_1 at 5,6) receives the ball upon winning opening jump-ball
      const winningHolderId = wonBy === 'PLAYER' ? 'p_1' : 'ai_1';
      const initialPieces = syncBallHolder(state.pieces, winningHolderId);
      const nextPhase: GamePhase = wonBy === 'PLAYER' ? 'PLAYER_PLAN' : 'AI_TURN';
      const nextToAct: Side = wonBy;

      const event: GameEvent = {
        id: `ev_${Date.now()}_${state.eventLog.length}`,
        timestamp: Date.now(),
        turn: 1,
        phase: 'JUMP_BALL',
        side: wonBy,
        type: 'JUMP_BALL_WON',
        details: {
          wonBy,
          releaseMarginMs: action.releaseMarginMs,
          ballHolderId: winningHolderId,
        },
        stateSummary: {
          playerScore: 0,
          aiScore: 0,
          playerMomentum: state.momentum.PLAYER,
          aiMomentum: state.momentum.AI,
        },
      };

      return {
        ...state,
        rngState: rng.getState(),
        phase: nextPhase,
        toAct: nextToAct,
        pieces: initialPieces,
        ballHolderId: winningHolderId,
        jumpBall: {
          ...state.jumpBall,
          active: false,
          playerHeld: false,
          wonBy,
          releaseMarginMs: action.releaseMarginMs,
        },
        eventLog: [...state.eventLog, event],
        timer: {
          ...state.timer,
          turnStartTime: Date.now(),
          remainingSeconds: state.config.timing.turnTimerSeconds,
          isExpired: false,
        },
      };
    }

    case 'CHOOSE_RESTART_THROWER': {
      if (state.phase !== 'PLAYER_PLAN') return state;
      const captain = state.pieces.find(p => p.side === 'PLAYER' && p.isCaptain);
      if (!captain) return state;

      const updatedPieces = state.pieces.map(p => ({
        ...p,
        hasBall: p.id === captain.id,
      }));

      return {
        ...state,
        pieces: syncBallHolder(updatedPieces, captain.id),
        ballHolderId: captain.id,
      };
    }

    // Stage / Direct Move
    case 'STAGE_MOVE':
    case 'MOVE_PIECE_DIRECT': {
      if (state.phase !== 'PLAYER_PLAN' || state.timer.isExpired) return state;
      const piece = state.pieces.find(p => p.id === action.pieceId);
      if (!piece || piece.side !== 'PLAYER') return state;

      if (piece.hasBall && !state.config.board.carrierMayPivotStep) return state;
      if (piece.isCaptain) return state;

      // Invariant: Two separate pieces cannot be staged to move into the same cell
      const isCellAlreadyStaged = state.plannedMoves.some(
        m => m.pieceId !== action.pieceId && areCellsEqual(m.destCell, action.destCell)
      );
      if (isCellAlreadyStaged) return state;

      const check = isLegalMove(
        piece,
        action.destCell,
        state.pieces,
        state.temporaryState,
        11,
        11,
        state.config.board.carrierMayPivotStep,
        state.plannedMoves
      );
      if (!check.legal) return state;

      const existingFiltered = state.plannedMoves.filter(m => m.pieceId !== action.pieceId);
      return {
        ...state,
        plannedMoves: [...existingFiltered, { pieceId: action.pieceId, destCell: action.destCell, cost: check.cost }],
      };
    }

    case 'UNSTAGE_MOVE': {
      return {
        ...state,
        plannedMoves: state.plannedMoves.filter(m => m.pieceId !== action.pieceId),
      };
    }

    case 'CLEAR_PLANNED_MOVES': {
      return {
        ...state,
        plannedMoves: [],
      };
    }

    case 'STAGE_THROW': {
      if (state.phase !== 'PLAYER_PLAN' || state.timer.isExpired) return state;
      const carrier = state.pieces.find(p => p.side === 'PLAYER' && p.hasBall);
      if (!carrier) return state;

      const targetPiece = state.pieces.find(p => p.id === action.targetPieceId);
      if (!targetPiece) return state;

      // Tournament Rule (§Mandatory Court Pass): Direct pass to Captain from baseline restart is forbidden
      if (targetPiece.isCaptain && state.isRestartPhase?.PLAYER && !carrier.isCaptain) {
        return {
          ...state,
          plannedThrow: null,
        };
      }

      const throwType: ThrowType = action.throwType || state.plannedThrow?.throwType || (targetPiece.isCaptain ? 'HIGH_LOB' : 'FLAT');
      const loft = LOFT_BY_TYPE[throwType] ?? 0;

      // 1-step receiving rule:
      // If target piece has a staged move > 1.42 cells, reject!
      // If target piece has a staged move <= 1.42 cells (or 0 steps), accept and set targetCell to staged destination!
      const stagedMove = state.plannedMoves.find(m => m.pieceId === targetPiece.id);
      let targetCell = { ...action.targetCell };
      if (stagedMove) {
        const moveDist = Math.hypot(stagedMove.destCell.col - targetPiece.cell.col, stagedMove.destCell.row - targetPiece.cell.row);
        if (moveDist > 1.42) {
          return {
            ...state,
            plannedThrow: null,
          };
        }
        targetCell = { ...stagedMove.destCell };
      } else {
        const dist = Math.hypot(action.targetCell.col - targetPiece.cell.col, action.targetCell.row - targetPiece.cell.row);
        if (dist > 1.42 && !targetPiece.isCaptain) {
          return {
            ...state,
            plannedThrow: null,
          };
        }
        if (targetPiece.movedLastTurn) {
          return {
            ...state,
            plannedThrow: null,
          };
        }
      }

      const totalCost = calculateTotalThrowCost(carrier.cell, targetCell, throwType, state.config.throw);
      if (carrier.energy < totalCost) {
        return {
          ...state,
          plannedThrow: null,
        };
      }

      return {
        ...state,
        plannedThrow: {
          targetPieceId: action.targetPieceId,
          targetCell,
          throwType,
          loft,
          totalCost,
        },
      };
    }

    case 'UNSTAGE_THROW': {
      return {
        ...state,
        plannedThrow: null,
      };
    }

    case 'STAGE_CARD': {
      if (state.phase !== 'PLAYER_PLAN' || state.timer.isExpired) return state;
      const card = CARDS_BY_ID[action.cardId];
      if (!card) return state;

      const side: Side = state.toAct;
      const currentMomentum = state.momentum[side];
      if (currentMomentum < card.momentumCost) return state;

      const swingCost = card.swingEnergyCost || 0;
      if (swingCost > 0) {
        const sidePieces = state.pieces.filter(p => p.side === side);
        const hasEnoughPieceEnergy = sidePieces.some(p => p.energy >= swingCost);
        if (!hasEnoughPieceEnergy) return state;
      }

      const existingFiltered = (state.plannedCards || []).filter(pc => pc.cardId !== action.cardId);
      return {
        ...state,
        plannedCards: [
          ...existingFiltered,
          {
            cardId: action.cardId,
            targetPieceId: action.targetPieceId,
            targetCell: action.targetCell,
            secondaryPieceId: action.secondaryPieceId,
          },
        ],
        cardPlayedThisTurn: {
          ...state.cardPlayedThisTurn,
          PLAYER: true,
        },
      };
    }

    case 'UNSTAGE_CARD': {
      const remaining = (state.plannedCards || []).filter(pc => pc.cardId !== action.cardId);
      return {
        ...state,
        plannedCards: remaining,
        cardPlayedThisTurn: {
          ...state.cardPlayedThisTurn,
          PLAYER: remaining.length > 0,
        },
      };
    }

    case 'CLEAR_PLANNED_CARDS': {
      return {
        ...state,
        plannedCards: [],
        cardPlayedThisTurn: {
          ...state.cardPlayedThisTurn,
          PLAYER: false,
        },
      };
    }

    case 'EXECUTE_PLAYER_MOVES': {
      if (state.phase !== 'PLAYER_PLAN' || state.plannedMoves.length === 0) return state;

      const newEvents: GameEvent[] = [];
      const updatedPieces = state.pieces.map(p => {
        const planned = state.plannedMoves.find(m => m.pieceId === p.id);
        if (planned) {
          newEvents.push({
            id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
            timestamp: Date.now(),
            turn: state.turn,
            phase: 'PLAYER_PLAN',
            side: 'PLAYER',
            type: 'PIECE_MOVED',
            details: {
              pieceId: p.id,
              fromCell: { ...p.cell },
              toCell: { ...planned.destCell },
              cost: planned.cost,
            },
          });
          return {
            ...p,
            cell: { ...planned.destCell },
            energy: Math.max(0, p.energy - planned.cost),
            movedLastTurn: true,
          };
        }
        return p;
      });

      const updatedControl = computeControlMap(updatedPieces, state.temporaryState);

      return {
        ...state,
        pieces: syncBallHolder(updatedPieces, state.ballHolderId),
        plannedMoves: [],
        controlMap: updatedControl,
        eventLog: [...state.eventLog, ...newEvents],
      };
    }

    case 'THROW_BALL': {
      if (state.phase !== 'PLAYER_PLAN' || state.timer.isExpired) return state;
      const carrier = state.pieces.find(p => p.side === 'PLAYER' && p.hasBall);
      if (!carrier) return state;

      const targetPiece = state.pieces.find(
        p => p.side === 'PLAYER' && (areCellsEqual(p.cell, action.targetCell) || state.plannedMoves.some(m => m.pieceId === p.id && areCellsEqual(m.destCell, action.targetCell)))
      );
      if (!targetPiece || targetPiece.id === carrier.id) return state;

      // Tournament Rule (§Mandatory Court Pass): Direct pass to Captain from baseline restart is forbidden
      if (targetPiece.isCaptain && state.isRestartPhase?.PLAYER && !carrier.isCaptain) return state;

      const stagedMove = state.plannedMoves.find(m => m.pieceId === targetPiece.id);
      let effectiveTargetCell = { ...action.targetCell };
      if (stagedMove) {
        const moveDist = Math.hypot(stagedMove.destCell.col - targetPiece.cell.col, stagedMove.destCell.row - targetPiece.cell.row);
        if (moveDist > 1.42) return state;
        effectiveTargetCell = { ...stagedMove.destCell };
      } else if (targetPiece.movedLastTurn) {
        return state;
      }

      const throwType: ThrowType = action.throwType || state.plannedThrow?.throwType || (targetPiece.isCaptain ? 'HIGH_LOB' : 'FLAT');
      const isRestart = !!state.isRestartPhase?.PLAYER;

      const resolution = resolveThrow(
        carrier,
        targetPiece,
        state.pieces,
        state.controlMap,
        rng,
        state.temporaryState,
        state.plannedMoves,
        effectiveTargetCell,
        isRestart,
        throwType
      );

      const newEvents: GameEvent[] = [];
      let updatedScore = { ...state.score };
      const updatedMomentum = { ...state.momentum };
      let isMatchOver = false;
      let winner: Side | null = null;
      let nextBallHolderId: string = carrier.id;
      const updatedIsRestartPhase = { ...state.isRestartPhase };

      newEvents.push({
        id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
        timestamp: Date.now(),
        turn: state.turn,
        phase: 'RESOLVE',
        side: 'PLAYER',
        type: 'PASS_ATTEMPTED',
        details: {
          throwerId: carrier.id,
          targetPieceId: targetPiece.id,
          targetCell: action.targetCell,
          throwType,
          loft: resolution.loft,
          isClean: resolution.isClean,
          throwEnergyPaid: resolution.throwEnergyPaid,
          postThrowEnergy: resolution.postThrowEnergy,
          preThrowEnergy: resolution.preThrowEnergy,
          rollValues: resolution.rollValues,
        },
      });

      if (resolution.rollValues) {
        for (const rv of resolution.rollValues) {
          if (rv.fEffective !== undefined && (rv.fEffective > 0 || rv.pCell > 0)) {
            newEvents.push({
              id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
              timestamp: Date.now(),
              turn: state.turn,
              phase: 'RESOLVE',
              side: 'PLAYER',
              type: 'ROULETTE_EVALUATED',
              details: {
                cell: rv.cell,
                defPieceId: rv.defPieceId,
                defEnergy: rv.defEnergy,
                fEffective: rv.fEffective,
                clearRelief: rv.clearRelief,
                throwerEnergy: rv.throwerEnergy,
                pCell: rv.pCell,
                roll: rv.roll,
                intercepted: rv.intercepted,
              },
            });
          }
        }
      }

      let updatedPieces = state.pieces.map(p => {
        if (p.id === carrier.id) {
          return {
            ...p,
            energy: resolution.postThrowEnergy,
          };
        }
        return p;
      });

      if (resolution.isClean) {
        newEvents.push({
          id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
          timestamp: Date.now(),
          turn: state.turn,
          phase: 'RESOLVE',
          side: 'PLAYER',
          type: 'PASS_CLEAN_REFUND',
          details: { throwerId: carrier.id, targetPieceId: targetPiece.id },
        });

        if (targetPiece.isCaptain) {
          updatedMomentum.PLAYER = Math.min(
            state.config.momentum.maxMomentum,
            updatedMomentum.PLAYER + state.config.momentum.cleanAssistEarn
          );
          newEvents.push({
            id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
            timestamp: Date.now(),
            turn: state.turn,
            phase: 'RESOLVE',
            side: 'PLAYER',
            type: 'MOMENTUM_EARNED',
            details: { reason: 'CLEAN_ASSIST_TO_CAPTAIN', amount: 2 },
          });
        }
      }

      if (resolution.intercepted) {
        nextBallHolderId = resolution.interceptedByPieceId || 'ai_1';
        const interceptor = updatedPieces.find(p => p.id === nextBallHolderId);
        let lungeCost = 0;
        if (interceptor && resolution.interceptedAtCell && !interceptor.isCaptain) {
          let destCell: Cell;
          if (interceptor.isBlocker) {
            const targetCaptain = interceptor.side === 'PLAYER' ? BOARD_CONFIG.aiScoringCell : BOARD_CONFIG.playerScoringCell;
            destCell = findNearestDefenseCircleCell(targetCaptain, updatedPieces, interceptor.cell);
          } else {
            destCell = findNearestUnoccupiedCell(resolution.interceptedAtCell, updatedPieces, interceptor.cell);
          }
          lungeCost = getEffectiveMoveCost(interceptor.cell, destCell, interceptor, state.temporaryState);
          interceptor.energy = Math.max(0, interceptor.energy - lungeCost);
          interceptor.cell = { ...destCell };
          interceptor.movedLastTurn = true;
          interceptor.hasBall = true;
        }
        if (interceptor) {
          const earned = calculateInterceptionMomentumEarn(interceptor.restStreak);
          updatedMomentum.AI = Math.min(
            state.config.momentum.maxMomentum,
            updatedMomentum.AI + earned
          );
        }

        newEvents.push({
          id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
          timestamp: Date.now(),
          turn: state.turn,
          phase: 'RESOLVE',
          side: 'PLAYER',
          type: 'PASS_INTERCEPTED',
          details: {
            interceptedAtCell: resolution.interceptedAtCell,
            interceptedByPieceId: resolution.interceptedByPieceId,
            lungeCost,
            postInterceptEnergy: interceptor ? interceptor.energy : 0,
            rollValues: resolution.rollValues,
          },
        });
      } else if (resolution.catchSuccess) {
        nextBallHolderId = targetPiece.id;
        if (!targetPiece.isCaptain) {
          updatedIsRestartPhase.PLAYER = false; // Mandatory court pass completed!
        }

        newEvents.push({
          id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
          timestamp: Date.now(),
          turn: state.turn,
          phase: 'RESOLVE',
          side: 'PLAYER',
          type: 'PASS_COMPLETED',
          details: { receiverId: targetPiece.id, loft: resolution.loft, catchRoll: resolution.catchRoll },
        });

        if (resolution.scored) {
          updatedScore.PLAYER += 1;
          updatedIsRestartPhase.AI = true; // AI concedes goal, enters baseline restart
          newEvents.push({
            id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
            timestamp: Date.now(),
            turn: state.turn,
            phase: 'RESOLVE',
            side: 'PLAYER',
            type: 'SCORE_GOAL',
            details: {
              scorerPieceId: targetPiece.id,
              playerScore: updatedScore.PLAYER,
              aiScore: updatedScore.AI,
            },
          });

          if (updatedScore.PLAYER >= state.config.board.pointsToWin) {
            isMatchOver = true;
            winner = 'PLAYER';
          } else {
            // Ball awarded to conceding team Captain (ai_captain at 5,0) for free restart throw out to court teammates
            nextBallHolderId = 'ai_captain';
            updatedPieces = updatedPieces.map(p => {
              if (p.id === 'ai_captain') {
                return { ...p, energy: state.config.energy.maxEnergy, movedLastTurn: false, hasBall: true };
              }
              return { ...p, hasBall: false };
            });
          }
        }
      } else {
        // Missed catch handling (§8: Overshoot, Undershoot, Fumble, Out of Bounds)
        const missedType = resolution.missedCatchType || 'FUMBLE';
        nextBallHolderId = resolution.ballHolderId || 'ai_1';

        if (missedType === 'OUT_OF_BOUNDS') {
          newEvents.push({
            id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
            timestamp: Date.now(),
            turn: state.turn,
            phase: 'RESOLVE',
            side: 'PLAYER',
            type: 'OUT_OF_BOUNDS_THROW_IN',
            details: {
              exitCell: resolution.ballRestCell,
              throwInPieceId: resolution.ballHolderId,
              reason: 'Overthrow out of bounds. Throw-in awarded to opponent.',
            },
          });
        } else if (missedType === 'UNDERSHOOT') {
          newEvents.push({
            id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
            timestamp: Date.now(),
            turn: state.turn,
            phase: 'RESOLVE',
            side: 'PLAYER',
            type: 'PASS_UNDERSHOOT_RACE',
            details: {
              landingCell: resolution.ballRestCell,
              winnerId: resolution.ballHolderId,
              reason: 'Undershoot dropped short. Resolved via race contest.',
            },
          });
        } else if (missedType === 'OVERSHOOT') {
          newEvents.push({
            id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
            timestamp: Date.now(),
            turn: state.turn,
            phase: 'RESOLVE',
            side: 'PLAYER',
            type: 'PASS_OVERSHOOT_GRABBED',
            details: {
              landingCell: resolution.ballRestCell,
              grabberId: resolution.ballHolderId,
              reason: 'Overthrow continued past receiver and was grabbed in flight.',
            },
          });
        } else {
          newEvents.push({
            id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
            timestamp: Date.now(),
            turn: state.turn,
            phase: 'RESOLVE',
            side: 'PLAYER',
            type: 'PASS_FUMBLE_LOOSE',
            details: {
              landingCell: resolution.ballRestCell,
              reason: 'Fumble dropped in place on receiver cell.',
            },
          });
        }
      }

      const tempState = { ...state.temporaryState };
      if (tempState.giveAndGoAvailablePieceId === carrier.id) {
        tempState.giveAndGoAvailablePieceId = null;
      }

      const finalizedPieces = syncBallHolder(updatedPieces, nextBallHolderId);

      const nextState: GameState = {
        ...state,
        rngState: rng.getState(),
        pieces: finalizedPieces,
        ballHolderId: nextBallHolderId,
        isRestartPhase: updatedIsRestartPhase,
        plannedThrow: null,
        score: updatedScore,
        momentum: updatedMomentum,
        temporaryState: tempState,
        eventLog: [...state.eventLog, ...newEvents],
      };

      if (isMatchOver) {
        const aptitudeReport = generateAptitudeReport(nextState);
        return {
          ...nextState,
          phase: 'MATCH_OVER',
          matchResult: {
            isOver: true,
            winner,
            reason: `Victory condition met: ${updatedScore.PLAYER} - ${updatedScore.AI}`,
            aptitudeReport,
          },
        };
      }

      return nextState;
    }

    case 'PLAY_CARD': {
      if (state.timer.isExpired) return state;
      const card = CARDS_BY_ID[action.cardId];
      if (!card) return state;

      const side: Side = state.toAct;
      const currentMomentum = state.momentum[side];
      if (currentMomentum < card.momentumCost) return state;

      const swingCost = card.swingEnergyCost || 0;
      const updatedPieces = [...state.pieces];

      if (swingCost > 0) {
        const sidePieces = updatedPieces.filter(p => p.side === side);
        const hasEnoughPieceEnergy = sidePieces.some(p => p.energy >= swingCost);
        if (!hasEnoughPieceEnergy) return state;

        const chosenPiece = sidePieces.sort((a, b) => b.energy - a.energy)[0];
        chosenPiece.energy = Math.max(0, chosenPiece.energy - swingCost);
      }

      const updatedMomentum = {
        ...state.momentum,
        [side]: currentMomentum - card.momentumCost,
      };

      const hand = state.hands[side].filter(c => c.id !== card.id);
      const discardPiles = {
        ...state.discardPiles,
        [side]: [...state.discardPiles[side], card],
      };

      const hands = {
        ...state.hands,
        [side]: hand,
      };

      const tempState: any = { ...state.temporaryState };

      switch (card.effect) {
        case 'deep_breath': {
          if (action.targetPieceId) {
            const p = updatedPieces.find(x => x.id === action.targetPieceId);
            if (p) p.restStreak += 2;
          }
          break;
        }
        case 'second_wind': {
          if (action.targetPieceId) {
            const p = updatedPieces.find(x => x.id === action.targetPieceId);
            if (p) p.energy = Math.min(state.config.energy.maxEnergy, p.energy + 4.0);
          }
          break;
        }
        case 'slow_burn': {
          if (action.targetPieceId) {
            const p = updatedPieces.find(x => x.id === action.targetPieceId);
            if (p) p.buffs.push({ id: 'buff_slow_burn', type: 'SLOW_BURN', durationTurns: 3 });
          }
          break;
        }
        case 'drain': {
          if (action.targetPieceId) {
            const p = updatedPieces.find(x => x.id === action.targetPieceId);
            if (p) p.energy = Math.max(0, p.energy - 2.0);
          }
          break;
        }
        case 'overclock': {
          if (action.targetPieceId) {
            const p = updatedPieces.find(x => x.id === action.targetPieceId);
            if (p) p.buffs.push({ id: 'buff_overclock', type: 'OVERCLOCK', durationTurns: 1 });
          }
          break;
        }
        case 'insurance': {
          tempState.insuranceActive = { ...(tempState.insuranceActive || {}), [side]: true };
          break;
        }
        case 'threaded_pass': {
          tempState.threadedPassActive = { ...(tempState.threadedPassActive || {}), [side]: true };
          break;
        }
        case 'steady_hands': {
          tempState.steadyHandsActive = { ...(tempState.steadyHandsActive || {}), [side]: true };
          break;
        }
        case 'long_bomb': {
          tempState.longBombActive = { ...(tempState.longBombActive || {}), [side]: true };
          break;
        }
        case 'no_look_pass': {
          tempState.noLookPassActive = { ...(tempState.noLookPassActive || {}), [side]: true };
          break;
        }
        case 'reset': {
          if (action.targetPieceId) {
            const p = updatedPieces.find(x => x.id === action.targetPieceId);
            if (p) {
              p.energy = state.config.energy.maxEnergy;
              p.movedLastTurn = false;
            }
          }
          break;
        }
        case 'ice_in_the_veins': {
          tempState.negateDebuff = { ...(tempState.negateDebuff || {}), [side]: true };
          break;
        }
        case 'anchor': {
          if (action.targetPieceId) {
            const p = updatedPieces.find(x => x.id === action.targetPieceId);
            if (p) p.buffs.push({ id: 'buff_anchor', type: 'ANCHOR', durationTurns: 1 });
          }
          break;
        }
        case 'timeout': {
          updatedPieces.forEach(p => {
            if (p.side === side) p.energy = Math.min(state.config.energy.maxEnergy, p.energy + 1.5);
          });
          break;
        }
        case 'give_and_go': {
          if (action.targetPieceId) {
            tempState.giveAndGoAvailablePieceId = action.targetPieceId;
          }
          break;
        }
        case 'screen': {
          if (action.targetPieceId) {
            const p = updatedPieces.find(x => x.id === action.targetPieceId);
            if (p) p.buffs.push({ id: 'buff_screen', type: 'SCREEN', durationTurns: 1 });
          }
          break;
        }
        case 'overlap': {
          if (action.targetPieceId) {
            const p = updatedPieces.find(x => x.id === action.targetPieceId);
            if (p) p.buffs.push({ id: 'buff_overlap', type: 'OVERLAP', durationTurns: 1 });
          }
          break;
        }
        case 'bait': {
          if (action.targetPieceId) {
            const enemyPiece = updatedPieces.find(x => x.id === action.targetPieceId);
            if (enemyPiece) {
              const isImmune = enemyPiece.buffs.some(b => b.type === 'ANCHOR') || !!tempState.negateDebuff?.[enemyPiece.side];
              if (tempState.negateDebuff?.[enemyPiece.side]) {
                tempState.negateDebuff[enemyPiece.side] = false;
              }
              if (!isImmune) {
                let destCell: Cell;
                if (action.targetCell) {
                  destCell = findNearestUnoccupiedCell(action.targetCell, updatedPieces, enemyPiece.cell);
                } else {
                  const dy = enemyPiece.side === 'AI' ? 1 : -1;
                  const candidate = { col: enemyPiece.cell.col, row: Math.max(0, Math.min(10, enemyPiece.cell.row + dy)) };
                  destCell = findNearestUnoccupiedCell(candidate, updatedPieces, enemyPiece.cell);
                }
                const lungeCost = getEffectiveMoveCost(enemyPiece.cell, destCell, enemyPiece, tempState);
                enemyPiece.cell = { ...destCell };
                enemyPiece.energy = Math.max(0, enemyPiece.energy - lungeCost);
                enemyPiece.movedLastTurn = true;
              }
            }
          }
          break;
        }
        case 'jam_the_lane': {
          if (action.targetCell) {
            tempState.extraControlCell = { cell: action.targetCell, turns: 1, side };
          }
          break;
        }
        case 'clamp': {
          if (action.targetPieceId) {
            const p = updatedPieces.find(x => x.id === action.targetPieceId);
            if (p) p.buffs.push({ id: 'buff_clamp', type: 'CLAMP', durationTurns: 1 });
          }
          break;
        }
        case 'full_court_press': {
          updatedPieces.forEach(p => {
            if (p.side === side) {
              p.buffs.push({ id: 'buff_fcp', type: 'FULL_COURT_PRESS', durationTurns: 1 });
            }
          });
          break;
        }
        case 'tempo_change': {
          updatedPieces.forEach(p => {
            if (p.side === side && !p.movedLastTurn) {
              p.energy = Math.min(state.config.energy.maxEnergy, p.energy + 1.5);
            }
          });
          break;
        }
        case 'set_the_play': {
          tempState.setThePlayActive = { ...(tempState.setThePlayActive || {}), [side]: true };
          break;
        }
        case 'rally': {
          tempState.teamEnergyInterceptionBoost = { side, multiplier: 1.25 };
          break;
        }
        case 'surge': {
          updatedPieces.forEach(p => {
            if (p.side === side) {
              p.energy = Math.min(state.config.energy.maxEnergy, p.energy + 2.0);
            }
          });
          break;
        }
      }

      const event: GameEvent = {
        id: `ev_${Date.now()}_${state.eventLog.length}`,
        timestamp: Date.now(),
        turn: state.turn,
        phase: state.phase,
        side,
        type: 'CARD_PLAYED',
        details: {
          cardId: card.id,
          cardName: card.name,
          momentumCost: card.momentumCost,
          targetPieceId: action.targetPieceId,
          targetCell: action.targetCell,
        },
      };

      const updatedControl = computeControlMap(updatedPieces, tempState);

      return {
        ...state,
        pieces: syncBallHolder(updatedPieces, state.ballHolderId),
        momentum: updatedMomentum,
        hands,
        discardPiles,
        controlMap: updatedControl,
        temporaryState: tempState,
        cardPlayedThisTurn: {
          ...state.cardPlayedThisTurn,
          [side]: true,
        },
        eventLog: [...state.eventLog, event],
      };
    }

    case 'DISCARD_CARD': {
      const side: Side = state.toAct;
      const card = state.hands[side].find(c => c.id === action.cardId);
      if (!card) return state;

      const hand = state.hands[side].filter(c => c.id !== card.id);
      const discardPiles = {
        ...state.discardPiles,
        [side]: [...state.discardPiles[side], card],
      };

      const event: GameEvent = {
        id: `ev_${Date.now()}_${state.eventLog.length}`,
        timestamp: Date.now(),
        turn: state.turn,
        phase: state.phase,
        side,
        type: 'CARD_DISCARDED',
        details: {
          cardId: card.id,
          wasForced: state.hands[side].length > state.config.momentum.handLimit,
        },
      };

      return {
        ...state,
        hands: {
          ...state.hands,
          [side]: hand,
        },
        discardPiles,
        eventLog: [...state.eventLog, event],
      };
    }

    case 'END_PLAYER_TURN': {
      if (state.phase !== 'PLAYER_PLAN') return state;

      // Invariant (§11): Player cannot end turn until hand is within hand limit (≤ 3 cards)
      if (state.hands.PLAYER.length > state.config.momentum.handLimit) {
        return state;
      }

      const latency = Math.max(100, Date.now() - state.timer.turnStartTime);
      const latencies = [...state.timer.latencies, latency];

      // Explicit Inverse-Latency Search Budget Formulation:
      // Total Turn Budget = 60 seconds (T_max = 60s)
      // Human used T_human seconds.
      // AI strives to use T_ai = max(1.0, T_max - T_human) seconds!
      // Example: If human uses 1 second of 60s, AI strives to use 59 seconds of 60s!
      // If human uses 50 seconds, AI uses 10 seconds.
      const maxTurnBudgetSeconds = state.config.timing.turnTimerSeconds || 60;
      const humanUsedSeconds = Math.max(0.1, latency / 1000.0);
      const aiTargetBudgetSeconds = Math.max(1.0, maxTurnBudgetSeconds - humanUsedSeconds);

      // Speed Ratio: 1.0 = ultra-fast human (1s) -> AI uses max budget (59s)
      const speedRatio = Math.max(0.0, Math.min(1.0, aiTargetBudgetSeconds / maxTurnBudgetSeconds));

      // Scaling iterations, rollout depth, and IS-MCTS hand samples directly with the AI target budget
      // When human takes 1s -> AI targets ~59s -> up to 50,000 iterations, 15-turn lookahead depth, 25 hand samples (T4 Deep Combine Engine)
      const baseIterations = 10000;
      const adaptiveIterations = Math.round(baseIterations + speedRatio * 40000); // 10,000 to 50,000
      const adaptiveRolloutDepth = Math.round(8 + speedRatio * 7); // 8 to 15 turns ahead
      const adaptiveSamples = Math.round(10 + speedRatio * 15); // 10 to 25 hidden permutations

      let adaptiveTier: 'T1' | 'T2' | 'T3' | 'T4' | 'CUSTOM' = 'T1';
      if (speedRatio >= 0.75) adaptiveTier = 'T4';
      else if (speedRatio >= 0.50) adaptiveTier = 'T3';
      else if (speedRatio >= 0.25) adaptiveTier = 'T2';
      else adaptiveTier = 'T1';

      const updatedMCTSConfig: GameConfig['mcts'] = {
        ...state.config.mcts,
        tier: state.config.mcts.tier === 'CUSTOM' ? 'CUSTOM' : adaptiveTier,
        iterations: state.config.mcts.tier === 'CUSTOM' ? state.config.mcts.iterations : adaptiveIterations,
        rolloutDepth: state.config.mcts.tier === 'CUSTOM' ? state.config.mcts.rolloutDepth : adaptiveRolloutDepth,
        ismctsSamples: state.config.mcts.tier === 'CUSTOM' ? state.config.mcts.ismctsSamples : adaptiveSamples,
        explorationConstant: state.config.mcts.explorationConstant || 1.414,
      };

      const newEvents: GameEvent[] = [];
      let nextBallHolderId = state.ballHolderId;
      let updatedScore = { ...state.score };
      const updatedMomentum = { ...state.momentum };
      let isMatchOver = false;
      let winner: Side | null = null;

      // 0. Resolve any staged player cards
      let playerHand = [...state.hands.PLAYER];
      let aiHand = [...state.hands.AI];
      const discardPiles = {
        PLAYER: [...state.discardPiles.PLAYER],
        AI: [...state.discardPiles.AI],
      };
      const tempState: any = { ...state.temporaryState };

      let updatedPieces = [...state.pieces];

      if (state.plannedCards && state.plannedCards.length > 0) {
        for (const plannedCard of state.plannedCards) {
          const card = CARDS_BY_ID[plannedCard.cardId];
          if (card && updatedMomentum.PLAYER >= card.momentumCost) {
            updatedMomentum.PLAYER -= card.momentumCost;

            const swingCost = card.swingEnergyCost || 0;
            if (swingCost > 0) {
              const sidePieces = updatedPieces.filter(p => p.side === 'PLAYER');
              const chosenPiece = sidePieces.sort((a, b) => b.energy - a.energy)[0];
              if (chosenPiece) {
                chosenPiece.energy = Math.max(0, chosenPiece.energy - swingCost);
              }
            }

            playerHand = playerHand.filter(c => c.id !== card.id);
            discardPiles.PLAYER.push(card);

            switch (card.effect) {
              case 'deep_breath': {
                if (plannedCard.targetPieceId) {
                  const p = updatedPieces.find(x => x.id === plannedCard.targetPieceId);
                  if (p) p.restStreak += 2;
                }
                break;
              }
              case 'second_wind': {
                if (plannedCard.targetPieceId) {
                  const p = updatedPieces.find(x => x.id === plannedCard.targetPieceId);
                  if (p) p.energy = Math.min(state.config.energy.maxEnergy, p.energy + 4.0);
                }
                break;
              }
              case 'slow_burn': {
                if (plannedCard.targetPieceId) {
                  const p = updatedPieces.find(x => x.id === plannedCard.targetPieceId);
                  if (p) p.buffs.push({ id: 'buff_slow_burn', type: 'SLOW_BURN', durationTurns: 3 });
                }
                break;
              }
              case 'drain': {
                if (plannedCard.targetPieceId) {
                  const p = updatedPieces.find(x => x.id === plannedCard.targetPieceId);
                  if (p) p.energy = Math.max(0, p.energy - 2.0);
                }
                break;
              }
              case 'overclock': {
                if (plannedCard.targetPieceId) {
                  const p = updatedPieces.find(x => x.id === plannedCard.targetPieceId);
                  if (p) p.buffs.push({ id: 'buff_overclock', type: 'OVERCLOCK', durationTurns: 1 });
                }
                break;
              }
              case 'insurance': {
                tempState.insuranceActive = { ...(tempState.insuranceActive || {}), PLAYER: true };
                break;
              }
              case 'threaded_pass': {
                tempState.threadedPassActive = { ...(tempState.threadedPassActive || {}), PLAYER: true };
                break;
              }
              case 'steady_hands': {
                tempState.steadyHandsActive = { ...(tempState.steadyHandsActive || {}), PLAYER: true };
                break;
              }
              case 'long_bomb': {
                tempState.longBombActive = { ...(tempState.longBombActive || {}), PLAYER: true };
                break;
              }
              case 'no_look_pass': {
                tempState.noLookPassActive = { ...(tempState.noLookPassActive || {}), PLAYER: true };
                break;
              }
              case 'reset': {
                if (plannedCard.targetPieceId) {
                  const p = updatedPieces.find(x => x.id === plannedCard.targetPieceId);
                  if (p) {
                    p.energy = state.config.energy.maxEnergy;
                    p.movedLastTurn = false;
                  }
                }
                break;
              }
              case 'ice_in_the_veins': {
                tempState.negateDebuff = { ...(tempState.negateDebuff || {}), PLAYER: true };
                break;
              }
              case 'anchor': {
                if (plannedCard.targetPieceId) {
                  const p = updatedPieces.find(x => x.id === plannedCard.targetPieceId);
                  if (p) p.buffs.push({ id: 'buff_anchor', type: 'ANCHOR', durationTurns: 1 });
                }
                break;
              }
              case 'timeout': {
                updatedPieces.forEach(p => {
                  if (p.side === 'PLAYER') p.energy = Math.min(state.config.energy.maxEnergy, p.energy + 1.5);
                });
                break;
              }
              case 'give_and_go': {
                if (plannedCard.targetPieceId) {
                  tempState.giveAndGoAvailablePieceId = plannedCard.targetPieceId;
                }
                break;
              }
              case 'screen': {
                if (plannedCard.targetPieceId) {
                  const p = updatedPieces.find(x => x.id === plannedCard.targetPieceId);
                  if (p) p.buffs.push({ id: 'buff_screen', type: 'SCREEN', durationTurns: 1 });
                }
                break;
              }
              case 'overlap': {
                if (plannedCard.targetPieceId) {
                  const p = updatedPieces.find(x => x.id === plannedCard.targetPieceId);
                  if (p) p.buffs.push({ id: 'buff_overlap', type: 'OVERLAP', durationTurns: 1 });
                }
                break;
              }
              case 'bait': {
                if (plannedCard.targetPieceId) {
                  const enemyPiece = updatedPieces.find(x => x.id === plannedCard.targetPieceId);
                  if (enemyPiece) {
                    const isImmune = enemyPiece.buffs.some(b => b.type === 'ANCHOR') || !!tempState.negateDebuff?.[enemyPiece.side];
                    if (tempState.negateDebuff?.[enemyPiece.side]) {
                      tempState.negateDebuff[enemyPiece.side] = false;
                    }
                    if (!isImmune) {
                      let destCell: Cell;
                      if (plannedCard.targetCell) {
                        destCell = findNearestUnoccupiedCell(plannedCard.targetCell, updatedPieces, enemyPiece.cell);
                      } else {
                        const dy = enemyPiece.side === 'AI' ? 1 : -1;
                        const candidate = { col: enemyPiece.cell.col, row: Math.max(0, Math.min(10, enemyPiece.cell.row + dy)) };
                        destCell = findNearestUnoccupiedCell(candidate, updatedPieces, enemyPiece.cell);
                      }
                      const lungeCost = getEffectiveMoveCost(enemyPiece.cell, destCell, enemyPiece, tempState);
                      enemyPiece.cell = { ...destCell };
                      enemyPiece.energy = Math.max(0, enemyPiece.energy - lungeCost);
                      enemyPiece.movedLastTurn = true;
                    }
                  }
                }
                break;
              }
              case 'jam_the_lane': {
                if (plannedCard.targetCell) {
                  tempState.extraControlCell = { cell: plannedCard.targetCell, turns: 1, side: 'PLAYER' };
                }
                break;
              }
              case 'clamp': {
                if (plannedCard.targetPieceId) {
                  const p = updatedPieces.find(x => x.id === plannedCard.targetPieceId);
                  if (p) p.buffs.push({ id: 'buff_clamp', type: 'CLAMP', durationTurns: 1 });
                }
                break;
              }
              case 'full_court_press': {
                updatedPieces.forEach(p => {
                  if (p.side === 'PLAYER') {
                    p.buffs.push({ id: 'buff_fcp', type: 'FULL_COURT_PRESS', durationTurns: 1 });
                  }
                });
                break;
              }
              case 'tempo_change': {
                updatedPieces.forEach(p => {
                  if (p.side === 'PLAYER' && !p.movedLastTurn) {
                    p.energy = Math.min(state.config.energy.maxEnergy, p.energy + 1.5);
                  }
                });
                break;
              }
              case 'set_the_play': {
                tempState.setThePlayActive = { ...(tempState.setThePlayActive || {}), PLAYER: true };
                break;
              }
              case 'rally': {
                tempState.teamEnergyInterceptionBoost = { side: 'PLAYER', multiplier: 1.25 };
                break;
              }
              case 'surge': {
                updatedPieces.forEach(p => {
                  if (p.side === 'PLAYER') {
                    p.energy = Math.min(state.config.energy.maxEnergy, p.energy + 2.0);
                  }
                });
                break;
              }
            }

            newEvents.push({
              id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
              timestamp: Date.now(),
              turn: state.turn,
              phase: 'PLAYER_PLAN',
              side: 'PLAYER',
              type: 'CARD_PLAYED',
              details: {
                cardId: card.id,
                cardName: card.name,
                momentumCost: card.momentumCost,
                targetPieceId: plannedCard.targetPieceId,
                targetCell: plannedCard.targetCell,
              },
            });
          }
        }
      }

      // 1. Resolve staged player moves in order
      updatedPieces = updatedPieces.map(p => {
        const planned = state.plannedMoves.find(m => m.pieceId === p.id);
        if (planned) {
          newEvents.push({
            id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
            timestamp: Date.now(),
            turn: state.turn,
            phase: 'PLAYER_PLAN',
            side: 'PLAYER',
            type: 'PIECE_MOVED',
            details: {
              pieceId: p.id,
              fromCell: { ...p.cell },
              toCell: { ...planned.destCell },
              cost: planned.cost,
            },
          });
          return {
            ...p,
            cell: { ...planned.destCell },
            energy: Math.max(0, p.energy - planned.cost),
            movedLastTurn: true,
          };
        }
        return p;
      });

      // 2. Resolve staged throw or enforce holding foul turnover
      const updatedIsRestartPhase = { ...state.isRestartPhase };

      if (state.plannedThrow) {
        const carrier = updatedPieces.find(p => p.side === 'PLAYER' && p.hasBall);
        const targetPiece = updatedPieces.find(p => p.id === state.plannedThrow!.targetPieceId);

        if (carrier && targetPiece) {
          const control = computeControlMap(updatedPieces, state.temporaryState);
          const isRestart = !!state.isRestartPhase?.PLAYER;
          const throwType = state.plannedThrow.throwType || (targetPiece.isCaptain ? 'HIGH_LOB' : 'FLAT');
          const res = resolveThrow(carrier, targetPiece, updatedPieces, control, rng, state.temporaryState, state.plannedMoves, undefined, isRestart, throwType);

          carrier.energy = res.postThrowEnergy;
          newEvents.push({
            id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
            timestamp: Date.now(),
            turn: state.turn,
            phase: 'RESOLVE',
            side: 'PLAYER',
            type: 'PASS_ATTEMPTED',
            details: {
              throwerId: carrier.id,
              targetPieceId: targetPiece.id,
              throwType,
              loft: res.loft,
              isClean: res.isClean,
              throwEnergyPaid: res.throwEnergyPaid,
              postThrowEnergy: res.postThrowEnergy,
              preThrowEnergy: res.preThrowEnergy,
              rollValues: res.rollValues,
            },
          });

          if (res.rollValues) {
            for (const rv of res.rollValues) {
              if (rv.fEffective !== undefined && (rv.fEffective > 0 || rv.pCell > 0)) {
                newEvents.push({
                  id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
                  timestamp: Date.now(),
                  turn: state.turn,
                  phase: 'RESOLVE',
                  side: 'PLAYER',
                  type: 'ROULETTE_EVALUATED',
                  details: {
                    cell: rv.cell,
                    defPieceId: rv.defPieceId,
                    defEnergy: rv.defEnergy,
                    fEffective: rv.fEffective,
                    clearRelief: rv.clearRelief,
                    throwerEnergy: rv.throwerEnergy,
                    pCell: rv.pCell,
                    roll: rv.roll,
                    intercepted: rv.intercepted,
                  },
                });
              }
            }
          }

          if (res.isClean) {
            newEvents.push({
              id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
              timestamp: Date.now(),
              turn: state.turn,
              phase: 'RESOLVE',
              side: 'PLAYER',
              type: 'PASS_CLEAN_REFUND',
              details: { throwerId: carrier.id, targetPieceId: targetPiece.id },
            });
            if (targetPiece.isCaptain) {
              updatedMomentum.PLAYER = Math.min(
                state.config.momentum.maxMomentum,
                updatedMomentum.PLAYER + state.config.momentum.cleanAssistEarn
              );
            }
          }

          if (res.intercepted) {
            nextBallHolderId = res.interceptedByPieceId || 'ai_1';
            const interceptor = updatedPieces.find(p => p.id === nextBallHolderId);
            let lungeCost = 0;
            if (interceptor && res.interceptedAtCell && !interceptor.isCaptain) {
              let destCell: Cell;
              if (interceptor.isBlocker) {
                const targetCaptain = interceptor.side === 'PLAYER' ? BOARD_CONFIG.aiScoringCell : BOARD_CONFIG.playerScoringCell;
                destCell = findNearestDefenseCircleCell(targetCaptain, updatedPieces, interceptor.cell);
              } else {
                destCell = findNearestUnoccupiedCell(res.interceptedAtCell, updatedPieces, interceptor.cell);
              }
              lungeCost = getEffectiveMoveCost(interceptor.cell, destCell, interceptor, state.temporaryState);
              interceptor.energy = Math.max(0, interceptor.energy - lungeCost);
              interceptor.cell = { ...destCell };
              interceptor.movedLastTurn = true;
              interceptor.hasBall = true;
            }
            if (interceptor) {
              const earned = calculateInterceptionMomentumEarn(interceptor.restStreak);
              updatedMomentum.AI = Math.min(
                state.config.momentum.maxMomentum,
                updatedMomentum.AI + earned
              );
            }

            newEvents.push({
              id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
              timestamp: Date.now(),
              turn: state.turn,
              phase: 'RESOLVE',
              side: 'PLAYER',
              type: 'PASS_INTERCEPTED',
              details: {
                interceptedAtCell: res.interceptedAtCell,
                interceptedByPieceId: res.interceptedByPieceId,
                lungeCost,
                postInterceptEnergy: interceptor ? interceptor.energy : 0,
              },
            });
          } else if (res.catchSuccess) {
            nextBallHolderId = targetPiece.id;
            if (!targetPiece.isCaptain) {
              updatedIsRestartPhase.PLAYER = false; // Mandatory court pass completed!
            }

            newEvents.push({
              id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
              timestamp: Date.now(),
              turn: state.turn,
              phase: 'RESOLVE',
              side: 'PLAYER',
              type: 'PASS_COMPLETED',
              details: { receiverId: targetPiece.id, loft: res.loft, catchRoll: res.catchRoll },
            });

            if (res.scored) {
              updatedScore.PLAYER += 1;
              updatedIsRestartPhase.AI = true; // AI concedes goal, enters baseline restart
              newEvents.push({
                id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
                timestamp: Date.now(),
                turn: state.turn,
                phase: 'RESOLVE',
                side: 'PLAYER',
                type: 'SCORE_GOAL',
                details: {
                  scorerPieceId: targetPiece.id,
                  playerScore: updatedScore.PLAYER,
                  aiScore: updatedScore.AI,
                },
              });

              if (updatedScore.PLAYER >= state.config.board.pointsToWin) {
                isMatchOver = true;
                winner = 'PLAYER';
              } else {
                // Goal scored by Player! Ball awarded to conceding team Captain (ai_captain at 5,0) for free restart throw out to court teammates
                // All other players on both teams stay at their exact current positions!
                nextBallHolderId = 'ai_captain';
                updatedPieces = updatedPieces.map(p => {
                  if (p.id === 'ai_captain') {
                    return { ...p, energy: state.config.energy.maxEnergy, movedLastTurn: false, hasBall: true };
                  }
                  return { ...p, hasBall: false };
                });
              }
            }
          } else {
            // Missed catch handling (§8: Overshoot, Undershoot, Fumble, Out of Bounds)
            const missedType = res.missedCatchType || 'FUMBLE';
            nextBallHolderId = res.ballHolderId || 'ai_1';

            if (missedType === 'OUT_OF_BOUNDS') {
              newEvents.push({
                id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
                timestamp: Date.now(),
                turn: state.turn,
                phase: 'RESOLVE',
                side: 'PLAYER',
                type: 'OUT_OF_BOUNDS_THROW_IN',
                details: {
                  exitCell: res.ballRestCell,
                  throwInPieceId: res.ballHolderId,
                  reason: 'Overthrow out of bounds. Throw-in awarded to opponent.',
                },
              });
            } else if (missedType === 'UNDERSHOOT') {
              newEvents.push({
                id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
                timestamp: Date.now(),
                turn: state.turn,
                phase: 'RESOLVE',
                side: 'PLAYER',
                type: 'PASS_UNDERSHOOT_RACE',
                details: {
                  landingCell: res.ballRestCell,
                  winnerId: res.ballHolderId,
                  reason: 'Undershoot dropped short. Resolved via race contest.',
                },
              });
            } else if (missedType === 'OVERSHOOT') {
              newEvents.push({
                id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
                timestamp: Date.now(),
                turn: state.turn,
                phase: 'RESOLVE',
                side: 'PLAYER',
                type: 'PASS_OVERSHOOT_GRABBED',
                details: {
                  landingCell: res.ballRestCell,
                  grabberId: res.ballHolderId,
                  reason: 'Overthrow continued past receiver and was grabbed in flight.',
                },
              });
            } else {
              newEvents.push({
                id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
                timestamp: Date.now(),
                turn: state.turn,
                phase: 'RESOLVE',
                side: 'PLAYER',
                type: 'PASS_FUMBLE_LOOSE',
                details: {
                  landingCell: res.ballRestCell,
                  reason: 'Fumble dropped in place on receiver cell.',
                },
              });
            }
          }
        }
      } else {
        // Holding foul rule: If Player holds ball without passing, referee whistle blows and turnover occurs!
        const playerCarrier = updatedPieces.find(p => p.side === 'PLAYER' && p.hasBall);
        if (playerCarrier && state.config.board.holdingFoulEnforced) {
          nextBallHolderId = 'ai_1';
          newEvents.push({
            id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
            timestamp: Date.now(),
            turn: state.turn,
            phase: 'RESOLVE',
            side: 'PLAYER',
            type: 'HOLDING_FOUL_TURNOVER',
            details: {
              foulPieceId: playerCarrier.id,
              turnoverToId: 'ai_1',
              reason: 'Holding foul: Ball held without throwing during turn. Possession awarded to opponent.',
            },
          });
        }
      }

      // 3. Prepare AI pieces for their turn: compounding rest & AI buff duration tick
      updatedPieces = updatedPieces.map(p => {
        if (p.side === 'AI') {
          const nextBuffs = p.buffs
            .map(b => ({ ...b, durationTurns: b.durationTurns - 1 }))
            .filter(b => b.durationTurns > 0);
          let streak = p.restStreak;
          let regenAmount = 1.0;

          if (p.movedLastTurn) {
            streak = 0;
            regenAmount = state.config.energy.baseRegen;
          } else {
            streak += 1;
            regenAmount = state.config.energy.compoundingRegenBase + streak;
          }

          const newEnergy = Math.min(state.config.energy.maxEnergy, p.energy + regenAmount);

          newEvents.push({
            id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
            timestamp: Date.now(),
            turn: state.turn,
            phase: 'AI_TURN',
            side: 'AI',
            type: 'REST_COMPOUNDED',
            details: {
              pieceId: p.id,
              restStreak: streak,
              regenAmount,
              energy: newEnergy,
            },
          });

          return {
            ...p,
            buffs: nextBuffs,
            restStreak: streak,
            energy: newEnergy,
            movedLastTurn: false,
          };
        }
        return p;
      });

      const aiDeck = [...state.decks.AI];
      aiHand = [...state.hands.AI];
      let drawnCard: Card | null = null;

      if (aiDeck.length > 0) {
        drawnCard = aiDeck.shift()!;
        aiHand.push(drawnCard);
      }

      if (aiHand.length > state.config.momentum.handLimit) {
        const discard = getAIDiscardChoice(aiHand, state.momentum.AI);
        aiHand = aiHand.filter(c => c.id !== discard.id);
      }

      const aiMomentum = Math.min(
        state.config.momentum.maxMomentum,
        state.momentum.AI + state.config.momentum.regenPerTurn
      );

      const finalizedPieces = syncBallHolder(updatedPieces, nextBallHolderId);
      const updatedControl = computeControlMap(finalizedPieces, state.temporaryState);

      const nextState: GameState = {
        ...state,
        config: {
          ...state.config,
          mcts: updatedMCTSConfig,
        },
        aiStatus: {
          ...state.aiStatus,
          lastHumanLatencyMs: latency,
          humanUsedSeconds: Number(humanUsedSeconds.toFixed(1)),
          aiTargetBudgetSeconds: Number(aiTargetBudgetSeconds.toFixed(1)),
          maxTurnBudgetSeconds,
          speedRatio,
          adaptiveIterations: state.config.mcts.tier === 'CUSTOM' ? state.config.mcts.iterations : adaptiveIterations,
          adaptiveRolloutDepth: state.config.mcts.tier === 'CUSTOM' ? state.config.mcts.rolloutDepth : adaptiveRolloutDepth,
          adaptiveSamples: state.config.mcts.tier === 'CUSTOM' ? state.config.mcts.ismctsSamples : adaptiveSamples,
          adaptiveTier: state.config.mcts.tier === 'CUSTOM' ? 'CUSTOM' : adaptiveTier,
        },
        phase: isMatchOver ? 'MATCH_OVER' : 'AI_TURN',
        toAct: 'AI',
        pieces: finalizedPieces,
        ballHolderId: nextBallHolderId,
        isRestartPhase: updatedIsRestartPhase,
        plannedMoves: [],
        plannedThrow: null,
        aiPlannedActions: null,
        controlMap: updatedControl,
        score: updatedScore,
        momentum: {
          PLAYER: updatedMomentum.PLAYER,
          AI: aiMomentum,
        },
        decks: {
          ...state.decks,
          AI: aiDeck,
        },
        hands: {
          ...state.hands,
          AI: aiHand,
        },
        drawnThisTurn: {
          PLAYER: null,
          AI: drawnCard,
        },
        cardPlayedThisTurn: {
          PLAYER: false,
          AI: false,
        },
        timer: {
          ...state.timer,
          latencies,
          turnStartTime: Date.now(),
          isExpired: false,
        },
        eventLog: [...state.eventLog, ...newEvents],
      };

      if (isMatchOver) {
        const aptitudeReport = generateAptitudeReport(nextState);
        return {
          ...nextState,
          matchResult: {
            isOver: true,
            winner,
            reason: `Victory condition met: ${updatedScore.PLAYER} - ${updatedScore.AI}`,
            aptitudeReport,
          },
        };
      }

      return nextState;
    }

    case 'RUN_AI_TURN': {
      if (state.phase !== 'AI_TURN') return state;

      const mctsResult = runSeededMCTS(state, rng);

      // Create AI planned actions object showing origin and destination for every move & throw
      const aiPlannedMoves = mctsResult.moves.map(m => {
        const p = state.pieces.find(x => x.id === m.pieceId);
        return {
          pieceId: m.pieceId,
          fromCell: p ? { ...p.cell } : { ...m.destCell },
          destCell: { ...m.destCell },
          cost: m.cost,
        };
      });

      let aiPlannedThrow: { throwerId: string; fromCell: Cell; targetPieceId: string; targetCell: Cell } | undefined;
      if (mctsResult.throwAction) {
        const carrier = state.pieces.find(p => p.id === mctsResult.throwAction!.throwerId);
        aiPlannedThrow = {
          throwerId: mctsResult.throwAction.throwerId,
          fromCell: carrier ? { ...carrier.cell } : { col: 5, row: 6 },
          targetPieceId: mctsResult.throwAction.targetPieceId,
          targetCell: { ...mctsResult.throwAction.targetCell },
        };
      }

      // Transition to AI_PLANNED_REVIEW so the player sees the AI's movements and vectors on the main gameplay UI
      return {
        ...state,
        phase: 'AI_PLANNED_REVIEW',
        aiPlannedActions: {
          moves: aiPlannedMoves,
          throwAction: aiPlannedThrow,
          stage0Card: mctsResult.stage0Card.card?.id || null,
          stage0CardTarget: mctsResult.stage0Card.targetPieceId || null,
          stage0CardCell: mctsResult.stage0Card.targetCell || null,
          stage2Card: mctsResult.stage2Card.card?.id || null,
          stage2CardTarget: mctsResult.stage2Card.targetPieceId || null,
          stage2CardCell: mctsResult.stage2Card.targetCell || null,
          posture: mctsResult.posture,
          stats: mctsResult.stats,
        },
        aiStatus: {
          isThinking: false,
          selectedPosture: mctsResult.posture,
          lastSearchStats: {
            iterations: mctsResult.stats.iterations,
            nodesEvaluated: mctsResult.stats.nodesEvaluated,
            bestScore: mctsResult.stats.bestScore,
            candidateCount: mctsResult.stats.candidateCount,
            bestActionDescription: mctsResult.stats.bestActionDescription,
            stage0Card: mctsResult.stage0Card.card?.id || null,
            stage2Card: mctsResult.stage2Card.card?.id || null,
            timeMs: mctsResult.stats.timeMs,
          },
        },
        timer: {
          ...state.timer,
          isPaused: true,
          isExpired: false,
        },
      };
    }

    // AI plays for PLAYER side (for AI vs AI testing)
    case 'RUN_AI_TURN_FOR_PLAYER': {
      if (state.phase !== 'PLAYER_PLAN') return state;

      // Run MCTS for PLAYER side
      const mctsResult = runSeededMCTS(state, rng, 'PLAYER');

      // Execute planned moves immediately
      let workingPieces = state.pieces.map(p => ({ ...p, cell: { ...p.cell }, buffs: [...p.buffs] }));
      const tempState: any = { ...state.temporaryState };
      const newEvents: GameEvent[] = [];
      let updatedScore = { ...state.score };
      const updatedMomentum = { ...state.momentum };
      let nextBallHolderId: string = state.ballHolderId || 'p_1';

      // Apply moves
      for (const m of mctsResult.moves) {
        const p = workingPieces.find(x => x.id === m.pieceId);
        if (p) {
          const fromCell = { ...p.cell };
          p.cell = { ...m.destCell };
          p.energy = Math.max(0, p.energy - m.cost);
          p.movedLastTurn = true;
          newEvents.push({
            id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
            timestamp: Date.now(), turn: state.turn, phase: 'PLAYER_PLAN', side: 'PLAYER',
            type: 'PIECE_MOVED',
            details: { pieceId: p.id, fromCell, toCell: m.destCell, cost: m.cost },
          });
        }
      }

      // Apply throw
      if (mctsResult.throwAction) {
        const carrier = workingPieces.find(p => p.id === mctsResult.throwAction!.throwerId);
        const targetPiece = workingPieces.find(p => p.id === mctsResult.throwAction!.targetPieceId);

        if (carrier && targetPiece) {
          const controlMap = computeControlMap(workingPieces, tempState);
          const throwType = targetPiece.isCaptain ? 'HIGH_LOB' as const : 'FLAT' as const;
          const res = resolveThrow(carrier, targetPiece, workingPieces, controlMap, rng, tempState, mctsResult.moves, mctsResult.throwAction.targetCell, false, throwType);

          carrier.energy = res.postThrowEnergy;
          newEvents.push({
            id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
            timestamp: Date.now(), turn: state.turn, phase: 'PLAYER_PLAN', side: 'PLAYER',
            type: 'PASS_ATTEMPTED',
            details: { throwerId: carrier.id, targetPieceId: targetPiece.id, throwType, loft: res.loft, isClean: res.isClean },
          });

          if (res.intercepted) {
            const interceptor = workingPieces.find(p => p.id === res.interceptedByPieceId);
            if (interceptor) {
              interceptor.hasBall = true;
              nextBallHolderId = interceptor.id;
              newEvents.push({
                id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
                timestamp: Date.now(), turn: state.turn, phase: 'PLAYER_PLAN', side: 'PLAYER',
                type: 'PASS_INTERCEPTED',
                details: { interceptedAtCell: res.interceptedAtCell, interceptedByPieceId: res.interceptedByPieceId },
              });
            }
          } else if (res.catchSuccess) {
            targetPiece.hasBall = true;
            carrier.hasBall = false;
            nextBallHolderId = targetPiece.id;
            newEvents.push({
              id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
              timestamp: Date.now(), turn: state.turn, phase: 'PLAYER_PLAN', side: 'PLAYER',
              type: 'PASS_COMPLETED',
              details: { receiverId: targetPiece.id, loft: res.loft, catchRoll: res.catchRoll },
            });
            if (res.scored) {
              updatedScore.PLAYER += 1;
              newEvents.push({
                id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
                timestamp: Date.now(), turn: state.turn, phase: 'PLAYER_PLAN', side: 'PLAYER',
                type: 'SCORE_GOAL',
                details: { scorerPieceId: targetPiece.id, playerScore: updatedScore.PLAYER, aiScore: updatedScore.AI },
              });
            }
          }
        }
      } else {
        // Holding foul: no throw = turnover
        const playerCarrier = workingPieces.find(p => p.side === 'PLAYER' && p.hasBall);
        if (playerCarrier && state.config.board.holdingFoulEnforced) {
          nextBallHolderId = 'ai_1';
        }
      }

      // Sync ball holder
      workingPieces = workingPieces.map(p => ({ ...p, hasBall: p.id === nextBallHolderId }));

      // AI pieces: energy regen + rest streak (same as END_PLAYER_TURN does for AI)
      workingPieces = workingPieces.map(p => {
        if (p.side === 'AI') {
          const nextBuffs = p.buffs.map(b => ({ ...b, durationTurns: b.durationTurns - 1 })).filter(b => b.durationTurns > 0);
          let streak = p.restStreak;
          let regenAmount = 1.0;
          if (p.movedLastTurn) {
            streak = 0;
            regenAmount = state.config.energy.baseRegen;
          } else {
            streak += 1;
            regenAmount = state.config.energy.compoundingRegenBase + streak;
          }
          const newEnergy = Math.min(state.config.energy.maxEnergy, p.energy + regenAmount);
          return { ...p, buffs: nextBuffs, restStreak: streak, energy: newEnergy, movedLastTurn: false };
        }
        return p;
      });

      // AI card draw + hand limit
      const aiDeck = [...state.decks.AI];
      let aiHand = [...state.hands.AI];
      if (aiDeck.length > 0) { aiHand.push(aiDeck.shift()!); }
      if (aiHand.length > state.config.momentum.handLimit) {
        const discard = getAIDiscardChoice(aiHand, state.momentum.AI);
        aiHand = aiHand.filter(c => c.id !== discard.id);
      }

      // AI momentum regen
      const aiMom = Math.min(state.config.momentum.maxMomentum, state.momentum.AI + state.config.momentum.regenPerTurn);

      return {
        ...state,
        phase: 'AI_TURN',
        toAct: 'AI',
        pieces: workingPieces,
        score: updatedScore,
        ballHolderId: nextBallHolderId,
        momentum: { ...updatedMomentum, AI: aiMom },
        temporaryState: tempState,
        decks: { ...state.decks, AI: aiDeck },
        hands: { ...state.hands, AI: aiHand },
        eventLog: [...state.eventLog, ...newEvents],
        plannedMoves: [],
        plannedThrow: null,
        plannedCards: [],
      };
    }

    // Resolves the AI's planned moves, card plays and throw upon player clicking "Start Turn"
    case 'START_PLAYER_TURN': {
      if (state.phase !== 'AI_PLANNED_REVIEW' && state.phase !== 'AI_TURN') return state;

      const aiPlan = state.aiPlannedActions;
      let workingPieces = [...state.pieces];
      const tempState: any = { ...state.temporaryState };
      const newEvents: GameEvent[] = [];
      let updatedScore = { ...state.score };
      const updatedMomentum = { ...state.momentum };
      let isMatchOver = false;
      let winner: Side | null = null;
      let nextBallHolderId: string = state.ballHolderId || 'ai_1';
      let updatedIsRestartPhase = { ...state.isRestartPhase };

      if (aiPlan) {
        // 0. Apply AI Stage 0 Card Play (e.g. Surge, Overclock, Set the Play)
        if (aiPlan.stage0Card && CARDS_BY_ID[aiPlan.stage0Card]) {
          const card = CARDS_BY_ID[aiPlan.stage0Card];
          if (updatedMomentum.AI >= card.momentumCost) {
            updatedMomentum.AI -= card.momentumCost;
            let targetPieceId: string | undefined = aiPlan.stage0CardTarget || undefined;
            let targetCell: Cell | undefined = aiPlan.stage0CardCell || undefined;

            if (card.id === 'overclock') {
              const targetP = (targetPieceId ? workingPieces.find(p => p.id === targetPieceId) : null) ||
                workingPieces.find(p => p.side === 'AI' && p.hasBall) ||
                workingPieces.find(p => p.side === 'AI' && !p.isCaptain);
              if (targetP) {
                targetP.buffs.push({ id: 'buff_overclock', type: 'OVERCLOCK', durationTurns: 1 });
                targetPieceId = targetP.id;
              }
            } else if (card.id === 'surge') {
              workingPieces.forEach(p => {
                if (p.side === 'AI') p.energy = Math.min(state.config.energy.maxEnergy, p.energy + 2.0);
              });
            } else if (card.id === 'set_the_play') {
              tempState.setThePlayActive = { ...(tempState.setThePlayActive || {}), AI: true };
            }

            newEvents.push({
              id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
              timestamp: Date.now(),
              turn: state.turn,
              phase: 'AI_TURN',
              side: 'AI',
              type: 'CARD_PLAYED',
              details: {
                cardId: card.id,
                cardName: card.name,
                momentumCost: card.momentumCost,
                targetPieceId,
                targetCell,
              },
            });
          }
        }

        // 1. Apply AI moves
        for (const m of aiPlan.moves) {
          const p = workingPieces.find(x => x.id === m.pieceId);
          if (p) {
            p.cell = { ...m.destCell };
            p.energy = Math.max(0, p.energy - m.cost);
            p.movedLastTurn = true;
            newEvents.push({
              id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
              timestamp: Date.now(),
              turn: state.turn,
              phase: 'AI_TURN',
              side: 'AI',
              type: 'PIECE_MOVED',
              details: { pieceId: p.id, fromCell: m.fromCell, toCell: m.destCell, cost: m.cost },
            });
          }
        }

        // 2. Apply AI Stage 2 Card Play (e.g. Drain on Player piece, Clamp, Second Wind, Deep Breath)
        if (aiPlan.stage2Card && CARDS_BY_ID[aiPlan.stage2Card]) {
          const card = CARDS_BY_ID[aiPlan.stage2Card];
          if (updatedMomentum.AI >= card.momentumCost) {
            updatedMomentum.AI -= card.momentumCost;
            let targetPieceId: string | undefined = aiPlan.stage2CardTarget || undefined;
            let targetCell: Cell | undefined = aiPlan.stage2CardCell || undefined;

            if (card.id === 'drain') {
              // Drain player carrier or highest energy player piece
              const targetPlayer = (targetPieceId ? workingPieces.find(p => p.id === targetPieceId) : null) ||
                workingPieces.find(p => p.side === 'PLAYER' && p.hasBall) ||
                [...workingPieces.filter(p => p.side === 'PLAYER' && !p.isCaptain)].sort((a, b) => b.energy - a.energy)[0];
              if (targetPlayer) {
                targetPlayer.energy = Math.max(0, targetPlayer.energy - 2.0);
                targetPieceId = targetPlayer.id;
              }
            } else if (card.id === 'clamp') {
              const targetPlayer = (targetPieceId ? workingPieces.find(p => p.id === targetPieceId) : null) ||
                [...workingPieces.filter(p => p.side === 'PLAYER')].sort((a, b) => b.energy - a.energy)[0];
              if (targetPlayer) {
                targetPlayer.buffs.push({ id: 'buff_clamp', type: 'CLAMP', durationTurns: 1 });
                targetPieceId = targetPlayer.id;
              }
            } else if (card.id === 'second_wind') {
              const lowEnergyAI = (targetPieceId ? workingPieces.find(p => p.id === targetPieceId) : null) ||
                [...workingPieces.filter(p => p.side === 'AI')].sort((a, b) => a.energy - b.energy)[0];
              if (lowEnergyAI) {
                lowEnergyAI.energy = Math.min(state.config.energy.maxEnergy, lowEnergyAI.energy + 4.0);
                targetPieceId = lowEnergyAI.id;
              }
            } else if (card.id === 'deep_breath') {
              const restingAI = (targetPieceId ? workingPieces.find(p => p.id === targetPieceId) : null) ||
                workingPieces.find(p => p.side === 'AI' && !p.movedLastTurn) ||
                workingPieces.find(p => p.side === 'AI');
              if (restingAI) {
                restingAI.restStreak += 2;
                targetPieceId = restingAI.id;
              }
            } else if (card.id === 'screen') {
              const courtAI = (targetPieceId ? workingPieces.find(p => p.id === targetPieceId) : null) ||
                workingPieces.find(p => p.side === 'AI' && !p.isCaptain) ||
                workingPieces.find(p => p.side === 'AI');
              if (courtAI) {
                courtAI.buffs.push({ id: 'buff_screen', type: 'SCREEN', durationTurns: 1 });
                targetPieceId = courtAI.id;
              }
            } else if (card.id === 'slow_burn') {
              const courtAI = (targetPieceId ? workingPieces.find(p => p.id === targetPieceId) : null) ||
                workingPieces.find(p => p.side === 'AI' && !p.isCaptain);
              if (courtAI) {
                courtAI.buffs.push({ id: 'buff_slow_burn', type: 'SLOW_BURN', durationTurns: 3 });
                targetPieceId = courtAI.id;
              }
            } else if (card.id === 'anchor') {
              const courtAI = (targetPieceId ? workingPieces.find(p => p.id === targetPieceId) : null) ||
                workingPieces.find(p => p.side === 'AI' && !p.isCaptain);
              if (courtAI) {
                courtAI.buffs.push({ id: 'buff_anchor', type: 'ANCHOR', durationTurns: 1 });
                targetPieceId = courtAI.id;
              }
            } else if (card.id === 'jam_the_lane') {
              if (!targetCell) {
                const playerCarrier = workingPieces.find(p => p.side === 'PLAYER' && p.hasBall);
                const playerCaptain = workingPieces.find(p => p.isCaptain && p.side === 'PLAYER');
                if (playerCarrier && playerCaptain) {
                  targetCell = {
                    col: Math.round((playerCarrier.cell.col + playerCaptain.cell.col) / 2),
                    row: Math.round((playerCarrier.cell.row + playerCaptain.cell.row) / 2),
                  };
                }
              }
              if (targetCell) {
                tempState.extraControlCell = { cell: targetCell, turns: 1, side: 'AI' };
              }
            } else if (card.id === 'threaded_pass') {
              tempState.threadedPassActive = { ...(tempState.threadedPassActive || {}), AI: true };
            } else if (card.id === 'steady_hands') {
              tempState.steadyHandsActive = { ...(tempState.steadyHandsActive || {}), AI: true };
            } else if (card.id === 'insurance') {
              tempState.insuranceActive = { ...(tempState.insuranceActive || {}), AI: true };
            } else if (card.id === 'no_look_pass') {
              tempState.noLookPassActive = { ...(tempState.noLookPassActive || {}), AI: true };
            } else if (card.id === 'rally') {
              tempState.teamEnergyInterceptionBoost = { side: 'AI', multiplier: 1.25 };
            } else if (card.id === 'ice_in_the_veins') {
              tempState.negateDebuff = { ...(tempState.negateDebuff || {}), AI: true };
            }

            newEvents.push({
              id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
              timestamp: Date.now(),
              turn: state.turn,
              phase: 'AI_TURN',
              side: 'AI',
              type: 'CARD_PLAYED',
              details: {
                cardId: card.id,
                cardName: card.name,
                momentumCost: card.momentumCost,
                targetPieceId,
                targetCell,
                isDebuff: card.id === 'drain' || card.id === 'clamp' || card.id === 'bait',
              },
            });
          }
        }

        // 3. Apply AI throw
        if (aiPlan.throwAction) {
          const carrier = workingPieces.find(p => p.id === aiPlan.throwAction!.throwerId);
          const targetPiece = workingPieces.find(p => p.id === aiPlan.throwAction!.targetPieceId);
          const stagedMove = aiPlan.moves.find(m => m.pieceId === aiPlan.throwAction!.targetPieceId);
          const moveDist = stagedMove ? stagedMove.cost : 0;
          const targetMovedTooFar = moveDist > 1.42;

          if (carrier && targetPiece && !targetMovedTooFar) {
            const control = computeControlMap(workingPieces, state.temporaryState);
            const throwType = aiPlan.throwAction.throwType || (targetPiece.isCaptain ? 'HIGH_LOB' : 'FLAT');
            const isRestart = !!state.isRestartPhase?.AI;
            const res = resolveThrow(
              carrier,
              targetPiece,
              workingPieces,
              control,
              rng,
              state.temporaryState,
              undefined,
              targetPiece.cell,
              isRestart,
              throwType
            );

            carrier.energy = res.postThrowEnergy;

            newEvents.push({
              id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
              timestamp: Date.now(),
              turn: state.turn,
              phase: 'AI_TURN',
              side: 'AI',
              type: 'PASS_ATTEMPTED',
              details: {
                throwerId: carrier.id,
                targetPieceId: targetPiece.id,
                throwType,
                loft: res.loft,
                isClean: res.isClean,
                throwEnergyPaid: res.throwEnergyPaid,
                postThrowEnergy: res.postThrowEnergy,
                preThrowEnergy: res.preThrowEnergy,
                rollValues: res.rollValues,
              },
            });

            if (res.rollValues) {
              for (const rv of res.rollValues) {
                if (rv.fEffective !== undefined && (rv.fEffective > 0 || rv.pCell > 0)) {
                  newEvents.push({
                    id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
                    timestamp: Date.now(),
                    turn: state.turn,
                    phase: 'AI_TURN',
                    side: 'AI',
                    type: 'ROULETTE_EVALUATED',
                    details: {
                      cell: rv.cell,
                      defPieceId: rv.defPieceId,
                      defEnergy: rv.defEnergy,
                      fEffective: rv.fEffective,
                      clearRelief: rv.clearRelief,
                      throwerEnergy: rv.throwerEnergy,
                      pCell: rv.pCell,
                      roll: rv.roll,
                      intercepted: rv.intercepted,
                    },
                  });
                }
              }
            }

            if (res.intercepted) {
              nextBallHolderId = res.interceptedByPieceId || 'p_1';
              const interceptor = workingPieces.find(p => p.id === nextBallHolderId);
              let lungeCost = 0;
              if (interceptor && res.interceptedAtCell && !interceptor.isCaptain) {
                let destCell: Cell;
                if (interceptor.isBlocker) {
                  const targetCaptain = interceptor.side === 'PLAYER' ? BOARD_CONFIG.aiScoringCell : BOARD_CONFIG.playerScoringCell;
                  destCell = findNearestDefenseCircleCell(targetCaptain, workingPieces, interceptor.cell);
                } else {
                  destCell = findNearestUnoccupiedCell(res.interceptedAtCell, workingPieces, interceptor.cell);
                }
                lungeCost = getEffectiveMoveCost(interceptor.cell, destCell, interceptor, state.temporaryState);
                interceptor.energy = Math.max(0, interceptor.energy - lungeCost);
                interceptor.cell = { ...destCell };
                interceptor.movedLastTurn = true;
                interceptor.hasBall = true;
              }
              if (interceptor) {
                const earned = calculateInterceptionMomentumEarn(interceptor.restStreak);
                updatedMomentum.PLAYER = Math.min(
                  state.config.momentum.maxMomentum,
                  updatedMomentum.PLAYER + earned
                );
              }

              newEvents.push({
                id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
                timestamp: Date.now(),
                turn: state.turn,
                phase: 'AI_TURN',
                side: 'AI',
                type: 'PASS_INTERCEPTED',
                details: {
                  interceptedAtCell: res.interceptedAtCell,
                  interceptedByPieceId: res.interceptedByPieceId,
                  lungeCost,
                  postInterceptEnergy: interceptor ? interceptor.energy : 0,
                },
              });
            } else if (res.catchSuccess) {
              nextBallHolderId = targetPiece.id;
              newEvents.push({
                id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
                timestamp: Date.now(),
                turn: state.turn,
                phase: 'AI_TURN',
                side: 'AI',
                type: 'PASS_COMPLETED',
                details: { receiverId: targetPiece.id, loft: res.loft, catchRoll: res.catchRoll },
              });

              if (res.scored) {
                updatedScore.AI += 1;
                updatedIsRestartPhase.PLAYER = true; // Player concedes goal, enters baseline restart
                newEvents.push({
                  id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
                  timestamp: Date.now(),
                  turn: state.turn,
                  phase: 'AI_TURN',
                  side: 'AI',
                  type: 'SCORE_GOAL',
                  details: { playerScore: updatedScore.PLAYER, aiScore: updatedScore.AI },
                });

                if (updatedScore.AI >= state.config.board.pointsToWin) {
                  isMatchOver = true;
                  winner = 'AI';
                } else {
                  // Goal scored by AI! Ball awarded to conceding team Captain (p_captain at 5,10) for free restart throw out to court teammates
                  // All other players on both teams stay at their exact current positions!
                  nextBallHolderId = 'p_captain';
                  workingPieces = workingPieces.map(p => {
                    if (p.id === 'p_captain') {
                      return { ...p, energy: state.config.energy.maxEnergy, movedLastTurn: false, hasBall: true };
                    }
                    return { ...p, hasBall: false };
                  });
                }
              } else if (!targetPiece.isCaptain) {
                updatedIsRestartPhase.AI = false; // Mandatory court pass completed by AI!
              }
            } else {
              // Missed catch handling for AI (§8)
              const missedType = res.missedCatchType || 'FUMBLE';
              nextBallHolderId = res.ballHolderId || 'p_1';

              if (missedType === 'OUT_OF_BOUNDS') {
                newEvents.push({
                  id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
                  timestamp: Date.now(),
                  turn: state.turn,
                  phase: 'AI_TURN',
                  side: 'AI',
                  type: 'OUT_OF_BOUNDS_THROW_IN',
                  details: {
                    exitCell: res.ballRestCell,
                    throwInPieceId: res.ballHolderId,
                    reason: 'AI overthrow out of bounds. Throw-in awarded to Player.',
                  },
                });
              } else if (missedType === 'UNDERSHOOT') {
                newEvents.push({
                  id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
                  timestamp: Date.now(),
                  turn: state.turn,
                  phase: 'AI_TURN',
                  side: 'AI',
                  type: 'PASS_UNDERSHOOT_RACE',
                  details: {
                    landingCell: res.ballRestCell,
                    winnerId: res.ballHolderId,
                    reason: 'AI undershoot dropped short. Resolved via race contest.',
                  },
                });
              } else if (missedType === 'OVERSHOOT') {
                newEvents.push({
                  id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
                  timestamp: Date.now(),
                  turn: state.turn,
                  phase: 'AI_TURN',
                  side: 'AI',
                  type: 'PASS_OVERSHOOT_GRABBED',
                  details: {
                    landingCell: res.ballRestCell,
                    grabberId: res.ballHolderId,
                    reason: 'AI overthrow continued past receiver and was grabbed in flight.',
                  },
                });
              } else {
                newEvents.push({
                  id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
                  timestamp: Date.now(),
                  turn: state.turn,
                  phase: 'AI_TURN',
                  side: 'AI',
                  type: 'PASS_FUMBLE_LOOSE',
                  details: {
                    landingCell: res.ballRestCell,
                    reason: 'AI fumble dropped in place on receiver cell.',
                  },
                });
              }
            }
          }
        } else {
          // Holding foul rule for AI: If AI carrier holds ball without throwing during turn, turnover occurs!
          const aiCarrier = workingPieces.find(p => p.side === 'AI' && p.hasBall);
          if (aiCarrier && state.config.board.holdingFoulEnforced) {
            nextBallHolderId = 'p_1';
            newEvents.push({
              id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
              timestamp: Date.now(),
              turn: state.turn,
              phase: 'AI_TURN',
              side: 'AI',
              type: 'HOLDING_FOUL_TURNOVER',
              details: {
                foulPieceId: aiCarrier.id,
                turnoverToId: 'p_1',
                reason: 'Holding foul on AI: Ball held without throwing during turn. Possession awarded to Player.',
              },
            });
          }
        }
      }

      if (state.turn >= state.config.board.maxTurns) {
        isMatchOver = true;
        winner = updatedScore.PLAYER >= updatedScore.AI ? 'PLAYER' : 'AI';
      }

      const nextTurn = state.turn + 1;
      const readyPieces = workingPieces.map(p => {
        const nextBuffs = p.buffs
          .map(b => ({ ...b, durationTurns: b.durationTurns - 1 }))
          .filter(b => b.durationTurns > 0);

        if (p.side === 'PLAYER') {
          let streak = p.restStreak;
          let regenAmount = 1.0;

          if (p.movedLastTurn) {
            streak = 0;
            regenAmount = state.config.energy.baseRegen;
          } else {
            streak += 1;
            regenAmount = state.config.energy.compoundingRegenBase + streak;
          }

          const newEnergy = Math.min(state.config.energy.maxEnergy, p.energy + regenAmount);

          newEvents.push({
            id: `ev_${Date.now()}_${state.eventLog.length + newEvents.length}`,
            timestamp: Date.now(),
            turn: nextTurn,
            phase: 'PLAYER_PLAN',
            side: 'PLAYER',
            type: 'REST_COMPOUNDED',
            details: { pieceId: p.id, restStreak: streak, regenAmount, energy: newEnergy },
          });

          return {
            ...p,
            buffs: nextBuffs,
            restStreak: streak,
            energy: newEnergy,
            movedLastTurn: false,
          };
        }
        return {
          ...p,
          buffs: nextBuffs,
        };
      });

      const playerDeck = [...state.decks.PLAYER];
      const playerHand = [...state.hands.PLAYER];
      let drawnCard: Card | null = null;

      if (playerDeck.length > 0) {
        drawnCard = playerDeck.shift()!;
        playerHand.push(drawnCard);
      }

      const playerMomentum = Math.min(
        state.config.momentum.maxMomentum,
        state.momentum.PLAYER + state.config.momentum.regenPerTurn
      );

      const finalizedPieces = syncBallHolder(readyPieces, nextBallHolderId);
      const updatedControl = computeControlMap(finalizedPieces, {});

      const nextState: GameState = {
        ...state,
        rngState: rng.getState(),
        turn: nextTurn,
        phase: isMatchOver ? 'MATCH_OVER' : 'PLAYER_PLAN',
        toAct: 'PLAYER',
        pieces: finalizedPieces,
        ballHolderId: nextBallHolderId,
        isRestartPhase: updatedIsRestartPhase,
        plannedMoves: [],
        plannedThrow: null,
        plannedCards: [],
        aiPlannedActions: null,
        score: updatedScore,
        momentum: {
          ...state.momentum,
          PLAYER: playerMomentum,
        },
        decks: {
          ...state.decks,
          PLAYER: playerDeck,
        },
        hands: {
          ...state.hands,
          PLAYER: playerHand,
        },
        discardPiles: state.discardPiles,
        drawnThisTurn: {
          PLAYER: drawnCard,
          AI: null,
        },
        cardPlayedThisTurn: {
          PLAYER: false,
          AI: false,
        },
        controlMap: updatedControl,
        temporaryState: tempState,
        timer: {
          ...state.timer,
          turnStartTime: Date.now(),
          remainingSeconds: state.config.timing.turnTimerSeconds,
          isPaused: false,
          isExpired: false,
        },
        eventLog: [...state.eventLog, ...newEvents],
      };

      if (isMatchOver) {
        const aptitudeReport = generateAptitudeReport(nextState);
        return {
          ...nextState,
          matchResult: {
            isOver: true,
            winner,
            reason: `Match ended at turn ${nextTurn}: Score ${updatedScore.PLAYER} - ${updatedScore.AI}`,
            aptitudeReport,
          },
        };
      }

      return nextState;
    }

    case 'TIMER_TICK': {
      if (state.phase !== 'PLAYER_PLAN' || state.timer.isPaused) return state;
      const remaining = Math.max(0, state.timer.remainingSeconds - action.secondsElapsed);
      const isExpired = remaining <= 0;
      return {
        ...state,
        timer: {
          ...state.timer,
          remainingSeconds: remaining,
          isExpired,
        },
      };
    }

    case 'CONCEDE_OR_END': {
      const aptitudeReport = generateAptitudeReport(state);
      return {
        ...state,
        phase: 'MATCH_OVER',
        matchResult: {
          isOver: true,
          winner: state.score.PLAYER >= state.score.AI ? 'PLAYER' : 'AI',
          reason: 'Match finalized.',
          aptitudeReport,
        },
      };
    }

    default:
      return state;
  }
}
