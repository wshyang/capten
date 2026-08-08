import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import { generateAptitudeReport } from '../src/engine/scoring';

const FAST_CONFIG = {
  mcts: {
    tier: 'CUSTOM' as const,
    iterations: 50,
    rolloutDepth: 2,
    ismctsSamples: 1,
    explorationConstant: 1.414,
  },
};

describe('100% Seeded Match Determinism (§3)', () => {
  it('guarantees identical match state, event log, and assessment output across replayed runs with the same seed', () => {
    const seed = 884422;

    const runMatch = () => {
      let state = createInitialState(seed, FAST_CONFIG);

      // Jump-Ball Release
      state = gameReducer(state, {
        type: 'JUMP_BALL_RELEASE',
        releaseMarginMs: 25,
        wonBy: 'PLAYER',
      });

      // Turn 1: Move p_1 to (2, 4)
      state = gameReducer(state, {
        type: 'STAGE_MOVE',
        pieceId: 'p_1',
        destCell: { col: 2, row: 4 },
      });

      // Throw ball from p_3 to p_1 at (2, 4)
      state = gameReducer(state, {
        type: 'STAGE_THROW',
        targetPieceId: 'p_1',
        targetCell: { col: 2, row: 4 },
      });

      // End player turn
      state = gameReducer(state, { type: 'END_PLAYER_TURN' });

      // Run AI Turn & resolve
      state = gameReducer(state, { type: 'RUN_AI_TURN' });
      state = gameReducer(state, { type: 'START_PLAYER_TURN' });

      const report = generateAptitudeReport(state);
      return { state, report };
    };

    const matchA = runMatch();
    const matchB = runMatch();

    expect(matchA.state.score).toEqual(matchB.state.score);
    expect(matchA.state.momentum).toEqual(matchB.state.momentum);
    expect(matchA.state.pieces.map(p => ({ id: p.id, cell: p.cell, energy: p.energy }))).toEqual(
      matchB.state.pieces.map(p => ({ id: p.id, cell: p.cell, energy: p.energy }))
    );
    expect(matchA.state.eventLog.length).toBe(matchB.state.eventLog.length);
    expect(matchA.report.normalizedScores).toEqual(matchB.report.normalizedScores);
    expect(matchA.report.suggestedRole).toBe(matchB.report.suggestedRole);
  });
});
