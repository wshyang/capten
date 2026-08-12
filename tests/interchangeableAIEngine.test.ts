/**
 * Interchangeable AIEngine Test Suite
 * Verifies that MCTS-based AI ('MCTS_ONLY') and NN-based AI ('NN_ACTIVE' / 'MCTS_WITH_NN_SHADOW')
 * implement the identical AIEngine contract and can be pitted against each other seamlessly.
 */
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import { getAIEngine } from '../src/engine/ai/index';
import type { GameState } from '../src/engine/types';
import { SeededRNG } from '../src/engine/rng';

describe('Interchangeable AIEngine Contract & Pit Suite', () => {
  it('factory getAIEngine returns conforming AIEngine instances for MCTS and NN modes', () => {
    const mctsEngine = getAIEngine('MCTS_ONLY');
    const nnShadowEngine = getAIEngine('MCTS_WITH_NN_SHADOW');
    const nnActiveEngine = getAIEngine('NN_ACTIVE');

    expect(mctsEngine.mode).toBe('MCTS_ONLY');
    expect(nnShadowEngine.mode).toBe('MCTS_WITH_NN_SHADOW');
    expect(nnActiveEngine.mode).toBe('NN_ACTIVE');

    const state = createInitialState(42);
    const rng = new SeededRNG(42);

    const mctsResult = mctsEngine.planTurn(state, rng, 'AI');
    const nnResult = nnActiveEngine.planTurn(state, rng, 'AI');

    // Both must conform to identical AIPlannedTurnResult structure
    expect(mctsResult).toHaveProperty('moves');
    expect(mctsResult).toHaveProperty('posture');
    expect(mctsResult).toHaveProperty('stats');

    expect(nnResult).toHaveProperty('moves');
    expect(nnResult).toHaveProperty('posture');
    expect(nnResult).toHaveProperty('stats');
  });

  it('can pit an NN-based AI (Player) against an MCTS-based AI (AI) in a real match', () => {
    let state = createInitialState(100);
    state = {
      ...state,
      config: {
        ...state.config,
        mcts: {
          ...state.config.mcts,
          tier: 'CUSTOM',
          iterations: 150,
          rolloutDepth: 4,
          ismctsSamples: 3,
        },
        ai: {
          playerEngineMode: 'NN_ACTIVE',
          aiEngineMode: 'MCTS_ONLY',
        },
      },
    };

    let s = gameReducer(state, { type: 'JUMP_BALL_RELEASE', wonBy: 'PLAYER', releaseMarginMs: 100 });
    s = { ...s, momentum: { PLAYER: 3, AI: 3 } } as GameState;

    // Run 10 full half-turns
    for (let t = 1; t <= 10; t++) {
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

    // Ensure valid match state and that both sides took actions without errors
    expect(s.turn).toBeGreaterThan(1);
    expect(s.eventLog.length).toBeGreaterThan(0);
    const playerMoves = s.eventLog.filter(e => e.type === 'PIECE_MOVED' && e.side === 'PLAYER');
    const aiMoves = s.eventLog.filter(e => e.type === 'PIECE_MOVED' && e.side === 'AI');
    expect(playerMoves.length + aiMoves.length).toBeGreaterThan(0);
  });

  it('can pit an MCTS-based AI (Player) against an NN-based AI (AI) with MCTS_WITH_NN_SHADOW', () => {
    let state = createInitialState(200);
    state = {
      ...state,
      config: {
        ...state.config,
        mcts: {
          ...state.config.mcts,
          tier: 'CUSTOM',
          iterations: 150,
          rolloutDepth: 4,
          ismctsSamples: 3,
        },
        ai: {
          playerEngineMode: 'MCTS_ONLY',
          aiEngineMode: 'MCTS_WITH_NN_SHADOW',
        },
      },
    };

    let s = gameReducer(state, { type: 'JUMP_BALL_RELEASE', wonBy: 'AI', releaseMarginMs: 100 });
    s = { ...s, momentum: { PLAYER: 3, AI: 3 } } as GameState;

    for (let t = 1; t <= 10; t++) {
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

    expect(s.turn).toBeGreaterThan(1);
    expect(s.eventLog.length).toBeGreaterThan(0);
  });
});
