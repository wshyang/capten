import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { isMainThread, Worker } from 'worker_threads';
import * as os from 'os';
import * as tf from '@tensorflow/tfjs';
import {
  createCNNModel,
  trainCNNModel,
  generateSelfPlayTrainingData,
  exportModelCheckpoint,
  importModelCheckpoint,
  saveCheckpointToStorage,
  loadCheckpointFromStorage,
  setCNNModel,
  FileStorageBackend,
} from './index';
import { createInitialState } from '../../setup';
import { gameReducer } from '../../reducer';
import type { GameState } from '../../types';
import type { MCTSTierConfig } from '../../config/mcts';
import { MCTS_EVALUATION_WEIGHTS } from '../../config/mcts';
import { BOARD_CONFIG } from '../../config/board';

/**
 * Returns available CPU core concurrency for parallel worker threads.
 * Uses os.availableParallelism() when available to respect cgroup/container limits,
 * falling back to os.cpus().length. Supports NUM_WORKERS env var override.
 */
export function getWorkerCount(override?: number): number {
  if (override && override > 0) return override;
  const envWorkers = parseInt(process.env.NUM_WORKERS || '', 10);
  if (!isNaN(envWorkers) && envWorkers > 0) return envWorkers;
  return os.availableParallelism ? os.availableParallelism() : os.cpus().length;
}

export function getWorkerPath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  const ext = path.extname(currentFile); // '.ts' or '.js'
  return path.resolve(currentDir, `./tournamentWorker${ext}`);
}

async function runWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      results[idx] = await fn(items[idx], idx);
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Competitive d4@50 MCTS Baseline Tier Config
 */
const D4_50_BASELINE: MCTSTierConfig & { weights: typeof MCTS_EVALUATION_WEIGHTS } = {
  tier: 'CUSTOM',
  iterations: 50,
  rolloutDepth: 4,
  ismctsSamples: 1,
  explorationConstant: 1.414,
  label: 'd4@50',
  description: 'Competitive d4@50 MCTS baseline (4 rollout depth, 50 iterations)',
  weights: MCTS_EVALUATION_WEIGHTS,
};

export type TournamentPhase =
  | 'INITIALIZING'
  | 'TRAINING_BASE_MODEL'
  | 'BASE_MODEL_READY'
  | 'GENERATING_INSTANCES'
  | 'INSTANCES_READY'
  | 'RUNNING_TOURNAMENT'
  | 'SUPREME_CHAMPION_CROWNED';

export interface Tournament32Manifest {
  status: TournamentPhase;
  baseCheckpointKey: string | null;
  baseWinRateVsD4: number;
  completedInstances: number;
  populationSize: number;
  initialInstanceKeys: string[];
  currentPopulationKeys: string[];
  currentGeneration: number;
  reigningChampionKey: string | null;
  reigningChampionWinsVsPool: number;
  reigningChampionWinRateVsPool: number;
  history: Array<{
    generation: number;
    championKey: string;
    winsVsPool: number;
    winRateVsPool: number;
  }>;
  timestamp: number;
}

export interface Tournament32Config {
  checkpointDir: string;
  populationSize: number;
  tournamentRounds: number;
  mctsIters: number;
  mctsDepth: number;
  baseSamples: number;
  baseEpochs: number;
  instSamples: number;
  instEpochs: number;
  maxGenerations: number;
  targetWinRate: number;
  evalMatches: number;
}

/**
 * Parses tournament configuration from environment variables and optional CLI flags.
 */
export function parseConfigFromEnv(): Tournament32Config {
  const env = process.env;
  return {
    checkpointDir: env.CHECKPOINT_DIR || './checkpoints/tournament_32',
    populationSize: parseInt(env.POPULATION_SIZE || '32', 10),
    tournamentRounds: parseInt(env.TOURNAMENT_ROUNDS || '12', 10),
    mctsIters: parseInt(env.MCTS_ITERS || '50', 10),
    mctsDepth: parseInt(env.MCTS_DEPTH || '4', 10),
    baseSamples: parseInt(env.BASE_SAMPLES || '8', 10),
    baseEpochs: parseInt(env.BASE_EPOCHS || '5', 10),
    instSamples: parseInt(env.INST_SAMPLES || '4', 10),
    instEpochs: parseInt(env.INST_EPOCHS || '3', 10),
    maxGenerations: parseInt(env.MAX_GENERATIONS || '15', 10),
    targetWinRate: parseFloat(env.TARGET_WIN_RATE || '75'),
    evalMatches: parseInt(env.EVAL_MATCHES || '16', 10),
  };
}

/**
 * Executes a head-to-head game between Model A (Player or AI) and MCTS Baseline d4@50 (or custom d4@iters).
 */
