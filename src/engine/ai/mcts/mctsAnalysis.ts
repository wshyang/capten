import type { GameState, Cell, Side } from '../../types';
import { SeededRNG } from '../../rng';
import { selectPosture } from './posture';
import { determinizePlayerHand } from './ismcts';
import { simulateCascadeRollout } from './rollout';
import { generateJointCandidateActions, applyActionToSimState } from './mcts';
import type { BalanceConfig } from '../../balanceVariations';

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
