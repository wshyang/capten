import '@tensorflow/tfjs-node';
import * as fs from 'fs';
import * as path from 'path';
import { createCNNModel, trainCNNModel } from './model';
import {
  exportModelCheckpoint,
  createCNNModelFromCheckpoint,
} from './checkpoints';
import {
  FileStorageBackend,
  saveCheckpointToStorage,
  loadCheckpointFromStorage,
  saveReplayBufferToStorage,
  loadReplayBufferFromStorage,
} from './persistence';
import { setCNNModel, runArenaAuditMatch, runArenaAuditMatchVsMCTS } from './index';
import { generateSelfPlayTrainingData } from './training';
import { getWorkerCount, getWorkerPath } from './tournament32';
import { Worker } from 'worker_threads';
import type { TrainingSample } from './model';

async function generateSelfPlayParallel(
  totalCount: number,
  baseSeed: number,
  mctsIters: number,
  mctsDepth: number,
  numChannels: number,
  numWorkers: number
): Promise<TrainingSample[]> {
  if (numWorkers <= 1 || totalCount <= 50) {
    return generateSelfPlayTrainingData(totalCount, baseSeed, mctsIters, mctsDepth, numChannels);
  }

  const workerScript = getWorkerPath();
  const chunkSize = Math.ceil(totalCount / numWorkers);
  const workerPromises = Array.from({ length: numWorkers }, (_, wIdx) => {
    const count = Math.min(chunkSize, totalCount - wIdx * chunkSize);
    if (count <= 0) return Promise.resolve([] as TrainingSample[]);
    return new Promise<TrainingSample[]>((resolve, reject) => {
      const worker = new Worker(workerScript, { execArgv: process.execArgv });
      worker.postMessage({ type: 'GENERATE_SELF_PLAY', count, seed: baseSeed + wIdx * 100, mctsIters, mctsDepth, numChannels });
      worker.on('message', (msg: any) => {
        worker.terminate();
        if (msg.status === 'SUCCESS') {
          resolve(msg.result.map((s: any) => ({
            stateTensor: new Float32Array(s.stateTensor),
            policyTarget: new Float32Array(s.policyTarget),
            valueTarget: s.valueTarget,
          })));
        } else {
          reject(new Error(msg.error));
        }
      });
      worker.on('error', reject);
    });
  });

  const chunks = await Promise.all(workerPromises);
  return chunks.flat();
}

interface ResumableScratchManifest {
  modelChannels: number;
  currentStep: 'GENERATE_DATA' | 'TRAIN_MODEL' | 'AUDIT_MATCHES' | 'COMPLETED';
  samplesCount: number;
  trainingLoss?: number;
  auditWinRate?: number;
  auditW?: number;
  auditL?: number;
  auditD?: number;
}


