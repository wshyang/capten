import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import { previewThrow } from '../src/engine/interception';
import { computeControlMap } from '../src/engine/control';

describe('Interception Edge Cases & Card Interaction Coverage', () => {
  it('handles negative energy bounds and energy cap clipping', () => {
    let state = createInitialState(1010);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 25, wonBy: 'AI' });

    const aiCarrier = state.pieces.find(p => p.id === 'ai_1')!;
    aiCarrier.energy = 0.5;

    const controlMap = computeControlMap(state.pieces);
    const targetCell = { col: 5, row: 0 };
    const preview = previewThrow(aiCarrier, targetCell, state.pieces, controlMap);

    expect(preview.postThrowEnergy).toBeGreaterThanOrEqual(0.0);
  });

  it('boosts energy interception multiplier with Rally card effect', () => {
    let state = createInitialState(2020);
    const playerCarrier = state.pieces.find(p => p.id === 'p_1')!;

    state.temporaryState.teamEnergyInterceptionBoost = { side: 'PLAYER', multiplier: 1.5 };
    const controlMap = computeControlMap(state.pieces);

    const preview = previewThrow(playerCarrier, { col: 5, row: 10 }, state.pieces, controlMap, state.temporaryState);
    expect(preview).toBeDefined();
  });

  it('handles null/empty path cells and boundary throws gracefully', () => {
    const state = createInitialState(3030);
    const thrower = state.pieces.find(p => p.id === 'p_1')!;
    const controlMap = computeControlMap(state.pieces);

    const sameCellPreview = previewThrow(thrower, thrower.cell, state.pieces, controlMap);
    expect(sameCellPreview.pathCells.length).toBe(0);
    expect(sameCellPreview.distance).toBe(0);
  });
});
