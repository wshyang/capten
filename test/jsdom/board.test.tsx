// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Board } from '../../src/ui/Board';
import { createInitialState } from '../../src/engine/setup';
import type { GameState } from '../../src/engine/types';
import { previewThrow } from '../../src/engine/interception';

describe('jsdom: <Board /> Component & Conversation Refinements', () => {
  it('should render 11x11 court grid and all 121 cells', () => {
    const state = createInitialState(4242);
    render(
      <Board
        state={state}
        onStageMove={vi.fn()}
        onUnstageMove={vi.fn()}
        onStageThrow={vi.fn()}
        onUnstageThrow={vi.fn()}
      />
    );

    const grid = screen.getByTestId('court-grid');
    expect(grid).toBeDefined();
    expect(screen.getByTestId('court-cell-5-5')).toBeDefined();
    expect(screen.getByTestId('court-cell-0-0')).toBeDefined();
    expect(screen.getByTestId('court-cell-10-10')).toBeDefined();
  });

  it('should verify symmetrical Triangle / Funnel Formation starting coordinates', () => {
    const state = createInitialState(4242);

    // Player formation check: 2nd row spread out at col 2 & 8; 3rd row closer together at col 3 & 7
    const p1 = state.pieces.find(p => p.id === 'p_1');
    const p2 = state.pieces.find(p => p.id === 'p_2');
    const p3 = state.pieces.find(p => p.id === 'p_3');
    const p4 = state.pieces.find(p => p.id === 'p_4');
    const p5 = state.pieces.find(p => p.id === 'p_5');
    const pBlocker = state.pieces.find(p => p.id === 'p_blocker');
    const pCaptain = state.pieces.find(p => p.id === 'p_captain');

    expect(p1?.cell).toEqual({ col: 5, row: 4 });
    expect(p2?.cell).toEqual({ col: 2, row: 3 }); // 2nd row wing (spread out)
    expect(p3?.cell).toEqual({ col: 8, row: 3 }); // 2nd row wing (spread out)
    expect(p5?.cell).toEqual({ col: 3, row: 2 }); // 3rd row near captain (closer together)
    expect(p4?.cell).toEqual({ col: 7, row: 2 }); // 3rd row near captain (closer together)
    expect(pBlocker?.cell).toEqual({ col: 5, row: 1 });
    expect(pCaptain?.cell).toEqual({ col: 5, row: 10 });

    // AI symmetric mirror check
    const ai1 = state.pieces.find(p => p.id === 'ai_1');
    const ai2 = state.pieces.find(p => p.id === 'ai_2');
    const ai3 = state.pieces.find(p => p.id === 'ai_3');
    const ai4 = state.pieces.find(p => p.id === 'ai_4');
    const ai5 = state.pieces.find(p => p.id === 'ai_5');
    const aiBlocker = state.pieces.find(p => p.id === 'ai_blocker');
    const aiCaptain = state.pieces.find(p => p.id === 'ai_captain');

    expect(ai1?.cell).toEqual({ col: 5, row: 6 });
    expect(ai2?.cell).toEqual({ col: 2, row: 7 }); // 2nd row wing (spread out)
    expect(ai3?.cell).toEqual({ col: 8, row: 7 }); // 2nd row wing (spread out)
    expect(ai5?.cell).toEqual({ col: 3, row: 8 }); // 3rd row near captain (closer together)
    expect(ai4?.cell).toEqual({ col: 7, row: 8 }); // 3rd row near captain (closer together)
    expect(aiBlocker?.cell).toEqual({ col: 5, row: 9 });
    expect(aiCaptain?.cell).toEqual({ col: 5, row: 0 });
  });

  it('should verify true orthogonal Column-5 trajectory vs diagonal wing trajectory math', () => {
    const state = createInitialState(4242);
    const carrierP1 = state.pieces.find(p => p.id === 'p_1')!;
    const captainP = state.pieces.find(p => p.id === 'p_captain')!;
    const wingP3 = state.pieces.find(p => p.id === 'p_3')!;

    // 1. Direct orthogonal throw along Column 5: col must remain constant (5) for all trajectory path cells
    const orthoPreview = previewThrow(carrierP1, captainP.cell, state.pieces, state.controlMap);
    expect(orthoPreview.pathCells.length).toBeGreaterThan(0);
    for (const node of orthoPreview.pathCells) {
      expect(node.cell.col).toBe(5); // Constant column 5 for orthogonal vertical lob
    }

    // 2. Diagonal wing throw from p_3 (8, 3) to (5, 10): both row and col change across trajectory
    const diagPreview = previewThrow(wingP3, captainP.cell, state.pieces, state.controlMap);
    const colsOnDiag = new Set(diagPreview.pathCells.map(node => node.cell.col));
    expect(colsOnDiag.size).toBeGreaterThan(1); // Changes columns across diagonal flight
  });

  it('should show throw trajectory shading WITHOUT obscuring overlay badges (Turn 2 Refinement)', () => {
    const state: GameState = {
      ...createInitialState(4242),
      phase: 'PLAYER_PLAN',
    };
    state.pieces.forEach(p => {
      if (p.id === 'p_1') p.hasBall = true;
    });

    render(
      <Board
        state={state}
        onStageMove={vi.fn()}
        onUnstageMove={vi.fn()}
        onStageThrow={vi.fn()}
        onUnstageThrow={vi.fn()}
      />
    );

    // Click on p_1 (ball carrier) and hover over an eligible receiving teammate cell
    const p1El = screen.getByTestId('piece-p_1');
    fireEvent.click(p1El);

    // Hover over teammate p_2 cell (2, 3) to trigger activeThrowPreview shading
    const p2Cell = screen.getByTestId('court-cell-2-3');
    fireEvent.mouseEnter(p2Cell);

    // Ensure trajectory cells are shaded
    const pathCells = screen.queryAllByTestId(/throw-path-cell-/);
    expect(pathCells.length).toBeGreaterThan(0);

    // Turn 2 Refinement: Verify NO overlay percentage badges (🛡️ XX%) exist inside any trajectory cell
    for (const cellEl of pathCells) {
      expect(cellEl.textContent).toBe(''); // Clean empty shading without obscuring badge text
    }
  });

  it('should show throw trajectory indicators ONLY during planning and hide after throw target is selected (Turn 3 Refinement)', () => {
    const state: GameState = {
      ...createInitialState(4242),
      phase: 'PLAYER_PLAN',
    };
    state.pieces.forEach(p => {
      if (p.id === 'p_1') p.hasBall = true;
    });

    const { rerender } = render(
      <Board
        state={state}
        onStageMove={vi.fn()}
        onUnstageMove={vi.fn()}
        onStageThrow={vi.fn()}
        onUnstageThrow={vi.fn()}
      />
    );

    // No throw target selected yet and no hover — throw path cells should be absent
    expect(screen.queryAllByTestId(/throw-path-cell-/).length).toBe(0);

    // Now stage a throw (plannedThrow target selected)
    const stagedState: GameState = {
      ...state,
      plannedThrow: {
        targetPieceId: 'p_captain',
        targetCell: { col: 5, row: 10 },
        throwType: 'HIGH_LOB',
      },
    };

    rerender(
      <Board
        state={stagedState}
        onStageMove={vi.fn()}
        onUnstageMove={vi.fn()}
        onStageThrow={vi.fn()}
        onUnstageThrow={vi.fn()}
      />
    );

    // Turn 3 Refinement: Once throw target is selected (plannedThrow staged), throw trajectory cell indicators MUST go off
    expect(screen.queryAllByTestId(/throw-path-cell-/).length).toBe(0);
  });
});
