/**
 * Fair depth scaling — d4 to d8 @150 iters, 8 matches per adjacent pair, 20 rounds, fair harness.
 * Tests whether deeper rollout helps at fixed 150 iters.
 */
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import type { MCTSTierConfig, GameState } from '../src/engine/types';

const ITERS = 150;
const ROUNDS = 20;

function makeTier(depth: number): MCTSTierConfig {
  return {
    tier: 'CUSTOM', iterations: ITERS, rolloutDepth: depth,
    ismctsSamples: Math.max(1, Math.min(8, Math.round(ITERS / 50))),
    explorationConstant: 1.414, label: `d${depth}@${ITERS}`, description: `d${depth} 150 iters`,
  };
}

function runFairGame(seed: number, cTier: MCTSTierConfig, rTier: MCTSTierConfig, cAsP: boolean, rounds: number, jumpWinner: 'PLAYER'|'AI') {
  const init = createInitialState(seed);
  let s = gameReducer(init, { type: 'JUMP_BALL_RELEASE', wonBy: jumpWinner, releaseMarginMs: 100 });
  s = { ...s, momentum: { PLAYER: 3, AI: 3 } } as GameState;
  let playerTurns = 0, aiTurns = 0, steps = 0;
  while ((playerTurns < rounds || aiTurns < rounds) && !s.matchResult.isOver && steps < rounds * 3 + 10) {
    steps++;
    if (s.phase === 'PLAYER_PLAN' && playerTurns < rounds) {
      const tier = cAsP ? cTier : rTier;
      const o = s.config.mcts;
      s = { ...s, config: { ...s.config, mcts: tier } } as GameState;
      s = gameReducer(s, { type: 'RUN_AI_TURN_FOR_PLAYER' });
      s = { ...s, config: { ...s.config, mcts: o } } as GameState;
      playerTurns++;
    } else if (s.phase === 'AI_TURN' && aiTurns < rounds) {
      const tier = cAsP ? rTier : cTier;
      const o = s.config.mcts;
      s = { ...s, config: { ...s.config, mcts: tier } } as GameState;
      s = gameReducer(s, { type: 'RUN_AI_TURN' });
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
  return { cS, rS, delta: cS - rS, pScore: s.score.PLAYER, aScore: s.score.AI, winner: cS > rS ? 'C' as const : rS > cS ? 'R' as const : 'D' as const, log: s.eventLog };
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

describe('Fair depth scaling d4→d8 @150 iters', () => {
  it('adjacent depths d4vsd5, d5vsd6, d6vsd7, d7vsd8 — 8 each, fair', async () => {
    const depths = [4, 5, 6, 7, 8];
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < depths.length - 1; i++) pairs.push([depths[i], depths[i + 1]]);

    const groups = [
      { cAsP: true, jump: 'PLAYER' as const, label: 'P-Chall/P-first' },
      { cAsP: true, jump: 'AI' as const, label: 'P-Chall/AI-first' },
      { cAsP: false, jump: 'PLAYER' as const, label: 'A-Chall/P-first' },
      { cAsP: false, jump: 'AI' as const, label: 'A-Chall/AI-first' },
    ];

    console.log('\n  ═══════════════════════════════════════════════════════════════════════');
    console.log(`  FAIR DEPTH SCALING — d4→d8 @${ITERS} iters, 8 per adjacent pair, 20 rounds`);
    console.log('  ═══════════════════════════════════════════════════════════════════════');

    const results: Array<{ low: number; high: number; totalC: number; totalR: number; delta: number; avg: number; cW: number; rW: number; bySide: number }> = [];

    for (const [low, high] of pairs) {
      const lowTier = makeTier(low);
      const highTier = makeTier(high);
      const seeds = seedsFor(8, low * 10 + high);
      const games: ReturnType<typeof runFairGame>[] = [];
      for (let g = 0; g < 8; g++) {
        const grp = groups[g % 4];
        // HIGH depth as Challenger (deeper should win)
        games.push(runFairGame(seeds[g], highTier, lowTier, grp.cAsP, ROUNDS, grp.jump));
      }
      const totalC = games.reduce((a,g)=>a+g.cS,0);
      const totalR = games.reduce((a,g)=>a+g.rS,0);
      const delta = totalC - totalR;
      const avg = delta / 8;
      const cW = games.filter(g=>g.winner==='C').length;
      const rW = games.filter(g=>g.winner==='R').length;
      const pTot = games.reduce((a,g)=>a+g.pScore,0);
      const aTot = games.reduce((a,g)=>a+g.aScore,0);
      results.push({ low, high, totalC, totalR, delta, avg, cW, rW, bySide: pTot - aTot });

      console.log(`\n  Pair HIGH d${high} vs LOW d${low} (Chall deeper) — 8 games`);
      games.forEach((g,i)=>{
        const grp = groups[i%4].label;
        console.log(`    G${i+1} ${grp.padEnd(18)} ${g.cS}-${g.rS} Δ=${g.delta>=0?'+':''}${g.delta} [${g.winner}]`);
      });
      console.log(`    → Total Chall ${totalC}-${totalR} Δ=${delta>=0?'+':''}${delta} avg=${avg>=0?'+':''}${avg.toFixed(3)} W/L/D ${cW}/${rW}/${8-cW-rW} bySide P-A ${pTot-aTot>=0?'+':''}${pTot-aTot}`);
    }

    console.log('\n  ───────────────────────────────────────────────────────────────────────');
    console.log('  DEPTH SUMMARY (HIGH deeper Chall vs LOW, 8 each)');
    for (const r of results) {
      console.log(`  d${r.high} vs d${r.low}  ${r.totalC}-${r.totalR} Δ=${r.delta>=0?'+':''}${r.delta} avg=${r.avg>=0?'+':''}${r.avg.toFixed(3)} W/L/D ${r.cW}/${r.rW}/${8-r.cW-r.rW} bySide ${r.bySide>=0?'+':''}${r.bySide}`);
    }
    const avgGain = results.reduce((a,r)=>a+r.avg,0)/results.length;
    console.log(`\n  Avg gain per +1 depth: ${avgGain>=0?'+':''}${avgGain.toFixed(3)}/game`);
    console.log('  Expected: positive if deeper rollout helps at 150 iters');
    console.log('  ═══════════════════════════════════════════════════════════════════════\n');
    expect(results.every(r=>Math.abs(r.avg) < 1.5)).toBe(true);
  }, 600000);

  it('direct d4@150 vs d8@150 — 32 games fair (8 per group)', async () => {
    const low = makeTier(4);
    const high = makeTier(8);
    const groups = [
      { cAsP: true, jump: 'PLAYER' as const },
      { cAsP: true, jump: 'AI' as const },
      { cAsP: false, jump: 'PLAYER' as const },
      { cAsP: false, jump: 'AI' as const },
    ];
    const seeds = seedsFor(32, 999);
    const gamesHighChall: ReturnType<typeof runFairGame>[] = [];
    const gamesLowChall: ReturnType<typeof runFairGame>[] = [];
    for (let i = 0; i < 32; i++) {
      const grp = groups[i % 4];
      const seed = seeds[i];
      gamesHighChall.push(runFairGame(seed, high, low, grp.cAsP, ROUNDS, grp.jump));
      // Reuse same seed but swapped challenger for paired comparison (same board, opposite depth)
      gamesLowChall.push(runFairGame(seed, low, high, grp.cAsP, ROUNDS, grp.jump));
    }
    const avgHigh = gamesHighChall.reduce((a,g)=>a+g.delta,0)/32;
    const avgLow = gamesLowChall.reduce((a,g)=>a+g.delta,0)/32;
    // avgHigh = high Chall - low Ref (expect + if deep helps)
    // avgLow = low Chall - high Ref (expect -)
    const totalHighC = gamesHighChall.reduce((a,g)=>a+g.cS,0);
    const totalHighR = gamesHighChall.reduce((a,g)=>a+g.rS,0);
    const totalLowC = gamesLowChall.reduce((a,g)=>a+g.cS,0);
    const totalLowR = gamesLowChall.reduce((a,g)=>a+g.rS,0);
    console.log('\n  ──────────────────────────────────────────────────────');
    console.log('  DIRECT d4@150 vs d8@150 — 32 games each direction, fair');
    console.log(`  HIGH Chall (d8) vs LOW Ref (d4)  ${totalHighC}-${totalHighR} avg ${avgHigh>=0?'+':''}${avgHigh.toFixed(3)} W/L/D ${gamesHighChall.filter(g=>g.winner==='C').length}/${gamesHighChall.filter(g=>g.winner==='R').length}/${gamesHighChall.filter(g=>g.winner==='D').length}`);
    console.log(`  LOW Chall (d4) vs HIGH Ref (d8)  ${totalLowC}-${totalLowR} avg ${avgLow>=0?'+':''}${avgLow.toFixed(3)} W/L/D ${gamesLowChall.filter(g=>g.winner==='C').length}/${gamesLowChall.filter(g=>g.winner==='R').length}/${gamesLowChall.filter(g=>g.winner==='D').length}`);
    const bias = (avgHigh + avgLow)/2;
    const depthGain = (avgHigh - avgLow)/2;
    console.log(`  Bias (challenger) ${(bias>=0?'+':'')+bias.toFixed(3)}  Depth gain d8-d4 ${(depthGain>=0?'+':'')+depthGain.toFixed(3)}/game`);
    console.log('  ──────────────────────────────────────────────────────\n');
    expect(Math.abs(bias)).toBeLessThan(0.5);
  }, 600000);

  it('mirrors d4,d6,d8 @150 — 8 each, should be ~0', async () => {
    const depths = [4, 6, 8];
    const groups = [
      { cAsP: true, jump: 'PLAYER' as const },
      { cAsP: true, jump: 'AI' as const },
      { cAsP: false, jump: 'PLAYER' as const },
      { cAsP: false, jump: 'AI' as const },
    ];
    console.log('\n  ──────────────────────────────────────────────────────');
    console.log('  MIRRORS d4,d6,d8 @150 — 8 each, fair');
    for (const d of depths) {
      const tier = makeTier(d);
      const seeds = seedsFor(8, d*100);
      const games = seeds.map((seed,i)=>{
        const g = groups[i%4];
        return runFairGame(seed, tier, tier, g.cAsP, ROUNDS, g.jump);
      });
      const totalC = games.reduce((a,g)=>a+g.cS,0);
      const totalR = games.reduce((a,g)=>a+g.rS,0);
      const delta = totalC-totalR;
      console.log(`  d${d}@150 vs d${d}@150  ${totalC}-${totalR} Δ=${delta>=0?'+':''}${delta} avg=${(delta/8).toFixed(3)} W/L/D ${games.filter(g=>g.winner==='C').length}/${games.filter(g=>g.winner==='R').length}/${games.filter(g=>g.winner==='D').length}`);
      expect(Math.abs(delta/8)).toBeLessThan(1.3); // 8 games → SD≈0.6, 1.125 is 1.9σ, ok with 3 depths
    }
    console.log('  ──────────────────────────────────────────────────────\n');
  }, 600000);
});
