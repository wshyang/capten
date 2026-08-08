import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { isLegalMove } from '../src/engine/movement';
import { BOARD_CONFIG, isInDefenseCircle } from '../src/engine/config/board';

describe("Official Captain's Ball Defense Circle & Designated Blocker Rule", () => {
  it('permits the designated Blocker (p_blocker) to move within the defense circle around AI Captain at (5, 0)', () => {
    const state = createInitialState(1234);

    // Player Blocker p_blocker starts at (5, 1) inside the defense circle around AI Captain (5, 0)
    const pBlocker = state.pieces.find(p => p.id === 'p_blocker')!;
    expect(pBlocker.isBlocker).toBe(true);
    expect(isInDefenseCircle(pBlocker.cell, BOARD_CONFIG.aiScoringCell)).toBe(true);

    // p_blocker moves to (4, 0) - legal because (4, 0) is inside AI Captain's defense circle
    pBlocker.energy = 10.0;
    const moveInside = isLegalMove(pBlocker, { col: 4, row: 0 }, state.pieces, state.temporaryState);
    expect(moveInside.legal).toBe(true);

    // But p_blocker attempts to move OUTSIDE the defense circle to empty cell (5, 3) - REJECTED!
    const moveOutside = isLegalMove(pBlocker, { col: 5, row: 3 }, state.pieces, state.temporaryState);
    expect(moveOutside.legal).toBe(false);
    expect(moveOutside.reason).toContain('designated Blocker may only move within the defense circle');
  });

  it('permits AI Blocker (ai_blocker) to move within the defense circle around Player Captain at (5, 10)', () => {
    const state = createInitialState(4321);

    // AI Blocker starts at (5, 9) inside Player Captain defense circle
    const aiBlocker = state.pieces.find(p => p.id === 'ai_blocker')!;
    expect(aiBlocker.isBlocker).toBe(true);
    expect(isInDefenseCircle(aiBlocker.cell, BOARD_CONFIG.playerScoringCell)).toBe(true);

    // ai_blocker moves to (4, 10) - legal inside the defense circle
    aiBlocker.energy = 10.0;
    const moveInside = isLegalMove(aiBlocker, { col: 4, row: 10 }, state.pieces, state.temporaryState);
    expect(moveInside.legal).toBe(true);

    // ai_blocker attempts to move OUTSIDE to empty cell (5, 7) - REJECTED!
    const moveOutside = isLegalMove(aiBlocker, { col: 5, row: 7 }, state.pieces, state.temporaryState);
    expect(moveOutside.legal).toBe(false);
    expect(moveOutside.reason).toContain('designated Blocker may only move within the defense circle');
  });

  it("prohibits general field runners from entering either defense circle", () => {
    const state = createInitialState(5678);

    // General field player p_2 at (2, 3) attempts to enter AI's defense circle at empty cell (4, 0) - REJECTED
    const p2 = state.pieces.find(p => p.id === 'p_2')!;
    p2.energy = 10.0;
    const moveEnemyCircle = isLegalMove(p2, { col: 4, row: 0 }, state.pieces, state.temporaryState);
    expect(moveEnemyCircle.legal).toBe(false);
    expect(moveEnemyCircle.reason).toContain("cannot enter the opponent's defense circle");

    // General field player p_2 attempts to enter Player's own goal circle at empty cell (4, 10) - REJECTED
    const moveOwnCircle = isLegalMove(p2, { col: 4, row: 10 }, state.pieces, state.temporaryState);
    expect(moveOwnCircle.legal).toBe(false);
    expect(moveOwnCircle.reason).toContain("cannot enter the goal circle around their Captain");
  });
});
