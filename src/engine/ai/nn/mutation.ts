import * as tf from '@tensorflow/tfjs';
import type { ModelCheckpoint } from './checkpoints';

/**
 * Mutates a TensorFlow.js LayersModel's weights in-place by adding controlled Gaussian noise.
 * Useful for Evolutionary Strategies, Population-Based Training (PBT), and exploring tactical variants.
 *
 * @param model - The model to mutate
 * @param mutationRate - Probability [0.0, 1.0] that any given weight parameter is mutated (default 0.05)
 * @param noiseStd - Standard deviation of Gaussian noise added to mutated weights (default 0.02)
 */
export function mutateModelWeights(model: tf.LayersModel, mutationRate = 0.05, noiseStd = 0.02): void {
  const mutatedTensors = model.getWeights().map(w => {
    return tf.tidy(() => {
      const mask = tf.randomUniform(w.shape).less(mutationRate);
      const noise = tf.randomNormal(w.shape, 0, noiseStd);
      return w.add(mask.cast('float32').mul(noise));
    });
  });
  model.setWeights(mutatedTensors);
  mutatedTensors.forEach(t => t.dispose());
}

/**
 * Blends two model checkpoints (e.g. Champion and Challenger) using linear interpolation:
 * w_blended = alpha * w_A + (1 - alpha) * w_B
 */
export function blendModelCheckpoints(
  checkpointA: ModelCheckpoint,
  checkpointB: ModelCheckpoint,
  alpha = 0.5
): ModelCheckpoint {
  const blendedWeights = checkpointA.weights.map((wA, idx) => {
    const wB = checkpointB.weights[idx];
    const blendedData = wA.data.map((v, i) => alpha * v + (1.0 - alpha) * (wB?.data[i] ?? v));
    return {
      shape: [...wA.shape],
      data: blendedData,
    };
  });

  return {
    generation: Math.max(checkpointA.generation, checkpointB.generation),
    winRate: alpha * checkpointA.winRate + (1.0 - alpha) * checkpointB.winRate,
    timestamp: Date.now(),
    weights: blendedWeights,
  };
}
