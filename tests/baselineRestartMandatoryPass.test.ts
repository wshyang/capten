import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';

const FAST_CONFIG = {
  mcts: {
    tier: 'CUSTOM' as const,
    iterations: 50,
    rolloutDepth: 2,
    ismctsSamples: 1,
    explorationConstant: 1.414,
  },
};

describe('Post-Goal Baseline Restart & Mandatory Court Pass Rule', () => {
  it('prohibits direct pass to Captain on baseline restart and allows goal only after mandatory court pass', () => {
    let state = createInitialState(333, FAST_CONFIG);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });

    // 1. Enter baseline restart phase (e.g. after conceding a goal)
    state.isRestartPhase.PLAYER = true;
    state.ballHolderId = 'p_1';
    state.pieces.forEach(p => { p.hasBall = p.id === 'p_1'; });

    // 2. Direct throw from baseline to Captain (5,10) is REJECTED by tournament mandatory court pass rule
    state = gameReducer(state, { type: 'STAGE_THROW', targetPieceId: 'p_captain', targetCell: { col: 5, row: 10 } });
    expect(state.plannedThrow).toBeNull(); // Rejected!

    // Direct throw via THROW_BALL to Captain is also rejected while in baseline restart
    state = gameReducer(state, { type: 'THROW_BALL', targetCell: { col: 5, row: 10 } });
    expect(state.score.PLAYER).toBe(0);

    // 3. Mandatory pass to active court player p_3 at (8,3) is ALLOWED
    state = gameReducer(state, { type: 'STAGE_THROW', targetPieceId: 'p_3', targetCell: { col: 8, row: 3 } });
    expect(state.plannedThrow?.targetPieceId).toBe('p_3');

    // 4. Resolve pass to court player p_3
    state = gameReducer(state, { type: 'END_PLAYER_TURN' });

    // Mandatory court pass was executed in END_PLAYER_TURN, lifting the restart restriction
    expect(state.isRestartPhase.PLAYER).toBe(false);

    // 5. Complete AI turn to return to Player turn
    state = gameReducer(state, { type: 'RUN_AI_TURN' });
    state = gameReducer(state, { type: 'START_PLAYER_TURN' });

    // 6. Now from court player p_3 at (8,3), passing to Captain (5,10) is legal!
    state.ballHolderId = 'p_3';
    state.pieces.forEach(p => { p.hasBall = p.id === 'p_3'; });
    state = gameReducer(state, { type: 'STAGE_THROW', targetPieceId: 'p_captain', targetCell: { col: 5, row: 10 } });
    expect(state.plannedThrow?.targetPieceId).toBe('p_captain');
  });

  it('keeps all outfield pieces at their exact current locations and gives ball back to the Captain for a free restart throw', () => {
    let state = createInitialState(555, FAST_CONFIG);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });

    // Move p_2 to custom location (3, 4) and p_3 to (7, 5)
    const p2 = state.pieces.find(p => p.id === 'p_2')!;
    p2.cell = { col: 3, row: 4 };
    const p3 = state.pieces.find(p => p.id === 'p_3')!;
    p3.cell = { col: 7, row: 5 };

    // Move AI piece ai_2 to (4, 6)
    const ai2 = state.pieces.find(p => p.id === 'ai_2')!;
    ai2.cell = { col: 4, row: 6 };

    // Player scores a goal with Captain
    state.temporaryState.noLookPassActive = { PLAYER: true };
    const carrier = state.pieces.find(p => p.hasBall)!;
    carrier.cell = { col: 5, row: 7 };

    state = gameReducer(state, { type: 'THROW_BALL', targetCell: { col: 5, row: 10 } });

    // Verify goal was scored
    expect(state.score.PLAYER).toBe(1);

    // ALL outfield pieces must remain at their exact current locations without entering defense circles!
    const p2After = state.pieces.find(p => p.id === 'p_2')!;
    expect(p2After.cell).toEqual({ col: 3, row: 4 });

    const p3After = state.pieces.find(p => p.id === 'p_3')!;
    expect(p3After.cell).toEqual({ col: 7, row: 5 });

    const ai2After = state.pieces.find(p => p.id === 'ai_2')!;
    expect(ai2After.cell).toEqual({ col: 4, row: 6 });

    // Ball is given directly to AI Captain at (5, 0) for the free restart throw out
    const aiCaptain = state.pieces.find(p => p.id === 'ai_captain')!;
    expect(aiCaptain.hasBall).toBe(true);
    expect(state.ballHolderId).toBe('ai_captain');
    expect(aiCaptain.cell).toEqual({ col: 5, row: 0 });
    expect(state.isRestartPhase.AI).toBe(true);
  });
});
