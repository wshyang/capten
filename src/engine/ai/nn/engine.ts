/**
 * src/engine/ai/nn/engine.ts
 *
 * The browser-safe portion of the NN engine surface. Extracted from the
 * legacy `nn/index.ts` barrel so the browser bundle stops pulling in the
 * Node-only training toolkit (flywheel, file-backed persistence, tournament
 * workers, goal seekers) as a side effect.
 *
 * What lives here:
 *   • getCNNModel(size) / setCNNModel   — the shared model singleton loader
 *   • NNEngine                          — implements AIEngine, called by
 *                                         the reducer's RUN_AI_TURN branch
 *
 * What does NOT live here:
 *   • trainCNNModel                     — training-only, stays in ./model
 *   • EvolutionFlywheel                 — Node-only, stays in ./flywheel
 *   • saveCheckpointToStorage w/ FileStorageBackend
 *                                       — Node-only, stays in ./persistence
 *
 * The `nn/browser.ts` barrel re-exports from this file. Node scripts and
 * tests may keep importing from `nn/index.ts` (the legacy barrel) as before.
 */

import type * as tf from '@tensorflow/tfjs';
import type { GameState, Side } from '../../types';
import type { SeededRNG } from '../../rng';
import type { AIEngine, AIEngineMode, AIPlannedTurnResult } from '../interface';
import { runSeededMCTS, generateJointCandidateActions } from '../mcts/mcts';
import { selectPosture } from '../mcts/posture';
import { evaluateStage0Cards, evaluateStage2Cards } from '../mcts/cardSearch';
import { resolveCandidateThrowAction, formatActionDescription } from '../actionHelpers';
import { createCNNModel, predictActionSync } from './model';
import {
  importModelCheckpoint,
  promoteCheckpointTo64Channels,
  type ModelCheckpoint,
} from './checkpoints';
import {
  loadCheckpointFromStorage,
  LocalStorageBackend,
} from './persistence';
import default64CkptData from '../../../../public/checkpoints/supreme_champion_64.json';
import default32CkptData from '../../../../public/checkpoints/supreme_champion.json';

// ---------------------------------------------------------------------------
// Shared model singletons
// ---------------------------------------------------------------------------

let sharedCNNModel32: tf.LayersModel | null = null;
let sharedCNNModel64: tf.LayersModel | null = null;

export function getCNNModel(size: '32' | '64' = '64'): tf.LayersModel {
  if (size === '32') {
    if (!sharedCNNModel32) {
      sharedCNNModel32 = createCNNModel([11, 11, 32]);
      try {
        // Browser path only reads LocalStorage or the bundled JSON. Node
        // scripts that want to load a file-backed checkpoint should call
        // loadCheckpointFromStorage(...) directly with a FileStorageBackend
        // and pass the result via setCNNModel().
        const ckpt =
          loadCheckpointFromStorage('supreme_champion', new LocalStorageBackend()) ||
          (default32CkptData as unknown as ModelCheckpoint);
        if (ckpt) {
          importModelCheckpoint(sharedCNNModel32, ckpt);
        }
      } catch {
        // ignore if supreme_champion checkpoint is not yet saved
      }
    }
    return sharedCNNModel32;
  }

  if (!sharedCNNModel64) {
    sharedCNNModel64 = createCNNModel([11, 11, 64]);
    try {
      let ckpt =
        loadCheckpointFromStorage('supreme_champion_64', new LocalStorageBackend()) ||
        (default64CkptData as unknown as ModelCheckpoint);
      if (!ckpt) {
        // No 64-channel snapshot yet — promote the 32-channel bundle in place.
        const ckpt32 =
          loadCheckpointFromStorage('supreme_champion', new LocalStorageBackend()) ||
          (default32CkptData as unknown as ModelCheckpoint);
        if (ckpt32) {
          ckpt = promoteCheckpointTo64Channels(ckpt32);
        }
      }
      if (ckpt) {
        importModelCheckpoint(sharedCNNModel64, ckpt);
      }
    } catch {
      // ignore if checkpoint is not yet saved
    }
  }
  return sharedCNNModel64;
}

export function setCNNModel(model: tf.LayersModel, size: '32' | '64' = '64'): void {
  if (size === '32') {
    sharedCNNModel32 = model;
  } else {
    sharedCNNModel64 = model;
  }
}

// ---------------------------------------------------------------------------
// NNEngine
// ---------------------------------------------------------------------------

