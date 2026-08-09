import { describe, it } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import type { MCTSTierConfig, GameState } from '../src/engine/types';

const REF_150: MCTSTierConfig = { tier: 'CUSTOM', iterations: 150, rolloutDepth: 4, ismctsSamples: 3, explorationConstant: 1.414, label: 'd4@150', description: '' };

function runGameWithFixedJump(seed: number, cTier: MCTSTierConfig, rTier: MCTSTierConfig, cAsP: boolean, maxT: number, fixedWinner: 'PLAYER'|'AI') {
  const init = createInitialState(seed);
  let s = gameReducer(init, { type: 'JUMP_BALL_RELEASE', wonBy: fixedWinner, releaseMarginMs: 100 });
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
  return { cS, rS, delta: cS - rS, winner: cS > rS ? 'C' : rS > cS ? 'R' : 'D' };
}

describe('first-mover bias isolation', () => {
  it('64 seeds fixed jump winner', async () => {
    const seeds = [1111,2222,3333,4444,5555,6666,7777,8888,9999,10101,12121,13131,14141,15151,16161,17171,18181,19191,21212,22233,23333,24444,25555,26666,27777,28888,29999,31111,32222,33344,34444,35555,36666,37777,38888,39999,41111,42222,43333,44455,45555,46666,47777,48888,49999,51111,52222,53333,54444,55566,56666,57777,58888,59999,61111,62222,63333,64444,65555,66677,67777,68888,69999,71111].slice(0,32);

    for (const fixed of ['PLAYER','AI'] as const) {
      const maxT=20;
      const games = seeds.map((seed,i)=> {
        const cAsP = i%2===0;
        return runGameWithFixedJump(seed, REF_150, REF_150, cAsP, maxT, fixed);
      });
      const totalC = games.reduce((a,g)=>a+g.cS,0);
      const totalR = games.reduce((a,g)=>a+g.rS,0);
      const delta = totalC-totalR;
      const cW = games.filter(g=>g.winner==='C').length;
      const rW = games.filter(g=>g.winner==='R').length;
      console.log(`\n  Fixed jump ${fixed} (first mover ${fixed}) 32 games mirror 150 vs 150:`);
      console.log(`    Total Chall ${totalC} - Ref ${totalR} Δ=${delta} avg ${(delta/32).toFixed(3)}  W/L/D ${cW}/${rW}/${32-cW-rW}`);
      // breakdown by challenger side
      const pChall = games.filter((_,i)=>i%2===0).reduce((a,g)=>a+g.delta,0)/16;
      const aChall = games.filter((_,i)=>i%2===1).reduce((a,g)=>a+g.delta,0)/16;
      console.log(`    P-Chall avg ${pChall.toFixed(3)}  A-Chall avg ${aChall.toFixed(3)}  (should both ~0)`);
    }
  }, 180000);
});
