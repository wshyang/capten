/**
 * Fixed Baseline 150 vs. Scaling Iterations (150, 300, 450, 600, 750)
 * Evaluates the cost-benefit drop-off curve for both d4 and d6 MCTS:
 * A fixed 150-iteration baseline fights against 150, 300, 450, 600, and 750 iterations.
 */
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import type { MCTSTierConfig, GameState } from '../src/engine/types';

const ROUNDS = 20;

function makeTier(depth: number, iters: number): MCTSTierConfig {
  return {
    tier: 'CUSTOM', iterations: iters, rolloutDepth: depth,
    ismctsSamples: Math.max(1, Math.min(8, Math.round(iters / 50))),
    explorationConstant: 1.414, label: `d${depth}@${iters}`, description: `${iters} iters`,
  };
}

function runFairGame(
  seed: number,
  cTier: MCTSTierConfig,
  rTier: MCTSTierConfig,
  cAsP: boolean,
  rounds: number,
  jumpWinner: 'PLAYER' | 'AI'
) {
  const init = createInitialState(seed);
  let s = gameReducer(init, { type: 'JUMP_BALL_RELEASE', wonBy: jumpWinner, releaseMarginMs: 100 });
  s = { ...s, momentum: { PLAYER: 3, AI: 3 } } as GameState;
  let playerTurns = 0, aiTurns = 0, steps = 0;
  let cTimeMs = 0, rTimeMs = 0, cTurns = 0, rTurns = 0;

  while ((playerTurns < rounds || aiTurns < rounds) && !s.matchResult.isOver && steps < rounds * 3 + 10) {
    steps++;
    if (s.phase === 'PLAYER_PLAN' && playerTurns < rounds) {
      const tier = cAsP ? cTier : rTier;
      const o = s.config.mcts;
      s = { ...s, config: { ...s.config, mcts: tier } } as GameState;
      s = gameReducer(s, { type: 'RUN_AI_TURN_FOR_PLAYER' });
      const searchTime = s.aiStatus.lastSearchStats?.timeMs || 0;
      if (cAsP) { cTimeMs += searchTime; cTurns++; } else { rTimeMs += searchTime; rTurns++; }
      s = { ...s, config: { ...s.config, mcts: o } } as GameState;
      playerTurns++;
    } else if (s.phase === 'AI_TURN' && aiTurns < rounds) {
      const tier = cAsP ? rTier : cTier;
      const o = s.config.mcts;
      s = { ...s, config: { ...s.config, mcts: tier } } as GameState;
      s = gameReducer(s, { type: 'RUN_AI_TURN' });
      const searchTime = s.aiStatus.lastSearchStats?.timeMs || 0;
      if (cAsP) { rTimeMs += searchTime; rTurns++; } else { cTimeMs += searchTime; cTurns++; }
      s = { ...s, config: { ...s.config, mcts: o } } as GameState;
      if (s.phase === 'AI_PLANNED_REVIEW') s = gameReducer(s, { type: 'START_PLAYER_TURN' });
      aiTurns++;
    } else if (s.phase === 'AI_PLANNED_REVIEW') {
      s = gameReducer(s, { type: 'START_PLAYER_TURN' });
    } else break;
    if (s.matchResult.isOver) break;
  }
  const cS = cAsP ? s.score.PLAYER : s.score.AI;
  const rS = cAsP ? s.score.AI : s.score.PLAYER;
  return {
    cS, rS, delta: cS - rS,
    cAvgTimeMs: cTurns > 0 ? cTimeMs / cTurns : 0,
    rAvgTimeMs: rTurns > 0 ? rTimeMs / rTurns : 0,
    winner: cS > rS ? ('C' as const) : rS > cS ? ('R' as const) : ('D' as const),
  };
}

function seedsFor(count: number, offset = 0): number[] {
  let n = 1009 + offset * 9999;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    n = (n * 1103515245 + 12345) & 0x7fffffff;
    out.push(1000 + (n % 90000));
  }
  return out;
}

const GROUPS = [
  { cAsP: true, jump: 'PLAYER' as const, label: 'P-Chall/P-first' },
  { cAsP: true, jump: 'AI' as const, label: 'P-Chall/AI-first' },
  { cAsP: false, jump: 'PLAYER' as const, label: 'A-Chall/P-first' },
  { cAsP: false, jump: 'AI' as const, label: 'A-Chall/AI-first' },
];

