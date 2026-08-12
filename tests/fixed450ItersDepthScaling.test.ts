/**
 * Fixed 450 Iterations: Lookahead Depth Scaling Sweep ([d2, d4, d6, d8, d10, d12])
 * Evaluates how rollout depth affects MCTS strength when iteration count is held constant at 450:
 * 1. Lookahead Depth Curve: Fixed d4@450 baseline vs. [d2, d4, d6, d8, d10, d12] at 450 iterations.
 * 2. Adjacent Depth Pairs: d2vsd4, d4vsd6, d6vsd8, d8vsd10, d10vsd12 at 450 iterations.
 */
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import type { MCTSTierConfig, GameState } from '../src/engine/types';

const ROUNDS = 20;
const FIXED_ITERS = 450;

function makeTier(depth: number, iters: number = FIXED_ITERS): MCTSTierConfig {
  return {
    tier: 'CUSTOM',
    iterations: iters,
    rolloutDepth: depth,
    ismctsSamples: Math.max(1, Math.min(8, Math.round(iters / 50))),
    explorationConstant: 1.414,
    label: `d${depth}@${iters}`,
    description: `depth ${depth} ${iters} iters`,
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

describe('Fixed 450 Iterations: Depth Scaling Sweep (d2, d4, d6, d8, d10, d12)', () => {
  it('depth scaling curve vs fixed d4@450 baseline: [d2, d4, d6, d8, d10, d12] at 450 iters', () => {
    const depths = [2, 4, 6, 8, 10, 12];
    const refTier = makeTier(4, FIXED_ITERS);

    console.log(`\n  ═══════════════════════════════════════════════════════════════════════════════════════`);
    console.log(`  LOOKAHEAD DEPTH CURVE @ 450 ITERS: d4 Baseline vs. [d2, d4, d6, d8, d10, d12]`);
    console.log(`  ═══════════════════════════════════════════════════════════════════════════════════════`);

    const results: Array<{
      depth: number;
      totalC: number;
      totalR: number;
      delta: number;
      avgDelta: number;
      winRate: number;
      cW: number;
      rW: number;
      draws: number;
      avgTimeMs: number;
      effRatio: number;
    }> = [];

    for (const depth of depths) {
      const challTier = makeTier(depth, FIXED_ITERS);
      const seeds = seedsFor(8, 45000 + depth * 100);
      const games: ReturnType<typeof runFairGame>[] = [];

      for (let g = 0; g < 8; g++) {
        const grp = GROUPS[g % 4];
        games.push(runFairGame(seeds[g], challTier, refTier, grp.cAsP, ROUNDS, grp.jump));
      }

      const totalC = games.reduce((a, g) => a + g.cS, 0);
      const totalR = games.reduce((a, g) => a + g.rS, 0);
      const delta = totalC - totalR;
      const avgDelta = delta / 8;
      const cW = games.filter(g => g.winner === 'C').length;
      const rW = games.filter(g => g.winner === 'R').length;
      const draws = games.filter(g => g.winner === 'D').length;
      const winRate = ((cW + 0.5 * draws) / 8) * 100;
      const avgTimeMs = games.reduce((a, g) => a + g.cAvgTimeMs, 0) / 8;
      const effRatio = avgTimeMs > 0 ? (avgDelta / avgTimeMs) * 1000 : 0;

      results.push({
        depth,
        totalC,
        totalR,
        delta,
        avgDelta,
        winRate,
        cW,
        rW,
        draws,
        avgTimeMs,
        effRatio,
      });
    }

    console.log(`  ───────────────────────────────────────────────────────────────────────────────────────`);
    console.log(`  Depth  Score (C-R)  Avg Δ/game   W / L / D    Win Rate    Search Time  Δ/Sec`);
    console.log(`  ───────────────────────────────────────────────────────────────────────────────────────`);
    for (const r of results) {
      const depthStr = `d${r.depth}@450`.padEnd(9);
      const scoreStr = `${String(r.totalC).padStart(2)} - ${String(r.totalR).padStart(2)}`.padEnd(11);
      const avgStr = `${r.avgDelta >= 0 ? '+' : ''}${r.avgDelta.toFixed(3)}`.padEnd(11);
      const wldStr = `${r.cW} / ${r.rW} / ${r.draws}`.padEnd(11);
      const wrStr = `${r.winRate.toFixed(1)}%`.padEnd(10);
      const timeStr = `${r.avgTimeMs.toFixed(1)}ms`.padEnd(11);
      const effStr = `${r.effRatio >= 0 ? '+' : ''}${r.effRatio.toFixed(2)}`;
      console.log(`  ${depthStr} ${scoreStr} ${avgStr}  ${wldStr}  ${wrStr}  ${timeStr}  ${effStr}`);
    }
    console.log(`  ───────────────────────────────────────────────────────────────────────────────────────`);

    let bestIdx = 0;
    for (let i = 1; i < results.length; i++) {
      if (results[i].winRate > results[bestIdx].winRate || (results[i].winRate === results[bestIdx].winRate && results[i].avgDelta > results[bestIdx].avgDelta)) {
        bestIdx = i;
      }
    }

    console.log(`\n  [DEPTH SCALING ANALYSIS @ 450 ITERS]`);
    console.log(`  • Optimal Lookahead Depth: d${results[bestIdx].depth} (${results[bestIdx].winRate.toFixed(1)}% Win Rate, Avg Δ = ${results[bestIdx].avgDelta >= 0 ? '+' : ''}${results[bestIdx].avgDelta.toFixed(3)}/game)`);
    console.log(`  • Search Horizon vs. Computational Cost: shows where deeper lookahead unlocks tactical gain vs. where horizon noise dilutes 450 iterations.`);
    console.log(`  ═══════════════════════════════════════════════════════════════════════════════════════\n`);

    expect(results.length).toBe(6);
  }, 360000);

  it('adjacent depth pairs at 450 iters: d2vsd4, d4vsd6, d6vsd8, d8vsd10, d10vsd12', () => {
    const depths = [2, 4, 6, 8, 10, 12];
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < depths.length - 1; i++) pairs.push([depths[i], depths[i + 1]]);

    console.log(`\n  ═══════════════════════════════════════════════════════════════════════════════════════`);
    console.log(`  ADJACENT DEPTH PAIRS @ 450 ITERS — Step-by-Step Strength Scaling`);
    console.log(`  ═══════════════════════════════════════════════════════════════════════════════════════`);

    const pairResults: Array<{
      low: number;
      high: number;
      totalC: number;
      totalR: number;
      delta: number;
      avg: number;
      cW: number;
      rW: number;
      draws: number;
    }> = [];

    for (const [low, high] of pairs) {
      const lowTier = makeTier(low, FIXED_ITERS);
      const highTier = makeTier(high, FIXED_ITERS);
      const seeds = seedsFor(8, 70000 + low * 10 + high);
      const games: ReturnType<typeof runFairGame>[] = [];

      for (let g = 0; g < 8; g++) {
        const grp = GROUPS[g % 4];
        games.push(runFairGame(seeds[g], highTier, lowTier, grp.cAsP, ROUNDS, grp.jump));
      }

      const totalC = games.reduce((a, g) => a + g.cS, 0);
      const totalR = games.reduce((a, g) => a + g.rS, 0);
      const delta = totalC - totalR;
      const avg = delta / 8;
      const cW = games.filter(g => g.winner === 'C').length;
      const rW = games.filter(g => g.winner === 'R').length;
      const draws = games.filter(g => g.winner === 'D').length;

      pairResults.push({
        low,
        high,
        totalC,
        totalR,
        delta,
        avg,
        cW,
        rW,
        draws,
      });

      console.log(`\n  Pair HIGH d${high} (Chall) vs LOW d${low} (Ref) @ 450 iters — 8 games`);
      games.forEach((g, i) => {
        const grp = GROUPS[i % 4].label;
        console.log(`    G${i + 1} ${grp.padEnd(18)} ${g.cS}-${g.rS} Δ=${g.delta >= 0 ? '+' : ''}${g.delta} [${g.winner}]`);
      });
      console.log(`    → Total Chall ${totalC} - Ref ${totalR}  Δ=${delta >= 0 ? '+' : ''}${delta}  avg=${avg >= 0 ? '+' : ''}${avg.toFixed(3)}  W/L/D ${cW}/${rW}/${draws}`);
    }

    console.log(`\n  ───────────────────────────────────────────────────────────────────────────────────────`);
    console.log(`  ADJACENT DEPTH SCALING SUMMARY (HIGH Chall vs LOW Ref @ 450 iters, 8 each)`);
    console.log(`  Pair Matchup   Score (C-R)   Avg Δ/game   W / L / D     Balance Assessment`);
    console.log(`  ───────────────────────────────────────────────────────────────────────────────────────`);
    for (const r of pairResults) {
      const label = `d${r.high} vs d${r.low}`.padEnd(12);
      const scoreStr = `${String(r.totalC).padStart(2)} - ${String(r.totalR).padStart(2)}`.padEnd(11);
      const avgStr = `${r.avg >= 0 ? '+' : ''}${r.avg.toFixed(3)}`.padEnd(11);
      const wldStr = `${r.cW} / ${r.rW} / ${r.draws}`.padEnd(11);
      const assess = r.avg > 0.1 ? `d${r.high} outperforms d${r.low}` : r.avg < -0.1 ? `d${r.low} outperforms d${r.high} (horizon dilution)` : `Equilibrium (~0 delta)`;
      console.log(`  ${label}   ${scoreStr}   ${avgStr}  ${wldStr}  ${assess}`);
    }
    console.log(`  ───────────────────────────────────────────────────────────────────────────────────────`);
    console.log(`  ═══════════════════════════════════════════════════════════════════════════════════════\n`);

    expect(pairResults.length).toBe(5);
  }, 360000);
});
