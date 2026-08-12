/**
 * scripts/verify_onnx_parity.ts
 *
 * Cross-checks that a generated `.onnx` file produces bit-comparable
 * outputs to the source `ModelCheckpoint` JSON via tfjs-node. Uses seeded
 * random inputs so failures are reproducible.
 *
 * Tolerance:
 *   * policy head max |Δ| < 1e-4   (dense fp32 softmax)
 *   * value  head max |Δ| < 1e-4   (single tanh scalar)
 *
 * Exit code is 0 only if BOTH gates pass on ALL samples.
 *
 * Usage:
 *   npx tsx scripts/verify_onnx_parity.ts
 *   npx tsx scripts/verify_onnx_parity.ts --only=32 --samples=200
 *   npx tsx scripts/verify_onnx_parity.ts --checkpoint=<path.json> --onnx=<path.onnx>
 *
 * Exports `verifyONNXParity()` for use inside the flywheel champion-promotion
 * hook (doc/ONNX_MIGRATION_PLAN.md §3.5).
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
// Pure-JS tfjs backend (no native download). Slow but correct — 100 samples
// through the 32/64-channel net finishes in a couple of seconds.
import * as tf from '@tensorflow/tfjs';
import * as ort from 'onnxruntime-node';
import { createCNNModelFromCheckpoint, type ModelCheckpoint } from '../src/engine/ai/nn/checkpoints';

// ESM-safe replacements for __dirname / require.main === module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;

const ROOT = path.resolve(__dirname, '..');

export interface ParityOptions {
  samples?: number;         // default 100
  seed?: number;            // default 20260812
  tolerance?: number;       // default 1e-4
}

export interface ParityResult {
  ok: boolean;
  samples: number;
  channels: number;
  maxPolicyDelta: number;
  maxValueDelta: number;
  tolerance: number;
  offendingSampleIndex?: number;
  reason?: string;
}

/**
 * Seeded PRNG (mulberry32) so parity runs are reproducible across hosts.
 */