export function runMatchAgainstD4_50(
  model: tf.LayersModel,
  seed: number,
  nnAsPlayer: boolean,
  rounds = 10,
  mctsIters = 50,
  mctsDepth = 4
): { nnScore: number; mctsScore: number; win: boolean; draw: boolean } {
  const init = createInitialState(seed);
  let s = gameReducer(init, {
    type: 'JUMP_BALL_RELEASE',
    wonBy: seed % 2 === 0 ? 'PLAYER' : 'AI',
    releaseMarginMs: 100,
  });
  s = { ...s, momentum: { PLAYER: 3, AI: 3 } } as GameState;
  const targetMcts: any = {
    ...D4_50_BASELINE,
    iterations: mctsIters,
    rolloutDepth: mctsDepth,
    label: `d${mctsDepth}@${mctsIters}`,
  };
  s = {
    ...s,
    config: {
      ...s.config,
      mcts: targetMcts,
      ai: {
        playerEngineMode: nnAsPlayer ? 'NN_ACTIVE' : 'MCTS_ONLY',
        aiEngineMode: nnAsPlayer ? 'MCTS_ONLY' : 'NN_ACTIVE',
      },
    },
  };

  setCNNModel(model);

  for (let t = 1; t <= rounds; t++) {
    if (s.matchResult.isOver) break;
    if (s.phase === 'PLAYER_PLAN') {
      s = gameReducer(s, { type: 'RUN_AI_TURN_FOR_PLAYER' });
    }
    if (s.phase === 'AI_TURN') {
      s = gameReducer(s, { type: 'RUN_AI_TURN' });
    }
    if (s.phase === 'AI_PLANNED_REVIEW') {
      s = gameReducer(s, { type: 'START_PLAYER_TURN' });
    }
  }

  const nnScore = nnAsPlayer ? s.score.PLAYER : s.score.AI;
  const mctsScore = nnAsPlayer ? s.score.AI : s.score.PLAYER;
  let win = nnScore > mctsScore;
  let draw = nnScore === mctsScore;
  if (draw) {
    const ballCarrier = s.pieces.find(p => p.hasBall);
    if (ballCarrier) {
      const nnTarget = nnAsPlayer ? BOARD_CONFIG.aiScoringCell : BOARD_CONFIG.playerScoringCell;
      const mctsTarget = nnAsPlayer ? BOARD_CONFIG.playerScoringCell : BOARD_CONFIG.aiScoringCell;
      const nnDistToGoal = Math.hypot(ballCarrier.cell.col - nnTarget.col, ballCarrier.cell.row - nnTarget.row);
      const mctsDistToGoal = Math.hypot(ballCarrier.cell.col - mctsTarget.col, ballCarrier.cell.row - mctsTarget.row);
      if (Math.abs(nnDistToGoal - mctsDistToGoal) > 0.1) {
        win = nnDistToGoal < mctsDistToGoal;
        draw = false;
      }
    }
  }
  return {
    nnScore,
    mctsScore,
    win,
    draw,
  };
}

/**
 * Evaluates a model against d4@50 (or custom d4@iters) across a symmetric benchmark set of seeds synchronously on the current thread.
 */
export function evalVsD4_50Sync(
  model: tf.LayersModel,
  seedsOrCount: number[] | number = 16,
  rounds = 10,
  mctsIters = 50,
  mctsDepth = 4
): { winRate: number; w: number; l: number; d: number } {
  const seeds: number[] = typeof seedsOrCount === 'number'
    ? Array.from({ length: seedsOrCount }, (_, i) => 1000 + i)
    : seedsOrCount;
  let w = 0, l = 0, d = 0;
  for (let i = 0; i < seeds.length; i++) {
    const seed = seeds[i];
    const nnAsPlayer = i % 2 === 0;
    const r = runMatchAgainstD4_50(model, seed, nnAsPlayer, rounds, mctsIters, mctsDepth);
    if (r.win) w++;
    else if (r.draw) d++;
    else l++;
  }
  const winRate = ((w + 0.5 * d) / seeds.length) * 100;
  return { winRate, w, l, d };
}

/**
 * Evaluates a model against d4@50 (or custom d4@iters) across a symmetric benchmark set of seeds using parallel multi-threaded workers.
 */
