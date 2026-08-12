import * as tf from '@tensorflow/tfjs';
import type { GameState, Side } from '../../types';
import { createInitialState } from '../../setup';
import { gameReducer } from '../../reducer';
import {
  createCNNModel,
  trainCNNModel,
  predictActionSync,
  type TrainingSample,
} from './model';
import { generateSelfPlayTrainingData } from './training';
import {
  exportModelCheckpoint,
  importModelCheckpoint,
  type ModelCheckpoint,
} from './checkpoints';
import { generateJointCandidateActions } from '../mcts/mcts';
import { selectPosture } from '../mcts/posture';
import { evaluateStage0Cards, evaluateStage2Cards } from '../mcts/cardSearch';
import { BOARD_CONFIG } from '../../config/board';

export interface FlywheelConfig {
  selfPlayGamesPerGen: number;
  selfPlayIters: number;
  selfPlayDepth: number;
  epochsPerGen: number;
  batchSize: number;
  arenaMatches: number;
  promotionWinRateThreshold: number;
  maxReplayBufferSize: number;
}

export const DEFAULT_FLYWHEEL_CONFIG: FlywheelConfig = {
  selfPlayGamesPerGen: 12,
  selfPlayIters: 150,
  selfPlayDepth: 4,
  epochsPerGen: 4,
  batchSize: 8,
  arenaMatches: 4,
  promotionWinRateThreshold: 50.0,
  maxReplayBufferSize: 150,
};

export interface GenerationResult {
  generation: number;
  promoted: boolean;
  championWinRate: number;
  challengerWinRate: number;
  arenaScore: {
    challengerScore: number;
    championScore: number;
    delta: number;
    w: number;
    l: number;
    d: number;
  };
  trainingLoss: number;
  checkpoint: ModelCheckpoint;
  sampleCount: number;
}

/**
 * Runs a single half-turn for a given CNN model in an Arena match.
 */
function planTurnWithModel(
  model: tf.LayersModel,
  state: GameState,
  actingSide: Side
) {
  const posture = selectPosture(state, actingSide);
  const stage0Card = evaluateStage0Cards(state, actingSide);
  const allCandidates = generateJointCandidateActions(state, posture, actingSide);

  const prediction = predictActionSync(model, state, allCandidates, actingSide);
  const bestAction = prediction.bestAction || allCandidates[0] || { moves: [] };

  let throwAction: any;
  if (bestAction.throwTargetPieceId) {
    const sidePieces = state.pieces.filter(p => p.side === actingSide);
    const carrier = sidePieces.find(p => p.hasBall);
    const targetPiece = sidePieces.find(p => p.id === bestAction.throwTargetPieceId);
    const staged = bestAction.moves.find(m => m.pieceId === bestAction.throwTargetPieceId);
    const defaultCell = actingSide === 'AI' ? BOARD_CONFIG.aiScoringCell : BOARD_CONFIG.playerScoringCell;
    const effectiveCell = staged ? staged.destCell : (targetPiece ? targetPiece.cell : defaultCell);

    if (carrier && targetPiece) {
      throwAction = {
        throwerId: carrier.id,
        targetPieceId: targetPiece.id,
        targetCell: effectiveCell,
        throwType: targetPiece.isCaptain ? 'HIGH_LOB' : 'FLAT',
      };
    }
  }

  const stage2Card = evaluateStage2Cards(state, actingSide);

  return {
    posture,
    stage0Card: bestAction.stage0Card || stage0Card,
    moves: bestAction.moves,
    throwAction,
    stage2Card: bestAction.stage2Card || stage2Card,
    stats: {
      iterations: 1,
      nodesEvaluated: allCandidates.length,
      bestScore: prediction.value * 500,
      timeMs: 5,
      candidateCount: allCandidates.length,
      bestActionDescription: 'CNN Policy Action',
    },
  };
}

/**
 * Pits Challenger CNN against Champion CNN across an equal-possessions Arena match.
 */
export function runArenaCNNMatch(
  seed: number,
  challengerModel: tf.LayersModel,
  championModel: tf.LayersModel,
  challAsPlayer: boolean,
  rounds = 15
): {
  challScore: number;
  champScore: number;
  delta: number;
  winner: 'C' | 'R' | 'D';
} {
  const init = createInitialState(seed);
  let s = gameReducer(init, {
    type: 'JUMP_BALL_RELEASE',
    wonBy: seed % 2 === 0 ? 'PLAYER' : 'AI',
    releaseMarginMs: 100,
  });
  s = { ...s, momentum: { PLAYER: 3, AI: 3 } } as GameState;

  for (let t = 1; t <= rounds; t++) {
    if (s.matchResult.isOver) break;

    if (s.phase === 'PLAYER_PLAN') {
      const model = challAsPlayer ? challengerModel : championModel;
      const turnPlan = planTurnWithModel(model, s, 'PLAYER');
      s = { ...s, aiPlannedActions: turnPlan as any, phase: 'AI_PLANNED_REVIEW' };
      s = gameReducer(s, { type: 'START_PLAYER_TURN' });
    }

    if (s.phase === 'AI_TURN') {
      const model = challAsPlayer ? championModel : challengerModel;
      const turnPlan = planTurnWithModel(model, s, 'AI');
      s = { ...s, aiPlannedActions: turnPlan as any, phase: 'AI_PLANNED_REVIEW' };
      s = gameReducer(s, { type: 'START_PLAYER_TURN' });
    }

    if (s.phase === 'AI_PLANNED_REVIEW') {
      s = gameReducer(s, { type: 'START_PLAYER_TURN' });
    }
  }

  const challScore = challAsPlayer ? s.score.PLAYER : s.score.AI;
  const champScore = challAsPlayer ? s.score.AI : s.score.PLAYER;
  const delta = challScore - champScore;
  const winner = challScore > champScore ? 'C' : champScore > challScore ? 'R' : 'D';

  return {
    challScore,
    champScore,
    delta,
    winner,
  };
}