function makeRNG(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function verifyONNXParity(
  checkpoint: ModelCheckpoint,
  onnxPath: string,
  opts: ParityOptions = {},
): Promise<ParityResult> {
  const samples = opts.samples ?? 100;
  const seed = opts.seed ?? 20260812;
  const tolerance = opts.tolerance ?? 1e-4;

  const tfModel = createCNNModelFromCheckpoint(checkpoint);
  const channels = tfModel.inputs[0]?.shape?.[3] as number ?? 32;

  const session = await ort.InferenceSession.create(onnxPath);
  const inputName = session.inputNames[0];

  const rand = makeRNG(seed);
  let maxPolicyDelta = 0;
  let maxValueDelta = 0;
  let offendingSampleIndex: number | undefined;

  for (let i = 0; i < samples; i++) {
    // Uniform [-1, 1] random input — same distribution the encoders produce.
    const inputData = new Float32Array(11 * 11 * channels);
    for (let j = 0; j < inputData.length; j++) {
      inputData[j] = rand() * 2 - 1;
    }

    // TFJS reference
    const inputTfjs = tf.tensor4d(inputData, [1, 11, 11, channels]);
    const [policyTf, valueTf] = tfModel.predict(inputTfjs) as [tf.Tensor2D, tf.Tensor2D];
    const policyTfData = await policyTf.data() as Float32Array;
    const valueTfData = await valueTf.data() as Float32Array;
    inputTfjs.dispose(); policyTf.dispose(); valueTf.dispose();

    // ONNX candidate
    const inputTensor = new ort.Tensor('float32', inputData, [1, 11, 11, channels]);
    const outputs = await session.run({ [inputName]: inputTensor });
    // Output names may be `policy_head` / `value_head` OR positional; try both.
    const policyOnnxTensor = outputs['policy_head'] ?? outputs[Object.keys(outputs)[0]];
    const valueOnnxTensor  = outputs['value_head']  ?? outputs[Object.keys(outputs)[1]];
    const policyOnnxData = policyOnnxTensor.data as Float32Array;
    const valueOnnxData  = valueOnnxTensor.data  as Float32Array;

    // Compare
    let localMaxPolicy = 0;
    for (let k = 0; k < policyTfData.length; k++) {
      const d = Math.abs(policyTfData[k] - policyOnnxData[k]);
      if (d > localMaxPolicy) localMaxPolicy = d;
    }
    const localMaxValue = Math.abs(valueTfData[0] - valueOnnxData[0]);

    if (localMaxPolicy > maxPolicyDelta) {
      maxPolicyDelta = localMaxPolicy;
      if (localMaxPolicy > tolerance) offendingSampleIndex = i;
    }
    if (localMaxValue > maxValueDelta) {
      maxValueDelta = localMaxValue;
      if (localMaxValue > tolerance && offendingSampleIndex === undefined) offendingSampleIndex = i;
    }
  }

  const ok = maxPolicyDelta < tolerance && maxValueDelta < tolerance;
  return {
    ok,
    samples,
    channels,
    maxPolicyDelta,
    maxValueDelta,
    tolerance,
    offendingSampleIndex,
    reason: ok
      ? undefined
      : `Parity failed after ${samples} samples: policy Δ=${maxPolicyDelta.toExponential(3)}, value Δ=${maxValueDelta.toExponential(3)}, tolerance=${tolerance.toExponential(0)}`,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const DEFAULT_PAIRS = [
  { label: '32-channel', checkpoint: 'checkpoints/supreme_champion.json',    onnx: 'public/onnx/supreme_champion_32.onnx' },
  { label: '64-channel', checkpoint: 'checkpoints/supreme_champion_64.json', onnx: 'public/onnx/supreme_champion_64.onnx' },
];

interface CliArgs {
  only?: string;
  samples?: number;
  seed?: number;
  tolerance?: number;
  checkpoint?: string;
  onnx?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {};
  for (const arg of argv) {
    const m = arg.match(/^--([^=]+)=(.+)$/);
    if (!m) continue;
    const [, k, v] = m;
    if (k === 'samples') out.samples = parseInt(v, 10);
    else if (k === 'seed') out.seed = parseInt(v, 10);
    else if (k === 'tolerance') out.tolerance = parseFloat(v);
    else if (k === 'only') out.only = v;
    else if (k === 'checkpoint') out.checkpoint = v;
    else if (k === 'onnx') out.onnx = v;
    else throw new Error(`Unknown flag: --${k}`);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const pairs = args.checkpoint && args.onnx
    ? [{ label: 'custom', checkpoint: args.checkpoint, onnx: args.onnx }]
    : args.only
      ? DEFAULT_PAIRS.filter(p => p.label.startsWith(args.only!))
      : DEFAULT_PAIRS;

  let anyFail = false;
  console.log('\n═══ ONNX PARITY CHECK ═══');
  console.log(`  samples=${args.samples ?? 100}  seed=${args.seed ?? 20260812}  tolerance=${(args.tolerance ?? 1e-4).toExponential(0)}\n`);

  for (const p of pairs) {
    const absCkpt = path.resolve(ROOT, p.checkpoint);
    const absOnnx = path.resolve(ROOT, p.onnx);
    if (!fs.existsSync(absCkpt) || !fs.existsSync(absOnnx)) {
      console.warn(`  ⚠️  ${p.label}: skipping — checkpoint or ONNX file missing.`);
      console.warn(`      ${absCkpt}  (${fs.existsSync(absCkpt) ? 'ok' : 'MISSING'})`);
      console.warn(`      ${absOnnx}  (${fs.existsSync(absOnnx) ? 'ok' : 'MISSING'})`);
      continue;
    }

    const ckpt = JSON.parse(fs.readFileSync(absCkpt, 'utf-8')) as ModelCheckpoint;
    const res = await verifyONNXParity(ckpt, absOnnx, {
      samples: args.samples,
      seed: args.seed,
      tolerance: args.tolerance,
    });

    const badge = res.ok ? '✓ PASS' : '✗ FAIL';
    console.log(`  [${badge}] ${p.label}`);
    console.log(`         channels          : ${res.channels}`);
    console.log(`         samples           : ${res.samples}`);
    console.log(`         max policy delta  : ${res.maxPolicyDelta.toExponential(3)}`);
    console.log(`         max value  delta  : ${res.maxValueDelta.toExponential(3)}`);
    console.log(`         tolerance         : ${res.tolerance.toExponential(0)}`);
    if (!res.ok) {
      console.log(`         offending sample  : ${res.offendingSampleIndex}`);
      console.log(`         reason            : ${res.reason}`);
    }
    console.log('');
    if (!res.ok) anyFail = true;
  }

  if (anyFail) {
    console.error('❌  Parity gate failed. Do NOT deploy these ONNX artefacts.');
    process.exit(1);
  }
  console.log('✅  All parity gates passed.\n');
}

if (isMain) {
  main().catch(err => {
    console.error('\n❌  Verify failed:', err.message || err);
    process.exit(1);
  });
}
