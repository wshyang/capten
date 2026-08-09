import type { GameState, Cell, Posture, ThrowType, Side } from '../types';
import { SeededRNG } from '../rng';
import { selectPosture } from './posture';
import { determinizePlayerHand } from './ismcts';
import { simulateCascadeRollout } from './rollout';
import { getReachableCells } from '../movement';
import { resolveThrow, getThrowPathCells } from '../interception';
import { computeControlMap } from '../control';
import { areCellsEqual, BOARD_CONFIG, findNearestUnoccupiedCell } from '../config/board';
import { generateJointCandidateActions } from './mcts';
import type { BalanceConfig } from '../balanceVariations';

export interface MCTSAnalysisResult {
  action: {
    moves: { pieceId: string; destCell: Cell; cost: number }[];
    throwTargetPieceId?: string;
    description?: string;
  };
  visits: number;
  totalScore: number;
  averageScore: number;
  ucb1Score: number;
  backpropagationValue: number;
}

interface MCTSNode {
  parent: MCTSNode | null;
  children: MCTSNode[];
  visits: number;
  totalScore: number;
  action: any;
  untriedActions: any[];
}

function applyActionToSimState(
  baseState: GameState,
  action: any,
  rng: SeededRNG,
  actingSide: Side = 'AI',
  balanceConfig?: BalanceConfig
): GameState {
  const enemySide: Side = actingSide === 'AI' ? 'PLAYER' : 'AI';
  const simState: GameState = {
    ...baseState,
    score: { ...baseState.score },
    momentum: { ...baseState.momentum },
    pieces: baseState.pieces.map(p => ({
      ...p,
      cell: { ...p.cell },
      buffs: [...p.buffs],
    })),
    matchResult: { ...baseState.matchResult },
  };

  // Apply moves
  for (const m of action.moves) {
    const p = simState.pieces.find(x => x.id === m.pieceId);
    if (p) {
      p.cell = { ...m.destCell };
      p.energy = Math.max(0, p.energy - m.cost);
      p.movedLastTurn = true;
    }
  }

  // Apply throw
  if (action.throwTargetPieceId) {
    const carrier = simState.pieces.find(p => p.side === actingSide && p.hasBall);
    const targetPiece = simState.pieces.find(p => p.id === action.throwTargetPieceId);
    
    const staged = action.moves.find((m: any) => m.pieceId === action.throwTargetPieceId);
    const origin = baseState.pieces.find(p => p.id === action.throwTargetPieceId)?.cell;
    const moveDist = staged && origin ? Math.hypot(staged.destCell.col - origin.col, staged.destCell.row - origin.row) : 0;
    const targetMovedTooFar = moveDist > 1.42;

    if (carrier && targetPiece && !targetMovedTooFar) {
      const controlMap = computeControlMap(simState.pieces, simState.temporaryState);
      const throwType: ThrowType = targetPiece.isCaptain ? 'HIGH_LOB' : 'FLAT';
      const isRestart = !!simState.isRestartPhase?.[actingSide];
      const res = resolveThrow(carrier, targetPiece, simState.pieces, controlMap, rng, simState.temporaryState, undefined, targetPiece.cell, isRestart, throwType, balanceConfig);

      carrier.energy = res.postThrowEnergy;
      carrier.hasBall = false;

      if (res.intercepted) {
        const interceptor = simState.pieces.find(p => p.id === res.interceptedByPieceId);
        if (interceptor) {
          interceptor.hasBall = true;
          if (res.interceptedAtCell && !interceptor.isCaptain) {
            const destCell = findNearestUnoccupiedCell(res.interceptedAtCell, simState.pieces, interceptor.cell);
            const cost = Math.hypot(destCell.col - interceptor.cell.col, destCell.row - interceptor.cell.row);
            interceptor.energy = Math.max(0, interceptor.energy - cost);
            interceptor.cell = { ...destCell };
            interceptor.movedLastTurn = true;
          }
        }
      } else {
        targetPiece.hasBall = true;
        if (res.scored) {
          simState.score[actingSide] += 1;
          if (simState.score[actingSide] >= simState.config.board.pointsToWin) {
            simState.matchResult.isOver = true;
            simState.matchResult.winner = actingSide;
          }
        }
      }
    }
  } else {
    const carrier = simState.pieces.find(p => p.side === actingSide && p.hasBall);
    if (carrier && simState.config.board.holdingFoulEnforced) {
      carrier.hasBall = false;
      const enemySide: Side = actingSide === 'AI' ? 'PLAYER' : 'AI';
      const enemyReceiver = simState.pieces.find(p => p.side === enemySide && !p.isCaptain);
      if (enemyReceiver) enemyReceiver.hasBall = true;
    }
  }

  return simState;
}

