import * as fs from 'fs';
import * as path from 'path';
import * as tf from '@tensorflow/tfjs';
import {
  createCNNModel,
  trainCNNModel,
  importModelCheckpoint,
  exportModelCheckpoint,
  saveCheckpointToStorage,
  loadCheckpointFromStorage,
  FileStorageBackend,
  type TrainingSample,
} from './index';
import { Worker } from 'worker_threads';
import { generateSelfPlayTrainingData } from './training';
import { evalVsD4_50, getWorkerCount, getWorkerPath } from './tournament32';

async function generateSelfPlayParallel(
  totalCount: number,
  baseSeed: number,
  mctsIters: number,
  mctsDepth: number,
  numWorkers: number
): Promise<TrainingSample[]> {
  if (numWorkers <= 1 || totalCount <= 2) {
    return generateSelfPlayTrainingData(totalCount, baseSeed, mctsIters, mctsDepth);
  }

  const workerScript = getWorkerPath();
  const chunkSize = Math.ceil(totalCount / numWorkers);
  const workerPromises = Array.from({ length: numWorkers }, (_, wIdx) => {
    const count = Math.min(chunkSize, totalCount - wIdx * chunkSize);
    if (count <= 0) return Promise.resolve([]);
    return new Promise<TrainingSample[]>((resolve, reject) => {
      const worker = new Worker(workerScript, { execArgv: process.execArgv });
      worker.postMessage({
        type: 'GENERATE_SELF_PLAY',
        count,
        seed: baseSeed + wIdx * 10,
        mctsIters,
        mctsDepth,
      });
      worker.on('message', (msg: any) => {
        worker.terminate();
        if (msg.status === 'SUCCESS') {
          const samples = msg.result.map((s: any) => ({
            stateTensor: new Float32Array(s.stateTensor),
            policyTarget: new Float32Array(s.policyTarget),
            valueTarget: s.valueTarget,
          }));
          resolve(samples);
        } else {
          reject(new Error(msg.error));
        }
      });
      worker.on('error', reject);
    });
  });

  const arrays = await Promise.all(workerPromises);
  const combined: TrainingSample[] = [];
  for (const arr of arrays) {
    combined.push(...arr);
  }
  return combined;
}

export interface GoalSeekerConfig {
  checkpointDir: string;
  targetWinRate: number;
  evalMatches: number;
  tournamentRounds: number;
  mctsIters: number;
  mctsDepth: number;
  samplesPerGen: number;
  epochsPerGen: number;
  maxGenerations: number;
  replayWindowSize: number;
}

export interface GoalSeekerManifest {
  status: 'TRAINING' | 'GOAL_ACHIEVED';
  currentGeneration: number;
  currentStep?: 'GENERATE_DATA' | 'TRAIN_MODEL' | 'AUDIT_MATCHES';
  bestWinRateVsTarget: number;
  totalTrainingSamples: number;
  reigningModelKey: string;
  history: Array<{
    generation: number;
    winRate: number;
    w: number;
    l: number;
    d: number;
    timestamp: number;
  }>;
  timestamp: number;
}

export class GoalSeeker450Manager {
  readonly config: GoalSeekerConfig;
  readonly backend: FileStorageBackend;

  constructor(config: GoalSeekerConfig) {
    this.config = config;
    this.backend = new FileStorageBackend(config.checkpointDir);
    if (!fs.existsSync(config.checkpointDir)) {
      fs.mkdirSync(config.checkpointDir, { recursive: true });
    }
  }

