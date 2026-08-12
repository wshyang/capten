import { createCNNModelFromCheckpoint, importModelCheckpoint } from '../src/engine/ai/nn/checkpoints';
import { createCNNModel } from '../src/engine/ai/nn/model';
import { FileStorageBackend, loadCheckpointFromStorage } from '../src/engine/ai/nn/persistence';
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

  const playerBside = playerASide === 'PLAYER' ? 'AI' : 'PLAYER';

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
  console.log(' CAPTEN AUDIT: CURRENT 32-v2 CHAMPION vs. 64-LAYER (85% EPSILON-GREEDY WRAPPER)');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════');
  console.log(' • Player A (Pure NN_ACTIVE):      Current 32-Layer Winner v2 (supreme_champion_32_v2.json)');
  console.log(' • Player B (EPSILON_GREEDY_NN):   64-Layer ResNet Champion (supreme_champion_64.json)');
  console.log(' • Epsilon Exploration Setting:    85% Greedy Policy / 15% Random Exploration');
  console.log(' • Match Protocol:                 16 Symmetric Home-and-Away Audit Matches (seed 1000..1007, 20 turns)');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════\n');

  const backend = new FileStorageBackend('./checkpoints');
  const ckpt32 = loadCheckpointFromStorage('supreme_champion_32_v2', backend) || loadCheckpointFromStorage('supreme_champion', backend);
  const ckpt64 = loadCheckpointFromStorage('supreme_champion_64', backend);

  if (!ckpt32 || !ckpt64) {
    throw new Error('Failed to load champion checkpoints!');
  }

  const modelA = createCNNModel([11, 11, 32]);
  importModelCheckpoint(modelA, ckpt32);

  const modelB = createCNNModelFromCheckpoint(ckpt64);

  setCNNModel(modelA, '32');
  setCNNModel(modelB, '64');

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
    console.log(` [Match ${String(matchNum++).padStart(2, ' ')}/16] Seed ${seed} (A as PLAYER, B as AI):   Score A ${m1.scoreA} - ${m1.scoreB} B ➔ Winner: ${m1.winner === 'A' ? 'PLAYER A (32-v2 Champion)' : m1.winner === 'B' ? 'PLAYER B (64-Layer 75% Epsilon)' : 'DRAW'}`);

    // Match 2: Player A as AI, Player B as PLAYER
    const m2 = runMatch(seed, 'AI', 20, 0.75);
    outcomes.push(m2);
    if (m2.winner === 'A') wA++;
    else if (m2.winner === 'B') wB++;
    else draws++;
    console.log(` [Match ${String(matchNum++).padStart(2, ' ')}/16] Seed ${seed} (A as AI, B as PLAYER):   Score A ${m2.scoreA} - ${m2.scoreB} B ➔ Winner: ${m2.winner === 'A' ? 'PLAYER A (32-v2 Champion)' : m2.winner === 'B' ? 'PLAYER B (64-Layer 75% Epsilon)' : 'DRAW'}`);
  }

  const totalMatches = wA + wB + draws;
  const winRateA = ((wA + 0.5 * draws) / totalMatches) * 100;
  const winRateB = ((wB + 0.5 * draws) / totalMatches) * 100;

  console.log('\n═══════════════════════════════════════════════════════════════════════════════════════');
  console.log(' TOURNAMENT SUMMARY TABLE (16 SYMMETRIC AUDIT MATCHES)');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════');
  console.log(` • Current Champion (32-v2 Winner, Pure NN):             ${wA} W / ${wB} L / ${draws} D  (Win Rate: ${winRateA.toFixed(1)}%)`);
  console.log(` • 64-Layer Champion (75% Epsilon-Greedy Wrapper):       ${wB} W / ${wA} L / ${draws} D  (Win Rate: ${winRateB.toFixed(1)}%)`);
  console.log('═══════════════════════════════════════════════════════════════════════════════════════\n');

  modelA.dispose();
  modelB.dispose();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
