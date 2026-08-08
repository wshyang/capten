import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import { previewThrow } from '../src/engine/interception';

describe('Clean Pass 100% Refund Invariant (§5 & §7)', () => {
  it('refunds 100% of throw energy (0.0e paid) when passing through uncontested open air', () => {
    let state = createInitialState(555);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });

    const carrier = state.pieces.find(p => p.hasBall)!; // p_1 at (5,4)
    const initialEnergy = carrier.energy;

    // Check preview to p_2 at (2,3)
    const preview = previewThrow(carrier, { col: 2, row: 3 }, state.pieces, state.controlMap);
    expect(preview.isClean).toBe(true);
    expect(preview.cumulativeCaptureRisk).toBe(0);

    // Execute throw to p_2
    state = gameReducer(state, { type: 'STAGE_THROW', targetPieceId: 'p_2', targetCell: { col: 2, row: 3 } });
    state = gameReducer(state, { type: 'THROW_BALL', targetCell: { col: 2, row: 3 } });

    // Thrower energy should remain untouched (100% refunded)
    const throwerAfter = state.pieces.find(p => p.id === carrier.id)!;
    expect(throwerAfter.energy).toBe(initialEnergy);

    // Ball successfully received by p_2
    const p2After = state.pieces.find(p => p.id === 'p_2')!;
    expect(p2After.hasBall).toBe(true);
  });
});
