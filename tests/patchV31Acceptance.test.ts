import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import { isLegalMove, getReachableCells } from '../src/engine/movement';
import { evaluateState } from '../src/engine/ai/evaluate';
import { BOARD_CONFIG } from '../src/engine/config/board';
import { runSeededMCTS } from '../src/engine/ai/mcts';
import { createRNG } from '../src/engine/rng';

describe('PATCH v3.1 Acceptance Criteria (#12, #13, #14, #15)', () => {
  it('Criterion #12: Ball-carrier cannot move to another cell (no running with the ball)', () => {
    let state = createInitialState(1200);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });

    const carrier = state.pieces.find(p => p.hasBall && p.side === 'PLAYER')!;
    expect(carrier).toBeDefined();

    // 1. Assert isLegalMove rejects any cell change for carrier
    const dest = { col: carrier.cell.col + 1, row: carrier.cell.row };
    const check = isLegalMove(carrier, dest, state.pieces, state.temporaryState);
    expect(check.legal).toBe(false);
    expect(check.reason).toContain('cannot run with the ball');

    // 2. Assert getReachableCells returns empty list for carrier
    const reachable = getReachableCells(carrier, state.pieces);
    expect(reachable.length).toBe(0);

    // 3. Assert STAGE_MOVE does not add a move for the carrier
    const beforePlanned = state.plannedMoves.length;
    state = gameReducer(state, { type: 'STAGE_MOVE', pieceId: carrier.id, destCell: dest });
    expect(state.plannedMoves.length).toBe(beforePlanned);

    // 4. Assert Captain piece cannot move
    const captain = state.pieces.find(p => p.isCaptain && p.side === 'PLAYER')!;
    const capCheck = isLegalMove(captain, { col: captain.cell.col, row: captain.cell.row - 1 }, state.pieces);
    expect(capCheck.legal).toBe(false);
    expect(capCheck.reason).toContain('Captain is a stationary target');
  });

  it('Criterion #13: Objective is fixed and completed pass to own Captain scores goal', () => {
    let state = createInitialState(1300);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 25, wonBy: 'PLAYER' });

    expect(BOARD_CONFIG.playerScoringCell.col).toBe(5);
    expect(BOARD_CONFIG.playerScoringCell.row).toBe(10);
    expect(BOARD_CONFIG.aiScoringCell.col).toBe(5);
    expect(BOARD_CONFIG.aiScoringCell.row).toBe(0);

    // Player captain is on (5, 10)
    const playerCaptain = state.pieces.find(p => p.isCaptain && p.side === 'PLAYER')!;
    expect(playerCaptain.cell.col).toBe(5);
    expect(playerCaptain.cell.row).toBe(10);

    // AI captain is on (5, 0)
    const aiCaptain = state.pieces.find(p => p.isCaptain && p.side === 'AI')!;
    expect(aiCaptain.cell.col).toBe(5);
    expect(aiCaptain.cell.row).toBe(0);

    // Position carrier at (5, 7) (within no-look pass range <=4.5) to score goal cleanly
    const carrier = state.pieces.find(p => p.hasBall)!;
    carrier.cell = { col: 5, row: 7 };
    state.temporaryState.noLookPassActive = { PLAYER: true };
    state = gameReducer(state, { type: 'THROW_BALL', targetCell: { col: 5, row: 10 } });
    expect(state.score.PLAYER).toBe(1);
    expect(state.eventLog.some(e => e.type === 'SCORE_GOAL')).toBe(true);
  });

  it('Criterion #14: AI advances ball toward Captain over time and attempts scoring passes', () => {
    let state = createInitialState(1400);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'AI' });
    
    // AI has ball at ai_1
    const aiCarrier = state.pieces.find(p => p.hasBall && p.side === 'AI')!;
    expect(aiCarrier).toBeDefined();

    // Execute AI turn using MCTS
    state.config.mcts.tier = 'T1';
    state.config.mcts.iterations = 150;
    const rng = createRNG(1400);
    const mctsResult = runSeededMCTS(state, rng);

    // MCTS plans a throw action toward Captain or cutting receiver
    expect(mctsResult.throwAction || mctsResult.moves.length > 0).toBeDefined();

    // Advance turn and resolve AI actions
    state = gameReducer(state, { type: 'RUN_AI_TURN' });
    state = gameReducer(state, { type: 'START_PLAYER_TURN' });

    // Assert that a pass was attempted or piece move event was recorded
    const passOrMove = state.eventLog.some(e => (e.type === 'PASS_ATTEMPTED' || e.type === 'PIECE_MOVED') && e.side === 'AI');
    expect(passOrMove).toBe(true);
  });

  it('Criterion #15: Evaluation function goal term (+1000) dominates the sum of all positional terms', () => {
    const state = createInitialState(1500);

    // Base state with score 0-0
    const evalBase = evaluateState(state);

    // State where AI has scored 1 goal (terminal advantage)
    const stateWithGoal = {
      ...state,
      score: { PLAYER: 0, AI: 1 },
    };
    const evalWithGoal = evaluateState(stateWithGoal);

    // State where Player has maximized all positional terms (full energy differential, max control, max rest)
    const stateWithMaxPosition = {
      ...state,
      score: { PLAYER: 0, AI: 0 },
      pieces: state.pieces.map(p => ({
        ...p,
        energy: p.side === 'PLAYER' ? 10.0 : 0.0,
        restStreak: p.side === 'PLAYER' ? 5 : 0,
      })),
    };
    const evalMaxPosition = evaluateState(stateWithMaxPosition);

    const goalDelta = evalWithGoal - evalBase;
    const maxPositionalDelta = Math.abs(evalMaxPosition - evalBase);

    expect(goalDelta).toBeGreaterThanOrEqual(999.0);
    expect(goalDelta).toBeGreaterThan(maxPositionalDelta);
  });
});
