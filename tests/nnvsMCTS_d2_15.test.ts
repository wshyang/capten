/**
 * Trained CNN vs. Basic d2@15 MCTS AI Pit Suite
 * Demonstrates:
 * 1. Creating the client-side TensorFlow.js Dual-Head Residual ConvNet.
 * 2. Training the CNN on self-play training data (demonstrating client-side training ability).
 * 3. Pitting the trained CNN ('NN_ACTIVE') against basic d2@15 MCTS AI ('MCTS_ONLY') across games.
 */
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import {
  createCNNModel,
  trainCNNModel,
  generateSelfPlayTrainingData,
  setCNNModel,
} from '../src/engine/ai/nn/index';
import type { GameState, MCTSTierConfig } from '../src/engine/types';

const BASIC_D2_15_TIER: MCTSTierConfig = {
  tier: 'CUSTOM',
  iterations: 15,
  rolloutDepth: 2,
  ismctsSamples: 1,
  explorationConstant: 1.414,
  label: 'd2@15',
  description: 'basic d2 15 iters MCTS AI',
};

function runGame(
  seed: number,
  nnAsPlayer: boolean,
  rounds = 15
): {
  nnScore: number;
  mctsScore: number;
  delta: number;
  winner: 'NN' | 'MCTS' | 'DRAW';
  nnAvgTimeMs: number;
  mctsAvgTimeMs: number;
} {
  const init = createInitialState(seed);
  let s = gameReducer(init, {
    type: 'JUMP_BALL_RELEASE',
    wonBy: seed % 2 === 0 ? 'PLAYER' : 'AI',
    releaseMarginMs: 100,
  });
  s = { ...s, momentum: { PLAYER: 3, AI: 3 } } as GameState;

  // Configure NN_ACTIVE vs MCTS_ONLY with d2@15
  s = {
    ...s,
    config: {
      ...s.config,
      mcts: BASIC_D2_15_TIER,
      ai: {
        playerEngineMode: nnAsPlayer ? 'NN_ACTIVE' : 'MCTS_ONLY',
        aiEngineMode: nnAsPlayer ? 'MCTS_ONLY' : 'NN_ACTIVE',
      },
    },
  };

  let nnTurns = 0;
  let mctsTurns = 0;
  let nnTotalTimeMs = 0;
  let mctsTotalTimeMs = 0;

  for (let t = 1; t <= rounds; t++) {
    if (s.matchResult.isOver) break;
    if (s.phase === 'PLAYER_PLAN') {
      s = gameReducer(s, { type: 'RUN_AI_TURN_FOR_PLAYER' });
      const timeMs = s.aiStatus.lastSearchStats?.timeMs || 0;
      if (nnAsPlayer) {
        nnTurns++;
        nnTotalTimeMs += timeMs;
      } else {
        mctsTurns++;
        mctsTotalTimeMs += timeMs;
      }
    }
    if (s.phase === 'AI_TURN') {
      s = gameReducer(s, { type: 'RUN_AI_TURN' });
      const timeMs = s.aiStatus.lastSearchStats?.timeMs || 0;
      if (nnAsPlayer) {
        mctsTurns++;
        mctsTotalTimeMs += timeMs;
      } else {
        nnTurns++;
        nnTotalTimeMs += timeMs;
      }
    }
    if (s.phase === 'AI_PLANNED_REVIEW') {
      s = gameReducer(s, { type: 'START_PLAYER_TURN' });
    }
  }

  const nnScore = nnAsPlayer ? s.score.PLAYER : s.score.AI;
  const mctsScore = nnAsPlayer ? s.score.AI : s.score.PLAYER;
  const delta = nnScore - mctsScore;
  const winner = nnScore > mctsScore ? 'NN' : mctsScore > nnScore ? 'MCTS' : 'DRAW';

  return {
    nnScore,
    mctsScore,
    delta,
    winner,
    nnAvgTimeMs: nnTurns > 0 ? nnTotalTimeMs / nnTurns : 0,
    mctsAvgTimeMs: mctsTurns > 0 ? mctsTotalTimeMs / mctsTurns : 0,
  };
}

