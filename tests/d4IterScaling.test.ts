/**
 * d=4@750 vs d=4@VARYING: Pure iteration scaling at depth 4
 * Tests whether more iterations helps when depth is held constant.
 */
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import type { MCTSTierConfig } from '../src/engine/types';

const CHALLENGER_ITERS = [150, 300, 450, 600, 750, 900, 1050, 1200];
const DEPTH = 4;

const REF: MCTSTierConfig = {
  tier: 'CUSTOM', iterations: 750, rolloutDepth: DEPTH, ismctsSamples: 8,
  explorationConstant: 1.414, label: 'd4@750', description: 'Reference',
};

function makeTier(iters: number): MCTSTierConfig {
  return {
    tier: 'CUSTOM', iterations: iters, rolloutDepth: DEPTH,
    ismctsSamples: Math.max(1, Math.min(8, Math.round(iters / 50))),
    explorationConstant: 1.414, label: `d4@${iters}`, description: `${iters} iters`,
  };
}

interface GR { cS: number; rS: number; cT: number; rT: number; w: 'C' | 'R' | 'D'; }

function runGame(seed: number, cTier: MCTSTierConfig, rTier: MCTSTierConfig, cAsP: boolean, maxT: number): GR {
  const init = createInitialState(seed);
  let s = gameReducer(init, { type: 'JUMP_BALL_RELEASE', wonBy: seed % 2 === 0 ? 'PLAYER' : 'AI', releaseMarginMs: 100 });
  s = { ...s, momentum: { PLAYER: 3, AI: 3 } };
  let cT = 0, rT = 0;
  for (let t = 1; t <= maxT; t++) {
    if (s.phase === 'MATCH_OVER') break;
    if (s.phase === 'PLAYER_PLAN') {
      const tier = cAsP ? cTier : rTier; const o = s.config.mcts;
      s = { ...s, config: { ...s.config, mcts: tier } };
      s = gameReducer(s, { type: 'RUN_AI_TURN_FOR_PLAYER' });
      s = { ...s, config: { ...s.config, mcts: o } };
    }
    if (s.phase === 'AI_TURN') {
      const tier = cAsP ? rTier : cTier; const o = s.config.mcts;
      s = { ...s, config: { ...s.config, mcts: tier } };
      s = gameReducer(s, { type: 'RUN_AI_TURN' });
      s = { ...s, config: { ...s.config, mcts: o } };
    }
    if (s.phase === 'AI_PLANNED_REVIEW') s = gameReducer(s, { type: 'START_PLAYER_TURN' });
  }
  for (const e of s.eventLog) {
    const isC = (cAsP && e.side === 'PLAYER') || (!cAsP && e.side === 'AI');
    if (e.type === 'PASS_ATTEMPTED') { if (isC) cT++; else rT++; }
  }
  const cS = cAsP ? s.score.PLAYER : s.score.AI;
  const rS = cAsP ? s.score.AI : s.score.PLAYER;
  let w: 'C' | 'R' | 'D' = 'D';
  if (cS > rS) w = 'C'; else if (rS > cS) w = 'R';
  return { cS, rS, cT, rT, w };
}