function selectBestChild(node: MCTSNode, c: number): MCTSNode {
  let bestChild = node.children[0];
  let bestVal = -Infinity;

  const logParent = Math.log(node.visits + 1);

  for (const child of node.children) {
    const q = child.totalScore / (child.visits || 1);
    const u = c * Math.sqrt(logParent / (child.visits || 1));
    const ucb1 = q + u;

    if (ucb1 > bestVal) {
      bestChild = child;
      bestVal = ucb1;
    }
  }

  return bestChild;
}

/**
 * Analyzes MCTS from starting position and returns detailed statistics for each action
 */
export function analyzeMCTSFromStartingPosition(
  state: GameState, 
  seed: number = 42,
  balanceConfig?: BalanceConfig,
  actingSide: Side = 'AI'
): MCTSAnalysisResult[] {
  const rng = new SeededRNG(seed);
  const config = state.config.mcts;
  const iterations = config.iterations || 300;
  const explorationC = config.explorationConstant || 1.414;

  const posture = selectPosture(state, actingSide);
  const allCandidates = generateJointCandidateActions(state, posture, actingSide);

  const rootNode: MCTSNode = {
    parent: null,
    children: [],
    visits: 0,
    totalScore: 0,
    action: { moves: [] },
    untriedActions: [...allCandidates],
  };

  // Run MCTS iterations
  for (let i = 0; i < iterations; i++) {
    determinizePlayerHand(state, rng, actingSide);

    let node = rootNode;
    let rolloutState = state;

    // Selection
    while (node.untriedActions.length === 0 && node.children.length > 0) {
      node = selectBestChild(node, explorationC);
      rolloutState = applyActionToSimState(rolloutState, node.action, rng, actingSide, balanceConfig);
    }

    // Expansion
    if (node.untriedActions.length > 0) {
      const untriedIdx = rng.nextInt(0, node.untriedActions.length - 1);
      const action = node.untriedActions.splice(untriedIdx, 1)[0];
      const childNode: MCTSNode = {
        parent: node,
        children: [],
        visits: 0,
        totalScore: 0,
        action,
        untriedActions: [],
      };
      node.children.push(childNode);
      node = childNode;
      rolloutState = applyActionToSimState(rolloutState, action, rng, actingSide, balanceConfig);
    }

    // Simulation
    const score = simulateCascadeRollout(rolloutState, config.rolloutDepth, rng, actingSide);

    // Backpropagation
    let curr: MCTSNode | null = node;
    while (curr !== null) {
      curr.visits++;
      curr.totalScore += score;
      curr = curr.parent;
    }
  }

  // Analyze results
  const results: MCTSAnalysisResult[] = [];
  const logRoot = Math.log(rootNode.visits + 1);

  for (const child of rootNode.children) {
    const averageScore = child.totalScore / (child.visits || 1);
    const u = explorationC * Math.sqrt(logRoot / (child.visits || 1));
    const ucb1Score = averageScore + u;
    
    results.push({
      action: child.action,
      visits: child.visits,
      totalScore: child.totalScore,
      averageScore,
      ucb1Score,
      backpropagationValue: child.totalScore, // Total backpropagated score
    });
  }

  // Sort by backpropagation value (highest first)
  results.sort((a, b) => b.backpropagationValue - a.backpropagationValue);

  return results;
}
