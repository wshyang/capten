import * as tf from '@tensorflow/tfjs';
import { createCNNModel } from './model';

export interface ModelCheckpoint {
  generation: number;
  winRate: number;
  timestamp: number;
  weights: { shape: number[]; data: number[] }[];
}

/**
 * Inspects a checkpoint's first weight tensor to determine its spatial feature channel count (default 32, 64, etc.).
 */
export function getCheckpointChannels(checkpoint: ModelCheckpoint): number {
  return checkpoint.weights?.[0]?.shape?.[2] || 32;
}

/**
 * Creates a new CNN model matching the channel count of the provided checkpoint and restores its weights.
 */
export function createCNNModelFromCheckpoint(checkpoint: ModelCheckpoint): tf.LayersModel {
  const channels = getCheckpointChannels(checkpoint);
  const model = createCNNModel([11, 11, channels]);
  importModelCheckpoint(model, checkpoint);
  return model;
}

/**
 * Promotes a 32-channel ModelCheckpoint to a 64-channel ModelCheckpoint with identical forward-pass parity.
 * Copies 0..31 channels/filters exactly and initializes channels/filters 32..63 to zero.
 */
export function promoteCheckpointTo64Channels(checkpoint32: ModelCheckpoint): ModelCheckpoint {
  const ckptChannels = getCheckpointChannels(checkpoint32);
  if (ckptChannels === 64) return checkpoint32;
  if (ckptChannels !== 32) {
    throw new Error(`Can only promote 32-channel checkpoint to 64 channels (got ${ckptChannels} channels)`);
  }

  const newWeights: { shape: number[]; data: number[] }[] = [];
  const w = checkpoint32.weights;

  // Weight 0: Conv2D 1 kernel [3, 3, 32, 32] -> [3, 3, 64, 64]
  const w0 = new Array(3 * 3 * 64 * 64).fill(0);
  for (let dy = 0; dy < 3; dy++) {
    for (let dx = 0; dx < 3; dx++) {
      for (let inCh = 0; inCh < 32; inCh++) {
        for (let outCh = 0; outCh < 32; outCh++) {
          w0[((dy * 3 + dx) * 64 + inCh) * 64 + outCh] = w[0].data[((dy * 3 + dx) * 32 + inCh) * 32 + outCh];
        }
      }
    }
  }
  newWeights.push({ shape: [3, 3, 64, 64], data: w0 });

  // Weight 1: Conv2D 1 bias [32] -> [64]
  const w1 = new Array(64).fill(0);
  for (let i = 0; i < 32; i++) w1[i] = w[1].data[i];
  newWeights.push({ shape: [64], data: w1 });

  // Weight 2: Conv2D 2 kernel [1, 1, 32, 32] -> [1, 1, 64, 64]
  const w2 = new Array(1 * 1 * 64 * 64).fill(0);
  for (let inCh = 0; inCh < 32; inCh++) {
    for (let outCh = 0; outCh < 32; outCh++) {
      w2[inCh * 64 + outCh] = w[2].data[inCh * 32 + outCh];
    }
  }
  newWeights.push({ shape: [1, 1, 64, 64], data: w2 });

  // Weight 3: Conv2D 2 bias [32] -> [64]
  const w3 = new Array(64).fill(0);
  for (let i = 0; i < 32; i++) w3[i] = w[3].data[i];
  newWeights.push({ shape: [64], data: w3 });

  // Weight 4: Dense 1 kernel [3872, 64] -> [7744, 64]
  const w4 = new Array(7744 * 64).fill(0);
  for (let cell = 0; cell < 121; cell++) {
    for (let ch = 0; ch < 32; ch++) {
      const r32 = cell * 32 + ch;
      const r64 = cell * 64 + ch;
      for (let u = 0; u < 64; u++) {
        w4[r64 * 64 + u] = w[4].data[r32 * 64 + u];
      }
    }
  }
  newWeights.push({ shape: [7744, 64], data: w4 });

  // Weight 5: Dense 1 bias [64] unchanged
  newWeights.push({ shape: [...w[5].shape], data: [...w[5].data] });

  // Weight 6: Dense 2 kernel [3872, 32] -> [7744, 32]
  const w6 = new Array(7744 * 32).fill(0);
  for (let cell = 0; cell < 121; cell++) {
    for (let ch = 0; ch < 32; ch++) {
      const r32 = cell * 32 + ch;
      const r64 = cell * 64 + ch;
      for (let u = 0; u < 32; u++) {
        w6[r64 * 32 + u] = w[6].data[r32 * 32 + u];
      }
    }
  }
  newWeights.push({ shape: [7744, 32], data: w6 });

  // Weight 7..11: unchanged
  for (let i = 7; i <= 11; i++) {
    newWeights.push({ shape: [...w[i].shape], data: [...w[i].data] });
  }

  return {
    ...checkpoint32,
    weights: newWeights,
  };
}

/**
 * Exports a TensorFlow.js LayersModel's weights into a serializable JSON-compatible checkpoint.
 * Can be saved to disk, local storage, or passed across test suites.
 */
export function exportModelCheckpoint(
  model: tf.LayersModel,
  generation: number,
  winRate = 50.0
): ModelCheckpoint {
  const weights: { shape: number[]; data: number[] }[] = [];
  for (const w of model.getWeights()) {
    weights.push({
      shape: [...w.shape],
      data: Array.from(w.dataSync()),
    });
  }
  return {
    generation,
    winRate,
    timestamp: Date.now(),
    weights,
  };
}

/**
 * Restores a TensorFlow.js LayersModel's weights from a serialized checkpoint.
 */
export function importModelCheckpoint(
  model: tf.LayersModel,
  checkpoint: ModelCheckpoint
): void {
  const expectedChannels = model.inputs[0]?.shape?.[3] || 32;
  const ckptChannels = getCheckpointChannels(checkpoint);
  if (expectedChannels !== ckptChannels) {
    throw new Error(
      `Channel mismatch: Model expects ${expectedChannels} channels, but checkpoint has ${ckptChannels} channels.`
    );
  }
  const newTensors = checkpoint.weights.map(w => tf.tensor(w.data, w.shape));
  model.setWeights(newTensors);
  newTensors.forEach(t => t.dispose());
}
