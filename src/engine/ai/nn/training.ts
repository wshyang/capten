import type { GameState, Side } from '../../types';
import { createInitialState } from '../../setup';
import { gameReducer } from '../../reducer';
import { runSeededMCTS } from '../mcts/mcts';
import { SeededRNG } from '../../rng';
import { encodeStateTensor } from './encoders';
import { encodeCandidateIndex } from './actionCodec';
import type { TrainingSample } from './model';

/**
 * Generates a self-play dataset of Supervised/RL training samples by executing MCTS matches.
 */
export async function generateSelfPlayTrainingData(
  count = 20,
  seed = 1000,
  iterations = 15,
  depth = 2,
  numChannels = 32
): Promise<TrainingSample[]> {
  const samples: TrainingSample[] = [];
  const rng = new SeededRNG(seed);

  const gameMaxTurns = typeof process !== 'undefined' && process.env?.GAME_MAX_TURNS
    ? parseInt(process.env.GAME_MAX_TURNS, 10)
    : 100;

  const makeGameConfig = (baseSeed: number) => {
    const state = createInitialState(baseSeed);
    return {
      ...state,
      config: {
        ...state.config,
        board: {
          ...state.config.board,
          maxTurns: gameMaxTurns,
        },
        mcts: {
          ...state.config.mcts,
          tier: 'CUSTOM' as const,
          iterations,
          rolloutDepth: depth,
          ismctsSamples: 1,
        },
        ai: {
          ...state.config.ai,
          aiEngineMode: 'MCTS_ONLY' as const,
          playerEngineMode: 'MCTS_ONLY' as const,
          defaultEngineMode: 'MCTS_ONLY' as const,
        },
      },
    };
  };

  let gameSeed = seed;
  let s = gameReducer(makeGameConfig(gameSeed), { type: 'JUMP_BALL_RELEASE', wonBy: 'PLAYER', releaseMarginMs: 100 });
  s = { ...s, momentum: { PLAYER: 3, AI: 3 } } as GameState;

  while (samples.length < count) {
    if (s.matchResult.isOver) {
      gameSeed++;
      s = gameReducer(makeGameConfig(gameSeed), { type: 'JUMP_BALL_RELEASE', wonBy: 'PLAYER', releaseMarginMs: 100 });
      s = { ...s, momentum: { PLAYER: 3, AI: 3 } } as GameState;
      continue;
    }

    const actingSide: Side = s.phase === 'PLAYER_PLAN' ? 'PLAYER' : 'AI';
    const stateTensor = encodeStateTensor(s, actingSide, numChannels);
    const mctsResult = runSeededMCTS(s, rng, actingSide);

    const policyTarget = new Float32Array(64);
    const chosenCand = {
      moves: mctsResult.moves,
      throwTargetPieceId: mctsResult.throwAction?.targetPieceId,
    };
    const actionIdx = encodeCandidateIndex(chosenCand, s, actingSide);
    policyTarget[actionIdx] = 1.0;

    const valueTarget = Math.max(-1.0, Math.min(1.0, (mctsResult.stats.bestScore || 0) / 500.0));

    samples.push({ stateTensor, policyTarget, valueTarget });

    if (s.phase === 'PLAYER_PLAN') {
      s = gameReducer(s, { type: 'RUN_AI_TURN_FOR_PLAYER' });
    } else {
      s = gameReducer(s, { type: 'RUN_AI_TURN' });
    }
    if (s.phase === 'AI_PLANNED_REVIEW') {
      s = gameReducer(s, { type: 'START_PLAYER_TURN' });
    }
  }

  return samples;
}
