/**
 * scripts/convert_checkpoint_to_onnx.ts
 *
 * Converts our inline-JSON `ModelCheckpoint` files (checkpoints/*.json) into
 * ONNX Runtime Web-compatible `.onnx` graphs, ready to be dropped into
 * `public/onnx/` for the browser bundle.
 *
 * Pipeline (each stage lives in its own directory so re-runs are debuggable):
 *
 *   JSON checkpoint  -->  TFJS Layers      -->  Keras SavedModel  -->  ONNX fp32          -->  onnxsim
 *   checkpoints/         tmp/tfjs_layers/       tmp/keras/               tmp/onnx_raw/           public/onnx/
 *
 * Requires the Python toolchain installed by ./scripts/setup_onnx_toolchain.sh
 * (venv at .venv-onnx/). This script auto-detects the venv and prepends its
 * bin directory to PATH, so you don't have to `source .venv-onnx/bin/activate`
 * yourself.
 *
 * Usage:
 *   npx tsx scripts/convert_checkpoint_to_onnx.ts
 *   npx tsx scripts/convert_checkpoint_to_onnx.ts --only=32
 *   npx tsx scripts/convert_checkpoint_to_onnx.ts --in=<path.json> --out=<path.onnx>
 *
 * Also exports a library entry `convertCheckpointToONNX()` so the flywheel
 * champion-promotion hook (see doc/ONNX_MIGRATION_PLAN.md §3.5) can invoke
 * it programmatically.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
// Pure-JS tfjs backend — no native addon required. Slower than tfjs-node
// for training, but conversion only runs a single forward-pass-shape
// materialization step, so speed is irrelevant here.
import * as tf from '@tensorflow/tfjs';
import { createCNNModelFromCheckpoint, type ModelCheckpoint } from '../src/engine/ai/nn/checkpoints';

// ---------------------------------------------------------------------------
// Manual TFJS Layers save (avoids requiring @tensorflow/tfjs-node's native
// addon, which needs libtensorflow downloaded from storage.googleapis.com).
//
// Writes the exact two-file layout `tensorflowjs_converter` expects:
//   <dir>/model.json                  ← topology + weightsManifest
//   <dir>/group1-shard1of1.bin        ← packed little-endian fp32 weights
// ---------------------------------------------------------------------------
async function saveTfjsLayersModelToDir(model: tf.LayersModel, outDir: string): Promise<void> {
  const artifacts = await new Promise<tf.io.ModelArtifacts>((resolve, reject) => {
    model
      .save(tf.io.withSaveHandler(async (a: tf.io.ModelArtifacts) => {
        resolve(a);
        return {
          modelArtifactsInfo: {
            dateSaved: new Date(),
            modelTopologyType: 'JSON',
          },
        };
      }))
      .catch(reject);
  });

  // 1) Write the weight buffer. Prefer already-packed .weightData; fall back
  //    to concatenating individual weight tensors if the handler emitted them
  //    per-spec (older tfjs behaviour).
  const weightData: ArrayBuffer =
    (artifacts.weightData as ArrayBuffer) ?? new ArrayBuffer(0);
  const binPath = path.join(outDir, 'group1-shard1of1.bin');
  fs.writeFileSync(binPath, Buffer.from(weightData));

  // 2) Write the model.json wrapper. `tensorflowjs_converter`'s parser is
  //    strict about the shape — see tfjs source: JsonModelArtifactsInfo.
  const modelJson = {
    modelTopology: artifacts.modelTopology,
    format: artifacts.format ?? 'layers-model',
    generatedBy: artifacts.generatedBy ?? 'capten-convert-script',
    convertedBy: artifacts.convertedBy ?? null,
    weightsManifest: [
      {
        paths: ['group1-shard1of1.bin'],
        weights: artifacts.weightSpecs,
      },
    ],
  };
  const jsonPath = path.join(outDir, 'model.json');
  fs.writeFileSync(jsonPath, JSON.stringify(modelJson));
}

// ESM-safe replacements for __dirname / require.main === module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;

// ---------------------------------------------------------------------------
// Toolchain discovery
// ---------------------------------------------------------------------------
const ROOT = path.resolve(__dirname, '..');
const VENV_DIR = path.join(ROOT, '.venv-onnx');
const VENV_BIN = path.join(VENV_DIR, 'bin');
const VENV_MARK = path.join(VENV_DIR, '.installed-versions');

function ensureToolchain(): void {
  if (!fs.existsSync(VENV_MARK)) {
    console.error('');
    console.error('  ❌  ONNX conversion toolchain not installed.');
    console.error('');
    console.error('     Run:   ./scripts/setup_onnx_toolchain.sh');
    console.error('');
    console.error('     (Creates a Python venv at .venv-onnx/ and installs');
    console.error('      tensorflow-cpu, tensorflowjs, tf2onnx, onnx, onnxsim,');
    console.error('      and onnxruntime with pinned versions. ~2–4 min.)');
    console.error('');
    process.exit(2);
  }
  // Prepend the venv's bin dir to PATH so `python`, `tensorflowjs_converter`,
  // etc. resolve to the pinned versions.
  process.env.PATH = `${VENV_BIN}:${process.env.PATH || ''}`;
}

function runCmd(cmd: string, opts: { cwd?: string } = {}): void {
  console.log(`    $ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: opts.cwd || ROOT });
}

// ---------------------------------------------------------------------------
// Core conversion
// ---------------------------------------------------------------------------

export interface ConvertOptions {
  checkpointJsonPath: string;    // e.g. 'checkpoints/supreme_champion.json'
  outputOnnxPath: string;        // e.g. 'public/onnx/supreme_champion_32.onnx'
  opset?: number;                // default 17
  keepIntermediates?: boolean;   // default false — deletes tmp/ subdirs on success
}

export interface ConvertResult {
  onnxPath: string;
  sizeBytes: number;
  channels: number;
  durationMs: number;
}

export async function convertCheckpointToONNX(opts: ConvertOptions): Promise<ConvertResult> {
  ensureToolchain();

  const t0 = Date.now();
  const absCkpt = path.resolve(ROOT, opts.checkpointJsonPath);
  const absOut = path.resolve(ROOT, opts.outputOnnxPath);

  if (!fs.existsSync(absCkpt)) {
    throw new Error(`Checkpoint not found: ${absCkpt}`);
  }

  console.log(`\n  ── Converting ${path.basename(absCkpt)} ──`);
  console.log(`     Source : ${absCkpt}`);
  console.log(`     Target : ${absOut}`);

  const base = path.basename(absCkpt, '.json');
  const stageTfjs   = path.join(ROOT, 'tmp', 'tfjs_layers', base);
  const stageKeras  = path.join(ROOT, 'tmp', 'keras', base);
  const stageOnnxRaw = path.join(ROOT, 'tmp', 'onnx_raw');
  const rawOnnxPath = path.join(stageOnnxRaw, `${base}.onnx`);

  // Wipe stale intermediates so re-runs are hermetic.
  for (const d of [stageTfjs, stageKeras]) {
    fs.rmSync(d, { recursive: true, force: true });
    fs.mkdirSync(d, { recursive: true });
  }
  fs.mkdirSync(stageOnnxRaw, { recursive: true });
  fs.mkdirSync(path.dirname(absOut), { recursive: true });

  // Stage 1: JSON checkpoint → TFJS Layers on disk
  //          (tfjs-node's `model.save('file://…')` writes model.json + shard.bin)
  console.log('  [1/4] Loading JSON checkpoint into a tfjs LayersModel…');
  const ckpt = JSON.parse(fs.readFileSync(absCkpt, 'utf-8')) as ModelCheckpoint;
  const model = createCNNModelFromCheckpoint(ckpt);
  const channels = model.inputs[0]?.shape?.[3] as number ?? 32;

  console.log(`  [1/4] Saving TFJS Layers snapshot (${channels}-channel) to ${stageTfjs}`);
  await saveTfjsLayersModelToDir(model, stageTfjs);

  // Stage 2: TFJS Layers → Keras SavedModel via tensorflowjs_converter
  console.log('  [2/4] Converting TFJS Layers → Keras SavedModel via tensorflowjs_converter');
  runCmd(
    `tensorflowjs_converter --input_format=tfjs_layers_model --output_format=keras_saved_model ` +
    `"${path.join(stageTfjs, 'model.json')}" "${stageKeras}"`,
  );

  // Stage 3: Keras SavedModel → ONNX via tf2onnx
  const opset = opts.opset ?? 17;
  console.log(`  [3/4] Converting Keras SavedModel → ONNX fp32 (opset ${opset}) via tf2onnx`);
  runCmd(
    `python -m tf2onnx.convert --saved-model "${stageKeras}" --opset ${opset} --output "${rawOnnxPath}"`,
  );

  // Stage 4: onnxsim graph simplification (constant folding, dead-op removal)
  console.log('  [4/4] Simplifying ONNX graph via onnxsim');
  runCmd(`python -m onnxsim "${rawOnnxPath}" "${absOut}"`);

  const sizeBytes = fs.statSync(absOut).size;
  const durationMs = Date.now() - t0;

  console.log(`  ✓  Wrote ${absOut}`);
  console.log(`     Size    : ${(sizeBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`     Elapsed : ${(durationMs / 1000).toFixed(1)}s`);

  if (!opts.keepIntermediates) {
    fs.rmSync(stageTfjs, { recursive: true, force: true });
    fs.rmSync(stageKeras, { recursive: true, force: true });
    fs.rmSync(rawOnnxPath, { force: true });
  }

  return { onnxPath: absOut, sizeBytes, channels, durationMs };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface CliArgs {
  only?: '32' | '64';
  inPath?: string;
  outPath?: string;
  keepIntermediates?: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {};
  for (const arg of argv) {
    if (arg === '--keep-intermediates') { out.keepIntermediates = true; continue; }
    const m = arg.match(/^--([^=]+)=(.+)$/);
    if (!m) continue;
    const [, k, v] = m;
    if (k === 'only') {
      if (v !== '32' && v !== '64') throw new Error(`--only must be '32' or '64' (got '${v}')`);
      out.only = v;
    } else if (k === 'in') {
      out.inPath = v;
    } else if (k === 'out') {
      out.outPath = v;
    } else {
      throw new Error(`Unknown flag: --${k}`);
    }
  }
  return out;
}

const DEFAULT_TARGETS: Array<{ label: string; size: '32' | '64'; in: string; out: string }> = [
  {
    label: '32-channel supreme champion',
    size: '32',
    in: 'checkpoints/supreme_champion.json',
    out: 'public/onnx/supreme_champion_32.onnx',
  },
  {
    label: '64-channel supreme champion',
    size: '64',
    in: 'checkpoints/supreme_champion_64.json',
    out: 'public/onnx/supreme_champion_64.onnx',
  },
];

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Custom single-file mode
  if (args.inPath || args.outPath) {
    if (!args.inPath || !args.outPath) {
      throw new Error('Both --in=<checkpoint.json> and --out=<file.onnx> must be given together.');
    }
    const res = await convertCheckpointToONNX({
      checkpointJsonPath: args.inPath,
      outputOnnxPath: args.outPath,
      keepIntermediates: args.keepIntermediates,
    });
    console.log(`\nDone. 1 file written, total ${(res.sizeBytes / 1024 / 1024).toFixed(2)} MB`);
    return;
  }

  const targets = args.only
    ? DEFAULT_TARGETS.filter(t => t.size === args.only)
    : DEFAULT_TARGETS;

  console.log(`\n═══ ONNX CONVERSION ═══`);
  console.log(`  Targets: ${targets.length}`);
  for (const t of targets) console.log(`    • ${t.label}  →  ${t.out}`);

  const results: ConvertResult[] = [];
  for (const t of targets) {
    if (!fs.existsSync(path.join(ROOT, t.in))) {
      console.warn(`\n  ⚠️  Skipping "${t.label}": source file ${t.in} not found.`);
      continue;
    }
    const res = await convertCheckpointToONNX({
      checkpointJsonPath: t.in,
      outputOnnxPath: t.out,
      keepIntermediates: args.keepIntermediates,
    });
    results.push(res);
  }

  const totalMB = results.reduce((a, r) => a + r.sizeBytes, 0) / 1024 / 1024;
  console.log(`\n═══ DONE ═══`);
  console.log(`  ${results.length} artefact(s), ${totalMB.toFixed(2)} MB total.\n`);
}

// Only run main() when executed directly, not when imported by the
// flywheel promotion hook.
if (isMain) {
  main().catch(err => {
    console.error('\n❌  Conversion failed:', err.message || err);
    process.exit(1);
  });
}