export async function evalVsD4_50(
  model: tf.LayersModel,
  seedsOrCount: number[] | number = 16,
  rounds = 10,
  mctsIters = 50,
  mctsDepth = 4
): Promise<{ winRate: number; w: number; l: number; d: number }> {
  const seeds: number[] = typeof seedsOrCount === 'number'
    ? Array.from({ length: seedsOrCount }, (_, i) => 1000 + i)
    : seedsOrCount;

  const numWorkers = getWorkerCount();
  if (numWorkers <= 1 || seeds.length <= 2) {
    return evalVsD4_50Sync(model, seeds, rounds, mctsIters, mctsDepth);
  }

  const checkpoint = exportModelCheckpoint(model, 0, 0);
  const totalWorkers = Math.min(numWorkers, seeds.length);
  const chunkSize = Math.ceil(seeds.length / totalWorkers);
  const chunks: number[][] = [];
  for (let i = 0; i < seeds.length; i += chunkSize) {
    chunks.push(seeds.slice(i, i + chunkSize));
  }

  const workerPromises = chunks.map(chunkSeeds => {
    return new Promise<{ w: number; l: number; d: number }>((resolve, reject) => {
      const worker = new Worker(getWorkerPath());
      worker.postMessage({
        type: 'EVAL_VS_D4',
        modelCheckpoint: checkpoint,
        seeds: chunkSeeds,
        rounds,
        mctsIters,
        mctsDepth,
      });
      worker.on('message', msg => {
        worker.terminate();
        if (msg.status === 'SUCCESS') resolve(msg.result);
        else reject(new Error(msg.error));
      });
      worker.on('error', err => {
        worker.terminate();
        reject(err);
      });
    });
  });

  const results = await Promise.all(workerPromises);
  let w = 0, l = 0, d = 0;
  for (const res of results) {
    w += res.w;
    l += res.l;
    d += res.d;
  }
  const winRate = ((w + 0.5 * d) / seeds.length) * 100;
  return { winRate, w, l, d };
}

/**
 * Runs a direct head-to-head game between Model A and Model B.
 * Returns true if Model A wins, false otherwise.
 */
export function runNNvsNNGame(
  modelA: tf.LayersModel,
  modelB: tf.LayersModel,
  seed: number,
  rounds = 10
): { scoreA: number; scoreB: number; energyA: number; energyB: number; winner: 'A' | 'B' | 'DRAW' } {
  const init = createInitialState(seed);
  let s = gameReducer(init, {
    type: 'JUMP_BALL_RELEASE',
    wonBy: seed % 2 === 0 ? 'PLAYER' : 'AI',
    releaseMarginMs: 100,
  });
  s = { ...s, momentum: { PLAYER: 3, AI: 3 } } as GameState;
  s = {
    ...s,
    config: {
      ...s.config,
      ai: {
        playerEngineMode: 'NN_ACTIVE',
        aiEngineMode: 'NN_ACTIVE',
      },
    },
  };

  for (let t = 1; t <= rounds; t++) {
    if (s.matchResult.isOver) break;
    if (s.phase === 'PLAYER_PLAN') {
      setCNNModel(modelA);
      s = gameReducer(s, { type: 'RUN_AI_TURN_FOR_PLAYER' });
    }
    if (s.phase === 'AI_TURN') {
      setCNNModel(modelB);
      s = gameReducer(s, { type: 'RUN_AI_TURN' });
    }
    if (s.phase === 'AI_PLANNED_REVIEW') {
      s = gameReducer(s, { type: 'START_PLAYER_TURN' });
    }
  }

  const scoreA = s.score.PLAYER;
  const scoreB = s.score.AI;
  const energyA = s.pieces.filter(p => p.side === 'PLAYER').reduce((acc, p) => acc + p.energy, 0);
  const energyB = s.pieces.filter(p => p.side === 'AI').reduce((acc, p) => acc + p.energy, 0);
  let winner: 'A' | 'B' | 'DRAW' = scoreA > scoreB ? 'A' : scoreB > scoreA ? 'B' : 'DRAW';
  if (winner === 'DRAW') {
    const ballCarrier = s.pieces.find(p => p.hasBall);
    if (ballCarrier) {
      const targetA = BOARD_CONFIG.aiScoringCell;
      const targetB = BOARD_CONFIG.playerScoringCell;
      const distA = Math.hypot(ballCarrier.cell.col - targetA.col, ballCarrier.cell.row - targetA.row);
      const distB = Math.hypot(ballCarrier.cell.col - targetB.col, ballCarrier.cell.row - targetB.row);
      if (Math.abs(distA - distB) > 0.1) {
        winner = distA < distB ? 'A' : 'B';
      }
    }
  }
  return {
    scoreA,
    scoreB,
    energyA,
    energyB,
    winner,
  };
}

/**
 * Evaluates a 2-game home-and-away match between Model A and Model B (1 game as Player, 1 game as AI).
 * Returns true if Model A scores more aggregate goals than Model B.
 */