/**
 * Parallel Dual-Head Residual ConvNet engine. Implements AIEngine so MCTS
 * and NN are interchangeable at the reducer's `RUN_AI_TURN` call site.
 *
 * Two operating modes:
 *   'NN_ACTIVE'            → policy/value inference only, no tree search
 *   'MCTS_WITH_NN_SHADOW'  → MCTS drives the move, NN evaluates in parallel
 *                            for shadow telemetry
 */
export class NNEngine implements AIEngine {
  readonly mode: AIEngineMode;
  readonly label: string;

  constructor(mode: AIEngineMode = 'MCTS_WITH_NN_SHADOW') {
    this.mode = mode;
    this.label = `Parallel CNN (${mode})`;
  }

  planTurn(
    state: GameState,
    rng: SeededRNG,
    actingSide: Side = 'AI'
  ): AIPlannedTurnResult {
    if (this.mode === 'NN_ACTIVE') {
      const startTime = Date.now();
      const posture = selectPosture(state, actingSide);
      const stage0Card = evaluateStage0Cards(state, actingSide);
      const allCandidates = generateJointCandidateActions(state, posture, actingSide);

      const modelSize = state.config.ai?.nnModelSize || '64';
      const model = getCNNModel(modelSize);
      const prediction = predictActionSync(model, state, allCandidates, actingSide);
      let bestAction = prediction.bestAction || allCandidates[0] || { moves: [] };

      // Defensive Line-Break Policy: when defending against enemy ball
      // possession, actively advance defenders toward the ball carrier
      // and break into the opponent's line instead of retreating.
      const sidePieces = state.pieces.filter(p => p.side === actingSide);
      const hasBall = sidePieces.some(p => p.hasBall);
      const enemySide: Side = actingSide === 'AI' ? 'PLAYER' : 'AI';
      const enemyCarrier = state.pieces.find(p => p.side === enemySide && p.hasBall);
      if (!hasBall && enemyCarrier) {
        const activeDefensiveMoves = allCandidates.filter(c => c.moves.length > 0);
        if (activeDefensiveMoves.length > 0) {
          activeDefensiveMoves.sort((a, b) => {
            const scoreCand = (cand: typeof a) => {
              let score = 0;
              for (const m of cand.moves) {
                const p = state.pieces.find(x => x.id === m.pieceId);
                if (!p) continue;
                const oldDist = Math.hypot(p.cell.col - enemyCarrier.cell.col, p.cell.row - enemyCarrier.cell.row);
                const newDist = Math.hypot(m.destCell.col - enemyCarrier.cell.col, m.destCell.row - enemyCarrier.cell.row);
                const advanceDelta = oldDist - newDist;
                score += advanceDelta * 30.0;

                const isForward = actingSide === 'AI' ? m.destCell.row <= p.cell.row : m.destCell.row >= p.cell.row;
                if (isForward) score += 45.0;
                if (actingSide === 'AI' && m.destCell.row <= 5) score += 35.0;
                if (actingSide === 'PLAYER' && m.destCell.row >= 5) score += 35.0;

                if (advanceDelta < -0.1) score -= 60.0;
              }
              if (cand.moves.length >= 2) score += 40.0;
              return score;
            };
            return scoreCand(b) - scoreCand(a);
          });
          bestAction = activeDefensiveMoves[0];
        }
      }

      const throwAction = resolveCandidateThrowAction(bestAction, state, actingSide);
      const stage2Card = evaluateStage2Cards(state, actingSide);
      const durationMs = Math.max(1, Date.now() - startTime);
      const bestActionDescription = formatActionDescription(bestAction, throwAction, 'CNN Policy');

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
          timeMs: durationMs,
          candidateCount: allCandidates.length,
          bestActionDescription,
        },
      };
    }

    // MCTS_WITH_NN_SHADOW: MCTS drives; NN runs passively for telemetry.
    const mctsResult = runSeededMCTS(state, rng, actingSide);
    try {
      const posture = selectPosture(state, actingSide);
      const allCandidates = generateJointCandidateActions(state, posture, actingSide);
      const modelSize = state.config.ai?.nnModelSize || '64';
      const model = getCNNModel(modelSize);
      const prediction = predictActionSync(model, state, allCandidates, actingSide);
      (mctsResult as any).telemetry = {
        engineType: this.mode,
        turnLatencyMs: mctsResult.stats.timeMs,
        shadowValuePrediction: prediction.value,
      };
    } catch (_e) {
      // Never let shadow-inference errors break gameplay
    }
    return mctsResult;
  }
}

export const defaultNNEngine = new NNEngine();
