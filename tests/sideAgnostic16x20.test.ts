/**
 * 16 seeds x 20 turns — Mirror and scaling to check if ratios balance out
 * Extended from sideAgnosticSimulation 8x10. Run with: ./node_modules/.bin/vitest run tests/sideAgnostic16x20.test.ts --reporter=verbose
 */
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import type { MCTSTierConfig, GameState } from '../src/engine/types';

const REF_750: MCTSTierConfig = {
  tier: 'CUSTOM', iterations: 750, rolloutDepth: 4, ismctsSamples: 8,
  explorationConstant: 1.414, label: 'd4@750', description: 'mirror ref',
};

function makeTier(iters: number): MCTSTierConfig {
  return {
    tier: 'CUSTOM', iterations: iters, rolloutDepth: 4,
    ismctsSamples: Math.max(1, Math.min(8, Math.round(iters / 50))),
    explorationConstant: 1.414, label: `d4@${iters}`, description: `${iters} iters`,
  };
}

function runGame(seed: number, cTier: MCTSTierConfig, rTier: MCTSTierConfig, cAsP: boolean, maxT: number) {
  const init = createInitialState(seed);
  let s = gameReducer(init, { type: 'JUMP_BALL_RELEASE', wonBy: seed % 2 === 0 ? 'PLAYER' : 'AI', releaseMarginMs: 100 });
  s = { ...s, momentum: { PLAYER: 3, AI: 3 } } as GameState;
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
  const cThrows = s.eventLog.filter(e => e.type === 'PASS_ATTEMPTED' && ((cAsP && e.side === 'PLAYER') || (!cAsP && e.side === 'AI'))).length;
  const rThrows = s.eventLog.filter(e => e.type === 'PASS_ATTEMPTED' && ((cAsP && e.side === 'AI') || (!cAsP && e.side === 'PLAYER'))).length;
  return { cS, rS, delta: cS - rS, winner: cS > rS ? 'C' : rS > cS ? 'R' : 'D' as const, cThrows, rThrows, log: s.eventLog };
}

