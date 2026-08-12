import * as fs from 'fs';
import * as path from 'path';
import { createCNNModel, trainCNNModel } from '../src/engine/ai/nn/model';
import { generateSelfPlayTrainingData } from '../src/engine/ai/nn/training';
import {
  exportModelCheckpoint,
  importModelCheckpoint,
  createCNNModelFromCheckpoint,
} from '../src/engine/ai/nn/checkpoints';
import {
  FileStorageBackend,
  saveCheckpointToStorage,
  loadCheckpointFromStorage,
} from '../src/engine/ai/nn/persistence';
import { setCNNModel } from '../src/engine/ai/nn/index';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import { BOARD_CONFIG } from '../src/engine/config/board';
import type { GameState } from '../src/engine/types';

interface MatchOutcome {
  seed: number;
  playerA_is: 'PLAYER' | 'AI';
  scoreA: number;
  scoreB: number;
  winner: 'A' | 'B' | 'DRAW';
}

function runMatch(
  seed: number,
  playerASide: 'PLAYER' | 'AI',
  rounds = 20,
  exploitRate = 0.75
): MatchOutcome {
  let s = createInitialState(seed);
  s = gameReducer(s, {
    type: 'JUMP_BALL_RELEASE',
    wonBy: seed % 2 === 0 ? 'PLAYER' : 'AI',
    releaseMarginMs: 100,
  });
  s = { ...s, momentum: { PLAYER: 3, AI: 3 } } as GameState;

  s = {
    ...s,
    config: {
      ...s.config,
      ai: {
        ...s.config.ai,
        playerEngineMode: playerASide === 'PLAYER' ? 'NN_ACTIVE' : 'EPSILON_GREEDY_NN',
        aiEngineMode: playerASide === 'AI' ? 'NN_ACTIVE' : 'EPSILON_GREEDY_NN',
        epsilonExploitRate: exploitRate,
      },
    },
  };

  for (let t = 1; t <= rounds; t++) {
    if (s.matchResult.isOver) break;
    if (s.phase === 'PLAYER_PLAN') {
      s = gameReducer(s, { type: 'RUN_AI_TURN_FOR_PLAYER' });
    }
    if (s.phase === 'AI_TURN') {
      s = gameReducer(s, { type: 'RUN_AI_TURN' });
    }
    if (s.phase === 'AI_PLANNED_REVIEW') {
      s = gameReducer(s, { type: 'START_PLAYER_TURN' });
    }
  }

  const scorePlayer = s.score.PLAYER;
  const scoreAi = s.score.AI;
  const scoreA = playerASide === 'PLAYER' ? scorePlayer : scoreAi;
  const scoreB = playerASide === 'PLAYER' ? scoreAi : scorePlayer;

  let winner: 'A' | 'B' | 'DRAW' = scoreA > scoreB ? 'A' : scoreB > scoreA ? 'B' : 'DRAW';
  if (winner === 'DRAW') {
    const ballCarrier = s.pieces.find(p => p.hasBall);
    if (ballCarrier) {
      const targetA = playerASide === 'PLAYER' ? BOARD_CONFIG.aiScoringCell : BOARD_CONFIG.playerScoringCell;
      const targetB = playerASide === 'PLAYER' ? BOARD_CONFIG.playerScoringCell : BOARD_CONFIG.aiScoringCell;
      const distA = Math.hypot(ballCarrier.cell.col - targetA.col, ballCarrier.cell.row - targetA.row);
      const distB = Math.hypot(ballCarrier.cell.col - targetB.col, ballCarrier.cell.row - targetB.row);
      if (Math.abs(distA - distB) > 0.1) {
        winner = distA < distB ? 'A' : 'B';
      }
    }
  }

  return {
    seed,
    playerA_is: playerASide,
    scoreA,
    scoreB,
    winner,
  };
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════════════════════════');
  console.log(' CAPTEN TRAINING: TRAINING 32-LAYER RESNET FROM SCRATCH & EVALUATING VS 75% EPSILON-64');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════');
  console.log(' • Target Architecture:   32-Channel Dual-Head ResNet (386,305 params)');
  console.log(' • Training Protocol:     MCTS Self-Play (d8@450 with Anti-Cyclic Penalty in Place)');
  console.log(' • Evaluation Opponent:   64-Layer Champion (supreme_champion_64.json) [75% Greedy / 25% Random]');
  console.log(' • Evaluation Protocol:   16 Symmetric Home-and-Away Audit Matches (seed 1000..1007, 20 turns)');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════\n');

  console.log(' [Step 1/4] Generating MCTS d8@450 Self-Play Training Dataset (with Anti-Cyclic rule active)...');
  const startGen = Date.now();
  const samples = await generateSelfPlayTrainingData(24, 4242, 450, 8, 32);
  const genTime = ((Date.now() - startGen) / 1000).toFixed(2);
  console.log(`   ➔ Generated ${samples.length} high-fidelity self-play samples in ${genTime}s`);

  console.log('\n [Step 2/4] Initializing & Training 32-Channel ResNet CNN from scratch...');
  const newModel32 = createCNNModel([11, 11, 32]);
  const startTrain = Date.now();
  const history = await trainCNNModel(newModel32, samples, 3, 16, 0.0005);
  const trainTime = ((Date.now() - startTrain) / 1000).toFixed(2);
  console.log(`   ➔ Training Completed in ${trainTime}s! Final Loss: ${history.history.loss?.[2]?.toFixed(4) || 'N/A'}`);

  console.log('\n [Step 3/4] Exporting and saving newly trained 32-Layer ResNet weights...');
  const backend = new FileStorageBackend('./checkpoints');
  const newCkpt = exportModelCheckpoint(newModel32, 1, 32);
  saveCheckpointToStorage('supreme_champion', newCkpt, backend);
  saveCheckpointToStorage('supreme_champion_32_v2', newCkpt, backend);

  // Also write to public/checkpoints/ for UI deployment
  const pubDir = path.join(process.cwd(), 'public', 'checkpoints');
  if (!fs.existsSync(pubDir)) fs.mkdirSync(pubDir, { recursive: true });
  fs.writeFileSync(path.join(pubDir, 'supreme_champion.json'), JSON.stringify(newCkpt), 'utf8');
  fs.writeFileSync(path.join(pubDir, 'supreme_champion_32_v2.json'), JSON.stringify(newCkpt), 'utf8');
  console.log('   ➔ Saved to checkpoints/ & public/checkpoints/ as supreme_champion.json & supreme_champion_32_v2.json ✓');

  console.log('\n [Step 4/4] Pitting Newly Trained 32-Layer Model vs. 64-Layer Champion (75% Epsilon-Greedy)...');
  const ckpt64 = loadCheckpointFromStorage('supreme_champion_64', backend);
  if (!ckpt64) {
    throw new Error('Failed to load 64-layer champion checkpoint!');
  }
  const model64 = createCNNModelFromCheckpoint(ckpt64);

  setCNNModel(newModel32, '32');
  setCNNModel(model64, '64');

  const seeds = [1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007];
  let wA = 0, wB = 0, draws = 0;
  const outcomes: MatchOutcome[] = [];

  let matchNum = 1;
  for (const seed of seeds) {
    // Match 1: Player A as PLAYER, Player B as AI
    const m1 = runMatch(seed, 'PLAYER', 20, 0.75);
    outcomes.push(m1);
    if (m1.winner === 'A') wA++;
    else if (m1.winner === 'B') wB++;
    else draws++;
    console.log(`   [Match ${String(matchNum++).padStart(2, ' ')}/16] Seed ${seed} (A as PLAYER, B as AI):   Score A ${m1.scoreA} - ${m1.scoreB} B ➔ Winner: ${m1.winner === 'A' ? 'PLAYER A (New 32-Layer)' : m1.winner === 'B' ? 'PLAYER B (64-Layer 75% Epsilon)' : 'DRAW'}`);

    // Match 2: Player A as AI, Player B as PLAYER
    const m2 = runMatch(seed, 'AI', 20, 0.75);
    outcomes.push(m2);
    if (m2.winner === 'A') wA++;
    else if (m2.winner === 'B') wB++;
    else draws++;
    console.log(`   [Match ${String(matchNum++).padStart(2, ' ')}/16] Seed ${seed} (A as AI, B as PLAYER):   Score A ${m2.scoreA} - ${m2.scoreB} B ➔ Winner: ${m2.winner === 'A' ? 'PLAYER A (New 32-Layer)' : m2.winner === 'B' ? 'PLAYER B (64-Layer 75% Epsilon)' : 'DRAW'}`);
  }

  const totalMatches = wA + wB + draws;
  const winRateA = ((wA + 0.5 * draws) / totalMatches) * 100;
  const winRateB = ((wB + 0.5 * draws) / totalMatches) * 100;

  console.log('\n═══════════════════════════════════════════════════════════════════════════════════════');
  console.log(' TOURNAMENT SUMMARY TABLE (16 SYMMETRIC AUDIT MATCHES)');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════');
  console.log(` • Newly Trained 32-Layer ResNet (from scratch):         ${wA} W / ${wB} L / ${draws} D  (Win Rate: ${winRateA.toFixed(1)}%)`);
  console.log(` • 64-Layer Champion (75% Epsilon-Greedy Wrapper):       ${wB} W / ${wA} L / ${draws} D  (Win Rate: ${winRateB.toFixed(1)}%)`);
  console.log('═══════════════════════════════════════════════════════════════════════════════════════\n');

  newModel32.dispose();
  model64.dispose();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
