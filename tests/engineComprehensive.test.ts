import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import { SeededRNG } from '../src/engine/rng';
import { areCellsEqual, isInsideBoard, cellDistance } from '../src/engine/config/board';
import { computeControlMap, getControlAt } from '../src/engine/control';
import { isLegalMove, getReachableCells } from '../src/engine/movement';
import { CARDS_BY_ID } from '../src/engine/config/cards';
import { calculateInterceptionMomentumEarn } from '../src/engine/config/momentum';
import { evaluateStage0Cards, evaluateStage2Cards, getAIDiscardChoice } from '../src/engine/ai/cardSearch';

describe('Comprehensive Engine Unit Test Coverage (≥80% target)', () => {
  it('tests SeededRNG methods (nextInt, nextBool, sample, shuffle, clone, getState, setState)', () => {
    const rng = new SeededRNG(12345);
    const val1 = rng.nextFloat();
    expect(val1).toBeGreaterThanOrEqual(0);
    expect(val1).toBeLessThan(1);

    const intVal = rng.nextInt(5, 10);
    expect(intVal).toBeGreaterThanOrEqual(5);
    expect(intVal).toBeLessThanOrEqual(10);

    const boolVal = rng.nextBool();
    expect(typeof boolVal).toBe('boolean');

    const sampled = rng.sample(['a', 'b', 'c']);
    expect(['a', 'b', 'c']).toContain(sampled);

    const shuffled = rng.shuffle([1, 2, 3, 4, 5]);
    expect(shuffled.length).toBe(5);

    const cloned = rng.clone();
    expect(cloned.getState()).toBe(rng.getState());

    const stateVal = rng.getState();
    rng.setState(stateVal);
    expect(rng.getState()).toBe(stateVal);
  });

  it('tests board geometry and boundary helpers', () => {
    expect(isInsideBoard({ col: 0, row: 0 })).toBe(true);
    expect(isInsideBoard({ col: 10, row: 10 })).toBe(true);
    expect(isInsideBoard({ col: -1, row: 5 })).toBe(false);
    expect(isInsideBoard({ col: 5, row: 11 })).toBe(false);

    expect(areCellsEqual({ col: 3, row: 4 }, { col: 3, row: 4 })).toBe(true);
    expect(areCellsEqual({ col: 3, row: 4 }, { col: 4, row: 3 })).toBe(false);

    const dist = cellDistance({ col: 0, row: 0 }, { col: 3, row: 4 });
    expect(dist).toBeCloseTo(5.0, 4);
  });

  it('tests buff modifiers in control map (SCREEN, CLAMP, OVERLAP, FULL_COURT_PRESS)', () => {
    const state = createInitialState(500);
    const p1 = state.pieces.find(p => p.id === 'p_1')!;
    p1.buffs.push({ id: 'b1', type: 'SCREEN', durationTurns: 1 });
    p1.buffs.push({ id: 'b2', type: 'CLAMP', durationTurns: 1 });
    p1.buffs.push({ id: 'b3', type: 'OVERLAP', durationTurns: 1 });
    p1.buffs.push({ id: 'b4', type: 'FULL_COURT_PRESS', durationTurns: 1 });

    const map = computeControlMap(state.pieces, state.temporaryState);
    expect(map.length).toBe(11);
    expect(map[0].length).toBe(11);
    expect(getControlAt(map, p1.cell, 'PLAYER')).toBeGreaterThan(0);
  });

  it('tests Euclidean Pythagorean movement (not limited to queen directions)', () => {
    const state = createInitialState(600);
    const piece = state.pieces.find(p => p.id === 'p_1')!; // at (5,4)
    const knightTarget = { col: 7, row: 5 }; // dx=2, dy=1

    const check = isLegalMove(piece, knightTarget, state.pieces, state.temporaryState);
    expect(check.legal).toBe(true);
    expect(check.cost).toBeCloseTo(Math.hypot(2, 1), 3);

    const reachable = getReachableCells(piece, state.pieces, state.temporaryState);
    expect(reachable.length).toBeGreaterThan(0);
  });

  it('tests AI card search decisions and discard heuristics', () => {
    const state = createInitialState(700);
    const s0 = evaluateStage0Cards(state);
    expect(s0).toBeDefined();

    const s2 = evaluateStage2Cards(state);
    expect(s2).toBeDefined();

    const hand = [CARDS_BY_ID['surge'], CARDS_BY_ID['deep_breath'], CARDS_BY_ID['timeout']];
    const discard = getAIDiscardChoice(hand, 3);
    expect(discard).toBeDefined();
    expect(hand.some(c => c.id === discard.id)).toBe(true);
  });

  it('tests momentum earn formulas', () => {
    expect(calculateInterceptionMomentumEarn(0)).toBe(2);
    expect(calculateInterceptionMomentumEarn(1)).toBe(2.5);
    expect(calculateInterceptionMomentumEarn(4)).toBe(4);
  });

  it('tests Timer and Concede actions in reducer', () => {
    let state = createInitialState(800);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 10, wonBy: 'PLAYER' });

    state = gameReducer(state, { type: 'TIMER_TICK', secondsElapsed: 5 });
    expect(state.timer.remainingSeconds).toBe(state.config.timing.turnTimerSeconds - 5);

    state = gameReducer(state, { type: 'CONCEDE_OR_END' });
    expect(state.matchResult.isOver).toBe(true);
    expect(state.matchResult.aptitudeReport).toBeDefined();
  });
});