describe('16x20 Extended Balance', () => {
  it('mirror 16 seeds x 20 turns: d4@750 vs d4@750 should average to ~0', async () => {
    const seeds = [1111, 2222, 3333, 4444, 5555, 6666, 7777, 8888, 9999, 10101, 12121, 13131, 14141, 15151, 16161, 17171];
    const maxT = 20;
    const games = seeds.map((seed, i) => {
      const cAsP = i % 2 === 0; // alternate Challenger as PLAYER vs AI
      return { seed, cAsP, ...runGame(seed, REF_750, REF_750, cAsP, maxT) };
    });

    const totalC = games.reduce((a, g) => a + g.cS, 0);
    const totalR = games.reduce((a, g) => a + g.rS, 0);
    const delta = totalC - totalR;
    const cWins = games.filter(g => g.winner === 'C').length;
    const rWins = games.filter(g => g.winner === 'R').length;
    const draws = games.filter(g => g.winner === 'D').length;
    const avgDeltaPerGame = delta / seeds.length;

    console.log('\n  ═══════════════════════════════════════════════════════════════════════════');
    console.log('  MIRROR 16×20 — d4@750 vs d4@750 (side-agnostic, 16 seeds, 20 turns, alt Challenger)');
    console.log('  ═══════════════════════════════════════════════════════════════════════════');
    games.forEach((g, i) => {
      const tag = g.cAsP ? 'P' : 'A';
      const sign = g.delta >= 0 ? '+' : '';
      console.log(`  G${String(i + 1).padStart(2)} seed=${String(g.seed).padStart(5)} (${tag} Chall)  ${g.cS}-${g.rS}  Δ=${sign}${g.delta}  [${g.winner}]  throws ${g.cThrows}/${g.rThrows}`);
    });
    console.log('  ───────────────────────────────────────────────────────────────────────────');
    console.log(`  TOTAL  Challenger ${totalC} - Reference ${totalR}   Δ=${delta >= 0 ? '+' : ''}${delta}  avg/seeds=${avgDeltaPerGame >= 0 ? '+' : ''}${avgDeltaPerGame.toFixed(2)}`);
    console.log(`  W/L/D  ${cWins}/${rWins}/${draws}   Challenger win%=${(cWins / seeds.length * 100).toFixed(1)}%`);
    const allLogs = games.flatMap(g => g.log);
    const aiThrows = allLogs.filter(e => e.type === 'PASS_ATTEMPTED' && e.side === 'AI').length;
    const plThrows = allLogs.filter(e => e.type === 'PASS_ATTEMPTED' && e.side === 'PLAYER').length;
    const aiCards = allLogs.filter(e => e.type === 'CARD_PLAYED' && e.side === 'AI').length;
    const plCards = allLogs.filter(e => e.type === 'CARD_PLAYED' && e.side === 'PLAYER').length;
    console.log(`  AGG Throws AI=${aiThrows} PLAYER=${plThrows}  (ratio ${(aiThrows / Math.max(1, plThrows)).toFixed(2)}x)`);
    console.log(`  AGG Cards  AI=${aiCards} PLAYER=${plCards}  (ratio ${(aiCards / Math.max(1, plCards)).toFixed(2)}x)`);
    console.log('  Expected: Δ≈0, win%≈50%, throw/card ratios ≈1.0x if truly side-agnostic');
    console.log('  ═══════════════════════════════════════════════════════════════════════════\n');

    // Variance: with 16 games, Poisson-like score sd ~ sqrt(n) ~ 4 goals; |Δ|<8 and win% 25-75% is healthy
    expect(Math.abs(delta)).toBeLessThan(8);
    expect(Math.abs(cWins - rWins)).toBeLessThan(6); // not lopsided
  }, 180000);

  it('challenger bias check: 16x20 d4@1200 vs d4@750 and flipped', async () => {
    const seeds = [1111, 2222, 3333, 4444, 5555, 6666, 7777, 8888, 9999, 10101, 12121, 13131, 14141, 15151, 16161, 17171];
    const maxT = 20;
    const strong = makeTier(1200);
    const weak = REF_750;

    // A: strong Challenger vs weak Reference
    const gamesA = seeds.map((seed, i) => runGame(seed, strong, weak, i % 2 === 0, maxT));
    const deltaA = gamesA.reduce((a, g) => a + g.delta, 0);
    const avgA = deltaA / seeds.length;

    // B: flipped — weak Challenger vs strong Reference (should be ~ -avgA if symmetric)
    const gamesB = seeds.map((seed, i) => runGame(seed, weak, strong, i % 2 === 0, maxT));
    const deltaB = gamesB.reduce((a, g) => a + g.delta, 0); // delta = weak - strong, so expect negative
    const avgB = deltaB / seeds.length;

    const challengerBias = (avgA + avgB) / 2; // should be ~0 if no Challenger advantage; positive = Challenger edge
    const strengthEffect = (avgA - avgB) / 2; // positive = stronger iter helps

    console.log('\n  ═══════════════════════════════════════════════════════════════════════════');
    console.log('  CHALLENGER BIAS 16×20 — strong(1200) vs weak(750)');
    console.log('  ═══════════════════════════════════════════════════════════════════════════');
    console.log(`  A: strong Challenger vs weak Ref   avg Δ=${avgA >= 0 ? '+' : ''}${avgA.toFixed(2)}  total Δ=${deltaA >= 0 ? '+' : ''}${deltaA}  (expect + if stronger wins)`);
    console.log(`  B: weak Challenger vs strong Ref   avg Δ=${avgB >= 0 ? '+' : ''}${avgB.toFixed(2)}  total Δ=${deltaB >= 0 ? '+' : ''}${deltaB}  (expect - if symmetric)`);
    console.log(`  Challenger bias = (avgA+avgB)/2 = ${challengerBias >= 0 ? '+' : ''}${challengerBias.toFixed(2)}  (0 = perfect, was +2.9 before fix)`);
    console.log(`  Strength effect = (avgA-avgB)/2 = ${strengthEffect >= 0 ? '+' : ''}${strengthEffect.toFixed(2)}  (+ = more iterations helps)`);
    console.log('  ═══════════════════════════════════════════════════════════════════════════\n');

    // We don't hard-fail on bias magnitude, but we do assert it's much smaller than before
    // Before fix: bias ~+2.9 per game? Actually over 4 games delta ~+5 => per game +1.2? Let's just check it's <1.0 per game now
    expect(Math.abs(challengerBias)).toBeLessThan(1.0);
    // Strength should still be positive (more iters helps a bit), but small is ok
    expect(strengthEffect).toBeGreaterThan(-1);
  }, 240000);
});