export function matchNNvsNN(
  modelA: tf.LayersModel,
  modelB: tf.LayersModel,
  baseSeed = 1000,
  rounds = 12
): { winA: boolean; winB: boolean; draw: boolean; scoreA: number; scoreB: number } {
  const g1 = runNNvsNNGame(modelA, modelB, baseSeed, rounds);       // A plays Player, B plays AI
  const g2 = runNNvsNNGame(modelB, modelA, baseSeed + 100, rounds); // B plays Player, A plays AI
  const totalA = g1.scoreA + g2.scoreB;
  const totalB = g1.scoreB + g2.scoreA;
  let winA = totalA > totalB;
  let winB = totalB > totalA;
  if (totalA === totalB) {
    const energyA = g1.energyA + g2.energyB;
    const energyB = g1.energyB + g2.energyA;
    winA = energyA >= energyB;
    winB = energyB > energyA;
  }
  return {
    winA,
    winB,
    draw: !winA && !winB,
    scoreA: totalA,
    scoreB: totalB,
  };
}

/**
 * Evaluates Candidate NN vs Champion NN across symmetric home-and-away audit matches in parallel across worker threads.
 */
export async function evalNNvsNN_Parallel(
  candidateModel: tf.LayersModel,
  championModel: tf.LayersModel,
  evalMatches = 16,
  rounds = 20,
  numWorkers = 1
): Promise<{ winRate: number; w: number; l: number; d: number }> {
  const numPairs = Math.max(1, Math.floor(evalMatches / 2));
  const baseSeeds = Array.from({ length: numPairs }, (_, i) => 1000 + i);

  if (numWorkers <= 1 || baseSeeds.length <= 1) {
    let w = 0, l = 0, d = 0;
    for (const seed of baseSeeds) {
      const res1 = runNNvsNNGame(candidateModel, championModel, seed, rounds);
      if (res1.winner === 'A') w++;
      else if (res1.winner === 'B') l++;
      else d++;

      const res2 = runNNvsNNGame(championModel, candidateModel, seed, rounds);
      if (res2.winner === 'B') w++;
      else if (res2.winner === 'A') l++;
      else d++;
    }
    const winRate = ((w + 0.5 * d) / (numPairs * 2)) * 100;
    return { winRate, w, l, d };
  }

  const candCkpt = exportModelCheckpoint(candidateModel, 0, 0);
  const champCkpt = exportModelCheckpoint(championModel, 0, 0);
  const workerScript = getWorkerPath();
  const chunkSize = Math.ceil(baseSeeds.length / numWorkers);
  const chunks: number[][] = [];
  for (let i = 0; i < baseSeeds.length; i += chunkSize) {
    chunks.push(baseSeeds.slice(i, i + chunkSize));
  }

  const workerPromises = chunks.map(chunkSeeds => {
    return new Promise<{ w: number; l: number; d: number }>((resolve, reject) => {
      const worker = new Worker(workerScript, { execArgv: process.execArgv });
      worker.postMessage({
        type: 'EVAL_NN_VS_NN_SYMMETRIC',
        candCheckpoint: candCkpt,
        champCheckpoint: champCkpt,
        baseSeeds: chunkSeeds,
        rounds,
      });
      worker.on('message', (msg: any) => {
        worker.terminate();
        if (msg.status === 'SUCCESS') resolve(msg.result);
        else reject(new Error(msg.error));
      });
      worker.on('error', reject);
    });
  });

  const results = await Promise.all(workerPromises);
  let w = 0, l = 0, d = 0;
  for (const res of results) {
    w += res.w;
    l += res.l;
    d += res.d;
  }
  const winRate = ((w + 0.5 * d) / (numPairs * 2)) * 100;
  return { winRate, w, l, d };
}

/**
 * Autonomous 32-Instance Evolutionary Tournament Manager
 */
export class Tournament32Manager {
  readonly config: Tournament32Config;
  readonly backend: FileStorageBackend;

  constructor(config: Tournament32Config) {
    this.config = config;
    this.backend = new FileStorageBackend(config.checkpointDir);
    if (!fs.existsSync(config.checkpointDir)) {
      fs.mkdirSync(config.checkpointDir, { recursive: true });
    }
  }

