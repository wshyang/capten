/**
 * Fair pits at 150 iters: d8 vs d4 and d12 vs d6
 * 32 games per direction (8 per 4 groups), 20 rounds, fair harness (equal possessions, decoupled first-mover)
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

function runPit(depthHigh: number, depthLow: number, labelHigh: string, labelLow: string) {
  const high = makeTier(depthHigh);
  const low = makeTier(depthLow);
  const groups = [
    { cAsP: true, jump: 'PLAYER' as const },
    { cAsP: true, jump: 'AI' as const },
    { cAsP: false, jump: 'PLAYER' as const },
    { cAsP: false, jump: 'AI' as const },
  ];
  const seeds = seedsFor(32, depthHigh * 100 + depthLow);

  const gamesHighChall: ReturnType<typeof runFairGame>[] = [];
  const gamesLowChall: ReturnType<typeof runFairGame>[] = [];
  for (let i = 0; i < 32; i++) {
    const grp = groups[i % 4];
    const seed = seeds[i];
    gamesHighChall.push(runFairGame(seed, high, low, grp.cAsP, ROUNDS, grp.jump));
    gamesLowChall.push(runFairGame(seed, low, high, grp.cAsP, ROUNDS, grp.jump));
  }
  const totalHighC = gamesHighChall.reduce((a,g)=>a+g.cS,0);
  const totalHighR = gamesHighChall.reduce((a,g)=>a+g.rS,0);
  const totalLowC = gamesLowChall.reduce((a,g)=>a+g.cS,0);
  const totalLowR = gamesLowChall.reduce((a,g)=>a+g.rS,0);
  const avgHigh = (totalHighC - totalHighR) / 32;
  const avgLow = (totalLowC - totalLowR) / 32;
  const bias = (avgHigh + avgLow) / 2;
  const gain = (avgHigh - avgLow) / 2; // positive = high depth helps
  const cWH = gamesHighChall.filter(g=>g.winner==='C').length;
  const rWH = gamesHighChall.filter(g=>g.winner==='R').length;
  const cWL = gamesLowChall.filter(g=>g.winner==='C').length;
  const rWL = gamesLowChall.filter(g=>g.winner==='R').length;

  console.log('\n  ───────────────────────────────────────────────────────────────────────');
  console.log(`  PIT ${labelHigh} vs ${labelLow} @${ITERS} iters — 32 games each direction, fair (8 per 4 groups)`);
  console.log(`  HIGH Chall (${labelHigh}) vs LOW Ref (${labelLow})  ${totalHighC}-${totalHighR} avg ${avgHigh>=0?'+':''}${avgHigh.toFixed(3)} W/L/D ${cWH}/${rWH}/${32-cWH-rWH}`);
  console.log(`  LOW Chall (${labelLow}) vs HIGH Ref (${labelHigh})  ${totalLowC}-${totalLowR} avg ${avgLow>=0?'+':''}${avgLow.toFixed(3)} W/L/D ${cWL}/${rWL}/${32-cWL-rWL}`);
  console.log(`  Bias (challenger) ${(bias>=0?'+':'')+bias.toFixed(3)}  Depth gain ${labelHigh}-${labelLow} ${(gain>=0?'+':'')+gain.toFixed(3)}/game`);
  // also by side (top vs bottom) totals
  const pTotHigh = gamesHighChall.reduce((a,g)=>a+g.pScore,0) + gamesLowChall.reduce((a,g)=>a+g.pScore,0);
  const aTotHigh = gamesHighChall.reduce((a,g)=>a+g.aScore,0) + gamesLowChall.reduce((a,g)=>a+g.aScore,0);
  console.log(`  By side (64 games combined) PLAYER ${pTotHigh} - AI ${aTotHigh} Δ=${pTotHigh-aTotHigh} ${(pTotHigh-aTotHigh)/64>=0?'+':''}${((pTotHigh-aTotHigh)/64).toFixed(3)}/game`);
  console.log('  ───────────────────────────────────────────────────────────────────────\n');
  return { avgHigh, avgLow, bias, gain, totalHighC, totalHighR, totalLowC, totalLowR };
}

describe('Fair pits @150 iters: d8 vs d4 and d12 vs d6', () => {
  it('d8 vs d4 @150 — 32 each direction', async () => {
    const r = runPit(8, 4, 'd8', 'd4');
    expect(Math.abs(r.bias)).toBeLessThan(0.5);
  }, 600000);

  it('d12 vs d6 @150 — 32 each direction', async () => {
    const r = runPit(12, 6, 'd12', 'd6');
    expect(Math.abs(r.bias)).toBeLessThan(0.5);
  }, 600000);
});
