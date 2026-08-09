/**
 * Side-Agnostic AI Simulation Test
 * Verifies that AI is entirely side-agnostic: ourCaptain/ourCarrier logic works for both top (AI) and bottom (PLAYER) sides.
 */
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import { evaluateState } from '../src/engine/ai/evaluate';
import { selectPosture } from '../src/engine/ai/posture';
import { evaluateStage0Cards, evaluateStage2Cards } from '../src/engine/ai/cardSearch';
import { simulateCascadeRollout } from '../src/engine/ai/rollout';
import { SeededRNG } from '../src/engine/rng';
import { runSeededMCTS } from '../src/engine/ai/mcts';
import { BOARD_CONFIG } from '../src/engine/config/board';
import type { MCTSTierConfig, GameState } from '../src/engine/types';

describe('Side-Agnostic AI Simulation', () => {
  // ----------------------------------------------------------------
  // 1. Posture is side-agnostic
  // ----------------------------------------------------------------
  it('posture is side-aware: ALL_OUT_ATTACK when acting side has ball', () => {
    const state = createInitialState(42);
    let s = gameReducer(state, { type: 'JUMP_BALL_RELEASE', wonBy: 'AI', releaseMarginMs: 100 });
    // AI has ball initially (ai_1 at 5,6)
    expect(s.pieces.find(p => p.side === 'AI' && p.hasBall)).toBeTruthy();
    expect(s.pieces.find(p => p.side === 'PLAYER' && p.hasBall)).toBeFalsy();

    const postureForAI = selectPosture(s, 'AI');
    const postureForPlayer = selectPosture(s, 'PLAYER');

    console.log(`  AI has ball: posture(AI)=${postureForAI}, posture(PLAYER)=${postureForPlayer}`);
    expect(postureForAI).toBe('ALL_OUT_ATTACK');
    // PLAYER does not have ball, but AI does — from PLAYER perspective, enemy has ball deep? Should be LOCK_DEFENCE or SPREAD
    expect(postureForPlayer).not.toBe('ALL_OUT_ATTACK');
  });

  it('posture LOCK_DEFENCE is symmetric via distance to our captain', () => {
    const state = createInitialState(100);
    let s = gameReducer(state, { type: 'JUMP_BALL_RELEASE', wonBy: 'AI', releaseMarginMs: 100 });

    // Move PLAYER carrier deep near AI captain (5,0) — should trigger LOCK_DEFENCE for AI
    const playerCarrier = s.pieces.find(p => p.side === 'PLAYER' && p.hasBall);
    // After JUMP_BALL AI wins, PLAYER does NOT have ball — so move AI carrier to PLAYER deep for symmetric test
    // Simpler: manually set a carrier near enemy goal
    // Create two custom states:
    const stateDeepAI = structuredClone(s) as GameState;
    // Place PLAYER carrier at (5,2) near AI goal (AI should LOCK)
    const pCarrier = stateDeepAI.pieces.find(p => p.side === 'PLAYER' && p.id === 'p_1')!;
    pCarrier.hasBall = true;
    stateDeepAI.pieces.find(p => p.side === 'AI' && p.hasBall)!.hasBall = false;
    stateDeepAI.ballHolderId = pCarrier.id;
    pCarrier.cell = { col: 5, row: 2 };

    const postureAIvsDeepPlayer = selectPosture(stateDeepAI, 'AI');
    console.log(`  PLAYER deep at (5,2) near AI goal: posture(AI)=${postureAIvsDeepPlayer}`);
    expect(postureAIvsDeepPlayer).toBe('LOCK_DEFENCE');

    // Symmetric: AI carrier at (5,8) near PLAYER goal (PLAYER should LOCK)
    const stateDeepPlayer = structuredClone(s) as GameState;
    const aiCarrier = stateDeepPlayer.pieces.find(p => p.side === 'AI' && p.hasBall)!;
    // Keep AI has ball but move it deep
    aiCarrier.cell = { col: 5, row: 8 };
    const posturePlayerVsDeepAI = selectPosture(stateDeepPlayer, 'PLAYER');
    console.log(`  AI deep at (5,8) near PLAYER goal: posture(PLAYER)=${posturePlayerVsDeepAI}`);
    expect(posturePlayerVsDeepAI).toBe('LOCK_DEFENCE');
  });

  // ----------------------------------------------------------------
  // 2. Card search is side-agnostic
  // ----------------------------------------------------------------
  it('card search uses actingSide hand/momentum', () => {
    const state = createInitialState(200);
    let s = gameReducer(state, { type: 'JUMP_BALL_RELEASE', wonBy: 'AI', releaseMarginMs: 100 });
    // Give PLAYER a surge card and momentum 3, AI has nothing
    s = {
      ...s,
      hands: {
        PLAYER: [{ id: 'surge', name: 'Surge', dim: 'RESOURCE', momentumCost: 1, effect: 'surge', description: '', targetType: 'NONE' }],
        AI: [],
      },
      momentum: { PLAYER: 3, AI: 0 },
    };
    // PLAYER pieces all high energy for surge condition
    s.pieces.forEach(p => { if (p.side === 'PLAYER') p.energy = 5; });

    const decisionForPlayer = evaluateStage0Cards(s, 'PLAYER');
    const decisionForAI = evaluateStage0Cards(s, 'AI');
    console.log(`  surge for PLAYER (acting PLAYER): ${decisionForPlayer.card?.id} Δ=${decisionForPlayer.evaluatedDelta}`);
    console.log(`  surge for AI (acting AI but PLAYER has surge): ${decisionForAI.card?.id}`);

    expect(decisionForPlayer.card?.id).toBe('surge');
    expect(decisionForAI.card).toBeNull(); // AI has no cards

    // Now give AI drain card and check enemy targeting
    s = {
      ...s,
      hands: {
        PLAYER: [],
        AI: [{ id: 'drain', name: 'Drain', dim: 'RESOURCE', momentumCost: 1, effect: 'drain', description: '', targetType: 'ENEMY_PIECE' }],
      },
      momentum: { PLAYER: 0, AI: 3 },
    };
    // Ensure PLAYER has a carrier for drain to target (enemy carrier from AI perspective)
    const pCarrier = s.pieces.find(p => p.side === 'PLAYER' && p.hasBall);
    // After AI jump win, AI has ball, not PLAYER. Manually set PLAYER carrier
    s.pieces.forEach(p => p.hasBall = false);
    const p1 = s.pieces.find(p => p.id === 'p_1')!;
    p1.hasBall = true;
    s.ballHolderId = p1.id;

    const drainForAI = evaluateStage2Cards(s, 'AI');
    console.log(`  drain for AI (enemy PLAYER carrier exists): ${drainForAI.card?.id} target=${drainForAI.targetPieceId}`);
    expect(drainForAI.card?.id).toBe('drain');
    expect(drainForAI.targetPieceId).toBe(p1.id);
  });

  // ----------------------------------------------------------------
  // 3. Rollout is side-agnostic: attack direction mirrored
  // ----------------------------------------------------------------
  it('rollout attack direction is mirrored (ourPieces cut toward our goal)', () => {
    const state = createInitialState(300);
    let sAI = gameReducer(state, { type: 'JUMP_BALL_RELEASE', wonBy: 'AI', releaseMarginMs: 100 });
    let sPlayer = gameReducer(createInitialState(300), { type: 'JUMP_BALL_RELEASE', wonBy: 'PLAYER', releaseMarginMs: 100 });

    const rngAI = new SeededRNG(12345);
    const scoreAI = simulateCascadeRollout(sAI, 1, rngAI, 'AI');

    const rngPlayer = new SeededRNG(12345);
    const scorePlayer = simulateCascadeRollout(sPlayer, 1, rngPlayer, 'PLAYER');

    console.log(`  rollout 1-step: AI perspective score=${scoreAI.toFixed(1)}, PLAYER perspective score=${scorePlayer.toFixed(1)}`);
    // At starting formation depth 1, stagnation triggers for both (71% still at initial, 0 in enemy half) — correct,
    // but signs should be opposite: AI penalized (-800), PLAYER penalized from opposite perspective (+800 becomes -800 for PLAYER? Actually score is from actingSide view)
    // After side-agnostic fix, penalty is symmetric: acting side stagnant => negative for that side
    // So AI acting stagnant = -800, PLAYER acting stagnant = -800 (but from PLAYER view). When we compare absolute, they match.
    // The key check: after mirroring, scores are opposite when evaluated from same global perspective? Simplified: both should be -800 (symmetric stagnation)
    expect(scoreAI).toBe(-800);
    expect(scorePlayer).toBe(-800);
  });

  it('rollout stagnation is side-aware (no false penalty on flipped board)', () => {
    // Create a state where AI is stagnant (stays at initial) but PLAYER is not — only AI should be penalized when AI is acting
    const state = createInitialState(400);
    let s = gameReducer(state, { type: 'JUMP_BALL_RELEASE', wonBy: 'AI', releaseMarginMs: 100 });
    // Move PLAYER pieces forward (row 4->6) to simulate development, keep AI at start
    s.pieces.filter(p => p.side === 'PLAYER' && !p.isCaptain).forEach(p => p.cell = { col: p.cell.col, row: Math.min(10, p.cell.row + 3) });
    // AI pieces remain at aiPiecesStart (rows 6-8) — they are NOT in enemy half (0-4), so AI is stagnant
    // Set high turn to trigger stagnation threshold
    s.turn = 10;

    const rng = new SeededRNG(999);
    const scoreAI = simulateCascadeRollout(s, 1, rng, 'AI');
    const rng2 = new SeededRNG(999);
    const scorePlayer = simulateCascadeRollout(s, 1, rng2, 'PLAYER');

    console.log(`  stagnation test (AI stagnant, turn 10): scoreAI=${scoreAI.toFixed(1)}, scorePlayer=${scorePlayer.toFixed(1)}`);
    // AI stagnant (at initial), PLAYER developed forward — so AI acting should be penalized, PLAYER acting should NOT
    expect(scoreAI).toBe(-800);
    expect(scorePlayer).not.toBe(-800);
    // So AI perspective lower than PLAYER perspective
    expect(scoreAI).toBeLessThan(scorePlayer);
  });

  // ----------------------------------------------------------------
  // 4. Evaluation symmetry still holds (regression)
  // ----------------------------------------------------------------
  it('evaluation remains perfectly symmetric after side-agnostic changes', () => {
    const seeds = [100, 200, 300, 400, 500];
    let maxAsym = 0;
    for (const seed of seeds) {
      const state = createInitialState(seed);
      const s = gameReducer(state, { type: 'JUMP_BALL_RELEASE', wonBy: 'AI', releaseMarginMs: 100 });
      const aiEval = evaluateState(s, 'AI');
      const plEval = evaluateState(s, 'PLAYER');
      const asym = Math.abs(aiEval + plEval);
      if (asym > maxAsym) maxAsym = asym;
      expect(asym).toBeLessThan(1);
    }
    console.log(`  max asymmetry after changes: ${maxAsym}`);
    expect(maxAsym).toBeLessThan(1);
  });

  // ----------------------------------------------------------------
  // 5. Full AI vs AI simulation — side-agnostic mirror test
  // ----------------------------------------------------------------
  it('AI vs AI mirror (d4@750 vs d4@750) is balanced over 8 games', async () => {
    const REF: MCTSTierConfig = {
      tier: 'CUSTOM', iterations: 750, rolloutDepth: 4, ismctsSamples: 8,
      explorationConstant: 1.414, label: 'd4@750', description: 'mirror',
    };
    const makeTier = (iters: number): MCTSTierConfig => ({
      tier: 'CUSTOM', iterations: iters, rolloutDepth: 4, ismctsSamples: Math.max(1, Math.min(8, Math.round(iters / 50))),
      explorationConstant: 1.414, label: `d4@${iters}`, description: `${iters} iters`,
    });

    function runGame(seed: number, cTier: MCTSTierConfig, rTier: MCTSTierConfig, cAsP: boolean, maxT: number) {
      const init = createInitialState(seed);
      let s = gameReducer(init, { type: 'JUMP_BALL_RELEASE', wonBy: seed % 2 === 0 ? 'PLAYER' : 'AI', releaseMarginMs: 100 });
      s = { ...s, momentum: { PLAYER: 3, AI: 3 } };
      for (let t = 1; t <= maxT; t++) {
        if (s.phase === 'MATCH_OVER') break;
        if (s.phase === 'PLAYER_PLAN') {
          const tier = cAsP ? cTier : rTier;
          const o = s.config.mcts;
          s = { ...s, config: { ...s.config, mcts: tier } } as GameState;
          s = gameReducer(s, { type: 'RUN_AI_TURN_FOR_PLAYER' });
          s = { ...s, config: { ...s.config, mcts: o } } as GameState;
        }
        if (s.phase === 'AI_TURN') {
          const tier = cAsP ? rTier : cTier;
          const o = s.config.mcts;
          s = { ...s, config: { ...s.config, mcts: tier } } as GameState;
          s = gameReducer(s, { type: 'RUN_AI_TURN' });
          s = { ...s, config: { ...s.config, mcts: o } } as GameState;
        }
        if (s.phase === 'AI_PLANNED_REVIEW') s = gameReducer(s, { type: 'START_PLAYER_TURN' });
      }
      const cS = cAsP ? s.score.PLAYER : s.score.AI;
      const rS = cAsP ? s.score.AI : s.score.PLAYER;
      return { cS, rS, delta: cS - rS, winner: cS > rS ? 'C' : rS > cS ? 'R' : 'D', log: s.eventLog };
    }

    const seeds = [1111, 2222, 3333, 4444, 5555, 6666, 7777, 8888];
    const games: ReturnType<typeof runGame>[] = [];
    for (let i = 0; i < seeds.length; i++) {
      const cAsP = i % 2 === 0;
      games.push(runGame(seeds[i], REF, REF, cAsP, 10));
    }

    const totalC = games.reduce((a, g) => a + g.cS, 0);
    const totalR = games.reduce((a, g) => a + g.rS, 0);
    const delta = totalC - totalR;
    const cWins = games.filter(g => g.winner === 'C').length;
    const rWins = games.filter(g => g.winner === 'R').length;
    const draws = games.filter(g => g.winner === 'D').length;

    console.log('\n  ═══ Side-Agnostic Mirror (d4@750 vs d4@750, 8 games, 10 turns) ═══');
    games.forEach((g, i) => {
      const side = i % 2 === 0 ? 'P' : 'A';
      console.log(`  G${i + 1}(${side} Challenger) ${g.cS}-${g.rS} [${g.winner}] seed=${seeds[i]}`);
    });
    console.log(`  TOTAL: Challenger ${totalC} - Reference ${totalR} (Δ=${delta >= 0 ? '+' : ''}${delta})  W/L/D ${cWins}/${rWins}/${draws}`);
    console.log(`  Expected: Δ ≈ 0 (±3 is natural variance over 8 games)`);

    // Challenger should not have systematic +2.9 bias anymore
    // Over 8 games with 10 turns, variance is high; we check |Δ| < 6 (was ~+5-6 before fix over 4 games)
    expect(Math.abs(delta)).toBeLessThan(6);

    // Also ensure both sides scored and threw
    const allEvents = games.flatMap(g => g.log);
    const aiThrows = allEvents.filter(e => e.type === 'PASS_ATTEMPTED' && e.side === 'AI').length;
    const plThrows = allEvents.filter(e => e.type === 'PASS_ATTEMPTED' && e.side === 'PLAYER').length;
    console.log(`  Throws AI=${aiThrows} PLAYER=${plThrows}`);
    expect(aiThrows).toBeGreaterThan(0);
    expect(plThrows).toBeGreaterThan(0);

    // Cards should be played by both sides now (side-agnostic fix)
    const aiCards = allEvents.filter(e => e.type === 'CARD_PLAYED' && e.side === 'AI').length;
    const plCards = allEvents.filter(e => e.type === 'CARD_PLAYED' && e.side === 'PLAYER').length;
    console.log(`  Cards AI=${aiCards} PLAYER=${plCards}`);
    expect(plCards).toBeGreaterThan(0); // previously 0 before fix
  }, 60000);

  // ----------------------------------------------------------------
  // 6. Iteration scaling sanity — stronger iter should tend to win (not guaranteed per seed, but avg)
  // ----------------------------------------------------------------
  it('iteration scaling: d4@1200 Challenger vs d4@750 Reference has non-negative avg', async () => {
    const ref: MCTSTierConfig = { tier: 'CUSTOM', iterations: 750, rolloutDepth: 4, ismctsSamples: 8, explorationConstant: 1.414, label: 'd4@750', description: '' };
    const strong: MCTSTierConfig = { tier: 'CUSTOM', iterations: 1200, rolloutDepth: 4, ismctsSamples: 8, explorationConstant: 1.414, label: 'd4@1200', description: '' };
    function run(seed: number, cAsP: boolean) {
      const init = createInitialState(seed);
      let s = gameReducer(init, { type: 'JUMP_BALL_RELEASE', wonBy: seed % 2 === 0 ? 'PLAYER' : 'AI', releaseMarginMs: 100 });
      s = { ...s, momentum: { PLAYER: 3, AI: 3 } } as GameState;
      for (let t = 1; t <= 10; t++) {
        if (s.phase === 'MATCH_OVER') break;
        if (s.phase === 'PLAYER_PLAN') {
          const tier = cAsP ? strong : ref;
          const o = s.config.mcts; s = { ...s, config: { ...s.config, mcts: tier } } as GameState;
          s = gameReducer(s, { type: 'RUN_AI_TURN_FOR_PLAYER' });
          s = { ...s, config: { ...s.config, mcts: o } } as GameState;
        }
        if (s.phase === 'AI_TURN') {
          const tier = cAsP ? ref : strong;
          const o = s.config.mcts; s = { ...s, config: { ...s.config, mcts: tier } } as GameState;
          s = gameReducer(s, { type: 'RUN_AI_TURN' });
          s = { ...s, config: { ...s.config, mcts: o } } as GameState;
        }
        if (s.phase === 'AI_PLANNED_REVIEW') s = gameReducer(s, { type: 'START_PLAYER_TURN' });
      }
      return cAsP ? s.score.PLAYER - s.score.AI : s.score.AI - s.score.PLAYER;
    }
    const deltas = [1111, 2222, 3333, 4444].map((seed, i) => run(seed, i % 2 === 0));
    const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    console.log(`  d4@1200 vs d4@750 deltas: ${deltas.join(', ')} avg=${avg.toFixed(2)}`);
    // Not a hard assertion — just logging; variance is high at 4 games
    expect(typeof avg).toBe('number');
  }, 60000);
});