/**
 * The AlphaZero / Leela Chess Zero Evolution Flywheel
 * Automates:
 * 1. Self-play supervised data collection
 * 2. Challenger neural training on experience replay buffer
 * 3. Champion vs. Challenger Arena evaluation
 * 4. Model promotion and checkpoint serialization
 */
export class EvolutionFlywheel {
  readonly config: FlywheelConfig;
  private championModel: tf.LayersModel;
  private championGeneration = 0;
  private championWinRate = 50.0;
  private replayBuffer: TrainingSample[] = [];

  constructor(config?: Partial<FlywheelConfig>, existingChampion?: tf.LayersModel) {
    this.config = { ...DEFAULT_FLYWHEEL_CONFIG, ...config };
    this.championModel = existingChampion || createCNNModel([11, 11, 32]);
  }

  getChampionModel(): tf.LayersModel {
    return this.championModel;
  }

  getGeneration(): number {
    return this.championGeneration;
  }

  /**
   * Runs a single evolutionary generation of the Flywheel.
   */
  async runGeneration(seedOffset = 0): Promise<GenerationResult> {
    const targetGen = this.championGeneration + 1;
    const seed = 1000 + targetGen * 100 + seedOffset;

    // Step 1: Collect self-play training samples
    const newSamples = await generateSelfPlayTrainingData(
      this.config.selfPlayGamesPerGen,
      seed,
      this.config.selfPlayIters,
      this.config.selfPlayDepth
    );

    this.replayBuffer.push(...newSamples);
    if (this.replayBuffer.length > this.config.maxReplayBufferSize) {
      const dropCount = this.replayBuffer.length - this.config.maxReplayBufferSize;
      this.replayBuffer.splice(0, dropCount);
    }

    // Step 2: Instantiate Challenger & train on replay buffer
    const challengerModel = createCNNModel([11, 11, 32]);
    if (this.championGeneration > 0) {
      // Initialize Challenger with current Champion weights
      const champCheckpoint = exportModelCheckpoint(
        this.championModel,
        this.championGeneration,
        this.championWinRate
      );
      importModelCheckpoint(challengerModel, champCheckpoint);
    }

    const history = await trainCNNModel(
      challengerModel,
      this.replayBuffer,
      this.config.epochsPerGen,
      this.config.batchSize
    );
    const lossArray = history.history.loss || [];
    const trainingLoss = lossArray.length > 0 ? Number(lossArray[lossArray.length - 1]) : 0;

    // Step 3: Pit Challenger vs. Champion in Arena
    const arenaMatches = this.config.arenaMatches;
    let challWins = 0;
    let champWins = 0;
    let draws = 0;
    let totalChallScore = 0;
    let totalChampScore = 0;

    for (let m = 0; m < arenaMatches; m++) {
      const challAsPlayer = m % 2 === 0;
      const mSeed = seed + 5000 + m;
      const res = runArenaCNNMatch(mSeed, challengerModel, this.championModel, challAsPlayer, 15);

      totalChallScore += res.challScore;
      totalChampScore += res.champScore;
      if (res.winner === 'C') challWins++;
      else if (res.winner === 'R') champWins++;
      else draws++;
    }

    const challengerWinRate = ((challWins + 0.5 * draws) / arenaMatches) * 100;
    const delta = totalChallScore - totalChampScore;

    // Step 4: Evaluate Promotion Criterion
    let promoted = false;
    if (challengerWinRate >= this.config.promotionWinRateThreshold || this.championGeneration === 0) {
      promoted = true;
      const oldChampion = this.championModel;
      this.championModel = challengerModel;
      this.championGeneration = targetGen;
      this.championWinRate = challengerWinRate;
      if (this.championGeneration > 1) {
        oldChampion.dispose();
      }
    } else {
      challengerModel.dispose();
    }

    // Step 5: Export serializable checkpoint
    const checkpoint = exportModelCheckpoint(
      this.championModel,
      this.championGeneration,
      this.championWinRate
    );

    return {
      generation: this.championGeneration,
      promoted,
      championWinRate: this.championWinRate,
      challengerWinRate,
      arenaScore: {
        challengerScore: totalChallScore,
        championScore: totalChampScore,
        delta,
        w: challWins,
        l: champWins,
        d: draws,
      },
      trainingLoss,
      checkpoint,
      sampleCount: this.replayBuffer.length,
    };
  }

  /**
   * Runs an automated multi-generation evolution loop.
   */
  async evolve(generations: number): Promise<GenerationResult[]> {
    const results: GenerationResult[] = [];
    for (let g = 0; g < generations; g++) {
      const res = await this.runGeneration(g);
      results.push(res);
    }
    return results;
  }
}