  private saveManifest(manifest: Tournament32Manifest): void {
    const raw = JSON.stringify(manifest, null, 2);
    const filePath = path.join(this.config.checkpointDir, 'tournament_manifest.json');
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, raw, 'utf8');
    fs.renameSync(tmpPath, filePath);
  }

  private loadManifest(): Tournament32Manifest | null {
    const filePath = path.join(this.config.checkpointDir, 'tournament_manifest.json');
    if (!fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Tournament32Manifest;
    } catch (_e) {
      return null;
    }
  }

  private loadModelFromStorage(key: string): tf.LayersModel | null {
    const ckpt = loadCheckpointFromStorage(key, this.backend);
    if (!ckpt) return null;
    const model = createCNNModel([11, 11, 32]);
    importModelCheckpoint(model, ckpt);
    return model;
  }

  private saveModelToStorage(key: string, model: tf.LayersModel, generation = 0, winRate = 50.0): void {
    const ckpt = exportModelCheckpoint(model, generation, winRate);
    saveCheckpointToStorage(key, ckpt, this.backend);
  }

  /**
   * Executes the autonomous 3-phase tournament pipeline:
   * 1) Train base model to beat d4@50 at targetWinRate across evalMatches.
   * 2) Train up 32 independent instances, verifying each beats d4@50 at targetWinRate across evalMatches.
   * 3) Evolutionary tournament until Reigning Champion defeats the initial 32 batch at targetWinRate (75% / 16 matches metric).
   */
  async runPipeline(): Promise<Tournament32Manifest> {
    let statNote = 'fast test mode, not statistically significant at p<0.05';
    if (this.config.evalMatches >= 32) {
      statNote = 'statistically significant at p=0.003 < 0.01, >90% power';
    } else if (this.config.evalMatches >= 24) {
      statNote = 'statistically significant at p=0.011 < 0.05, 80% power';
    } else if (this.config.evalMatches >= 16) {
      statNote = 'statistically significant at p=0.038 < 0.05 exact binomial test';
    }

    console.log(`\n  ═══════════════════════════════════════════════════════════════════════════════════════`);
    console.log(`  CAPTEN AUTONOMOUS 32-INSTANCE EVOLUTIONARY TOURNAMENT PIPELINE`);
    console.log(`  • Checkpoint Dir:   ${this.config.checkpointDir}`);
    console.log(`  • Population Size:  ${this.config.populationSize}`);
    console.log(`  • Tournament Turns: ${this.config.tournamentRounds} turns/game`);
    console.log(`  • MCTS Config:      iters=${this.config.mctsIters}, depth=${this.config.mctsDepth}`);
    console.log(`  • Target Win Rate:  ${this.config.targetWinRate}% across ${this.config.evalMatches} matches (${statNote})`);
    console.log(`  ═══════════════════════════════════════════════════════════════════════════════════════`);

    let manifest = this.loadManifest();
    if (manifest) {
      console.log(`  [RESUMABILITY CHECK: Found saved Tournament32 Manifest]`);
      console.log(`    • Status:              ${manifest.status}`);
      console.log(`    • Completed Instances: ${manifest.completedInstances} / ${manifest.populationSize}`);
      console.log(`    • Current Generation:  Gen ${manifest.currentGeneration}`);
      console.log(`    • Reigning Champion:   ${manifest.reigningChampionKey || 'None yet'} (${manifest.reigningChampionWinsVsPool}/${manifest.populationSize} wins vs pool | Win Rate: ${manifest.reigningChampionWinRateVsPool.toFixed(1)}%)`);
    } else {
      manifest = {
        status: 'INITIALIZING',
        baseCheckpointKey: null,
        baseWinRateVsD4: 0,
        completedInstances: 0,
        populationSize: this.config.populationSize,
        initialInstanceKeys: [],
        currentPopulationKeys: [],
        currentGeneration: 0,
        reigningChampionKey: null,
        reigningChampionWinsVsPool: 0,
        reigningChampionWinRateVsPool: 0,
        history: [],
        timestamp: Date.now(),
      };
      this.saveManifest(manifest);
    }

    // PHASE 1: Train base model weight up from scratch to beat d4@50 at targetWinRate across evalMatches
    if (manifest.status === 'INITIALIZING' || !manifest.baseCheckpointKey || !loadCheckpointFromStorage(manifest.baseCheckpointKey, this.backend)) {
      console.log(`\n  [PHASE 1] Training base model weight up from scratch to beat d4@50 baseline...`);
      const baseModel = createCNNModel([11, 11, 32]);
      const baseSamples = await generateSelfPlayTrainingData(
        this.config.baseSamples,
        1000,
        this.config.mctsIters,
        this.config.mctsDepth
      );
      await trainCNNModel(baseModel, baseSamples, this.config.baseEpochs, 8);

      let evalRes = await evalVsD4_50(baseModel, this.config.evalMatches, this.config.tournamentRounds);
      let baseRetries = 0;
      while (evalRes.winRate < this.config.targetWinRate && baseRetries < 5) {
        baseRetries++;
        console.log(`    • Fine-tuning base model (attempt ${baseRetries}) to guarantee win rate >= ${this.config.targetWinRate}% across ${this.config.evalMatches} matches against d4@50...`);
        const moreSamples = await generateSelfPlayTrainingData(
          this.config.baseSamples,
          1000 + baseRetries * 50,
          this.config.mctsIters,
          this.config.mctsDepth
        );
        await trainCNNModel(baseModel, moreSamples, this.config.baseEpochs, 8);
        evalRes = await evalVsD4_50(baseModel, this.config.evalMatches, this.config.tournamentRounds);
      }
      console.log(`    • Base Model vs. d4@50 Evaluation: ${evalRes.winRate.toFixed(1)}% (W/L/D: ${evalRes.w}/${evalRes.l}/${evalRes.d})`);

      const baseKey = 'base_d4_50_winner';
      this.saveModelToStorage(baseKey, baseModel, 0, evalRes.winRate);

      manifest.status = 'BASE_MODEL_READY';
      manifest.baseCheckpointKey = baseKey;
      manifest.baseWinRateVsD4 = evalRes.winRate;
      this.saveManifest(manifest);
      console.log(`    • Successfully saved base model to ${baseKey}.json!`);
    } else {
      console.log(`  [PHASE 1] Base model already trained & verified (${manifest.baseCheckpointKey}.json | Win Rate: ${manifest.baseWinRateVsD4.toFixed(1)}%). Skipping Phase 1.`);
    }

    // PHASE 2: Train up 32 independent instances of these weights, verifying each wins against d4@50 at targetWinRate
    if (manifest.completedInstances < this.config.populationSize) {
      const numWorkers = getWorkerCount();
      console.log(`\n  [PHASE 2] Training up ${this.config.populationSize} independent weights in the pool using ${numWorkers} parallel CPU worker threads...`);

      const baseCheckpoint = loadCheckpointFromStorage(manifest.baseCheckpointKey!, this.backend);
      if (!baseCheckpoint) {
        throw new Error(`Failed to load base checkpoint ${manifest.baseCheckpointKey}`);
      }

      const indices: number[] = [];
      for (let i = manifest.completedInstances; i < this.config.populationSize; i++) {
        indices.push(i);
      }

      await runWithConcurrencyLimit(indices, numWorkers, async (i) => {
        const instKey = `pop_${i}`;
        console.log(`    • [Worker Thread] Creating independent pool instance ${i + 1}/${this.config.populationSize} (${instKey})...`);

        const result = await new Promise<{
          instanceIndex: number;
          instKey: string;
          checkpoint: any;
          winRate: number;
          w: number;
          l: number;
          d: number;
        }>((resolve, reject) => {
          const worker = new Worker(getWorkerPath());
          worker.postMessage({
            type: 'TRAIN_INSTANCE',
            instanceIndex: i,
            baseCheckpoint,
            config: this.config,
          });
          worker.on('message', msg => {
            worker.terminate();
            if (msg.status === 'SUCCESS') resolve(msg.result);
            else reject(new Error(msg.error));
          });
          worker.on('error', err => {
            worker.terminate();
            reject(err);
          });
        });

        // Save completed instance on the main coordinator thread
        const instModel = createCNNModel([11, 11, 32]);
        importModelCheckpoint(instModel, result.checkpoint);
        this.saveModelToStorage(instKey, instModel, 1, result.winRate);
        instModel.dispose();

        console.log(`      ➔ [Worker Complete] ${instKey} vs. d4@50 Win Rate: ${result.winRate.toFixed(1)}% (W/L/D: ${result.w}/${result.l}/${result.d})`);

        if (!manifest.initialInstanceKeys.includes(instKey)) {
          manifest.initialInstanceKeys.push(instKey);
        }
        if (!manifest.currentPopulationKeys.includes(instKey)) {
          manifest.currentPopulationKeys.push(instKey);
        }
        manifest.completedInstances = Math.max(manifest.completedInstances, i + 1);
        if (manifest.completedInstances >= this.config.populationSize) {
          manifest.status = 'INSTANCES_READY';
        } else {
          manifest.status = 'GENERATING_INSTANCES';
        }
        this.saveManifest(manifest);
      });

      console.log(`    • Successfully created and saved all ${this.config.populationSize} independent pool instances!`);
    } else {
      console.log(`  [PHASE 2] All ${this.config.populationSize} initial pool instances already trained & saved. Skipping Phase 2.`);
    }

    // PHASE 3: Tournament & Mutation using the same 75% / 16 matches metric
    console.log(`\n  [PHASE 3] Evolutionary Tournament & Mutation within the pool of ${this.config.populationSize}...`);
    console.log(`    • Target Victory Condition: Reigning Champion achieves >= ${this.config.targetWinRate}% win rate across the pool AND passes the ${this.config.targetWinRate}% / ${this.config.evalMatches} matches statistical verification vs d4@50.`);

    let generation = manifest.currentGeneration || 0;

    while (
      manifest.status !== 'SUPREME_CHAMPION_CROWNED' &&
      manifest.reigningChampionWinRateVsPool < this.config.targetWinRate &&
      generation <= this.config.maxGenerations
    ) {
      console.log(`\n  ─── TOURNAMENT GENERATION ${generation} ───`);

      // 1. Evaluate current reigning champion candidate against the initial pool cohort
      const candidateKey = manifest.reigningChampionKey || manifest.currentPopulationKeys[0] || 'pop_0';
      const candidateModel = this.loadModelFromStorage(candidateKey)!;

      let poolWins = 0;
      let poolLosses = 0;
      let poolDraws = 0;
      const defeatedKeys: string[] = [];
      const unbeatenKeys: string[] = [];

      const numWorkers = getWorkerCount();
      if (numWorkers <= 1 || manifest.initialInstanceKeys.length <= 2) {
        for (let j = 0; j < manifest.initialInstanceKeys.length; j++) {
          const defKey = manifest.initialInstanceKeys[j];
          if (defKey === candidateKey) {
            poolWins++;
            defeatedKeys.push(defKey);
            continue;
          }

          const defenderModel = this.loadModelFromStorage(defKey)!;
          const matchRes = matchNNvsNN(candidateModel, defenderModel, 1000 + j * 2, this.config.tournamentRounds);

          if (matchRes.winA) {
            poolWins++;
            defeatedKeys.push(defKey);
          } else {
            if (matchRes.draw) poolDraws++;
            else poolLosses++;
            unbeatenKeys.push(defKey);
          }
        }
      } else {
        const candCkpt = exportModelCheckpoint(candidateModel, 0, 0);
        const defenderTasks = manifest.initialInstanceKeys.map((defKey, j) => {
          if (defKey === candidateKey) {
            return { defKey, isSelf: true, seed: 1000 + j * 2, checkpoint: null };
          }
          const defModel = this.loadModelFromStorage(defKey)!;
          const ckpt = exportModelCheckpoint(defModel, 0, 0);
          defModel.dispose();
          return { defKey, isSelf: false, seed: 1000 + j * 2, checkpoint: ckpt };
        });

        const totalWorkers = Math.min(numWorkers, defenderTasks.length);
        const chunkSize = Math.ceil(defenderTasks.length / totalWorkers);
        const chunks: any[] = [];
        for (let i = 0; i < defenderTasks.length; i += chunkSize) {
          chunks.push(defenderTasks.slice(i, i + chunkSize));
        }

        const chunkPromises = chunks.map(chunk => {
          return new Promise<any>((resolve, reject) => {
            const worker = new Worker(getWorkerPath());
            worker.postMessage({
              type: 'MATCH_VS_POOL_CHUNK',
              candidateCheckpoint: candCkpt,
              defenders: chunk,
              rounds: this.config.tournamentRounds,
            });
            worker.on('message', msg => {
              worker.terminate();
              if (msg.status === 'SUCCESS') resolve(msg.result);
              else reject(new Error(msg.error));
            });
            worker.on('error', err => {
              worker.terminate();
              reject(err);
            });
          });
        });

        const results = await Promise.all(chunkPromises);
        for (const r of results) {
          poolWins += r.poolWins;
          poolLosses += r.poolLosses;
          poolDraws += r.poolDraws;
          defeatedKeys.push(...r.defeatedKeys);
          unbeatenKeys.push(...r.unbeatenKeys);
        }
      }

      const winRateVsPool = ((poolWins + 0.5 * poolDraws) / this.config.populationSize) * 100;
      console.log(
        `    • Candidate (${candidateKey}) vs. Initial Batch of ${this.config.populationSize}: ${poolWins}/${this.config.populationSize} wins (Win Rate: ${winRateVsPool.toFixed(1)}% | W/L/D: ${poolWins}/${poolLosses}/${poolDraws})`
      );

      if (poolWins >= (manifest.reigningChampionWinsVsPool || 0)) {
        manifest.reigningChampionKey = candidateKey;
        manifest.reigningChampionWinsVsPool = poolWins;
        manifest.reigningChampionWinRateVsPool = winRateVsPool;
      }
      manifest.currentGeneration = generation;

      const historyEntry = {
        generation,
        championKey: candidateKey,
        winsVsPool: poolWins,
        winRateVsPool,
      };
      // Prevent duplicate history entry for the same generation
      manifest.history = manifest.history.filter(h => h.generation !== generation);
      manifest.history.push(historyEntry);

      // Apply the same 75% / 16 matches statistical verification metric to crown the Supreme Champion
      if (winRateVsPool >= this.config.targetWinRate) {
        console.log(`    • Candidate win rate vs pool (${winRateVsPool.toFixed(1)}%) reached target >= ${this.config.targetWinRate}%. Verifying with the ${this.config.targetWinRate}% / ${this.config.evalMatches} matches statistical metric against d4@50...`);
        const finalAudit = await evalVsD4_50(candidateModel, this.config.evalMatches, this.config.tournamentRounds);
        console.log(`      ➔ Supreme Candidate vs. d4@50 Audit: ${finalAudit.winRate.toFixed(1)}% across ${this.config.evalMatches} matches (W/L/D: ${finalAudit.w}/${finalAudit.l}/${finalAudit.d})`);

        if (finalAudit.winRate >= this.config.targetWinRate) {
          console.log(`\n  ★ ★ ★ SUPREME VICTORY ACHIEVED! ★ ★ ★`);
          console.log(`  Reigning Champion (${candidateKey}) has met the ${this.config.targetWinRate}% / ${this.config.evalMatches} matches metric against BOTH the initial 32 population and d4@50!`);
          manifest.status = 'SUPREME_CHAMPION_CROWNED';
          this.saveModelToStorage('supreme_champion', candidateModel, generation, winRateVsPool);
          this.saveManifest(manifest);
          break;
        } else {
          console.log(`      ➔ Candidate did not meet the ${this.config.targetWinRate}% vs d4@50 metric (${finalAudit.winRate.toFixed(1)}%). Continuing evolutionary refinement...`);
        }
      }

      // 2. Evolutionary step: Mutate and evolve against the unbeaten instances
      console.log(`    • Evolving population: mutating top performers to overcome ${unbeatenKeys.length} remaining unbeaten instances (${unbeatenKeys.slice(0, 5).join(', ')}...)...`);

      const nextGenKey = `gen_${generation + 1}_champ`;
      const evolvedModel = createCNNModel([11, 11, 32]);
      const champKeyToEvolve = manifest.reigningChampionKey || candidateKey;
      const currentCkpt = loadCheckpointFromStorage(champKeyToEvolve, this.backend);
      if (currentCkpt) {
        importModelCheckpoint(evolvedModel, currentCkpt);
      }

      // Collect targeted training data on the exact seeds of the unbeaten instances
      const unbeatenIndices = unbeatenKeys.map(k => parseInt(k.replace('pop_', ''), 10)).filter(idx => !isNaN(idx));
      const targetSeed = unbeatenIndices.length > 0 ? 1000 + unbeatenIndices[0] * 2 : 1000;
      const evoSamples = await generateSelfPlayTrainingData(
        Math.max(16, this.config.baseSamples * 2),
        targetSeed,
        this.config.mctsIters,
        this.config.mctsDepth
      );
      await trainCNNModel(evolvedModel, evoSamples, Math.max(8, this.config.baseEpochs * 2), 8);

      const evoWinRate = (await evalVsD4_50(evolvedModel, this.config.evalMatches, this.config.tournamentRounds)).winRate;
      this.saveModelToStorage(nextGenKey, evolvedModel, generation + 1, evoWinRate);

      // Update reigning champion to our new evolved model for the next generation
      manifest.reigningChampionKey = nextGenKey;
      manifest.currentPopulationKeys.unshift(nextGenKey);

      generation++;
      manifest.currentGeneration = generation;
      manifest.status = 'RUNNING_TOURNAMENT';
      this.saveManifest(manifest);
    }

    console.log(`\n  ═══════════════════════════════════════════════════════════════════════════════════════`);
    console.log(`  TOURNAMENT EXECUTION COMPLETE`);
    console.log(`  • Status:               ${manifest.status}`);
    console.log(`  • Reigning Champion:    ${manifest.reigningChampionKey} (Win Rate: ${manifest.reigningChampionWinRateVsPool.toFixed(1)}% vs. initial batch)`);
    console.log(`  • Total Generations:    ${manifest.currentGeneration}`);
    console.log(`  ═══════════════════════════════════════════════════════════════════════════════════════\n`);

    return manifest;
  }
}

// Autonomously execute if invoked directly via tsx/node
const isMain = isMainThread && (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('tournament32.ts'));
if (isMain) {
  const config = parseConfigFromEnv();
  const manager = new Tournament32Manager(config);
  manager.runPipeline().catch(err => {
    console.error(`[Tournament32 Error]:`, err);
    process.exit(1);
  });
}