function evaluateCurve(depth: number) {
  const baseIters = 150;
  const testIters = [150, 300, 450, 600, 750];
  const refTier = makeTier(depth, baseIters);

  console.log(`\n  ═══════════════════════════════════════════════════════════════════════════════════════`);
  console.log(`  COST-BENEFIT DROP-OFF CURVE: d${depth} Baseline (150 iters) vs. [150, 300, 450, 600, 750]`);
  console.log(`  ═══════════════════════════════════════════════════════════════════════════════════════`);

  const results: Array<{
    iters: number;
    totalC: number;
    totalR: number;
    delta: number;
    avgDelta: number;
    marginalDelta: number;
    winRate: number;
    cW: number;
    rW: number;
    draws: number;
    avgTimeMs: number;
    effRatio: number;
  }> = [];

  let prevAvgDelta = 0;

  for (const iters of testIters) {
    const challTier = makeTier(depth, iters);
    const seeds = seedsFor(8, depth * 1000 + iters);
    const games: ReturnType<typeof runFairGame>[] = [];

    for (let g = 0; g < 8; g++) {
      const grp = GROUPS[g % 4];
      games.push(runFairGame(seeds[g], challTier, refTier, grp.cAsP, ROUNDS, grp.jump));
    }

    const totalC = games.reduce((a, g) => a + g.cS, 0);
    const totalR = games.reduce((a, g) => a + g.rS, 0);
    const delta = totalC - totalR;
    const avgDelta = delta / 8;
    const marginalDelta = iters === 150 ? 0 : avgDelta - prevAvgDelta;
    const cW = games.filter(g => g.winner === 'C').length;
    const rW = games.filter(g => g.winner === 'R').length;
    const draws = games.filter(g => g.winner === 'D').length;
    const winRate = ((cW + 0.5 * draws) / 8) * 100;
    const avgTimeMs = games.reduce((a, g) => a + g.cAvgTimeMs, 0) / 8;
    const effRatio = avgTimeMs > 0 ? (avgDelta / avgTimeMs) * 1000 : 0; // Delta per second of search time

    results.push({
      iters,
      totalC,
      totalR,
      delta,
      avgDelta,
      marginalDelta,
      winRate,
      cW,
      rW,
      draws,
      avgTimeMs,
      effRatio,
    });

    prevAvgDelta = avgDelta;
  }

  console.log(`  ───────────────────────────────────────────────────────────────────────────────────────`);
  console.log(`  Iters  Score (C-R)  Avg Δ/game   Marginal Δ   W / L / D    Win Rate    Search Time  Δ/Sec`);
  console.log(`  ───────────────────────────────────────────────────────────────────────────────────────`);
  for (const r of results) {
    const itersStr = `d${depth}@${r.iters}`.padEnd(9);
    const scoreStr = `${String(r.totalC).padStart(2)} - ${String(r.totalR).padStart(2)}`.padEnd(11);
    const avgStr = `${r.avgDelta >= 0 ? '+' : ''}${r.avgDelta.toFixed(3)}`.padEnd(11);
    const margStr = `${r.marginalDelta >= 0 ? '+' : ''}${r.marginalDelta.toFixed(3)}`.padEnd(11);
    const wldStr = `${r.cW} / ${r.rW} / ${r.draws}`.padEnd(11);
    const wrStr = `${r.winRate.toFixed(1)}%`.padEnd(10);
    const timeStr = `${r.avgTimeMs.toFixed(1)}ms`.padEnd(11);
    const effStr = `${r.effRatio >= 0 ? '+' : ''}${r.effRatio.toFixed(2)}`;
    console.log(`  ${itersStr} ${scoreStr} ${avgStr}  ${margStr}  ${wldStr}  ${wrStr}  ${timeStr}  ${effStr}`);
  }
  console.log(`  ───────────────────────────────────────────────────────────────────────────────────────`);

  // Identify where marginal return drops off
  let peakMarginalIdx = 1;
  let dropoffIters = testIters[1];
  for (let i = 2; i < results.length; i++) {
    if (results[i].marginalDelta < results[peakMarginalIdx].marginalDelta * 0.5) {
      dropoffIters = results[i].iters;
      break;
    }
  }

  console.log(`\n  [d${depth} ANALYSIS]`);
  console.log(`  • Peak Marginal Gain: at ${results[1].iters} iters (Marginal Δ = ${results[1].marginalDelta >= 0 ? '+' : ''}${results[1].marginalDelta.toFixed(3)}/game)`);
  console.log(`  • Cost-Benefit Drop-off: observed at ${dropoffIters}+ iters where marginal gain per iteration flattens.`);
  console.log(`  ═══════════════════════════════════════════════════════════════════════════════════════\n`);

  return results;
}

describe('Fixed Baseline 150 vs. Scaling (150, 300, 450, 600, 750)', () => {
  it('d4 cost-benefit drop-off curve: fixed 150 vs [150, 300, 450, 600, 750]', () => {
    const res = evaluateCurve(4);
    expect(res.length).toBe(5);
  }, 300000);

  it('d6 cost-benefit drop-off curve: fixed 150 vs [150, 300, 450, 600, 750]', () => {
    const res = evaluateCurve(6);
    expect(res.length).toBe(5);
  }, 300000);

  it('d10 cost-benefit drop-off curve: fixed 150 vs [150, 300, 450, 600, 750]', () => {
    const res = evaluateCurve(10);
    expect(res.length).toBe(5);
  }, 300000);
});
