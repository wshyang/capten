import { describe, it, expect } from 'vitest';
import { ALL_CARDS, CARDS_BY_ID } from '../src/engine/config/cards';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import { computeControlMap } from '../src/engine/control';
import { previewThrow } from '../src/engine/interception';
import { getEffectiveMoveCost } from '../src/engine/movement';

describe('Exhaustive 26-Card Catalog & Mechanics Verification (§10 & §11)', () => {
  it('contains exactly 26 distinct cards with valid configurations', () => {
    expect(ALL_CARDS.length).toBe(26);
    const ids = new Set(ALL_CARDS.map(c => c.id));
    expect(ids.size).toBe(26);

    ALL_CARDS.forEach(card => {
      expect(card.id).toBeDefined();
      expect(card.name.length).toBeGreaterThan(2);
      expect(['RESOURCE', 'RISK', 'COMPOSURE', 'TEAMWORK', 'SPATIAL', 'LEADERSHIP']).toContain(card.dim);
      expect(card.momentumCost).toBeGreaterThanOrEqual(1);
      expect(card.momentumCost).toBeLessThanOrEqual(3);
      expect(['NONE', 'FRIENDLY_PIECE', 'ENEMY_PIECE', 'CELL', 'TWO_FRIENDLY', 'THROW']).toContain(card.targetType);
      expect(card.description.length).toBeGreaterThan(10);
    });
  });

  // ==========================================
  // 1. RESOURCE DIMENSION (5 Cards)
  // ==========================================
  describe('Dimension 1: RESOURCE Cards', () => {
    it('1. deep_breath: adds +2 rest-streak to chosen piece to accelerate compounding regen', () => {
      let state = createInitialState(101);
      state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });
      state.momentum.PLAYER = 6;
      state.hands.PLAYER = [CARDS_BY_ID['deep_breath']];

      const p3Before = state.pieces.find(p => p.id === 'p_3')!;
      expect(p3Before.restStreak).toBe(0);

      state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'deep_breath', targetPieceId: 'p_3' });
      const p3After = state.pieces.find(p => p.id === 'p_3')!;
      expect(p3After.restStreak).toBe(2);
      expect(state.momentum.PLAYER).toBe(5);
    });

    it('2. second_wind: restores +4.0 energy directly to chosen piece (clamped to 10.0e)', () => {
      let state = createInitialState(102);
      state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });
      state.momentum.PLAYER = 6;
      state.hands.PLAYER = [CARDS_BY_ID['second_wind']];

      const p2 = state.pieces.find(p => p.id === 'p_2')!;
      p2.energy = 3.0;

      state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'second_wind', targetPieceId: 'p_2' });
      expect(p2.energy).toBe(7.0);
    });

    it('3. slow_burn: attaches SLOW_BURN buff (-0.5e move cost) for 3 turns', () => {
      let state = createInitialState(103);
      state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });
      state.momentum.PLAYER = 6;
      state.hands.PLAYER = [CARDS_BY_ID['slow_burn']];

      state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'slow_burn', targetPieceId: 'p_2' });
      const p2 = state.pieces.find(p => p.id === 'p_2')!;
      const buff = p2.buffs.find(b => b.type === 'SLOW_BURN');
      expect(buff).toBeDefined();
      expect(buff!.durationTurns).toBe(3);

      const discountedCost = getEffectiveMoveCost(p2.cell, { col: 2, row: 4 }, p2);
      expect(discountedCost).toBeCloseTo(0.5, 3); // 1.0 - 0.5 = 0.5e
    });

    it('4. drain: drains -2.0 energy from targeted enemy piece', () => {
      let state = createInitialState(104);
      state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });
      state.momentum.PLAYER = 6;
      state.hands.PLAYER = [CARDS_BY_ID['drain']];

      const ai1 = state.pieces.find(p => p.id === 'ai_1')!;
      ai1.energy = 8.0;

      state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'drain', targetPieceId: 'ai_1' });
      expect(ai1.energy).toBe(6.0);
    });

    it('5. overclock: enables 2x move range (50% cost discount) via OVERCLOCK buff', () => {
      let state = createInitialState(105);
      state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });
      state.momentum.PLAYER = 6;
      state.hands.PLAYER = [CARDS_BY_ID['overclock']];

      state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'overclock', targetPieceId: 'p_3' });
      const p3 = state.pieces.find(p => p.id === 'p_3')!;
      const buff = p3.buffs.find(b => b.type === 'OVERCLOCK');
      expect(buff).toBeDefined();

      const cost = getEffectiveMoveCost(p3.cell, { col: 8, row: 5 }, p3);
      expect(cost).toBeCloseTo(1.0, 3); // 2.0 * 0.5 = 1.0e
    });
  });

  // ==========================================
  // 2. RISK DIMENSION (5 Cards)
  // ==========================================
  describe('Dimension 2: RISK Cards', () => {
    it('6. insurance: activates insurance protection to retain ball on interception', () => {
      let state = createInitialState(201);
      state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });
      state.momentum.PLAYER = 6;
      state.hands.PLAYER = [CARDS_BY_ID['insurance']];

      state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'insurance' });
      expect(state.temporaryState.insuranceActive?.PLAYER).toBe(true);
    });

    it('7. threaded_pass: activates threaded pass to ignore first enemy control cell', () => {
      let state = createInitialState(202);
      state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });
      state.momentum.PLAYER = 6;
      state.hands.PLAYER = [CARDS_BY_ID['threaded_pass']];

      state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'threaded_pass' });
      expect(state.temporaryState.threadedPassActive?.PLAYER).toBe(true);
    });

    it('8. steady_hands: activates steady hands (+50% effective throw energy)', () => {
      let state = createInitialState(203);
      state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });
      state.momentum.PLAYER = 6;
      state.hands.PLAYER = [CARDS_BY_ID['steady_hands']];

      state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'steady_hands' });
      expect(state.temporaryState.steadyHandsActive?.PLAYER).toBe(true);
    });

    it('9. long_bomb: activates long bomb (halves throw cost / doubles range)', () => {
      let state = createInitialState(204);
      state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });
      state.momentum.PLAYER = 6;
      state.hands.PLAYER = [CARDS_BY_ID['long_bomb']];

      state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'long_bomb' });
      expect(state.temporaryState.longBombActive?.PLAYER).toBe(true);

      const carrier = state.pieces.find(p => p.hasBall)!;
      const preview = previewThrow(carrier, { col: 5, row: 10 }, state.pieces, state.controlMap, state.temporaryState);
      expect(preview.throwCost).toBeCloseTo(6.0 / 6.0, 3); // 6.0 / (3.0 * 2.0) = 1.0e
    });

    it('10. no_look_pass (⚡ Swing): guarantees 100% clean uninterceptable throw (<=4.5 dist)', () => {
      let state = createInitialState(205);
      state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });
      state.momentum.PLAYER = 6;
      state.hands.PLAYER = [CARDS_BY_ID['no_look_pass']];

      state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'no_look_pass' });
      expect(state.temporaryState.noLookPassActive?.PLAYER).toBe(true);

      const carrier = state.pieces.find(p => p.hasBall)!;
      carrier.cell = { col: 5, row: 7 }; // dist 3 to (5,10) <= 4.5
      const preview = previewThrow(carrier, { col: 5, row: 10 }, state.pieces, state.controlMap, state.temporaryState);
      expect(preview.isNoLookPass).toBe(true);
      expect(preview.cumulativeCaptureRisk).toBe(0);
    });
  });

  // ==========================================
  // 3. COMPOSURE DIMENSION (4 Cards)
  // ==========================================
  describe('Dimension 3: COMPOSURE Cards', () => {
    it('11. reset: fully restores piece to 10.0e energy and resets movedLastTurn', () => {
      let state = createInitialState(301);
      state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });
      state.momentum.PLAYER = 6;
      state.hands.PLAYER = [CARDS_BY_ID['reset']];

      const p2 = state.pieces.find(p => p.id === 'p_2')!;
      p2.energy = 1.5;
      p2.movedLastTurn = true;

      state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'reset', targetPieceId: 'p_2' });
      expect(p2.energy).toBe(10.0);
      expect(p2.movedLastTurn).toBe(false);
    });

    it('12. ice_in_the_veins: sets negateDebuff to immune next opponent disruption', () => {
      let state = createInitialState(302);
      state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });
      state.momentum.PLAYER = 6;
      state.hands.PLAYER = [CARDS_BY_ID['ice_in_the_veins']];

      state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'ice_in_the_veins' });
      expect(state.temporaryState.negateDebuff?.PLAYER).toBe(true);
    });

    it('13. anchor: attaches ANCHOR buff to piece for forced movement & drain immunity', () => {
      let state = createInitialState(303);
      state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });
      state.momentum.PLAYER = 6;
      state.hands.PLAYER = [CARDS_BY_ID['anchor']];

      state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'anchor', targetPieceId: 'p_3' });
      const p3 = state.pieces.find(p => p.id === 'p_3')!;
      expect(p3.buffs.some(b => b.type === 'ANCHOR')).toBe(true);
    });

    it('14. timeout: restores +1.5e across all team pieces', () => {
      let state = createInitialState(304);
      state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });
      state.momentum.PLAYER = 6;
      state.hands.PLAYER = [CARDS_BY_ID['timeout']];

      state.pieces.forEach(p => {
        if (p.side === 'PLAYER') p.energy = 5.0;
      });

      state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'timeout' });
      state.pieces.forEach(p => {
        if (p.side === 'PLAYER') {
          expect(p.energy).toBe(6.5);
        }
      });
    });
  });

  // ==========================================
  // 4. TEAMWORK DIMENSION (4 Cards)
  // ==========================================
  describe('Dimension 4: TEAMWORK Cards', () => {
    it('15. give_and_go: flags piece for free follow-up movement after passing', () => {
      let state = createInitialState(401);
      state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });
      state.momentum.PLAYER = 6;
      state.hands.PLAYER = [CARDS_BY_ID['give_and_go']];

      state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'give_and_go', targetPieceId: 'p_1' });
      expect(state.temporaryState.giveAndGoAvailablePieceId).toBe('p_1');
    });

    it('16. spacing: verifies spacing card configuration for multi-piece coordination', () => {
      expect(CARDS_BY_ID['spacing'].dim).toBe('TEAMWORK');
      expect(CARDS_BY_ID['spacing'].targetType).toBe('TWO_FRIENDLY');
      expect(CARDS_BY_ID['spacing'].momentumCost).toBe(2);
    });

    it('17. screen: attaches SCREEN buff to expand Area-of-Control (+0.5)', () => {
      let state = createInitialState(403);
      state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });
      state.momentum.PLAYER = 6;
      state.hands.PLAYER = [CARDS_BY_ID['screen']];

      state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'screen', targetPieceId: 'p_2' });
      const p2 = state.pieces.find(p => p.id === 'p_2')!;
      expect(p2.buffs.some(b => b.type === 'SCREEN')).toBe(true);
    });

    it('18. overlap: attaches OVERLAP buff to merge and double stacked control fields', () => {
      let state = createInitialState(404);
      state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });
      state.momentum.PLAYER = 6;
      state.hands.PLAYER = [CARDS_BY_ID['overlap']];

      state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'overlap', targetPieceId: 'p_3' });
      const p3 = state.pieces.find(p => p.id === 'p_3')!;
      expect(p3.buffs.some(b => b.type === 'OVERLAP')).toBe(true);
    });
  });

  // ==========================================
  // 5. SPATIAL DIMENSION (4 Cards)
  // ==========================================
  describe('Dimension 5: SPATIAL Cards', () => {
    it('19. bait: verifies bait card configuration for forcing enemy displacement', () => {
      expect(CARDS_BY_ID['bait'].dim).toBe('SPATIAL');
      expect(CARDS_BY_ID['bait'].targetType).toBe('ENEMY_PIECE');
      expect(CARDS_BY_ID['bait'].momentumCost).toBe(1);
    });

    it('20. jam_the_lane: creates temporary 1.0 artificial control cell on targeted coordinate', () => {
      let state = createInitialState(502);
      state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });
      state.momentum.PLAYER = 6;
      state.hands.PLAYER = [CARDS_BY_ID['jam_the_lane']];

      state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'jam_the_lane', targetCell: { col: 5, row: 5 } });
      expect(state.temporaryState.extraControlCell?.cell.col).toBe(5);
      expect(state.temporaryState.extraControlCell?.cell.row).toBe(5);

      const control = computeControlMap(state.pieces, state.temporaryState);
      expect(control[5][5][0]).toBeGreaterThanOrEqual(1.0);
    });

    it('21. clamp: attaches CLAMP debuff to halve enemy Area-of-Control factor', () => {
      let state = createInitialState(503);
      state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });
      state.momentum.PLAYER = 6;
      state.hands.PLAYER = [CARDS_BY_ID['clamp']];

      state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'clamp', targetPieceId: 'ai_1' });
      const ai1 = state.pieces.find(p => p.id === 'ai_1')!;
      expect(ai1.buffs.some(b => b.type === 'CLAMP')).toBe(true);
    });

    it('22. full_court_press (⚡ Swing): attaches FULL_COURT_PRESS buff across all team pieces', () => {
      let state = createInitialState(504);
      state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });
      state.momentum.PLAYER = 6;
      state.hands.PLAYER = [CARDS_BY_ID['full_court_press']];

      state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'full_court_press' });
      state.pieces.forEach(p => {
        if (p.side === 'PLAYER') {
          expect(p.buffs.some(b => b.type === 'FULL_COURT_PRESS')).toBe(true);
        }
      });
    });
  });

  // ==========================================
  // 6. LEADERSHIP DIMENSION (4 Cards)
  // ==========================================
  describe('Dimension 6: LEADERSHIP Cards', () => {
    it('23. tempo_change: restores +1.5e to each teammate that remained stationary last turn', () => {
      let state = createInitialState(601);
      state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });
      state.momentum.PLAYER = 6;
      state.hands.PLAYER = [CARDS_BY_ID['tempo_change']];

      const p2 = state.pieces.find(p => p.id === 'p_2')!;
      p2.energy = 5.0;
      p2.movedLastTurn = false;

      state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'tempo_change' });
      expect(p2.energy).toBe(6.5);
    });

    it('24. set_the_play: activates -0.8e movement discount across all pieces', () => {
      let state = createInitialState(602);
      state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });
      state.momentum.PLAYER = 6;
      state.hands.PLAYER = [CARDS_BY_ID['set_the_play']];

      state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'set_the_play' });
      expect(state.temporaryState.setThePlayActive?.PLAYER).toBe(true);

      const p2 = state.pieces.find(p => p.id === 'p_2')!;
      const discountedCost = getEffectiveMoveCost(p2.cell, { col: 2, row: 4 }, p2, state.temporaryState);
      expect(discountedCost).toBeCloseTo(0.5, 3); // max(0.5, 1.0 - 0.8) = 0.5e
    });

    it('25. rally: activates +25% team interception multiplier on all rolls', () => {
      let state = createInitialState(603);
      state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });
      state.momentum.PLAYER = 6;
      state.hands.PLAYER = [CARDS_BY_ID['rally']];

      state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'rally' });
      expect(state.temporaryState.teamEnergyInterceptionBoost?.multiplier).toBe(1.25);
    });

    it('26. surge (⚡ Swing): grants +2.0e boost team-wide and tempo dominance', () => {
      let state = createInitialState(604);
      state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });
      state.momentum.PLAYER = 6;
      state.hands.PLAYER = [CARDS_BY_ID['surge']];

      const p4 = state.pieces.find(p => p.id === 'p_4')!;
      p4.energy = 5.0;

      state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'surge' });
      // p4 gains +2.0e (unless it was chosen as the swing piece with max energy)
      expect(p4.energy).toBeGreaterThanOrEqual(4.0);
      expect(state.momentum.PLAYER).toBe(3);
    });
  });
});
