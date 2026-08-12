/**
 * src/engine/ai/nn/index.ts
 *
 * NODE-SIDE barrel for the NN training toolkit + arena/tournament code.
 * This file may import Node built-ins (fs, path, worker_threads) and any
 * side-effecting training module. It should NOT be imported by anything
 * that ends up in the browser bundle — the browser uses `./browser` instead.
 *
 * Historical note: this file used to also define `NNEngine`, `getCNNModel`,
 * and `setCNNModel`. Those were extracted into `./engine` so they can be
 * imported without pulling in the training toolkit. We re-export them from
 * here purely for backward compatibility with existing Node scripts.
 */

import type * as tf from '@tensorflow/tfjs';
import { createCNNModel, predictActionSync, trainCNNModel, type TrainingSample } from './model';
import { generateSelfPlayTrainingData } from './training';
import { encodeStateTensor } from './encoders';
import { encodeCandidateIndex } from './actionCodec';
import { EvolutionFlywheel, type FlywheelConfig, type GenerationResult } from './flywheel';
import {
  exportModelCheckpoint,
  importModelCheckpoint,
  getCheckpointChannels,
  createCNNModelFromCheckpoint,
  promoteCheckpointTo64Channels,
  type ModelCheckpoint,
} from './checkpoints';
import { mutateModelWeights, blendModelCheckpoints } from './mutation';
import {
  saveFlywheelManifest,
  loadFlywheelManifest,
  saveCheckpointToStorage,
  loadCheckpointFromStorage,
  saveReplayBufferToStorage,
  loadReplayBufferFromStorage,
  LocalStorageBackend,
  InMemoryStorageBackend,
  FileStorageBackend,
  type StorageBackend,
  type ResumableFlywheelState,
  type FlywheelStatus,
} from './persistence';
import { runArenaAuditMatch, runArenaAuditMatchVsMCTS, type MatchOutcome } from './auditMatch';
import {
  NNEngine,
  defaultNNEngine,
  getCNNModel as getCNNModelShared,
  setCNNModel as setCNNModelShared,
} from './engine';

// ---------------------------------------------------------------------------
// Node-side augmented getCNNModel
//
// The Node-only training pipeline stores checkpoints under a couple of extra
// on-disk locations (./checkpoints/tournament_32, ./checkpoints) that the
// browser cannot reach. We wrap `./engine`'s getCNNModel with a pre-load
// step that tries those file paths first, then hands the resulting
// checkpoint to the shared cache via setCNNModel so the browser-side and
// Node-side singletons stay in sync.
// ---------------------------------------------------------------------------

let preloadedFromDisk32 = false;
let preloadedFromDisk64 = false;

function tryPreloadFromDisk(size: '32' | '64'): void {
  if (size === '32' && preloadedFromDisk32) return;
  if (size === '64' && preloadedFromDisk64) return;

  try {
    const key = size === '32' ? 'supreme_champion' : 'supreme_champion_64';
    const ckpt =
      loadCheckpointFromStorage(key, new FileStorageBackend('./checkpoints/tournament_32')) ||
      loadCheckpointFromStorage(key, new FileStorageBackend('./checkpoints'));
    if (ckpt) {
      const model = createCNNModel([11, 11, size === '32' ? 32 : 64]);
      importModelCheckpoint(model, ckpt);
      setCNNModelShared(model, size);
    }
  } catch {
    // no disk backing — fine, ./engine will fall back to the bundled JSON
  }

  if (size === '32') preloadedFromDisk32 = true;
  else preloadedFromDisk64 = true;
}

export function getCNNModel(size: '32' | '64' = '64'): tf.LayersModel {
  tryPreloadFromDisk(size);
  return getCNNModelShared(size);
}

export function setCNNModel(model: tf.LayersModel, size: '32' | '64' = '64'): void {
  setCNNModelShared(model, size);
  // Once the caller explicitly sets a model, disable the file-backed preload
  // so we don't clobber their model on a subsequent get.
  if (size === '32') preloadedFromDisk32 = true;
  else preloadedFromDisk64 = true;
}

// ---------------------------------------------------------------------------
// Full training/tournament re-export surface
// ---------------------------------------------------------------------------

export {
  NNEngine,
  defaultNNEngine,
  createCNNModel,
  trainCNNModel,
  predictActionSync,
  generateSelfPlayTrainingData,
  encodeStateTensor,
  encodeCandidateIndex,
  EvolutionFlywheel,
  exportModelCheckpoint,
  importModelCheckpoint,
  getCheckpointChannels,
  createCNNModelFromCheckpoint,
  promoteCheckpointTo64Channels,
  mutateModelWeights,
  blendModelCheckpoints,
  saveFlywheelManifest,
  loadFlywheelManifest,
  saveCheckpointToStorage,
  loadCheckpointFromStorage,
  saveReplayBufferToStorage,
  loadReplayBufferFromStorage,
  LocalStorageBackend,
  InMemoryStorageBackend,
  FileStorageBackend,
  runArenaAuditMatch,
  runArenaAuditMatchVsMCTS,
};

export type {
  TrainingSample,
  FlywheelConfig,
  GenerationResult,
  ModelCheckpoint,
  StorageBackend,
  ResumableFlywheelState,
  FlywheelStatus,
  MatchOutcome,
};
