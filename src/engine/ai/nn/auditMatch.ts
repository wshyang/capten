import { createInitialState } from '../../setup';
import { gameReducer } from '../../reducer';
import { BOARD_CONFIG } from '../../config/board';
import type { GameState } from '../../types';

export interface MatchOutcome {
  seed: number;
  playerA_is: 'PLAYER' | 'AI';
  scoreA: number;
  scoreB: number;
  winner: 'A' | 'B' | 'DRAW';
}

/**
 * Runs a symmetric arena audit match between two AI models (e.g. candidate vs champion)
 * across an assigned number of tournament rounds and epsilon exploration rates.
 */
export function runArenaAuditMatch(
  seed: number,
  playerASide: 'PLAYER' | 'AI',
  rounds = 20,
  exploitRate = 0.75,
  modelSizeA: '32' | '64' = '32',
  modelSizeB: '32' | '64' = '64'
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
      s = { ...s, config: { ...s.config, ai: { ...s.config.ai, nnModelSize: playerASide === 'PLAYER' ? modelSizeA : modelSizeB } } };
      s = gameReducer(s, { type: 'RUN_AI_TURN_FOR_PLAYER' });
    }
    if (s.phase === 'AI_TURN') {
      s = { ...s, config: { ...s.config, ai: { ...s.config.ai, nnModelSize: playerASide === 'AI' ? modelSizeA : modelSizeB } } };
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
