import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';

describe('Holding Foul Rule Tests', () => {
  it('turns over possession on holding foul when Player ball-carrier does not pass during the turn', () => {
    let state = createInitialState(7788);
    // Player wins opening jump-ball, p_1 possesses the ball
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });
    expect(state.ballHolderId).toBe('p_1');

    // Move non-carrier piece without staging a throw
    state = gameReducer(state, { type: 'MOVE_PIECE_DIRECT', pieceId: 'p_2', destCell: { col: 8, row: 4 } });

    // End player turn without throwing the ball
    state = gameReducer(state, { type: 'END_PLAYER_TURN' });

    // Holding foul whistle blows and ball turns over to ai_1!
    expect(state.ballHolderId).toBe('ai_1');
    const foulEvent = state.eventLog.find(e => e.type === 'HOLDING_FOUL_TURNOVER' && e.side === 'PLAYER');
    expect(foulEvent).toBeDefined();
    expect(foulEvent?.details.foulPieceId).toBe('p_1');
  });

  it('turns over possession on holding foul when AI ball-carrier does not pass during its turn', () => {
    let state = createInitialState(8899);
    // AI wins opening jump-ball, ai_1 possesses the ball
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'AI' });
    expect(state.ballHolderId).toBe('ai_1');

    // Simulate AI plan with only moves and NO throw action
    state.aiPlannedActions = {
      moves: [{ pieceId: 'ai_2', fromCell: { col: 8, row: 7 }, destCell: { col: 8, row: 6 }, cost: 1.0 }],
      throwAction: undefined, // AI does not throw
      stats: { iterations: 100, nodesEvaluated: 100, bestScore: 0, timeMs: 10, candidateCount: 1, bestActionDescription: 'Anchor' },
    };
    state.phase = 'AI_PLANNED_REVIEW';

    // Start player turn resolves AI moves: holding foul turnover occurs!
    state = gameReducer(state, { type: 'START_PLAYER_TURN' });

    expect(state.ballHolderId).toBe('p_1');
    const foulEvent = state.eventLog.find(e => e.type === 'HOLDING_FOUL_TURNOVER' && e.side === 'AI');
    expect(foulEvent).toBeDefined();
    expect(foulEvent?.details.foulPieceId).toBe('ai_1');
  });
});
