import * as tf from '@tensorflow/tfjs';
import type { GameState, Side } from '../../types';
import type { MCTSCandidateAction } from '../mcts/mcts';
import { encodeStateTensor } from './encoders';
import { encodeCandidateIndex } from './actionCodec';

export interface TrainingSample {
  stateTensor: Float32Array; // 11 * 11 * 12 = 1452 numbers
  policyTarget: Float32Array; // length 64 probability vector
  valueTarget: number; // -1.0 to +1.0
}

/**
 * Creates an industry-standard Dual-Head Residual ConvNet (AlphaZero style) for 11x11 board.
 */
export function createCNNModel(inputShape: [number, number, number] = [11, 11, 32]): tf.LayersModel {
  const channels = inputShape[2] || 32;
  const input = tf.input({ shape: inputShape });

  // Conv Block 1: Spatial 3x3 convolution across `channels` filters
  const x1 = tf.layers.conv2d({ filters: channels, kernelSize: 3, padding: 'same', activation: 'relu' }).apply(input) as tf.SymbolicTensor;
  // Conv Block 2: 1x1 point-wise channel mixing with Residual skip connection
  const x2 = tf.layers.conv2d({ filters: channels, kernelSize: 1, padding: 'same', activation: 'relu' }).apply(x1) as tf.SymbolicTensor;
  const res = tf.layers.add().apply([x1, x2]) as tf.SymbolicTensor;

  const flat = tf.layers.flatten().apply(res) as tf.SymbolicTensor;

  // Policy Head (64 discrete action scores)
  const policyDense = tf.layers.dense({ units: 64, activation: 'relu' }).apply(flat) as tf.SymbolicTensor;
  const policyOutput = tf.layers.dense({ units: 64, activation: 'softmax', name: 'policy_head' }).apply(policyDense) as tf.SymbolicTensor;

  // Value Head (scalar in [-1, +1])
  const valueDense = tf.layers.dense({ units: 32, activation: 'relu' }).apply(flat) as tf.SymbolicTensor;
  const valueOutput = tf.layers.dense({ units: 1, activation: 'tanh', name: 'value_head' }).apply(valueDense) as tf.SymbolicTensor;

  const model = tf.model({ inputs: input, outputs: [policyOutput, valueOutput] });

  model.compile({
    optimizer: tf.train.adam(0.005),
    loss: {
      policy_head: 'categoricalCrossentropy',
      value_head: 'meanSquaredError',
    },
  });

  return model;
}

/**
 * Client-Side / Node Training Pipeline
 * Trains the Dual-Head CNN on a dataset of self-play supervised/RL training samples.
 */
export async function trainCNNModel(
  model: tf.LayersModel,
  samples: TrainingSample[],
  epochs = 5,
  batchSize = 16,
  learningRate?: number
): Promise<tf.History> {
  if (learningRate && learningRate > 0) {
    model.compile({
      optimizer: tf.train.adam(learningRate),
      loss: {
        policy_head: 'categoricalCrossentropy',
        value_head: 'meanSquaredError',
      },
    });
  }

  const channels = samples[0]?.stateTensor.length / (11 * 11) || 32;
  const xsData = new Float32Array(samples.length * 11 * 11 * channels);
  const policyData = new Float32Array(samples.length * 64);
  const valueData = new Float32Array(samples.length * 1);

  for (let i = 0; i < samples.length; i++) {
    xsData.set(samples[i].stateTensor, i * 11 * 11 * channels);
    policyData.set(samples[i].policyTarget, i * 64);
    valueData[i] = samples[i].valueTarget;
  }

  const xsTensor = tf.tensor4d(xsData, [samples.length, 11, 11, channels]);
  const policyTensor = tf.tensor2d(policyData, [samples.length, 64]);
  const valueTensor = tf.tensor2d(valueData, [samples.length, 1]);

  try {
    const history = await model.fit(xsTensor, [policyTensor, valueTensor], {
      epochs,
      batchSize,
      shuffle: true,
      verbose: 0,
    });
    return history;
  } finally {
    xsTensor.dispose();
    policyTensor.dispose();
    valueTensor.dispose();
  }
}

/**
 * Fast Client-Side Forward Inference
 * Selects the top unmasked candidate action and predicts match value in milliseconds.
 */
export async function predictAction(
  model: tf.LayersModel,
  state: GameState,
  candidates: MCTSCandidateAction[],
  actingSide: Side = 'AI'
): Promise<{ bestAction: MCTSCandidateAction; value: number; policyScores: Float32Array }> {
  if (candidates.length === 0) {
    return { bestAction: { moves: [] }, value: 0, policyScores: new Float32Array(64) };
  }

  const inputShape = model.inputs[0]?.shape;
  const modelChannels = (inputShape && typeof inputShape[3] === 'number') ? inputShape[3] : 32;
  const stateTensorData = encodeStateTensor(state, actingSide, modelChannels);
  const channels = stateTensorData.length / (11 * 11) || modelChannels;
  const inputTensor = tf.tensor4d(stateTensorData, [1, 11, 11, channels]);

  try {
    const [policyOutput, valueOutput] = model.predict(inputTensor) as [tf.Tensor2D, tf.Tensor2D];
    const policyScores = (await policyOutput.data()) as Float32Array;
    const valueData = (await valueOutput.data()) as Float32Array;
    const value = valueData[0] || 0;

    policyOutput.dispose();
    valueOutput.dispose();

    let bestAction = candidates[0];
    let bestScore = -Infinity;

    for (const cand of candidates) {
      const idx = encodeCandidateIndex(cand, state, actingSide);
      const score = policyScores[idx] || 0;
      if (score > bestScore) {
        bestScore = score;
        bestAction = cand;
      }
    }

    return {
      bestAction,
      value,
      policyScores,
    };
  } finally {
    inputTensor.dispose();
  }
}

/**
 * Synchronous Client-Side Forward Inference
 * Selects the top unmasked candidate action and predicts match value synchronously in milliseconds.
 */
export function predictActionSync(
  model: tf.LayersModel,
  state: GameState,
  candidates: MCTSCandidateAction[],
  actingSide: Side = 'AI'
): { bestAction: MCTSCandidateAction; value: number; policyScores: Float32Array } {
  if (candidates.length === 0) {
    return { bestAction: { moves: [] }, value: 0, policyScores: new Float32Array(64) };
  }

  const inputShape = model.inputs[0]?.shape;
  const modelChannels = (inputShape && typeof inputShape[3] === 'number') ? inputShape[3] : 32;
  const stateTensorData = encodeStateTensor(state, actingSide, modelChannels);
  const channels = stateTensorData.length / (11 * 11) || modelChannels;
  const inputTensor = tf.tensor4d(stateTensorData, [1, 11, 11, channels]);

  try {
    const [policyOutput, valueOutput] = model.predict(inputTensor) as [tf.Tensor2D, tf.Tensor2D];
    const policyScores = policyOutput.dataSync() as Float32Array;
    const valueData = valueOutput.dataSync() as Float32Array;
    const value = valueData[0] || 0;

    policyOutput.dispose();
    valueOutput.dispose();

    let bestAction = candidates[0];
    let bestScore = -Infinity;

    for (const cand of candidates) {
      const idx = encodeCandidateIndex(cand, state, actingSide);
      const score = policyScores[idx] || 0;
      if (score > bestScore) {
        bestScore = score;
        bestAction = cand;
      }
    }

    return {
      bestAction,
      value,
      policyScores,
    };
  } finally {
    inputTensor.dispose();
  }
}
