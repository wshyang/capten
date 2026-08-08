import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import { CARDS_BY_ID } from '../src/engine/config/cards';

const FAST_CONFIG = {
  mcts: {
    tier: 'CUSTOM' as const,
    iterations: 50,
    rolloutDepth: 2,
    ismctsSamples: 1,
    explorationConstant: 1.414,
  },
};

describe('Buff & Debuff Duration Decaying & Expiration Engine (§10)', () => {
  it('decays multi-turn buff duration across turns (Slow Burn: 3T -> 2T -> 1T -> Expired)', () => {
    let state = createInitialState(777, FAST_CONFIG);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });

    state.momentum.PLAYER = 6;
    state.hands.PLAYER = [CARDS_BY_ID['slow_burn']];

    // Play Slow Burn on p_2
    state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'slow_burn', targetPieceId: 'p_2' });
    const p2Init = state.pieces.find(p => p.id === 'p_2')!;
    const buffInit = p2Init.buffs.find(b => b.type === 'SLOW_BURN');
    expect(buffInit).toBeDefined();
    expect(buffInit!.durationTurns).toBe(3);

    // End Turn 1 (AI turn occurs)
    state = gameReducer(state, { type: 'END_PLAYER_TURN' });
    state = gameReducer(state, { type: 'RUN_AI_TURN' });
    state = gameReducer(state, { type: 'START_PLAYER_TURN' });

    // Turn 2: Duration should be 2
    const p2Turn2 = state.pieces.find(p => p.id === 'p_2')!;
    const buffTurn2 = p2Turn2.buffs.find(b => b.type === 'SLOW_BURN');
    expect(buffTurn2).toBeDefined();
    expect(buffTurn2!.durationTurns).toBe(2);

    // End Turn 2
    state = gameReducer(state, { type: 'END_PLAYER_TURN' });
    state = gameReducer(state, { type: 'RUN_AI_TURN' });
    state = gameReducer(state, { type: 'START_PLAYER_TURN' });

    // Turn 3: Duration should be 1
    const p2Turn3 = state.pieces.find(p => p.id === 'p_2')!;
    const buffTurn3 = p2Turn3.buffs.find(b => b.type === 'SLOW_BURN');
    expect(buffTurn3).toBeDefined();
    expect(buffTurn3!.durationTurns).toBe(1);

    // End Turn 3
    state = gameReducer(state, { type: 'END_PLAYER_TURN' });
    state = gameReducer(state, { type: 'RUN_AI_TURN' });
    state = gameReducer(state, { type: 'START_PLAYER_TURN' });

    // Turn 4: Duration expired, buff removed from array
    const p2Turn4 = state.pieces.find(p => p.id === 'p_2')!;
    const buffTurn4 = p2Turn4.buffs.find(b => b.type === 'SLOW_BURN');
    expect(buffTurn4).toBeUndefined();
    expect(p2Turn4.buffs.length).toBe(0);
  });

  it('expires single-turn buffs (Overclock, Anchor, Screen, Clamp) cleanly after 1 turn', () => {
    let state = createInitialState(888, FAST_CONFIG);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 20, wonBy: 'PLAYER' });

    state.momentum.PLAYER = 6;
    state.hands.PLAYER = [
      CARDS_BY_ID['overclock'],
      CARDS_BY_ID['anchor'],
      CARDS_BY_ID['clamp'],
    ];

    // Play Overclock on p_3
    state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'overclock', targetPieceId: 'p_3' });
    const p3 = state.pieces.find(p => p.id === 'p_3')!;
    expect(p3.buffs.some(b => b.type === 'OVERCLOCK')).toBe(true);

    // Play Anchor on p_4
    state.cardPlayedThisTurn.PLAYER = false;
    state = gameReducer(state, { type: 'PLAY_CARD', cardId: 'anchor', targetPieceId: 'p_4' });
    const p4 = state.pieces.find(p => p.id === 'p_4')!;
    expect(p4.buffs.some(b => b.type === 'ANCHOR')).toBe(true);

    // Cycle turn
    state = gameReducer(state, { type: 'END_PLAYER_TURN' });
    state = gameReducer(state, { type: 'RUN_AI_TURN' });
    state = gameReducer(state, { type: 'START_PLAYER_TURN' });

    const p3Next = state.pieces.find(p => p.id === 'p_3')!;
    const p4Next = state.pieces.find(p => p.id === 'p_4')!;
    expect(p3Next.buffs.length).toBe(0);
    expect(p4Next.buffs.length).toBe(0);
  });
});