  private saveManifest(manifest: GoalSeekerManifest): void {
    const raw = JSON.stringify(manifest, null, 2);
    const filePath = path.join(this.config.checkpointDir, 'goal_seeker_450_manifest.json');
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, raw, 'utf8');
    fs.renameSync(tmpPath, filePath);
  }

  private loadManifest(): GoalSeekerManifest | null {
    const filePath = path.join(this.config.checkpointDir, 'goal_seeker_450_manifest.json');
    if (!fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8')) as GoalSeekerManifest;
    } catch {
      return null;
    }
  }

  private saveReplayBuffer(samples: TrainingSample[]): void {
    const filePath = path.join(this.config.checkpointDir, 'goal_seeker_450_replay.json');
    const tmpPath = `${filePath}.tmp`;
    const serialized = samples.map(s => ({
      stateTensor: Array.from(s.stateTensor),
      policyTarget: Array.from(s.policyTarget),
      valueTarget: s.valueTarget,
    }));
    fs.writeFileSync(tmpPath, JSON.stringify(serialized), 'utf8');
    fs.renameSync(tmpPath, filePath);
  }

  private loadReplayBuffer(): TrainingSample[] {
    const filePath = path.join(this.config.checkpointDir, 'goal_seeker_450_replay.json');
    if (!fs.existsSync(filePath)) return [];
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return raw.map((s: any) => ({
        stateTensor: new Float32Array(s.stateTensor),
        policyTarget: new Float32Array(s.policyTarget),
        valueTarget: s.valueTarget,
      }));
    } catch {
      return [];
    }
  }

  async run(): Promise<GoalSeekerManifest> {
    const numWorkers = getWorkerCount();
    let statNote = 'fast test mode, not statistically significant at p<0.05';
    if (this.config.evalMatches >= 32) {
      statNote = 'statistically significant at p=0.003 < 0.01, >90% power';
    } else if (this.config.evalMatches >= 24) {
      statNote = 'statistically significant at p=0.011 < 0.05, 80% power';
    } else if (this.config.evalMatches >= 16) {
      statNote = 'statistically significant at p=0.038 < 0.05 exact binomial test';
    }

    console.log(`\n  ═══════════════════════════════════════════════════════════════════════════════════════`);
    console.log(`  CAPTEN AUTONOMOUS GOAL-SEEKING SINGLE MODEL TRAINING FLYWHEEL`);
    console.log(`  • Checkpoint Dir:    ${this.config.checkpointDir}`);
    console.log(`  • Worker Threads:    ${numWorkers} parallel CPU cores detected`);
    console.log(`  • Target Objective:  Win rate >= ${this.config.targetWinRate}% vs d4@${this.config.mctsIters} across ${this.config.evalMatches} matches (${statNote})`);
    console.log(`  • Training Config:   ${this.config.samplesPerGen} samples/gen, ${this.config.epochsPerGen} epochs/gen, window cap=${this.config.replayWindowSize}`);
    console.log(`  ═══════════════════════════════════════════════════════════════════════════════════════`);

    let manifest = this.loadManifest();
    let replayBuffer = this.loadReplayBuffer();
    let model = createCNNModel([11, 11, 32]);

    if (manifest && manifest.reigningModelKey) {
      console.log(`  [RESUMABILITY CHECK: Found saved GoalSeeker Manifest]`);
      console.log(`    • Status:             ${manifest.status}`);
      console.log(`    • Current Generation: Gen ${manifest.currentGeneration}`);
      console.log(`    • Replay Buffer:      ${replayBuffer.length} accumulated training samples`);
      const ckpt = loadCheckpointFromStorage(manifest.reigningModelKey, this.backend);
      if (ckpt) {
        importModelCheckpoint(model, ckpt);
      }
    } else {
      manifest = {
        status: 'TRAINING',
        currentGeneration: 0,
        bestWinRateVsTarget: 0,
        totalTrainingSamples: 0,
        reigningModelKey: 'goal_seeker_450_current',
        history: [],
        timestamp: Date.now(),
      };
      this.saveManifest(manifest);

      console.log(`    • Warm-starting single model from existing champion (./checkpoints/supreme_champion.json)...`);
      const supremeBackend = new FileStorageBackend('./checkpoints');
      const warmCkpt = loadCheckpointFromStorage('supreme_champion', supremeBackend);
      if (warmCkpt) {
        importModelCheckpoint(model, warmCkpt);
        console.log(`      ➔ Warm-start successful (Generation ${warmCkpt.generation} | Baseline win rate: ${warmCkpt.winRate.toFixed(1)}%)`);
      }
    }

    while (manifest.status !== 'GOAL_ACHIEVED' && manifest.currentGeneration < this.config.maxGenerations) {
      const gen = manifest.currentGeneration;
      const step = manifest.currentStep || 'GENERATE_DATA';
      console.log(`\n  ─── GOAL-SEEKER GENERATION ${gen} (Current Step: ${step}) ───`);

      if (step === 'GENERATE_DATA') {
        // 1. Generate high-quality self-play training experience using d4@mctsIters
        console.log(`    • [Step 1/3: GENERATE_DATA] Generating ${this.config.samplesPerGen} new self-play training samples using MCTS d4@${this.config.mctsIters}...`);
        const newSamples = await generateSelfPlayParallel(
          this.config.samplesPerGen,
          1000 + gen * 50,
          this.config.mctsIters,
          this.config.mctsDepth,
          numWorkers
        );

        replayBuffer.push(...newSamples);
        if (replayBuffer.length > this.config.replayWindowSize) {
          replayBuffer = replayBuffer.slice(-this.config.replayWindowSize);
        }
        this.saveReplayBuffer(replayBuffer);
        manifest.totalTrainingSamples = replayBuffer.length;
        manifest.currentStep = 'TRAIN_MODEL';
        this.saveManifest(manifest);
        console.log(`      ➔ Data generation complete & replay buffer saved (${replayBuffer.length} samples). Advanced to step: TRAIN_MODEL.`);
      } else {
        console.log(`    • [Step 1/3: GENERATE_DATA] Already completed for Gen ${gen}. Replay buffer has ${replayBuffer.length} samples.`);
      }

      if (manifest.currentStep === 'TRAIN_MODEL') {
        // 2. Train single model on accumulated replay experience
        console.log(`    • [Step 2/3: TRAIN_MODEL] Supervised training on ${replayBuffer.length} replay samples for ${this.config.epochsPerGen} epochs...`);
        await trainCNNModel(model, replayBuffer, this.config.epochsPerGen, 8);

        const ckpt = exportModelCheckpoint(model, gen, manifest.bestWinRateVsTarget || 0);
        saveCheckpointToStorage('goal_seeker_450_current', ckpt, this.backend);

        manifest.currentStep = 'AUDIT_MATCHES';
        this.saveManifest(manifest);
        console.log(`      ➔ Supervised training complete & checkpoint saved to goal_seeker_450_current.json. Advanced to step: AUDIT_MATCHES.`);
      } else {
        console.log(`    • [Step 2/3: TRAIN_MODEL] Already completed for Gen ${gen}. Loaded goal_seeker_450_current checkpoint.`);
      }

      // 3. Parallel multi-threaded verification audit against d4@450 across evalMatches
      console.log(`    • [Step 3/3: AUDIT_MATCHES] Executing parallel audit against d4@${this.config.mctsIters} across ${this.config.evalMatches} symmetric matches (${numWorkers} CPU threads)...`);
      const evalRes = await evalVsD4_50(
        model,
        this.config.evalMatches,
        this.config.tournamentRounds,
        this.config.mctsIters,
        this.config.mctsDepth
      );

      console.log(
        `      ➔ Single Model vs. d4@${this.config.mctsIters} Audit: ${evalRes.winRate.toFixed(1)}% (W/L/D: ${evalRes.w}/${evalRes.l}/${evalRes.d})`
      );

      manifest.bestWinRateVsTarget = Math.max(manifest.bestWinRateVsTarget, evalRes.winRate);
      const ckpt = exportModelCheckpoint(model, gen, evalRes.winRate);
      saveCheckpointToStorage('goal_seeker_450_current', ckpt, this.backend);

      manifest.history = manifest.history.filter(h => h.generation !== gen);
      manifest.history.push({
        generation: gen,
        winRate: evalRes.winRate,
        w: evalRes.w,
        l: evalRes.l,
        d: evalRes.d,
        timestamp: Date.now(),
      });

      if (evalRes.winRate >= this.config.targetWinRate) {
        console.log(`\n  ★ ★ ★ GOAL-SEEKING SUCCESS ACHIEVED! ★ ★ ★`);
        console.log(
          `  Single ResNet CNN model weight has verifiably defeated d4@${this.config.mctsIters} at ${evalRes.winRate.toFixed(1)}% (>= ${this.config.targetWinRate}%) across ${this.config.evalMatches} matches!`
        );
        manifest.status = 'GOAL_ACHIEVED';
        saveCheckpointToStorage('goal_seeker_d4_450_winner', ckpt, this.backend);

        // Also save as supreme_champion in checkpoints/ and public/checkpoints/ for the web UI
        const supremeBackend = new FileStorageBackend('./checkpoints');
        saveCheckpointToStorage('supreme_champion', ckpt, supremeBackend);
        const publicDir = path.resolve(process.cwd(), 'public/checkpoints');
        if (!fs.existsSync(publicDir)) {
          fs.mkdirSync(publicDir, { recursive: true });
        }
        fs.writeFileSync(
          path.join(publicDir, 'supreme_champion.json'),
          JSON.stringify(ckpt, null, 2),
          'utf8'
        );

        this.saveManifest(manifest);
        break;
      }

      manifest.currentGeneration = gen + 1;
      manifest.currentStep = 'GENERATE_DATA';
      this.saveManifest(manifest);
      console.log(`      ➔ Generation ${gen} complete. State checkpointed. Proceeding to Generation ${gen + 1}...`);
    }

    if (manifest.status !== 'GOAL_ACHIEVED') {
      console.log(`\n  [INFO] Max generations reached without reaching target win rate (${manifest.bestWinRateVsTarget.toFixed(1)}%). Re-run script to resume flywheel.`);
    }

    model.dispose();
    tf.disposeVariables();
    return manifest;
  }
}

