/**
 * Fair d10 scaling 150→750 at 150 steps, 8 matches per adjacent pair, 20 rounds, fair harness.
 * Pairs: 150vs300, 300vs450, 450vs600, 600vs750 (+ mirrors for each tier).
 * Fair: equal possessions (rounds=20 each side), decoupled first-mover (2 per 4 groups =8).
 */
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import type { MCTSTierConfig, GameState } from '../src/engine/types';

const DEPTH = 10;
const ROUNDS = 20;

function makeTier(iters: number): MCTSTierConfig {
  return {
    tier: 'CUSTOM', iterations: iters, rolloutDepth: DEPTH,
    ismctsSamples: Math.max(1, Math.min(8, Math.round(iters / 50))),
    explorationConstant: 1.414, label: `d${DEPTH}@${iters}`, description: `${iters} iters`,
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

describe('Fair d10 scaling 150→750 @150 steps, 8 per pair', () => {
  it('adjacent pairs 150vs300, 300vs450, 450vs600, 600vs750 — 8 matches each, fair', async () => {
    const levels = [150, 300, 450, 600, 750];
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < levels.length - 1; i++) pairs.push([levels[i], levels[i + 1]]);

    const groups = [
      { cAsP: true, jump: 'PLAYER' as const, label: 'P-Chall/P-first' },
      { cAsP: true, jump: 'AI' as const, label: 'P-Chall/AI-first' },
      { cAsP: false, jump: 'PLAYER' as const, label: 'A-Chall/P-first' },
      { cAsP: false, jump: 'AI' as const, label: 'A-Chall/AI-first' },
    ];

    console.log('\n  ═══════════════════════════════════════════════════════════════════════');
    console.log('  FAIR d10 SCALING — 150→750 @150 steps, 8 matches per adjacent pair, 20 rounds');
    console.log('  ═══════════════════════════════════════════════════════════════════════');

    const pairResults: Array<{ low: number; high: number; totalC: number; totalR: number; delta: number; avg: number; cW: number; rW: number; d: number; bySideDelta: number }> = [];

    for (const [low, high] of pairs) {
      const lowTier = makeTier(low);
      const highTier = makeTier(high);
      const seeds = seedsFor(8, low);
      const games: ReturnType<typeof runFairGame>[] = [];
      for (let g = 0; g < 8; g++) {
        const gg = groups[g % 4];
        games.push(runFairGame(seeds[g], highTier, lowTier, gg.cAsP, ROUNDS, gg.jump));
      }
      const totalC = games.reduce((a,g)=>a+g.cS,0);
      const totalR = games.reduce((a,g)=>a+g.rS,0);
      const delta = totalC - totalR;
      const avg = delta / 8;
      const cW = games.filter(g=>g.winner==='C').length;
      const rW = games.filter(g=>g.winner==='R').length;
      const pTot = games.reduce((a,g)=>a+g.pScore,0);
      const aTot = games.reduce((a,g)=>a+g.aScore,0);
      const bySideDelta = pTot - aTot;
      pairResults.push({ low, high, totalC, totalR, delta, avg, cW, rW, d: 8 - cW - rW, bySideDelta });

      console.log(`\n  Pair HIGH ${high} (Chall) vs LOW ${low} (Ref) — 8 games`);
      games.forEach((g,i)=>{
        const grp = groups[i%4].label;
        console.log(`    G${i+1} ${grp.padEnd(18)} ${g.cS}-${g.rS} Δ=${g.delta>=0?'+':''}${g.delta} [${g.winner}]`);
      });
      console.log(`    → Total Chall ${totalC} - Ref ${totalR}  Δ=${delta>=0?'+':''}${delta}  avg=${avg>=0?'+':''}${avg.toFixed(3)}  W/L/D ${cW}/${rW}/${8-cW-rW}  bySide P-A Δ=${bySideDelta>=0?'+':''}${bySideDelta}`);
    }

    console.log('\n  ───────────────────────────────────────────────────────────────────────');
    console.log('  SCALING SUMMARY (HIGH Chall vs LOW Ref, fair, 8 each, depth 10)');
    console.log('  Pair            Total     Avg/game  W/L/D   bySide P-A');
    for (const r of pairResults) {
      const label = `${r.high} vs ${r.low}`.padEnd(12);
      console.log(`  ${label}  ${String(r.totalC).padStart(2)}-${String(r.totalR).padStart(2)}  ${r.avg>=0?'+':''}${r.avg.toFixed(3).padEnd(6)}  ${r.cW}/${r.rW}/${r.d}   ${r.bySideDelta>=0?'+':''}${r.bySideDelta}`);
    }

    const avgStrength = pairResults.reduce((a,r)=>a+r.avg,0)/pairResults.length;
    console.log(`\n  Avg strength per step (150→750, 4 steps, d10): ${avgStrength>=0?'+':''}${avgStrength.toFixed(3)}/game`);
    console.log('  Expected positive at d10 as higher iterations unlock deeper horizon moves');
    console.log('  ═══════════════════════════════════════════════════════════════════════\n');

    expect(pairResults.every(r=>Math.abs(r.avg) < 1.8)).toBe(true);
  }, 600000);

  it('mirrors at each tier 150,300,450,600,750 — 8 each, should be ~0', async () => {
    const levels = [150, 300, 450, 600, 750];
    const groups = [
      { cAsP: true, jump: 'PLAYER' as const },
      { cAsP: true, jump: 'AI' as const },
      { cAsP: false, jump: 'PLAYER' as const },
      { cAsP: false, jump: 'AI' as const },
    ];
    console.log('\n  ───────────────────────────────────────────────────────────────────────');
    console.log('  MIRRORS d10 — each tier vs itself, 8 games, fair');
    for (const lvl of levels) {
      const tier = makeTier(lvl);
      const seeds = seedsFor(8, lvl * 3);
      const games = seeds.map((seed,i)=>{
        const g = groups[i%4];
        return runFairGame(seed, tier, tier, g.cAsP, ROUNDS, g.jump);
      });
      const totalC = games.reduce((a,g)=>a+g.cS,0);
      const totalR = games.reduce((a,g)=>a+g.rS,0);
      const delta = totalC-totalR;
      const avg = delta/8;
      const cW = games.filter(g=>g.winner==='C').length;
      const rW = games.filter(g=>g.winner==='R').length;
      console.log(`  d10@${String(lvl).padStart(3)} vs d10@${String(lvl).padStart(3)}  ${totalC}-${totalR} Δ=${delta>=0?'+':''}${delta} avg=${avg>=0?'+':''}${avg.toFixed(3)} W/L/D ${cW}/${rW}/${8-cW-rW}`);
      expect(Math.abs(avg)).toBeLessThan(0.8);
    }
    console.log('  ───────────────────────────────────────────────────────────────────────\n');
  }, 600000);
});
