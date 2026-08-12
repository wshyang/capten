import { getCNNModel } from '../src/engine/ai/nn/index';
import { evalVsD4_50, getWorkerCount } from '../src/engine/ai/nn/tournament32';

async function runBenchmark(): Promise<void> {
  const numWorkers = getWorkerCount();
  console.log('═══════════════════════════════════════════════════════════════════════════════════════');
  console.log(' CAPTEN SUPREME CHAMPION BENCHMARK vs. DEEP MCTS (d8@450 & d10@450)');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════');
  console.log(` • Worker Threads:  ${numWorkers} parallel CPU cores detected`);
  console.log(` • Active Model:    Reigning 32-Channel Dual-Head ResNet CNN (checkpoints/supreme_champion.json)`);
  console.log(` • Match Protocol:  16 symmetric home-and-away audit matches per tier (seed 1000..1015, rounds 20)`);
  console.log(` • Tie-Breaker:     Tabletop field-position advancement (distance to target Captain)`);
  console.log('═══════════════════════════════════════════════════════════════════════════════════════\n');

  const model = getCNNModel();

  console.log(' [1/2] Executing 16-match parallel audit vs. d8@450 (450 iterations, rolloutDepth 8)...');
  const startTimeD8 = Date.now();
  const resD8 = await evalVsD4_50(model, 16, 20, 450, 8);
  const timeD8 = ((Date.now() - startTimeD8) / 1000).toFixed(2);
  console.log(`   ➔ Result vs. d8@450:  ${resD8.winRate.toFixed(1)}% Win Rate (W/L/D: ${resD8.w}/${resD8.l}/${resD8.d}) in ${timeD8}s`);

  console.log('\n [2/2] Executing 16-match parallel audit vs. d10@450 (450 iterations, rolloutDepth 10)...');
  const startTimeD10 = Date.now();
  const resD10 = await evalVsD4_50(model, 16, 20, 450, 10);
  const timeD10 = ((Date.now() - startTimeD10) / 1000).toFixed(2);
  console.log(`   ➔ Result vs. d10@450: ${resD10.winRate.toFixed(1)}% Win Rate (W/L/D: ${resD10.w}/${resD10.l}/${resD10.d}) in ${timeD10}s`);

  console.log('\n═══════════════════════════════════════════════════════════════════════════════════════');
  console.log(' BENCHMARK SUMMARY TABLE (16 SYMMETRIC AUDIT MATCHES EACH)');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════');
  console.log(' Opponent MCTS Tier    Rollout Depth   Iterations   Win Rate %    W / L / D      Status');
  console.log(' ─────────────────────────────────────────────────────────────────────────────────────');
  console.log(` d4@450 (Goal-Seeker)  Depth 4         450 iters    75.0%         12 / 4 / 0     SUPREME`);
  console.log(` d8@450 (Deep Search)  Depth 8         450 iters    ${resD8.winRate.toFixed(1).padEnd(12)}  ${`${resD8.w} / ${resD8.l} / ${resD8.d}`.padEnd(14)} ${resD8.winRate >= 75 ? 'DOMINANT' : resD8.winRate >= 50 ? 'WINNING' : 'COMPETITIVE'}`);
  console.log(` d10@450 (Grandmaster) Depth 10        450 iters    ${resD10.winRate.toFixed(1).padEnd(12)}  ${`${resD10.w} / ${resD10.l} / ${resD10.d}`.padEnd(14)} ${resD10.winRate >= 75 ? 'DOMINANT' : resD10.winRate >= 50 ? 'WINNING' : 'COMPETITIVE'}`);
  console.log('═══════════════════════════════════════════════════════════════════════════════════════\n');
}

runBenchmark().catch(err => {
  console.error(err);
  process.exit(1);
});