export async function runResumableTrainer64(): Promise<void> {
  const dirPath = process.env.CHECKPOINT_DIR || './checkpoints/train_resumable_64';
  const samplesCount = parseInt(process.env.SAMPLES_COUNT || '24', 10);
  const epochs = parseInt(process.env.EPOCHS || '1', 10);
  const learningRate = parseFloat(process.env.LEARNING_RATE || '0.0005');
  const evalMatches = parseInt(process.env.EVAL_MATCHES || process.env.AUDIT_MATCHES || '16', 10);
  const minWinRate = parseFloat(process.env.MIN_WIN_RATE || process.env.TARGET_WIN_RATE || '75.0');
  const rounds = parseInt(process.env.AUDIT_ROUNDS || '300', 10);
  const exploitRate = parseFloat(process.env.AUDIT_EXPLOIT_RATE || '0.75');
  const auditOpponent = process.env.AUDIT_OPPONENT || 'NN32';
  const auditMctsIterations = parseInt(process.env.AUDIT_MCTS_ITERATIONS || '450', 10);
  const auditMctsDepth = parseInt(process.env.AUDIT_MCTS_DEPTH || '8', 10);
  const reset = process.env.RESET === '1' || process.env.RESET === 'true';

  const absDir = path.resolve(process.cwd(), dirPath);
  if (!fs.existsSync(absDir)) {
    fs.mkdirSync(absDir, { recursive: true });
  }

  const manifestPath = path.join(absDir, 'manifest.json');
  if (reset && fs.existsSync(manifestPath)) {
    console.log(' [RESET=1] Clearing existing manifest and temporary checkpoints...');
    fs.unlinkSync(manifestPath);
    const replayPath = path.join(absDir, 'replay_buffer_64.json');
    const candPath = path.join(absDir, 'cand_checkpoint_64.json');
    if (fs.existsSync(replayPath)) fs.unlinkSync(replayPath);
    if (fs.existsSync(candPath)) fs.unlinkSync(candPath);
  }

  let manifest: ResumableScratchManifest;
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
      manifest = { modelChannels: 64, currentStep: 'GENERATE_DATA', samplesCount };
    }
  } else {
    manifest = { modelChannels: 64, currentStep: 'GENERATE_DATA', samplesCount };
  }

  const saveManifest = () => {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  };

  console.log('═══════════════════════════════════════════════════════════════════════════════════════');
  console.log(' RESUMABLE TRAINING HARNESS: 64-LAYER RESNET FROM SCRATCH (STATE PERSISTED BY STEP)');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════');
  console.log(` • Working Directory:   ${dirPath}`);
  console.log(` • Target Architecture: 64-Channel Dual-Head ResNet (788,801 params)`);
  console.log(` • Current Step:        ${manifest.currentStep}`);
  console.log(` • Data Generation:     MCTS d8@450 Self-Play (${samplesCount} samples, ${getWorkerCount()} parallel workers)`);
  console.log(` • Training Hyperparams:${epochs} Epochs • LR = ${learningRate}`);
  const opponentLabel = auditOpponent === 'MCTS'
    ? `MCTS d${auditMctsDepth}@${auditMctsIterations}`
    : auditOpponent === 'NN64'
    ? '64-Layer NN Champion (supreme_champion_64)'
    : '32-Layer NN Champion';
  console.log(` • Audit Configuration: ${evalMatches} Matches vs ${opponentLabel} • Target Win Rate >= ${minWinRate}% (${rounds} Rounds per Match)`);
  console.log('═══════════════════════════════════════════════════════════════════════════════════════\n');

  const backend = new FileStorageBackend(dirPath);
  const maxRetries = parseInt(process.env.MAX_RETRIES || '5', 10);
  const numWorkers = getWorkerCount();
  let attempt = 0;

  while (manifest.currentStep !== 'COMPLETED' && attempt < maxRetries) {
    attempt++;
    if (attempt > 1) {
      console.log(`\n ── RETRY ATTEMPT ${attempt}/${maxRetries} ──\n`);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // STEP 1: GENERATE_DATA
    // ─────────────────────────────────────────────────────────────────────────────
    if (manifest.currentStep === 'GENERATE_DATA') {
      console.log(' [Step 1/3: GENERATE_DATA] Checking for existing replay buffer or generating new self-play dataset...');
      let replayBuffer = loadReplayBufferFromStorage('replay_buffer_64', backend);
      if (!replayBuffer || replayBuffer.length < samplesCount) {
        console.log(`   ➔ Generating ${samplesCount} 64-channel MCTS d8@450 self-play samples (${numWorkers} workers)...`);
        const startGen = Date.now();
        const newSamples = await generateSelfPlayParallel(samplesCount, 4242 + attempt, 450, 8, 64, numWorkers);
        const genTime = ((Date.now() - startGen) / 1000).toFixed(2);
        console.log(`   ➔ Generated ${newSamples.length} samples in ${genTime}s`);
        saveReplayBufferToStorage('replay_buffer_64', newSamples, backend);
        replayBuffer = newSamples;
      } else {
        console.log(`   ➔ [RESUMED] Found existing replay buffer with ${replayBuffer.length} samples.`);
      }

      manifest.samplesCount = replayBuffer.length;
      manifest.currentStep = 'TRAIN_MODEL';
      saveManifest();
      console.log('   ➔ Completed GENERATE_DATA step. State persisted to manifest.json ✓\n');
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // STEP 2: TRAIN_MODEL
    // ─────────────────────────────────────────────────────────────────────────────
    if (manifest.currentStep === 'TRAIN_MODEL') {
      console.log(' [Step 2/3: TRAIN_MODEL] Loading replay buffer and training 64-layer ResNet from scratch...');
      const replayBuffer = loadReplayBufferFromStorage('replay_buffer_64', backend);
      if (!replayBuffer || replayBuffer.length === 0) {
        throw new Error('Replay buffer missing! Run with RESET=1 to regenerate data.');
      }

      const model64 = createCNNModel([11, 11, 64]);
      const startTrain = Date.now();
      const history = await trainCNNModel(model64, replayBuffer, epochs, 16, learningRate);
      const trainTime = ((Date.now() - startTrain) / 1000).toFixed(2);
      const rawLoss = history.history.loss?.[epochs - 1];
      const finalLoss = typeof rawLoss === 'number' ? rawLoss : 0;
      console.log(`   ➔ Training Completed in ${trainTime}s! Final Loss: ${finalLoss.toFixed(4)}`);

      const candCkpt = exportModelCheckpoint(model64, 1, 64);
      saveCheckpointToStorage('cand_checkpoint_64', candCkpt, backend);

      manifest.trainingLoss = finalLoss;
      manifest.currentStep = 'AUDIT_MATCHES';
      saveManifest();
      model64.dispose();
      console.log('   ➔ Completed TRAIN_MODEL step. Saved cand_checkpoint_64.json & persisted manifest.json ✓\n');
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // STEP 3: AUDIT_MATCHES
    // ─────────────────────────────────────────────────────────────────────────────
    if (manifest.currentStep === 'AUDIT_MATCHES') {
      console.log(` [Step 3/3: AUDIT_MATCHES] Loading cand_checkpoint and evaluating vs ${opponentLabel}...`);
      const candCkpt = loadCheckpointFromStorage('cand_checkpoint_64', backend);
      if (!candCkpt) {
        throw new Error('Candidate checkpoint missing! Run with RESET=1 to restart.');
      }
      const model64 = createCNNModelFromCheckpoint(candCkpt);
      setCNNModel(model64, '64');

      const mainBackend = new FileStorageBackend('./checkpoints');

      if (auditOpponent === 'NN64') {
        const ckpt64champ = loadCheckpointFromStorage('supreme_champion_64', mainBackend);
        if (!ckpt64champ) throw new Error('supreme_champion_64 checkpoint missing!');
        setCNNModel(createCNNModelFromCheckpoint(ckpt64champ), '32');
      } else if (auditOpponent !== 'MCTS') {
        const ckpt32 =
          loadCheckpointFromStorage('supreme_champion_32_v2', mainBackend) ||
          loadCheckpointFromStorage('supreme_champion', mainBackend);
        if (!ckpt32) throw new Error('Reigning 32-layer champion checkpoint missing!');
        setCNNModel(createCNNModelFromCheckpoint(ckpt32), '32');
      }

      const numPairs = Math.max(1, Math.ceil(evalMatches / 2));
      const seeds = Array.from({ length: numPairs }, (_, i) => 1000 + i);
      let wA = 0, wB = 0, draws = 0;
      let matchNum = 1;

      for (const seed of seeds) {
        const runMatch = (side: 'PLAYER' | 'AI') => auditOpponent === 'MCTS'
          ? runArenaAuditMatchVsMCTS(seed, side, rounds, auditMctsIterations, auditMctsDepth, '64')
          : runArenaAuditMatch(seed, side, rounds, exploitRate, '64', '32');

        const m1 = runMatch('PLAYER');
        if (m1.winner === 'A') wA++;
        else if (m1.winner === 'B') wB++;
        else draws++;
        console.log(`   [Match ${String(matchNum++).padStart(2, ' ')}/${numPairs * 2}] Seed ${seed} (A as PLAYER, B as AI):   Score A ${m1.scoreA} - ${m1.scoreB} B ➔ Winner: ${m1.winner === 'A' ? `PLAYER A (64-Layer NN)` : m1.winner === 'B' ? `PLAYER B (${opponentLabel})` : 'DRAW'}`);

        const m2 = runMatch('AI');
        if (m2.winner === 'A') wA++;
        else if (m2.winner === 'B') wB++;
        else draws++;
        console.log(`   [Match ${String(matchNum++).padStart(2, ' ')}/${numPairs * 2}] Seed ${seed} (A as AI, B as PLAYER):   Score A ${m2.scoreA} - ${m2.scoreB} B ➔ Winner: ${m2.winner === 'A' ? `PLAYER A (64-Layer NN)` : m2.winner === 'B' ? `PLAYER B (${opponentLabel})` : 'DRAW'}`);
      }

      const totalMatches = wA + wB + draws;
      const winRate = ((wA + 0.5 * draws) / totalMatches) * 100;

      manifest.auditWinRate = winRate;
      manifest.auditW = wA;
      manifest.auditL = wB;
      manifest.auditD = draws;

      console.log('\n ── AUDIT TOURNAMENT RESULT ──');
      console.log(`   ➔ W / L / D: ${wA} / ${wB} / ${draws} (Win Rate: ${winRate.toFixed(1)}%)`);

      if (winRate >= minWinRate) {
        console.log(`   ➔ SUCCESS: Candidate Win Rate (${winRate.toFixed(1)}%) meets or exceeds target MIN_WIN_RATE=${minWinRate.toFixed(1)}%!`);
        console.log('   ➔ Promoting newly trained 64-layer ResNet weights to reigning 64-layer champion file...');
        saveCheckpointToStorage('supreme_champion_64', candCkpt, mainBackend);

        const pubDir = path.join(process.cwd(), 'public', 'checkpoints');
        if (!fs.existsSync(pubDir)) fs.mkdirSync(pubDir, { recursive: true });
        fs.writeFileSync(path.join(pubDir, 'supreme_champion_64.json'), JSON.stringify(candCkpt), 'utf8');

        manifest.currentStep = 'COMPLETED';
        saveManifest();
        model64.dispose();
        console.log('   ➔ Completed AUDIT_MATCHES step. Promoted checkpoint to ./checkpoints & ./public/checkpoints ✓\n');
      } else {
        console.log(`   ➔ WARNING: Candidate Win Rate (${winRate.toFixed(1)}%) fell below required target MIN_WIN_RATE=${minWinRate.toFixed(1)}%! Checkpoint NOT promoted.`);
        manifest.currentStep = 'GENERATE_DATA';
        saveManifest();
        model64.dispose();
        console.log(`   ➔ Reverted manifest.currentStep to GENERATE_DATA. Retrying (${attempt}/${maxRetries})...\n`);
      }
    }
  }

  if (manifest.currentStep === 'COMPLETED') {
    console.log('═══════════════════════════════════════════════════════════════════════════════════════');
    console.log(' 64-LAYER RESNET RETRAINING ALREADY COMPLETED (CRASH-SAFE HARNESS)');
    console.log('═══════════════════════════════════════════════════════════════════════════════════════');
    console.log(` • Training Loss:   ${manifest.trainingLoss?.toFixed(4) || 'N/A'}`);
    console.log(` • Audit Result:    ${manifest.auditW} W / ${manifest.auditL} L / ${manifest.auditD} D (${manifest.auditWinRate?.toFixed(1)}% Win Rate)`);
    console.log(` • Checkpoint:      ./checkpoints/supreme_champion_64.json`);
    console.log(` • Note: To force a fresh restart from scratch at any time, run with RESET=1`);
    console.log('═══════════════════════════════════════════════════════════════════════════════════════\n');
  } else {
    console.error(`\n ERROR: Exhausted MAX_RETRIES=${maxRetries} without achieving win rate target of ${minWinRate}%.`);
    console.error(` Last result: ${manifest.auditW ?? 0} W / ${manifest.auditL ?? 0} L / ${manifest.auditD ?? 0} D (${manifest.auditWinRate?.toFixed(1) ?? 'N/A'}%)`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('resumableTrainer64.ts')) {
  runResumableTrainer64().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