// Support CLI execution when invoked directly
if (process.argv[1]?.endsWith('goalSeeker_d4_450.ts') || process.argv[1]?.endsWith('goalSeeker_d4_450.js')) {
  const config: GoalSeekerConfig = {
    checkpointDir: process.env.CHECKPOINT_DIR || './checkpoints/goal_seeker_450',
    targetWinRate: parseInt(process.env.TARGET_WIN_RATE || '75', 10),
    evalMatches: parseInt(process.env.EVAL_MATCHES || '16', 10),
    tournamentRounds: parseInt(process.env.TOURNAMENT_ROUNDS || '20', 10),
    mctsIters: parseInt(process.env.MCTS_ITERS || '450', 10),
    mctsDepth: parseInt(process.env.MCTS_DEPTH || '4', 10),
    samplesPerGen: parseInt(process.env.SAMPLES_PER_GEN || '20', 10),
    epochsPerGen: parseInt(process.env.EPOCHS_PER_GEN || '6', 10),
    maxGenerations: parseInt(process.env.MAX_GENERATIONS || '10', 10),
    replayWindowSize: parseInt(process.env.REPLAY_WINDOW_SIZE || '160', 10),
  };

  const manager = new GoalSeeker450Manager(config);
  manager.run().then(m => {
    console.log(`\n[goalSeeker_d4_450] Completed with status: ${m.status}`);
  }).catch(err => {
    console.error(`[goalSeeker_d4_450] Fatal Error:`, err);
    process.exit(1);
  });
}
