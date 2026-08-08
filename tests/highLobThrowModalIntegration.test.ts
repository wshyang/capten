import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import { resolveThrow } from '../src/engine/interception';
import { computeControlMap } from '../src/engine/control';
import { SeededRNG } from '../src/engine/rng';

const FAST_CONFIG = {
  mcts: {
    tier: 'CUSTOM' as const,
    iterations: 40,
    rolloutDepth: 2,
    ismctsSamples: 1,
    explorationConstant: 1.414,
  },
};

describe('High Lob to Player Captain Resolution (§4, §7, §Modal Integration)', () => {
  it('correctly stages and resolves High Lob from (4, 8) to Player Captain (5, 10) scoring a goal with 100% catch rate', () => {
    let state = createInitialState(98765, FAST_CONFIG);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });

    // Place a player piece p_5 at (4, 8) holding the ball
    const p5 = state.pieces.find(p => p.id === 'p_5')!;
    p5.cell = { col: 4, row: 8 };
    p5.hasBall = true;
    p5.energy = 10.0;
    state.ballHolderId = p5.id;
    state.pieces.forEach(p => {
      if (p.id !== 'p_5') p.hasBall = false;
    });

    // Clear defenders from in-flight path (5, 9) so pass reaches reception cleanly
    const aiBlocker = state.pieces.find(p => p.id === 'ai_blocker')!;
    aiBlocker.cell = { col: 2, row: 9 };

    // Stage High Lob to Player Captain at (5, 10)
    state = gameReducer(state, {
      type: 'STAGE_THROW',
      targetPieceId: 'p_captain',
      targetCell: { col: 5, row: 10 },
      throwType: 'HIGH_LOB',
    });

    expect(state.plannedThrow).toBeDefined();
    expect(state.plannedThrow?.throwType).toBe('HIGH_LOB');
    expect(state.plannedThrow?.loft).toBe(2);

    // End player turn to execute and resolve the staged throw
    state = gameReducer(state, { type: 'END_PLAYER_TURN' });

    // Verify pass attempted with HIGH_LOB and loft 2
    const passAttemptEvent = state.eventLog.find(e => e.type === 'PASS_ATTEMPTED' && e.side === 'PLAYER');
    expect(passAttemptEvent).toBeDefined();
    expect(passAttemptEvent?.details.throwType).toBe('HIGH_LOB');
    expect(passAttemptEvent?.details.loft).toBe(2);

    // Verify pass was completed cleanly and goal was scored without undershoot
    const passCompletedEvent = state.eventLog.find(e => e.type === 'PASS_COMPLETED' && e.side === 'PLAYER');
    expect(passCompletedEvent).toBeDefined();

    const goalEvent = state.eventLog.find(e => e.type === 'SCORE_GOAL' && e.side === 'PLAYER');
    expect(goalEvent).toBeDefined();
    expect(state.score.PLAYER).toBe(1);

    // Undershoot must NOT occur on a High Lob to Captain
    const undershootEvent = state.eventLog.find(e => e.type === 'PASS_UNDERSHOOT_RACE');
    expect(undershootEvent).toBeUndefined();
  });

  it('direct resolveThrow with HIGH_LOB to elevated Captain (hr=2) evaluates mismatch m=0 and 100% catch rate', () => {
    const state = createInitialState(112233);
    const thrower = state.pieces.find(p => p.id === 'p_5')!;
    thrower.cell = { col: 4, row: 8 };

    const captain = state.pieces.find(p => p.id === 'p_captain')!;
    expect(captain.height).toBe(2);

    // Move AI blocker away so ray is clean
    const aiBlocker = state.pieces.find(p => p.id === 'ai_blocker')!;
    aiBlocker.cell = { col: 2, row: 9 };
    const controlMap = computeControlMap(state.pieces);

    const rng = new SeededRNG(42);
    const resolution = resolveThrow(
      thrower,
      captain,
      state.pieces,
      controlMap,
      rng,
      undefined,
      undefined,
      captain.cell,
      false,
      'HIGH_LOB'
    );

    expect(resolution.loft).toBe(2);
    expect(resolution.catcherHeight).toBe(2);
    expect(resolution.catchSuccess).toBe(true);
    expect(resolution.scored).toBe(true);
    expect(resolution.missedCatchType).toBeUndefined();
  });
});