describe('d=4 Iteration Scaling: d=4@750 vs d=4@Varying', () => {
  it('maps the iteration scaling curve at depth 4', () => {
    const G = 4, MT = 10, seeds = [1111, 2222, 3333, 4444];
    console.log('\n' + '═'.repeat(90));
    console.log('  d=4 ITERATION SCALING: d=4@750 vs d=4@Varying');
    console.log('═'.repeat(90));
    console.log(`  Challenger: d=4 at varying iters | Reference: d=4@750 | ${G} games | ${MT} turns\n`);

    interface CR { it: number; cW: number; rW: number; dr: number; tC: number; tR: number; d: number; aCT: number; aRT: number; wr: number; }
    const res: CR[] = [];

    for (const it of CHALLENGER_ITERS) {
      const tier = makeTier(it);
      const games: GR[] = [];
      for (let g = 0; g < G; g++) games.push(runGame(seeds[g], tier, REF, g % 2 === 0, MT));
      const cW = games.filter(r => r.w === 'C').length;
      const rW = games.filter(r => r.w === 'R').length;
      const dr = games.filter(r => r.w === 'D').length;
      const tC = games.reduce((s, r) => s + r.cS, 0);
      const tR = games.reduce((s, r) => s + r.rS, 0);
      res.push({ it, cW, rW, dr, tC, tR, d: tC - tR, aCT: games.reduce((s, r) => s + r.cT, 0) / G, aRT: games.reduce((s, r) => s + r.rT, 0) / G, wr: cW / G });

      const sign = tC - tR >= 0 ? '+' : '';
      const lbl = it === 750 ? 'MIRROR' : it < 750 ? 'weaker' : 'stronger';
      console.log(`  ┌─ d=4@${it} vs d=4@750 (${lbl}) ─┐`);
      console.log(`  │ Score: ${tC}-${tR} (${sign}${tC - tR})  W/L/D: ${cW}/${rW}/${dr}  WR: ${(cW / G * 100).toFixed(0)}%`);
      for (let g = 0; g < games.length; g++) {
        const r = games[g];
        console.log(`  │  G${g + 1}(${g % 2 === 0 ? 'P' : 'A'}): ${r.cS}-${r.rS} [${r.w}] throws=${r.cT}/${r.rT}`);
      }
      console.log(`  └${'─'.repeat(60)}┘\n`);
    }

    console.log('═'.repeat(90));
    console.log('  SUMMARY');
    console.log('═'.repeat(90));
    console.log('  Iters │ Ratio │ Score │ Δ    │ W/L/D   │ WR  │ Throws');
    console.log('  ──────┼───────┼───────┼──────┼─────────┼─────┼───────');
    for (const r of res) {
      const s = r.d >= 0 ? '+' : '';
      const p = (x: string, n: number) => x.padEnd(n);
      const m = r.it === 750 ? ' ◄ MIRROR' : '';
      console.log(`  ${p(String(r.it), 5)} │ ${p((r.it / 750).toFixed(2) + 'x', 5)} │ ${p(`${r.tC}-${r.tR}`, 5)} │ ${p(s + r.d, 4)} │ ${p(`${r.cW}/${r.rW}/${r.dr}`, 7)} │ ${p((r.wr * 100).toFixed(0) + '%', 3)} │ ${r.aCT.toFixed(1)}/${r.aRT.toFixed(1)}${m}`);
    }

    console.log('\n  Score differential:');
    for (const r of res) {
      const bar = r.d >= 0 ? ' '.repeat(10) + '█'.repeat(Math.min(20, Math.abs(r.d) * 2)) : ' '.repeat(Math.max(0, 10 + r.d * 2)) + '░'.repeat(Math.min(10, Math.abs(r.d) * 2));
      const m = r.it === 750 ? ' ◄ mirror' : '';
      console.log(`  ${String(r.it).padStart(5)} (${(r.it / 750).toFixed(2)}x): ${r.d >= 0 ? '+' : ''}${r.d}  ${bar}${m}`);
    }

    // Scaling law
    const nonMirror = res.filter(r => r.it !== 750);
    let sLR = 0, sLR2 = 0, sLRD = 0, sD = 0;
    for (const r of nonMirror) { const l = Math.log(r.it / 750); sLR += l; sLR2 += l * l; sLRD += l * r.d; sD += r.d; }
    const n = nonMirror.length;
    const a = (n * sLRD - sLR * sD) / (n * sLR2 - sLR * sLR);
    console.log(`\n  Scaling law: Δ ≈ ${a.toFixed(2)} × ln(iter_ratio)`);
    console.log(`  Each doubling ≈ ${(a * Math.log(2)).toFixed(2)} Δ`);

    const mirror = res.find(r => r.it === 750);
    console.log(`\n  Mirror: ${mirror!.tC}-${mirror!.tR} (Δ=${mirror!.d >= 0 ? '+' : ''}${mirror!.d})`);

    console.log('\n' + '═'.repeat(90));
    expect(true).toBe(true);
  }, 600000);
});
