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

  let state = createInitialState(seed);
  state = {
    ...state,
    config: {
      ...state.config,
      mcts: {
        ...state.config.mcts,
        tier: 'CUSTOM',
        iterations,
        rolloutDepth: depth,
        ismctsSamples: 1,
      },
      ai: {
        ...state.config.ai,
        aiEngineMode: 'MCTS_ONLY',
        playerEngineMode: 'MCTS_ONLY',
        defaultEngineMode: 'MCTS_ONLY',
      },
    },
  };

  let s = gameReducer(state, { type: 'JUMP_BALL_RELEASE', wonBy: 'PLAYER', releaseMarginMs: 100 });
  s = { ...s, momentum: { PLAYER: 3, AI: 3 } } as GameState;

  for (let step = 0; step < count; step++) {
    if (s.matchResult.isOver) break;

    const actingSide: Side = s.phase === 'PLAYER_PLAN' ? 'PLAYER' : 'AI';
    const stateTensor = encodeStateTensor(s, actingSide, numChannels);
    const mctsResult = runSeededMCTS(s, rng, actingSide);

    // Create policy one-hot target for chosen action
    const policyTarget = new Float32Array(64);
    const chosenCand = {
      moves: mctsResult.moves,
      throwTargetPieceId: mctsResult.throwAction?.targetPieceId,
    };
    const actionIdx = encodeCandidateIndex(chosenCand, s, actingSide);
    policyTarget[actionIdx] = 1.0;

    // Estimate value target from MCTS normalized score in [-1.0, +1.0]
    const valueTarget = Math.max(-1.0, Math.min(1.0, (mctsResult.stats.bestScore || 0) / 500.0));

    samples.push({
      stateTensor,
      policyTarget,
      valueTarget,
    });

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
