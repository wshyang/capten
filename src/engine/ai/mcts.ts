import type { GameState, Cell, Posture, ThrowType } from '../types';
import { SeededRNG } from '../rng';
import { selectAIPosture } from './posture';
import { determinizePlayerHand } from './ismcts';
import { simulateCascadeRollout } from './rollout';
import { evaluateStage0Cards, evaluateStage2Cards, type CardDecision } from './cardSearch';
import { getReachableCells } from '../movement';
import { resolveThrow, getThrowPathCells } from '../interception';
import { computeControlMap } from '../control';
import { areCellsEqual, BOARD_CONFIG, findNearestUnoccupiedCell } from '../config/board';

export interface AIPlannedTurnResult {
  posture: Posture;
  stage0Card: CardDecision;
  moves: { pieceId: string; destCell: Cell; cost: number }[];
  throwAction?: { throwerId: string; targetPieceId: string; targetCell: Cell };
  stage2Card: CardDecision;
  stats: {
    iterations: number;
    nodesEvaluated: number;
    bestScore: number;
    timeMs: number;
    candidateCount: number;
    bestActionDescription: string;
  };
}

export interface MCTSCandidateAction {
  moves: { pieceId: string; destCell: Cell; cost: number }[];
  throwTargetPieceId?: string;
  description?: string;
}

interface MCTSNode {
  parent: MCTSNode | null;
  children: MCTSNode[];
  visits: number;
  totalScore: number;
  action: MCTSCandidateAction;
  untriedActions: MCTSCandidateAction[];
}

function applyActionToSimState(
  baseState: GameState,
  action: MCTSCandidateAction,
  rng: SeededRNG
): GameState {
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

  // 1. First apply all mobile piece moves (moves recipient to its new staged position)
  for (const m of action.moves) {
    const p = simState.pieces.find(x => x.id === m.pieceId);
    if (p) {
      p.cell = { ...m.destCell };
      p.energy = Math.max(0, p.energy - m.cost);
      p.movedLastTurn = true;
    }
  }

  // 2. Then apply throw to the recipient at its new position (1-step catch/pivot rule)
  if (action.throwTargetPieceId) {
    const carrier = simState.pieces.find(p => p.side === 'AI' && p.hasBall);
    const targetPiece = simState.pieces.find(p => p.id === action.throwTargetPieceId);
    
    // Check if target piece moved <= 1.42 cells distance
    const staged = action.moves.find(m => m.pieceId === action.throwTargetPieceId);
    const origin = baseState.pieces.find(p => p.id === action.throwTargetPieceId)?.cell;
    const moveDist = staged && origin ? Math.hypot(staged.destCell.col - origin.col, staged.destCell.row - origin.row) : 0;
    const targetMovedTooFar = moveDist > 1.42;

    if (carrier && targetPiece && !targetMovedTooFar) {
      const controlMap = computeControlMap(simState.pieces, simState.temporaryState);
      const throwType: ThrowType = targetPiece.isCaptain ? 'HIGH_LOB' : 'FLAT';
      const isRestart = !!simState.isRestartPhase?.AI;
      const res = resolveThrow(carrier, targetPiece, simState.pieces, controlMap, rng, simState.temporaryState, undefined, targetPiece.cell, isRestart, throwType);

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
          simState.score.AI += 1;
          if (simState.score.AI >= simState.config.board.pointsToWin) {
            simState.matchResult.isOver = true;
            simState.matchResult.winner = 'AI';
          }
        }
      }
    }
  } else {
    // If AI ball carrier holds ball without passing, holding foul turnover occurs
    const carrier = simState.pieces.find(p => p.side === 'AI' && p.hasBall);
    if (carrier && simState.config.board.holdingFoulEnforced) {
      carrier.hasBall = false;
      const playerReceiver = simState.pieces.find(p => p.side === 'PLAYER' && !p.isCaptain);
      if (playerReceiver) playerReceiver.hasBall = true;
    }
  }

  return simState;
}

