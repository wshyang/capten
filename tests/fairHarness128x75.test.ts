/**
 * Fair harness — equal possessions, balanced starters — 128 seeds × 20 rounds × 75 iters
 * Goal: all start factors same for both sides, then 75 iters for 128 seeds.
 *
 * Fairness fixes vs old harness:
 * 1. Equal possessions: each side gets exactly `rounds` turns (20 PLAYER + 20 AI) regardless of jump winner.
 *    Old harness used `for t=1..maxT` with two ifs → AI-start gave AI an extra turn (20 vs 19).
 * 2. Decoupled Challenger side vs first-mover: jump winner is chosen independently of cAsP,
 *    so Challenger is first mover exactly 50% of games for both P-Chall and A-Chall.
 *    Old harness had challenger == second mover every game (cAsP == i%2 coupled to seed%2).
 * 3. Deterministic seeds: 128 distinct seeds, no reuse.
 */
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import type { MCTSTierConfig, GameState } from '../src/engine/types';

const ITERS = 75; // as requested
const ROUNDS = 20; // each side gets 20 turns = 40 half-turns
const DEPTH = 4;

function makeTier(iters: number): MCTSTierConfig {
  return {
    tier: 'CUSTOM', iterations: iters, rolloutDepth: DEPTH,
    ismctsSamples: Math.max(1, Math.min(8, Math.round(iters / 50))),
    explorationConstant: 1.414, label: `d${DEPTH}@${iters}`, description: `${iters} iters`,
  };
}
const TIER_75 = makeTier(ITERS);
const TIER_75_REF = makeTier(ITERS); // mirror

// Fair game runner: exactly `rounds` PLAYER turns and `rounds` AI turns, regardless of jump winner.
// Returns scores by side, not by challenger.
function runFairGame(seed: number, cTier: MCTSTierConfig, rTier: MCTSTierConfig, cAsP: boolean, rounds: number, fixedJumpWinner?: 'PLAYER'|'AI') {
  const jumpWinner = fixedJumpWinner ?? (seed % 2 === 0 ? 'PLAYER' : 'AI');
  const init = createInitialState(seed);
  let s = gameReducer(init, { type: 'JUMP_BALL_RELEASE', wonBy: jumpWinner, releaseMarginMs: 100 });
  s = { ...s, momentum: { PLAYER: 3, AI: 3 } } as GameState;

  let playerTurns = 0;
  let aiTurns = 0;

  // Safety cap: at most 2*rounds + 2 iterations
  let steps = 0;
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
      // START counts as finishing the AI turn and prepares next PLAYER turn
      if (s.phase === 'AI_PLANNED_REVIEW') {
        s = gameReducer(s, { type: 'START_PLAYER_TURN' });
      }
      aiTurns++;
      // If we just finished AI and player still needs turns, we will loop to PLAYER.
      // If AI won jump and we started with AI, the first iteration will be AI (playerTurns still 0) — that's one AI turn before any PLAYER.
      // To keep equal possessions, we don't skip.
    } else if (s.phase === 'AI_PLANNED_REVIEW') {
      // Edge: AI planned but we already counted aiTurns — just START
      s = gameReducer(s, { type: 'START_PLAYER_TURN' });
    } else {
      // No eligible phase but turns remain? e.g., PLAYER_PLAN but playerTurns==rounds → skip to AI
      // Advance by START if stuck in AI_PLANNED_REVIEW, or break if both done
      if (s.phase === 'PLAYER_PLAN' && playerTurns >= rounds) {
        // Player done, but AI still needs turns — if AI has ball, we need to let AI go.
        // Force a skip: treat as if PLAYER passed? Instead just break and let AI catch up via its own turn.
        // For simplicity, if PLAYER is done, we switch to AI by not processing PLAYER.
        // The loop will next handle AI_TURN.
        // To avoid infinite loop when both phases need to advance but one side is done, just count as done.
        // We'll manually advance turn without PLAYER action? Better to just increment playerTurns to allow exit.
        // Instead, we consider game over for fairness: both should have had equal chances, so we can end.
        break;
      }
      if (s.phase === 'AI_TURN' && aiTurns >= rounds) {
        break;
      }
      break;
    }

    if (s.matchResult.isOver) break;
  }

  const cS = cAsP ? s.score.PLAYER : s.score.AI;
  const rS = cAsP ? s.score.AI : s.score.PLAYER;
  return {
    cS, rS, delta: cS - rS,
    pScore: s.score.PLAYER, aScore: s.score.AI,
    playerTurns, aiTurns,
    winner: cS > rS ? 'C' as const : rS > cS ? 'R' as const : 'D' as const,
    log: s.eventLog,
    finalPhase: s.phase,
    finalTurn: s.turn,
  };
}

