/**
 * AlphaZero / Leela Chess Zero Evolution Flywheel Test Suite
 * Demonstrates:
 * 1. Self-play supervised data collection across generations.
 * 2. Training a Challenger model on an experience replay buffer.
 * 3. Pitting Challenger vs. Champion in an Arena tournament.
 * 4. Promoting Challenger if it beats the win-rate threshold.
 * 5. Serializing and restoring model checkpoints (JSON-compatible weights).
 */
import { describe, it, expect } from 'vitest';
import {
  EvolutionFlywheel,
  createCNNModel,
  exportModelCheckpoint,
  importModelCheckpoint,
} from '../src/engine/ai/nn/index';

describe('NN Evolution Flywheel & Checkpoint Preservation Suite', () => {
  it('runs a generation of the EvolutionFlywheel: self-play -> train -> arena -> promote -> export', async () => {
    console.log(`\n  ═══════════════════════════════════════════════════════════════════════════════════════`);
    console.log(`  ALPHA-ZERO / LEELA CHESS ZERO EVOLUTION FLYWHEEL — HARNESS VERIFICATION`);
    console.log(`  ═══════════════════════════════════════════════════════════════════════════════════════`);

    const flywheel = new EvolutionFlywheel({
      selfPlayGamesPerGen: 6,
      selfPlayIters: 150,
      selfPlayDepth: 4,
      epochsPerGen: 3,
      batchSize: 8,
      arenaMatches: 4,
      promotionWinRateThreshold: 50.0,
      maxReplayBufferSize: 100,
    });

    expect(flywheel.getGeneration()).toBe(0);

    const res = await flywheel.runGeneration(10);

    console.log(`\n  [FLYWHEEL GENERATION 1 REPORT]`);
    console.log(`  • Generation Number:     ${res.generation}`);
    console.log(`  • Replay Buffer Samples: ${res.sampleCount}`);
    console.log(`  • Training Loss:         ${res.trainingLoss.toFixed(4)}`);
    console.log(`  • Arena Score (C - R):   ${res.arenaScore.challengerScore} - ${res.arenaScore.championScore} (Δ = ${res.arenaScore.delta >= 0 ? '+' : ''}${res.arenaScore.delta})`);
    console.log(`  • W / L / D:             ${res.arenaScore.w} / ${res.arenaScore.l} / ${res.arenaScore.d}`);
    console.log(`  • Challenger Win Rate:   ${res.challengerWinRate.toFixed(1)}%`);
    console.log(`  • Promoted to Champion:  ${res.promoted ? 'YES ✓ (New Reigning Champion!)' : 'NO'}`);
    console.log(`  ═══════════════════════════════════════════════════════════════════════════════════════\n`);

    expect(res.generation).toBe(1);
    expect(res.sampleCount).toBeGreaterThan(0);
    expect(res.checkpoint).toBeDefined();
    expect(res.checkpoint.weights.length).toBeGreaterThan(0);
    expect(res.checkpoint.generation).toBe(1);
  }, 180000);

  it('serializes a model checkpoint to JSON arrays and restores it into a fresh CNN model', () => {
    const originalModel = createCNNModel([11, 11, 32]);
    const checkpoint = exportModelCheckpoint(originalModel, 5, 62.5);

    expect(checkpoint.generation).toBe(5);
    expect(checkpoint.winRate).toBe(62.5);
    expect(Array.isArray(checkpoint.weights)).toBe(true);
    expect(checkpoint.weights[0]).toHaveProperty('shape');
    expect(checkpoint.weights[0]).toHaveProperty('data');

    // Create a fresh uninitialized model and restore weights
    const restoredModel = createCNNModel([11, 11, 32]);
    importModelCheckpoint(restoredModel, checkpoint);

    const origWeights = originalModel.getWeights();
    const restWeights = restoredModel.getWeights();

    expect(origWeights.length).toBe(restWeights.length);
    for (let i = 0; i < origWeights.length; i++) {
      const origData = origWeights[i].dataSync();
      const restData = restWeights[i].dataSync();
      expect(origData[0]).toBeCloseTo(restData[0], 5);
    }
  });
});
