/**
 * 64 seeds x 20 turns @ 150 iters — low iteration balance check
 * Run: ./node_modules/.bin/vitest run tests/sideAgnostic64x20_150.test.ts --reporter=verbose
 */
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import type { MCTSTierConfig, GameState } from '../src/engine/types';

const REF_150: MCTSTierConfig = {
  tier: 'CUSTOM', iterations: 150, rolloutDepth: 4, ismctsSamples: Math.max(1, Math.min(8, Math.round(150 / 50))),
  explorationConstant: 1.414, label: 'd4@150', description: 'low iters mirror',
};
const REF_750: MCTSTierConfig = {
  tier: 'CUSTOM', iterations: 750, rolloutDepth: 4, ismctsSamples: 8,
  explorationConstant: 1.414, label: 'd4@750', description: 'ref',
};



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
  return { cS, rS, delta: cS - rS, winner: cS > rS ? 'C' as const : rS > cS ? 'R' as const : 'D' as const, cThrows, rThrows, log: s.eventLog };
}

function seeds64(): number[] {
  // deterministic 64 seeds - use 1000.. + primes to avoid collisions
  const base = [1111, 2222, 3333, 4444, 5555, 6666, 7777, 8888, 9999, 10101, 12121, 13131, 14141, 15151, 16161, 17171,
                18181, 19191, 21212, 22233, 23333, 24444, 25555, 26666, 27777, 28888, 29999, 31111, 32222, 33344, 34444, 35555,
                36666, 37777, 38888, 39999, 41111, 42222, 43333, 44455, 45555, 46666, 47777, 48888, 49999, 51111, 52222, 53333,
                54444, 55566, 56666, 57777, 58888, 59999, 61111, 62222, 63333, 64444, 65555, 66677, 67777, 68888, 69999, 71111];
  return base.slice(0, 64);
}