export function runSeededMCTS(state: GameState, rng: SeededRNG): AIPlannedTurnResult {
  const startTime = Date.now();
  const config = state.config.mcts;
  const iterations = config.iterations || 300;
  const explorationC = config.explorationConstant || 1.414;

  const posture = selectAIPosture(state);
  const stage0Card = evaluateStage0Cards(state);
  const allCandidates = generateJointCandidateActions(state, posture);

  const rootNode: MCTSNode = {
    parent: null,
    children: [],
    visits: 0,
    totalScore: 0,
    action: { moves: [] },
    untriedActions: [...allCandidates],
  };

  let nodesEvaluated = 0;

  for (let i = 0; i < iterations; i++) {
    determinizePlayerHand(state, rng);

    let node = rootNode;
    let rolloutState = state;

    while (node.untriedActions.length === 0 && node.children.length > 0) {
      node = selectBestChild(node, explorationC);
      rolloutState = applyActionToSimState(rolloutState, node.action, rng);
    }

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
      rolloutState = applyActionToSimState(rolloutState, action, rng);
    }

    const score = simulateCascadeRollout(rolloutState, config.rolloutDepth, rng);
    nodesEvaluated++;

    let curr: MCTSNode | null = node;
    while (curr !== null) {
      curr.visits++;
      curr.totalScore += score;
      curr = curr.parent;
    }
  }

  let bestAction: MCTSCandidateAction = rootNode.children.length > 0
    ? rootNode.children[0].action
    : (allCandidates[0] || { moves: [] });
  let maxVisits = -1;
  let bestScore = -Infinity;

  if (rootNode.children.length > 0) {
    for (const child of rootNode.children) {
      const avgScore = child.totalScore / (child.visits || 1);
      if (child.visits > maxVisits || (child.visits === maxVisits && avgScore > bestScore)) {
        maxVisits = child.visits;
        bestAction = child.action;
        bestScore = avgScore;
      }
    }
  }

  let throwAction: { throwerId: string; targetPieceId: string; targetCell: Cell; throwType?: ThrowType } | undefined;
  if (bestAction.throwTargetPieceId) {
    const aiPieces = state.pieces.filter(p => p.side === 'AI');
    const carrier = aiPieces.find(p => p.hasBall);
    const targetPiece = aiPieces.find(p => p.id === bestAction.throwTargetPieceId);
    const staged = bestAction.moves.find(m => m.pieceId === bestAction.throwTargetPieceId);
    const effectiveCell = staged ? staged.destCell : (targetPiece ? targetPiece.cell : { col: 5, row: 0 });

    if (carrier && targetPiece) {
      throwAction = {
        throwerId: carrier.id,
        targetPieceId: targetPiece.id,
        targetCell: effectiveCell,
        throwType: targetPiece.isCaptain ? 'HIGH_LOB' : 'FLAT',
      };
    }
  }

  const stage2Card = evaluateStage2Cards(state);
  const durationMs = Date.now() - startTime;

  let bestActionDescription = 'Hold Position & Anchor';
  if (throwAction && bestAction.moves.length > 0) {
    bestActionDescription = `Cut (${bestAction.moves.map(m => m.pieceId.replace('ai_', 'A.')).join(', ')}) & Pass to ${throwAction.targetPieceId.replace('ai_', 'A.')}`;
  } else if (throwAction) {
    bestActionDescription = `Direct Pass to ${throwAction.targetPieceId.replace('ai_', 'A.')}`;
  } else if (bestAction.moves.length > 0) {
    bestActionDescription = `Formation Cut: ${bestAction.moves.map(m => m.pieceId.replace('ai_', 'A.')).join(', ')}`;
  }

  return {
    posture,
    stage0Card,
    moves: bestAction.moves,
    throwAction,
    stage2Card,
    stats: {
      iterations,
      nodesEvaluated,
      bestScore,
      timeMs: durationMs,
      candidateCount: allCandidates.length,
      bestActionDescription,
    },
  };
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
 * Generates joint candidate actions strictly enforcing:
 * 1. Each piece moves at most 1 time per turn (cannot chain moves A -> B -> C in one turn).
 * 2. 1-step receiving rule: A recipient may move up to 1 cell (dist <= 1.42) to receive the catch!
 * 3. Multi-piece joint candidate actions across all interchangeable court players.
 */