describe('Trained CNN vs. Basic d2@15 MCTS AI Pit Suite', () => {
  it('trains the CNN model on self-play data and pits it against d2@15 MCTS AI', async () => {
    console.log(`\n  ═══════════════════════════════════════════════════════════════════════════════════════`);
    console.log(`  1. CREATING & TRAINING CLIENT-SIDE TFJS DUAL-HEAD RESNET CNN MODEL`);
    console.log(`  ═══════════════════════════════════════════════════════════════════════════════════════`);

    const model = createCNNModel([11, 11, 32]);
    const samples = await generateSelfPlayTrainingData(12, 1000, 150, 4);
    console.log(`  • Generated ${samples.length} self-play supervised training samples from d4@150 MCTS.`);

    const history = await trainCNNModel(model, samples, 5, 8);
    const finalLoss = history.history.loss ? Number(history.history.loss[history.history.loss.length - 1]) : 0;
    console.log(`  • Successfully trained CNN for 5 epochs! Final Loss: ${finalLoss.toFixed(4)}`);

    // Set the trained model as active in NNEngine
    setCNNModel(model);

    console.log(`\n  ═══════════════════════════════════════════════════════════════════════════════════════`);
    console.log(`  2. PITTING TRAINED CNN ('NN_ACTIVE') vs. BASIC d2@15 MCTS AI ('MCTS_ONLY') — 4 Matches`);
    console.log(`  ═══════════════════════════════════════════════════════════════════════════════════════`);

    const seeds = [1111, 2222, 3333, 4444];
    const results = seeds.map((seed, idx) => {
      const nnAsPlayer = idx % 2 === 0;
      return { seed, nnAsPlayer, ...runGame(seed, nnAsPlayer, 15) };
    });

    const totalNNScore = results.reduce((a, r) => a + r.nnScore, 0);
    const totalMCTSScore = results.reduce((a, r) => a + r.mctsScore, 0);
    const nnWins = results.filter(r => r.winner === 'NN').length;
    const mctsWins = results.filter(r => r.winner === 'MCTS').length;
    const draws = results.filter(r => r.winner === 'DRAW').length;
    const avgNNTimeMs = results.reduce((a, r) => a + r.nnAvgTimeMs, 0) / results.length;
    const avgMCTSTimeMs = results.reduce((a, r) => a + r.mctsAvgTimeMs, 0) / results.length;

    console.log(`  ───────────────────────────────────────────────────────────────────────────────────────`);
    console.log(`  Match    Role        Score (NN - MCTS)   Winner      NN Time/Turn    MCTS Time/Turn`);
    console.log(`  ───────────────────────────────────────────────────────────────────────────────────────`);
    results.forEach((r, idx) => {
      const roleStr = r.nnAsPlayer ? 'NN=Player, MCTS=AI' : 'NN=AI, MCTS=Player';
      const scoreStr = `${String(r.nnScore).padStart(2)} - ${String(r.mctsScore).padStart(2)}`.padEnd(17);
      console.log(
        `  G${idx + 1}       ${roleStr.padEnd(20)} ${scoreStr} [${r.winner.padEnd(4)}]      ${r.nnAvgTimeMs.toFixed(1)}ms         ${r.mctsAvgTimeMs.toFixed(1)}ms`
      );
    });
    console.log(`  ───────────────────────────────────────────────────────────────────────────────────────`);
    console.log(
      `  TOTAL:   NN ${totalNNScore} - MCTS ${totalMCTSScore} (Δ = ${totalNNScore - totalMCTSScore >= 0 ? '+' : ''}${totalNNScore - totalMCTSScore})   W/L/D: ${nnWins} / ${mctsWins} / ${draws}`
    );
    console.log(`  AVG TURN LATENCY: NN = ${avgNNTimeMs.toFixed(1)}ms | MCTS d2@15 = ${avgMCTSTimeMs.toFixed(1)}ms`);
    console.log(`  ═══════════════════════════════════════════════════════════════════════════════════════\n`);

    expect(results.length).toBe(4);
    expect(avgNNTimeMs).toBeGreaterThan(0);
    expect(avgMCTSTimeMs).toBeGreaterThan(0);
  }, 120000);
});
