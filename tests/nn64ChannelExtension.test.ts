import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as tf from '@tensorflow/tfjs';
import {
  createCNNModel,
  encodeStateTensor,
  predictActionSync,
  trainCNNModel,
  exportModelCheckpoint,
  getCheckpointChannels,
  createCNNModelFromCheckpoint,
  promoteCheckpointTo64Channels,
  importModelCheckpoint,
  loadCheckpointFromStorage,
  FileStorageBackend,
} from '../src/engine/ai/nn';
import { generateSelfPlayTrainingData } from '../src/engine/ai/nn/training';
import { evalNNvsNN_Parallel } from '../src/engine/ai/nn/tournament32';
import { createInitialState } from '../src/engine/setup';
import { generateJointCandidateActions } from '../src/engine/ai/mcts/mcts';

describe('64-Channel Residual ConvNet Extension & Tournament Parity', () => {
  let model32: tf.LayersModel;
  let model64: tf.LayersModel;

  beforeAll(() => {
    model32 = createCNNModel([11, 11, 32]);
    model64 = createCNNModel([11, 11, 64]);
  });

  afterAll(() => {
    model32.dispose();
    model64.dispose();
  });

  it('should create 32-channel and 64-channel CNN models with correct input shapes and parameter counts', () => {
    expect(model32.inputs[0].shape).toEqual([null, 11, 11, 32]);
    expect(model64.inputs[0].shape).toEqual([null, 11, 11, 64]);

    const params32 = model32.countParams();
    const params64 = model64.countParams();

    expect(params32).toBe(386305);
    expect(params64).toBe(788801);
    expect(params64).toBeGreaterThan(params32 * 2);
  });

  it('should encode 32-channel (3872 length) and 64-channel (7744 length) state tensors with parity on channels 0..31', () => {
    const state = createInitialState(1234);
    const tensor32 = encodeStateTensor(state, 'AI', 32);
    const tensor64 = encodeStateTensor(state, 'AI', 64);

    expect(tensor32.length).toBe(11 * 11 * 32);
    expect(tensor64.length).toBe(11 * 11 * 64);

    // Verify channel 0..31 parity across all 11x11 spatial cells
    for (let r = 0; r < 11; r++) {
      for (let c = 0; c < 11; c++) {
        for (let ch = 0; ch < 32; ch++) {
          const idx32 = (r * 11 + c) * 32 + ch;
          const idx64 = (r * 11 + c) * 64 + ch;
          expect(tensor64[idx64]).toBe(tensor32[idx32]);
        }
      }
    }

    // Verify channels 32..63 are populated with distance gradients and spatial features
    let hasNonZeroExtended = false;
    for (let r = 0; r < 11; r++) {
      for (let c = 0; c < 11; c++) {
        for (let ch = 32; ch < 64; ch++) {
          const idx64 = (r * 11 + c) * 64 + ch;
          if (tensor64[idx64] !== 0) {
            hasNonZeroExtended = true;
            break;
          }
        }
      }
    }
    expect(hasNonZeroExtended).toBe(true);
  });

  it('should predict actions synchronously for both 32-channel and 64-channel models without error', () => {
    const state = createInitialState(42);
    const candidates = generateJointCandidateActions(state, 'AI');

    const pred32 = predictActionSync(model32, state, candidates, 'AI');
    const pred64 = predictActionSync(model64, state, candidates, 'AI');

    expect(pred32.policyScores.length).toBe(64);
    expect(pred64.policyScores.length).toBe(64);
    expect(typeof pred32.value).toBe('number');
    expect(typeof pred64.value).toBe('number');
  });

  it('should export, inspect channel count, and re-import 64-channel checkpoints seamlessly', () => {
    const ckpt64 = exportModelCheckpoint(model64, 1, 62.5);
    expect(getCheckpointChannels(ckpt64)).toBe(64);

    const restoredModel = createCNNModelFromCheckpoint(ckpt64);
    expect(restoredModel.inputs[0].shape).toEqual([null, 11, 11, 64]);
    expect(restoredModel.countParams()).toBe(788801);
    restoredModel.dispose();
  });

  it('should promote a 32-channel checkpoint to 64 channels, train on 64-channel self-play, and achieve parity vs 32-channel champion', async () => {
    const backend = new FileStorageBackend('./checkpoints');
    const supremeCkpt = loadCheckpointFromStorage('supreme_champion', backend);
    expect(supremeCkpt).toBeDefined();

    const champ32 = createCNNModel([11, 11, 32]);
    importModelCheckpoint(champ32, supremeCkpt!);

    const ckpt64 = promoteCheckpointTo64Channels(supremeCkpt!);
    expect(getCheckpointChannels(ckpt64)).toBe(64);

    const trained64 = createCNNModelFromCheckpoint(ckpt64);
    expect(trained64.inputs[0].shape).toEqual([null, 11, 11, 64]);
    expect(trained64.countParams()).toBe(788801);

    // Generate 64-channel MCTS self-play training samples
    const samples64 = await generateSelfPlayTrainingData(12, 2000, 450, 8, 64);
    expect(samples64.length).toBe(12);
    expect(samples64[0].stateTensor.length).toBe(11 * 11 * 64);

    // Train 64-channel model on samples
    const history = await trainCNNModel(trained64, samples64, 2, 8, 0.0005);
    expect(history.history.loss).toBeDefined();

    // Evaluate trained 64-channel model against 32-channel champion across 16 symmetric home-and-away matches
    const evalRes = await evalNNvsNN_Parallel(trained64, champ32, 16, 20, 1);
    expect(evalRes.winRate).toBeGreaterThanOrEqual(50.0); // Matches or exceeds reigning 32-channel champion
    expect(evalRes.w + evalRes.l + evalRes.d).toBe(16);

    champ32.dispose();
    trained64.dispose();
  }, 120000);
});
