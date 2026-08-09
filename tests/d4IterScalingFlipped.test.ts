/**
 * FLIPPED: d=4@Varying (Reference) vs d=4@750 (Challenger)
 * Tests if d4@750 wins as Challenger against varying iteration opponents.
 * Compares with previous test where varying iters was Challenger.
 */
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import type { MCTSTierConfig } from '../src/engine/types';

const VARYING_ITERS = [150, 300, 450, 600, 750, 900, 1050, 1200];
const DEPTH = 4;

// Challenger is ALWAYS d4@750
const CHALLENGER: MCTSTierConfig = {
  tier: 'CUSTOM', iterations: 750, rolloutDepth: DEPTH, ismctsSamples: 8,
  explorationConstant: 1.414, label: 'd4@750', description: 'Challenger (fixed)',
};

function makeRef(iters: number): MCTSTierConfig {
  return {
    tier: 'CUSTOM', iterations: iters, rolloutDepth: DEPTH,
    ismctsSamples: Math.max(1, Math.min(8, Math.round(iters / 50))),
    explorationConstant: 1.414, label: `d4@${iters}`, description: `Reference ${iters} iters`,
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

describe('FLIPPED: d=4@750 Challenger vs d=4@Varying Reference', () => {
  it('d=4@750 as Challenger against varying iteration References', () => {
    const G = 4, MT = 10, seeds = [1111, 2222, 3333, 4444];
    console.log('\n' + '═'.repeat(90));
    console.log('  FLIPPED: d=4@750 (Challenger) vs d=4@Varying (Reference)');
    console.log('═'.repeat(90));
    console.log(`  Challenger: d=4@750 (fixed) | Reference: varying iters | ${G} games | ${MT} turns\n`);

    interface CR { it: number; cW: number; rW: number; dr: number; tC: number; tR: number; d: number; aCT: number; aRT: number; wr: number; games: GR[]; }
    const res: CR[] = [];

    for (const it of VARYING_ITERS) {
      const ref = makeRef(it);
      const games: GR[] = [];
      for (let g = 0; g < G; g++) games.push(runGame(seeds[g], CHALLENGER, ref, g % 2 === 0, MT));
      const cW = games.filter(r => r.w === 'C').length;
      const rW = games.filter(r => r.w === 'R').length;
      const dr = games.filter(r => r.w === 'D').length;
      const tC = games.reduce((s, r) => s + r.cS, 0);
      const tR = games.reduce((s, r) => s + r.rS, 0);
      res.push({ it, cW, rW, dr, tC, tR, d: tC - tR, aCT: games.reduce((s, r) => s + r.cT, 0) / G, aRT: games.reduce((s, r) => s + r.rT, 0) / G, wr: cW / G, games });

      const sign = tC - tR >= 0 ? '+' : '';
      console.log(`  ┌─ d=4@750 vs d=4@${it} ─┐`);
      console.log(`  │ Score: ${tC}-${tR} (${sign}${tC - tR})  d4@750 W/L/D: ${cW}/${rW}/${dr}  WR: ${(cW / G * 100).toFixed(0)}%`);
      for (let g = 0; g < games.length; g++) {
        const r = games[g];
        console.log(`  │  G${g + 1}(${g % 2 === 0 ? 'P' : 'A'}): d4@750=${r.cS} d4@${it}=${r.rS} [${r.w}] throws=${r.cT}/${r.rT}`);
      }
      console.log(`  └${'─'.repeat(60)}┘\n`);
    }

    // Summary
    console.log('═'.repeat(90));
    console.log('  SUMMARY: d=4@750 Challenger vs d=4@Varying Reference');
    console.log('═'.repeat(90));
    console.log('  Ref Iters │ Score │ Δ    │ W/L/D   │ WR  │ Throws');
    console.log('  ──────────┼───────┼──────┼─────────┼─────┼───────');
    for (const r of res) {
      const s = r.d >= 0 ? '+' : '';
      const p = (x: string, n: number) => x.padEnd(n);
      const m = r.it === 750 ? ' ◄ MIRROR' : '';
      console.log(`  ${p(String(r.it), 9)} │ ${p(`${r.tC}-${r.tR}`, 5)} │ ${p(s + r.d, 4)} │ ${p(`${r.cW}/${r.rW}/${r.dr}`, 7)} │ ${p((r.wr * 100).toFixed(0) + '%', 3)} │ ${r.aCT.toFixed(1)}/${r.aRT.toFixed(1)}${m}`);
    }

    // Side-by-side comparison with previous (unflipped) test
    const prevDiffs: Record<number, number> = { 150: 4, 300: 0, 450: 4, 600: 1, 750: 5, 900: 6, 1050: 8, 1200: 1 };
    console.log('\n' + '═'.repeat(90));
    console.log('  CROSS-COMPARISON: Challenger Role Effect');
    console.log('═'.repeat(90));
    console.log('  Varying │ Prev: Varying=Challenger │ Now: d4@750=Challenger │ Avg Δ');
    console.log('  Iters   │ Δ (varying - d4@750)     │ Δ (d4@750 - varying)   │ (should ≈0 if symmetric)');
    console.log('  ────────┼──────────────────────────┼────────────────────────┼───────');
    for (const r of res) {
      const prev = prevDiffs[r.it] ?? '?';
      const avg = typeof prev === 'number' ? ((prev + (-r.d)) / 2).toFixed(1) : '?';
      // Note: prev = varying - d4@750, r.d = d4@750 - varying
      // If perfectly symmetric: prev = -r.d, so avg = 0
      console.log(`  ${String(r.it).padStart(7)} │ ${String(typeof prev === 'number' ? (prev >= 0 ? '+' + prev : prev) : prev).padStart(26)} │ ${String(r.d >= 0 ? '+' + r.d : r.d).padStart(22)} │ ${avg}`);
    }

    // Compute average asymmetry
    let totalAsym = 0;
    let count = 0;
    for (const r of res) {
      const prev = prevDiffs[r.it];
      if (typeof prev === 'number') {
        // prev = varying_wins_by (varying as Challenger)
        // r.d = d4@750_wins_by (d4@750 as Challenger)
        // If no role bias: prev ≈ -r.d → prev + r.d ≈ 0
        // Role bias = (prev + r.d) / 2 → positive means Challenger advantage
        const roleBias = (prev + r.d) / 2;
        totalAsym += roleBias;
        count++;
      }
    }
    if (count > 0) {
      console.log(`\n  Average Challenger role bias: +${(totalAsym / count).toFixed(1)} Δ`);
      console.log(`  (Positive = Challenger role gives advantage, 0 = perfectly symmetric)`);
    }

    console.log('\n' + '═'.repeat(90));
    expect(true).toBe(true);
  }, 600000);
});