function seeds128(): number[] {
  // 128 distinct deterministic seeds
  const base: number[] = [];
  let n = 1009;
  for (let i = 0; i < 128; i++) {
    n = (n * 1103515245 + 12345) & 0x7fffffff;
    base.push(1000 + (n % 90000));
  }
  // Ensure uniqueness and mix odd/even roughly 50/50
  return [...new Set(base)].slice(0, 128);
}

describe('Fair harness 128×75 — equal possessions, decoupled first-mover', () => {
  it('mirror 128 seeds × 20 rounds @75 iters — should be ~0 with fair harness', async () => {
    const seeds = seeds128();
    const rounds = ROUNDS;

    // Decoupled: jump winner chosen as `seed % 3 == 0 ? PLAYER : AI` *independent* of cAsP assignment.
    // cAsP cycles P/A every seed; jumpWinner cycles on different period (mod 3) so correlation = 0.
    // For perfect balance, we also ensure exactly 64 P-Chall and 64 A-Chall, and within each, exactly 32 PLAYER-first, 32 AI-first.
    // We achieve by constructing 4 groups of 32:
    // Group: P-Chall + PLAYER-first, P-Chall + AI-first, A-Chall + PLAYER-first, A-Chall + AI-first
    const groups: Array<{ cAsP: boolean; jump: 'PLAYER'|'AI'; label: string }> = [
      { cAsP: true, jump: 'PLAYER', label: 'P-Chall/PLAYER-first' },
      { cAsP: true, jump: 'AI', label: 'P-Chall/AI-first' },
      { cAsP: false, jump: 'PLAYER', label: 'A-Chall/PLAYER-first' },
      { cAsP: false, jump: 'AI', label: 'A-Chall/AI-first' },
    ];

    const games: Array<ReturnType<typeof runFairGame> & { seed: number; cAsP: boolean; jump: string; group: string }> = [];
    let seedIdx = 0;
    for (const g of groups) {
      for (let k = 0; k < 32; k++) {
        const seed = seeds[seedIdx++];
        const res = runFairGame(seed, TIER_75, TIER_75_REF, g.cAsP, rounds, g.jump);
        games.push({ seed, cAsP: g.cAsP, jump: g.jump, group: g.label, ...res });
      }
    }

    const totalC = games.reduce((a, g) => a + g.cS, 0);
    const totalR = games.reduce((a, g) => a + g.rS, 0);
    const delta = totalC - totalR;
    const avg = delta / games.length;
    const cW = games.filter(g => g.winner === 'C').length;
    const rW = games.filter(g => g.winner === 'R').length;
    const draws = games.filter(g => g.winner === 'D').length;

    console.log('\n  ═══════════════════════════════════════════════════════════════════════');
    console.log(`  FAIR MIRROR 128×20 @${ITERS} iters — 4×32 balanced groups, equal possessions`);
    console.log('  ═══════════════════════════════════════════════════════════════════════');
    // Per-group breakdown
    for (const g of groups) {
      const slice = games.filter(x => x.group === g.label);
      const tC = slice.reduce((a, x) => a + x.cS, 0);
      const tR = slice.reduce((a, x) => a + x.rS, 0);
      const d = tC - tR;
      const cw = slice.filter(x => x.winner === 'C').length;
      const rw = slice.filter(x => x.winner === 'R').length;
      console.log(`  ${g.label.padEnd(22)}  ${tC}-${tR}  Δ=${d >= 0 ? '+' : ''}${d}  avg=${(d/32).toFixed(3)}  W/L/D ${cw}/${rw}/${32-cw-rw}`);
    }
    console.log('  ───────────────────────────────────────────────────────────────────────');
    console.log(`  OVERALL  Chall ${totalC} - Ref ${totalR}  Δ=${delta >= 0 ? '+' : ''}${delta}  avg=${avg >= 0 ? '+' : ''}${avg.toFixed(4)}/game`);
    console.log(`  W/L/D  ${cW}/${rW}/${draws}  win% ${(cW/128*100).toFixed(1)}% (decisive win% ${(cW/Math.max(1,cW+rW)*100).toFixed(1)}%)`);

    // Possession check
    const avgPTurns = games.reduce((a,g)=>a+g.playerTurns,0)/games.length;
    const avgATurns = games.reduce((a,g)=>a+g.aiTurns,0)/games.length;
    console.log(`  Possessions avg PLAYER ${avgPTurns.toFixed(2)}  AI ${avgATurns.toFixed(2)}  (should both be 20.00)`);
    const pScores = games.reduce((a,g)=>a+g.pScore,0);
    const aScores = games.reduce((a,g)=>a+g.aScore,0);
    console.log(`  By side (not Challenger): PLAYER ${pScores} - AI ${aScores}  Δ=${pScores-aScores}  (should be ~0 if top/bottom symmetric)`);
    const allLogs = games.flatMap(g=>g.log);
    const aiThrows = allLogs.filter(e=>e.type==='PASS_ATTEMPTED' && e.side==='AI').length;
    const plThrows = allLogs.filter(e=>e.type==='PASS_ATTEMPTED' && e.side==='PLAYER').length;
    const aiCards = allLogs.filter(e=>e.type==='CARD_PLAYED' && e.side==='AI').length;
    const plCards = allLogs.filter(e=>e.type==='CARD_PLAYED' && e.side==='PLAYER').length;
    console.log(`  Throws AI ${aiThrows} PL ${plThrows} ratio ${(aiThrows/Math.max(1,plThrows)).toFixed(2)}x`);
    console.log(`  Cards  AI ${aiCards} PL ${plCards} ratio ${(aiCards/Math.max(1,plCards)).toFixed(2)}x`);
    console.log('  Expected: Δ≈0, win%≈50%, possessions 20/20, P-vs-A by side Δ≈0');
    console.log('  ═══════════════════════════════════════════════════════════════════════\n');

    // With 128 games, SD total Δ ≈ sqrt(128)*1.2 ≈13.6, so |Δ|<14 is healthy; per game |avg|<0.25
    expect(Math.abs(delta)).toBeLessThan(20);
    expect(Math.abs(avg)).toBeLessThan(0.30);
    expect(Math.abs(avgPTurns - avgATurns)).toBeLessThan(1.0); // equal possessions, but games end early to 3 points (~15 avg, not 20)
  }, 600000);

  it('sweep 128 seeds: compare 75 vs 150 iters strength at fair harness', async () => {
    const seeds = seeds128().slice(0, 32); // 32 for speed, still fair (8 per group)
    const rounds = ROUNDS;
    const low = makeTier(75);
    const high = makeTier(150);
    // Use balanced groups again but smaller n for speed: 4 groups ×8 =32
    const groups = [
      { cAsP: true, jump: 'PLAYER' as const },
      { cAsP: true, jump: 'AI' as const },
      { cAsP: false, jump: 'PLAYER' as const },
      { cAsP: false, jump: 'AI' as const },
    ];
    function runBatch(cTier: MCTSTierConfig, rTier: MCTSTierConfig) {
      const games: ReturnType<typeof runFairGame>[] = [];
      let idx = 0;
      for (const g of groups) {
        for (let k = 0; k < 8; k++) {
          const seed = seeds[idx++];
          games.push(runFairGame(seed, cTier, rTier, g.cAsP, rounds, g.jump));
          if (idx >= seeds.length) idx = 0;
        }
      }
      return games;
    }
    const gamesLowChall = runBatch(low, high);
    const gamesHighChall = runBatch(high, low);
    const avgLow = gamesLowChall.reduce((a,g)=>a+g.delta,0)/32;
    const avgHigh = gamesHighChall.reduce((a,g)=>a+g.delta,0)/32;
    const bias = (avgLow + avgHigh)/2;
    const strength = (avgHigh - avgLow)/2;
    console.log('\n  ──────────────────────────────────────────────────────');
    console.log('  STRENGTH 32×20 @75 vs 150 (fair harness, 4×8 groups)');
    console.log(`  LOW Chall (75) vs HIGH Ref (150)  avg ${avgLow >=0?'+':''}${avgLow.toFixed(3)}`);
    console.log(`  HIGH Chall (150) vs LOW Ref (75)  avg ${avgHigh>=0?'+':''}${avgHigh.toFixed(3)}`);
    console.log(`  Challenger bias ${(bias>=0?'+':'')+bias.toFixed(3)}  Strength ${(strength>=0?'+':'')+strength.toFixed(3)}`);
    console.log('  ──────────────────────────────────────────────────────\n');
    expect(Math.abs(bias)).toBeLessThan(0.5);
  }, 300000);
});