export function generateJointCandidateActions(
  state: GameState,
  _posture: Posture = 'BALANCED'
): MCTSCandidateAction[] {
  const aiPieces = state.pieces.filter(p => p.side === 'AI');
  const carrier = aiPieces.find(p => p.hasBall);
  const captain = aiPieces.find(p => p.isCaptain);
  const bouncer = aiPieces.find(p => p.isBlocker || p.id === 'ai_blocker');
  // Outfield runners are active field pieces (ai_1 through ai_5) moving and cutting downfield
  const outfieldRunners = aiPieces.filter(
    p => !p.isCaptain && !p.isBlocker && p.id !== 'ai_blocker' && (!carrier || p.id !== carrier.id) && p.energy >= 1.0
  );
  // All mobile pieces (excluding carrier and captain)
  const mobilePieces = aiPieces.filter(p => !p.isCaptain && (!carrier || p.id !== carrier.id) && p.energy >= 1.0);

  const candidates: MCTSCandidateAction[] = [];
  const playerCarrier = state.pieces.find(p => p.side === 'PLAYER' && p.hasBall);
  const playerCaptain = state.pieces.find(p => p.isCaptain && p.side === 'PLAYER') || { cell: BOARD_CONFIG.playerScoringCell };
  const playerPassRay = playerCarrier ? getThrowPathCells(playerCarrier.cell, playerCaptain.cell) : [];

  // Helper to compute Euclidean distance to the player's passing ray
  const getDistToPassingRay = (cell: Cell): number => {
    if (playerPassRay.length === 0) return 99;
    let minD = Infinity;
    for (const r of playerPassRay) {
      const d = Math.hypot(cell.col - r.col, cell.row - r.row);
      if (d < minD) minD = d;
    }
    return minD;
  };

  // Pre-calculate sorted reachable cells for each mobile piece
  const pieceReachableMap = new Map<string, { cell: Cell; cost: number }[]>();
  for (const p of mobilePieces) {
    const reachable = getReachableCells(p, state.pieces, state.temporaryState, 11, 11, false);
    if (carrier) {
      // Attacking drive: prioritize breaking formation and cutting forward into the shooting sweet spot (rows 2-4)
      reachable.sort((a, b) => {
        const distA = Math.hypot(a.cell.col - 5, a.cell.row - 0);
        const distB = Math.hypot(b.cell.col - 5, b.cell.row - 0);

        const getPocketScore = (cell: Cell, dist: number): number => {
          const r = cell.row;
          if (r === 2 || r === 3) return 50.0 - dist * 1.5; // Peak assist shooting pocket (~3.0 - 4.5 cells from Captain)
          if (r === 1 || r === 4) return 38.0 - dist * 1.5; // Attacking half / perimeter
          if (r === 0) return 28.0 - dist * 1.5; // Baseline flank sneak option
          if (r === 5) return 15.0 - dist; // Midfield
          return -dist;
        };

        return getPocketScore(b.cell, distB) - getPocketScore(a.cell, distA);
      });
    } else if (playerCarrier) {
      // DEFENSIVE AWARENESS: Prioritize cells that step onto the passing ray to block player scoring passes!
      reachable.sort((a, b) => {
        const rayDistA = getDistToPassingRay(a.cell);
        const rayDistB = getDistToPassingRay(b.cell);
        if (Math.abs(rayDistA - rayDistB) > 0.3) {
          return rayDistA - rayDistB;
        }
        const distA = Math.hypot(a.cell.col - playerCarrier.cell.col, a.cell.row - playerCarrier.cell.row);
        const distB = Math.hypot(b.cell.col - playerCarrier.cell.col, b.cell.row - playerCarrier.cell.row);
        return distA - distB;
      });
    }
    pieceReachableMap.set(p.id, reachable.slice(0, 6));
  }

  // =========================================================================
  // 1. CARRIER ACTIONS: Throws to Captain or 1-step receiving outfield teammates
  // =========================================================================
  if (carrier) {
    // 1.1 Priority: Direct throw to Captain (Captain NEVER moves, always stationary!)
    // Prohibited during baseline restart phase: mandatory pass to court player required first
    if (captain && !captain.hasBall && !state.isRestartPhase?.AI) {
      // With companion runners surging forward into enemy territory
      const otherRunners = [...outfieldRunners];
      if (otherRunners.length >= 2) {
        const o1 = otherRunners[0];
        const o2 = otherRunners[1];
        const reach1 = pieceReachableMap.get(o1.id) || [];
        const reach2 = pieceReachableMap.get(o2.id) || [];
        if (reach1.length > 0 && reach2.length > 0) {
          candidates.push({
            moves: [
              { pieceId: o1.id, destCell: reach1[0].cell, cost: reach1[0].cost },
              { pieceId: o2.id, destCell: reach2[0].cell, cost: reach2[0].cost },
            ],
            throwTargetPieceId: captain.id,
            description: `Attack Wave (${o1.id}, ${o2.id}) & Strike to Captain`,
          });
        }
      }
      candidates.push({
        moves: [],
        throwTargetPieceId: captain.id,
        description: `Direct Throw to Captain (${captain.cell.col}, ${captain.cell.row})`,
      });
    }

    // Sort outfield runners by forward advancement (closer to row 0 / enemy territory first)
    const sortedRunners = [...outfieldRunners].sort((a, b) => a.cell.row - b.cell.row);

    // 1.2 Joint Forward Cuts & Catch: Receiver cuts 1 step to catch while other outfield teammates sprint forward into enemy territory!
    for (const teammate of sortedRunners) {
      const reach = pieceReachableMap.get(teammate.id) || [];
      const otherRunners = sortedRunners.filter(p => p.id !== teammate.id);

      for (const cut of reach) {
        const dist = Math.hypot(cut.cell.col - teammate.cell.col, cut.cell.row - teammate.cell.row);
        if (dist <= 1.42) {
          const recMove = { pieceId: teammate.id, destCell: cut.cell, cost: cut.cost };

          // Combined: Receiver cuts to catch + 2 other teammates sprint forward into enemy territory
          if (otherRunners.length >= 2) {
            const o1 = otherRunners[0];
            const o2 = otherRunners[1];
            const reachO1 = pieceReachableMap.get(o1.id) || [];
            const reachO2 = pieceReachableMap.get(o2.id) || [];
            if (reachO1.length > 0 && reachO2.length > 0) {
              const mO1 = reachO1[0];
              const mO2 = reachO2[0];
              if (!areCellsEqual(cut.cell, mO1.cell) && !areCellsEqual(cut.cell, mO2.cell) && !areCellsEqual(mO1.cell, mO2.cell)) {
                candidates.push({
                  moves: [
                    recMove,
                    { pieceId: o1.id, destCell: mO1.cell, cost: mO1.cost },
                    { pieceId: o2.id, destCell: mO2.cell, cost: mO2.cost },
                  ],
                  throwTargetPieceId: teammate.id,
                  description: `Full Wave Attack: (${o1.id}, ${o2.id}) surge forward & Pass to ${teammate.id}`,
                });
              }
            }
          }

          // Combined: Receiver cuts to catch + 1 other teammate sprints forward into enemy territory
          for (const other of otherRunners) {
            const otherReach = pieceReachableMap.get(other.id) || [];
            if (otherReach.length > 0) {
              const otherMove = otherReach[0];
              if (!areCellsEqual(cut.cell, otherMove.cell)) {
                candidates.push({
                  moves: [
                    recMove,
                    { pieceId: other.id, destCell: otherMove.cell, cost: otherMove.cost },
                  ],
                  throwTargetPieceId: teammate.id,
                  description: `Joint Forward Attack: ${other.id} sprints to (${otherMove.cell.col}, ${otherMove.cell.row}) & Pass to ${teammate.id}`,
                });
              }
            }
          }

          // Receiver moves alone to catch
          candidates.push({
            moves: [recMove],
            throwTargetPieceId: teammate.id,
            description: `Forward Cut & Catch: ${teammate.id} to (${cut.cell.col}, ${cut.cell.row})`,
          });
        }
      }
    }

    // 1.3 Forward Passes to Stationary Teammates with Companion Breakthrough Runs
    for (const teammate of sortedRunners) {
      if (!teammate.movedLastTurn) {
        const otherRunners = sortedRunners.filter(p => p.id !== teammate.id);
        if (otherRunners.length > 0) {
          const other = otherRunners[0];
          const otherReach = pieceReachableMap.get(other.id) || [];
          if (otherReach.length > 0) {
            const m = otherReach[0];
            candidates.push({
              moves: [{ pieceId: other.id, destCell: m.cell, cost: m.cost }],
              throwTargetPieceId: teammate.id,
              description: `Advance ${other.id} to (${m.cell.col}, ${m.cell.row}) & Pass to ${teammate.id}`,
            });
          }
        }
        // Only generate pure stationary pass if not stuck in deep initial formation
        if (carrier.cell.row <= 4 || teammate.cell.row <= 4) {
          candidates.push({
            moves: [],
            throwTargetPieceId: teammate.id,
            description: `Forward Pass to ${teammate.id} (${teammate.cell.col}, ${teammate.cell.row})`,
          });
        }
      }
    }

    // 1.4 Emergency Last-Resort Pass to Bouncer: ONLY generated if NO other passing candidate exists
    // (e.g. all outfield runners blocked/exhausted) to prevent holding foul turnover
    const hasAnyOtherPass = candidates.some(c => !!c.throwTargetPieceId);
    if (!hasAnyOtherPass && bouncer && bouncer.id !== carrier.id && !bouncer.movedLastTurn) {
      candidates.push({
        moves: [],
        throwTargetPieceId: bouncer.id,
        description: `Emergency Pass to Blocker (Last Resort)`,
      });
    }

    return candidates;
  }

  // =========================================================================
  // 2. DEFENCE & OFF-BALL ACTIONS: Single & Joint Formations
  // =========================================================================
  for (const piece of mobilePieces) {
    const reachable = pieceReachableMap.get(piece.id) || [];
    for (const move of reachable) {
      candidates.push({
        moves: [{ pieceId: piece.id, destCell: move.cell, cost: move.cost }],
        description: `Move ${piece.id} to (${move.cell.col}, ${move.cell.row})`,
      });
    }
  }

  // Pairwise Joint Movements
  if (mobilePieces.length >= 2) {
    const p1 = mobilePieces[0];
    const p2 = mobilePieces[1];
    const reach1 = pieceReachableMap.get(p1.id) || [];
    const reach2 = pieceReachableMap.get(p2.id) || [];

    if (reach1.length > 0 && reach2.length > 0) {
      const m1 = reach1[0];
      const m2 = reach2[0];
      if (!areCellsEqual(m1.cell, m2.cell)) {
        candidates.push({
          moves: [
            { pieceId: p1.id, destCell: m1.cell, cost: m1.cost },
            { pieceId: p2.id, destCell: m2.cell, cost: m2.cost },
          ],
          description: `Joint Formation: ${p1.id} & ${p2.id}`,
        });
      }
    }
  }

  // Stationary Anchor
  candidates.push({
    moves: [],
    description: 'Anchor Formation (Hold & Compound Rest)',
  });

  return candidates;
}
