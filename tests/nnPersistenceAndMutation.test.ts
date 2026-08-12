/**
 * Persistence, Resumability & Mutation Suite for NN Evolution Flywheel
 * Verifies:
 * 1. Controlled Gaussian noise weight mutation (mutateModelWeights).
 * 2. Linear checkpoint interpolation / blending (blendModelCheckpoints).
 * 3. Storage-backed ResumableFlywheelState manifest persistence.
 * 4. Storage-backed ModelCheckpoint JSON serialization.
 * 5. Storage-backed Experience Replay Buffer JSONL serialization.
 */
import { describe, it, expect } from 'vitest';
import {
  createCNNModel,
  exportModelCheckpoint,
  mutateModelWeights,
  blendModelCheckpoints,
  saveFlywheelManifest,
  loadFlywheelManifest,
  saveCheckpointToStorage,
  loadCheckpointFromStorage,
  saveReplayBufferToStorage,
  loadReplayBufferFromStorage,
  InMemoryStorageBackend,
  type ResumableFlywheelState,
} from '../src/engine/ai/nn/index';

describe('NN Persistence, Resumability & Mutation Suite', () => {
  it('mutates model weights in-place with controlled Gaussian noise', () => {
    const model = createCNNModel([11, 11, 32]);
    const origWeights = model.getWeights().map(w => Array.from(w.dataSync()));

    mutateModelWeights(model, 1.0, 0.1); // 100% mutation rate for test verification

    const mutWeights = model.getWeights().map(w => Array.from(w.dataSync()));
    expect(origWeights.length).toBe(mutWeights.length);

    let changedCount = 0;
    for (let i = 0; i < origWeights.length; i++) {
      if (Math.abs(origWeights[i][0] - mutWeights[i][0]) > 0.0001) {
        changedCount++;
      }
    }
    expect(changedCount).toBeGreaterThan(0);
  });

  it('blends two checkpoints linearly with alpha interpolation', () => {
    const modelA = createCNNModel([11, 11, 32]);
    const modelB = createCNNModel([11, 11, 32]);
    const ckptA = exportModelCheckpoint(modelA, 1, 40.0);
    const ckptB = exportModelCheckpoint(modelB, 2, 80.0);

    const blended = blendModelCheckpoints(ckptA, ckptB, 0.5);

    expect(blended.generation).toBe(2);
    expect(blended.winRate).toBe(60.0);
    expect(blended.weights.length).toBe(ckptA.weights.length);

    const valA = ckptA.weights[0].data[0];
    const valB = ckptB.weights[0].data[0];
    const valBlend = blended.weights[0].data[0];
    expect(valBlend).toBeCloseTo(0.5 * valA + 0.5 * valB, 5);
  });

  it('saves and reloads ResumableFlywheelState manifest, ModelCheckpoint, and Replay Buffer using StorageBackend', () => {
    const backend = new InMemoryStorageBackend();
    const manifestKey = 'flywheel_state_gen_3';
    const ckptKey = 'champion_ckpt_gen_3';
    const replayKey = 'replay_buffer_gen_3';

    const manifest: ResumableFlywheelState = {
      currentGeneration: 3,
      status: 'COLLECTING_SELF_PLAY',
      completedSelfPlayGames: 8,
      completedArenaMatches: 0,
      arenaScore: { challengerScore: 10, championScore: 5, w: 2, l: 0, d: 2 },
      championCheckpointKey: ckptKey,
      replayBufferKey: replayKey,
      timestamp: Date.now(),
    };

    saveFlywheelManifest(manifestKey, manifest, backend);
    const loadedManifest = loadFlywheelManifest(manifestKey, backend);

    expect(loadedManifest).toBeDefined();
    expect(loadedManifest?.currentGeneration).toBe(3);
    expect(loadedManifest?.status).toBe('COLLECTING_SELF_PLAY');
    expect(loadedManifest?.completedSelfPlayGames).toBe(8);

    const model = createCNNModel([11, 11, 32]);
    const ckpt = exportModelCheckpoint(model, 3, 62.5);
    saveCheckpointToStorage(ckptKey, ckpt, backend);
    const loadedCkpt = loadCheckpointFromStorage(ckptKey, backend);

    expect(loadedCkpt).toBeDefined();
    expect(loadedCkpt?.generation).toBe(3);
    expect(loadedCkpt?.winRate).toBe(62.5);

    const samples = [
      {
        stateTensor: new Float32Array(11 * 11 * 32).fill(0.5),
        policyTarget: new Float32Array(64).fill(0.1),
        valueTarget: 1.0,
      },
    ];

    saveReplayBufferToStorage(replayKey, samples, backend);
    const loadedSamples = loadReplayBufferFromStorage(replayKey, backend);

    expect(loadedSamples.length).toBe(1);
    expect(loadedSamples[0].stateTensor.length).toBe(11 * 11 * 32);
    expect(loadedSamples[0].valueTarget).toBe(1.0);
  });
});