describe('64x20 @150 iters — low iteration balance', () => {
  it('mirror 64 seeds x 20 turns: d4@150 vs d4@150 should be ~0', async () => {
    const seeds = seeds64();
    const maxT = 20;
    const games = seeds.map((seed, i) => {
      const cAsP = i % 2 === 0;
      return { seed, cAsP, ...runGame(seed, REF_150, REF_150, cAsP, maxT) };
    });

    const totalC = games.reduce((a, g) => a + g.cS, 0);
    const totalR = games.reduce((a, g) => a + g.rS, 0);
    const delta = totalC - totalR;
    const avg = delta / seeds.length;
    const cWins = games.filter(g => g.winner === 'C').length;
    const rWins = games.filter(g => g.winner === 'R').length;
    const draws = games.filter(g => g.winner === 'D').length;

    console.log('\n  ═══════════════════════════════════════════════════════════════════════');
    console.log('  MIRROR 64×20 @150 iters — d4@150 vs d4@150 (64 seeds, alt Challenger)');
    console.log('  ═══════════════════════════════════════════════════════════════════════');
    // Print in blocks of 8 for readability
    for (let block = 0; block < 8; block++) {
      const slice = games.slice(block * 8, block * 8 + 8);
      const line = slice.map((g, j) => {
        const idx = block * 8 + j + 1;
        const tag = g.cAsP ? 'P' : 'A';
        const sign = g.delta >= 0 ? '+' : '';
        return `G${String(idx).padStart(2)}(${tag}:${String(g.seed).padStart(5)})${g.cS}-${g.rS}[${g.winner}]${sign}${g.delta}`;
      }).join('  |  ');
      console.log(`  ${line}`);
    }
    console.log('  ───────────────────────────────────────────────────────────────────────');
    console.log(`  TOTAL  Chall ${totalC} - Ref ${totalR}  Δ=${delta >= 0 ? '+' : ''}${delta}  avg=${avg >= 0 ? '+' : ''}${avg.toFixed(3)}/game`);
    console.log(`  W/L/D  ${cWins}/${rWins}/${draws}  win% ${(cWins / seeds.length * 100).toFixed(1)}%`);
    const allLogs = games.flatMap(g => g.log);
    const aiThrows = allLogs.filter(e => e.type === 'PASS_ATTEMPTED' && e.side === 'AI').length;
    const plThrows = allLogs.filter(e => e.type === 'PASS_ATTEMPTED' && e.side === 'PLAYER').length;
    const aiCards = allLogs.filter(e => e.type === 'CARD_PLAYED' && e.side === 'AI').length;
    const plCards = allLogs.filter(e => e.type === 'CARD_PLAYED' && e.side === 'PLAYER').length;
    const aiScores = allLogs.filter(e => e.type === 'SCORE_GOAL' && e.side === 'AI').length;
    const plScores = allLogs.filter(e => e.type === 'SCORE_GOAL' && e.side === 'PLAYER').length;
    console.log(`  AGG Throws AI=${aiThrows} PL=${plThrows}  ratio ${(aiThrows / Math.max(1, plThrows)).toFixed(2)}x`);
    console.log(`  AGG Cards  AI=${aiCards} PL=${plCards}  ratio ${(aiCards / Math.max(1, plCards)).toFixed(2)}x`);
    console.log(`  AGG Scores AI=${aiScores} PL=${plScores}`);
    console.log('  Expected: Δ≈0, win%≈50%, throw/card≈1.0x');
    console.log('  ═══════════════════════════════════════════════════════════════════════\n');

    // Statistical check: with 64 games, SD of Δ ≈ sqrt(64)*~1.2 ≈ 9.6 goals total, so |Δ|<12 is healthy; per game |avg|<0.5
    expect(Math.abs(delta)).toBeLessThan(15);
    expect(Math.abs(avg)).toBeLessThan(0.5);
    // Also check win% not lopsided
    expect(Math.abs(cWins - rWins)).toBeLessThan(15);
  }, 360000);

  it('challenger bias 64×20 @150: low Chall vs high Ref and flipped', async () => {
    const seeds = seeds64();
    const maxT = 20;
    const low = REF_150;
    const high = REF_750;

    const gamesLowChall = seeds.map((seed, i) => runGame(seed, low, high, i % 2 === 0, maxT));
    const deltaLowChall = gamesLowChall.reduce((a, g) => a + g.delta, 0);
    const avgLowChall = deltaLowChall / seeds.length;

    const gamesHighChall = seeds.map((seed, i) => runGame(seed, high, low, i % 2 === 0, maxT));
    const deltaHighChall = gamesHighChall.reduce((a, g) => a + g.delta, 0);
    const avgHighChall = deltaHighChall / seeds.length;

    const challengerBias = (avgLowChall + avgHighChall) / 2; // 0 = perfect; positive = Challenger edge
    const strengthEffect = (avgHighChall - avgLowChall) / 2; // + = high iters helps

    console.log('\n  ═══════════════════════════════════════════════════════════════════════');
    console.log('  CHALLENGER BIAS 64×20 @150 vs 750');
    console.log('  ═══════════════════════════════════════════════════════════════════════');
    console.log(`  LOW Chall (150) vs HIGH Ref (750)  avg ${avgLowChall >= 0 ? '+' : ''}${avgLowChall.toFixed(3)}  total ${deltaLowChall >= 0 ? '+' : ''}${deltaLowChall}  (expect - if stronger helps)`);
    console.log(`  HIGH Chall (750) vs LOW Ref (150)  avg ${avgHighChall >= 0 ? '+' : ''}${avgHighChall.toFixed(3)}  total ${deltaHighChall >= 0 ? '+' : ''}${deltaHighChall}  (expect + if stronger helps)`);
    console.log(`  Challenger bias = (lowChall+highChall)/2 = ${challengerBias >= 0 ? '+' : ''}${challengerBias.toFixed(3)}  (0 = perfect, was +2.9)`);
    console.log(`  Strength effect = (high-low)/2 = ${strengthEffect >= 0 ? '+' : ''}${strengthEffect.toFixed(3)}  (+ = high iters helps)`);
    // Also per-side breakdown to see top vs bottom
    const lowChallP = gamesLowChall.filter((_, i) => i % 2 === 0).reduce((a, g) => a + g.delta, 0) / 32;
    const lowChallA = gamesLowChall.filter((_, i) => i % 2 === 1).reduce((a, g) => a + g.delta, 0) / 32;
    const highChallP = gamesHighChall.filter((_, i) => i % 2 === 0).reduce((a, g) => a + g.delta, 0) / 32;
    const highChallA = gamesHighChall.filter((_, i) => i % 2 === 1).reduce((a, g) => a + g.delta, 0) / 32;
    console.log(`  Breakdown P-Chall vs A-Chall:`);
    console.log(`    LOW Chall:  P-Chall avg ${lowChallP >= 0 ? '+' : ''}${lowChallP.toFixed(3)}  A-Chall avg ${lowChallA >= 0 ? '+' : ''}${lowChallA.toFixed(3)}`);
    console.log(`    HIGH Chall: P-Chall avg ${highChallP >= 0 ? '+' : ''}${highChallP.toFixed(3)}  A-Chall avg ${highChallA >= 0 ? '+' : ''}${highChallA.toFixed(3)}`);
    console.log('  ═══════════════════════════════════════════════════════════════════════\n');

    expect(Math.abs(challengerBias)).toBeLessThan(0.5);
  }, 600000);
});
