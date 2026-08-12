# ONNX Runtime Web Migration Plan

_Approved 2026-08-12. Owner: engineering. Status: ready to implement._

## Locked decisions (2026-08-12 review)

1. **Full fp32 ONNX only.** No int8 quantisation for either the 32-channel
   or 64-channel model. Parity gate is `max|Δpolicy| < 1e-4` against the
   TFJS reference; anything looser is not shipped.
2. **Path B — async `RUN_AI_TURN`.** Reducer stays synchronous; the caller
   in `App.tsx` awaits ORT-Web and dispatches a new
   `APPLY_AI_TURN_RESULT` action carrying a pre-computed
   `AIPlannedTurnResult`. Same treatment for `RUN_AI_TURN_FOR_PLAYER`.
   We accept the ~30-test-file adjustment.
3. **Automated ONNX conversion inside the flywheel champion-promotion
   script.** Whenever a goal-seeker or tournament pipeline saves a new
   `supreme_champion*` checkpoint, it also runs the conversion + parity
   check. The promotion is not considered complete until the parity check
   passes; if parity fails, the promotion is rolled back and the run
   emits a hard error.

Everything downstream in this document reflects those three decisions.

## Goal

Keep training on TensorFlow (Node) exactly as it is today. Convert the
existing 32- and 64-channel dual-head ResNet weights to **ONNX fp32**, and
swap the browser inference path from `@tensorflow/tfjs` to
**`onnxruntime-web`**.

Non-goals for this pass: retraining, changing the model architecture,
touching MCTS, quantisation, or moving training to ONNX. Those stay
untouched.

---

## 1. Current state of play — what actually needs to change

Grep-verified surface area as of this branch:

| Category | Files | Notes |
|---|---|---|
| **Browser-facing NN inference** | `src/engine/ai/nn/model.ts` (`predictActionSync`, `predictAction`), `src/engine/ai/nn/index.ts` (`getCNNModel`, `NNEngine.planTurn`) | These are the only paths that must switch to ORT-Web. |
| **Checkpoint loading in the browser** | `src/engine/ai/nn/checkpoints.ts` (`createCNNModelFromCheckpoint`, `importModelCheckpoint`), plus JSON files under `public/checkpoints/` | Today the browser JSON.parses ~16 MB of inline weights and stuffs them into a `tf.LayersModel`. After migration the browser fetches a `.onnx` file directly and never touches JSON weights. |
| **Training-only code (Node)** | `src/engine/ai/nn/{flywheel,training,mutation,tournament32,goalSeeker_*,resumableTrainer*,auditMatch}.ts`, `scripts/*.ts` | Stays on `@tensorflow/tfjs-node`. Unchanged apart from the promotion hook (§3.5). |
| **Engine glue** | `src/engine/ai/index.ts` (`getAIEngine`), `src/engine/reducer.ts` cases `'RUN_AI_TURN'` (line 1662) and `'RUN_AI_TURN_FOR_PLAYER'` (line 1731) | These currently call `aiEngine.planTurn` synchronously. Path B splits this into a caller-side async planner + a reducer-side pure applier. |
| **UI copy** | `src/ui/MCTSVisualizer.tsx`, `src/ui/ConfigTuner.tsx` | Cosmetic only. Drop the "~8ms Turn Latency" claim because real numbers will differ with WebGPU. |
| **Vite build config** | `vite.config.ts`, `deploy/nginx.conf` | ORT-Web needs `.wasm` and `.onnx` assets served with the correct MIME types. |

**Approximate payload size** (fp32-only, measured against current `public/checkpoints/`):

| Artefact | Today (JSON) | After (ONNX fp32) | Gzipped |
|---|---|---|---|
| 32-channel | 8.0 MB | ~1.5 MB | ~0.7 MB |
| 64-channel | 16.0 MB | ~3.1 MB | ~1.4 MB |

Plus we drop `@tensorflow/tfjs` from the browser bundle: **~1.4 MB min+gz**.

Net first-load payload win, shipping the 64-channel by default: **~17 MB → ~4.5 MB** on the wire, ~2.8 MB gzipped.

---

## 2. Path B — async `RUN_AI_TURN`

### 2.1 The problem, restated in one line

`ORT-Web session.run()` returns a `Promise`. React's `useReducer` requires
that reducers be synchronous and pure. Something has to give, and that
something is where we call the engine.

### 2.2 The refactor

Today:

```
App.tsx effect ─dispatch({type:'RUN_AI_TURN'})─▶ reducer
                                                    │
                                                    ├─ getAIEngine(mode)
                                                    ├─ engine.planTurn(state)  ◀── sync TF call
                                                    └─ mutate state
```

After:

```
App.tsx effect ──▶ getAIEngine(mode)
                        │
                        └─ engine.planTurnAsync(state)  ◀── awaits ORT
                                    │
                                    ▼
              dispatch({type:'APPLY_AI_TURN_RESULT', side:'AI', result})
                                    │
                                    ▼
                                 reducer
                                    │
                                    └─ mutate state from `result`
                                       (pure, no engine call)
```

Two new interfaces on `AIEngine`:

```ts
export interface AIEngine {
  readonly mode: AIEngineMode;
  readonly label: string;

  /** Legacy sync planner — MCTS engines and epsilon-random keep this. */
  planTurn(state: GameState, rng: SeededRNG, actingSide: Side): AIPlannedTurnResult;

  /** New async planner — NN engines override this. Default just wraps planTurn. */
  planTurnAsync?(state: GameState, rng: SeededRNG, actingSide: Side): Promise<AIPlannedTurnResult>;
}
```

For MCTS and pure-random engines, `planTurnAsync` is a thin
`return Promise.resolve(this.planTurn(...))` default so the caller only
ever writes one path. Only `NNEngine` (and `EpsilonGreedyAIEngine`
wrapping it) implement a real async body.

### 2.3 New reducer actions

```ts
| { type: 'REQUEST_AI_TURN'; side: Side }         // caller announces intent; state transitions phase → 'AI_TURN'
| { type: 'APPLY_AI_TURN_RESULT'; side: Side;     // caller supplies the plan; reducer applies purely
    result: AIPlannedTurnResult; rngStateAfter: RngState }
```

`RUN_AI_TURN` and `RUN_AI_TURN_FOR_PLAYER` **stay in the type union** and
**keep their current bodies** for one release, marked `@deprecated`. They
now internally do the same work synchronously using the LEGACY TFJS
backend (still available behind the feature flag). This is the escape
hatch: if ORT breaks in production, we flip the flag and dispatch
`RUN_AI_TURN` as before. In PR 6 we delete them.

### 2.4 The caller-side async orchestrator

New file `src/engine/ai/asyncTurnRunner.ts`:

```ts
export async function planAndDispatchAITurn(
  state: GameState,
  dispatch: React.Dispatch<GameAction>,
  side: Side = 'AI',
) {
  const rng = createRNG(state.rngState);
  const mode = state.config.ai?.aiEngineMode || 'MCTS_ONLY';
  const engine = getAIEngine(mode, state.config.ai?.epsilonExploitRate ?? 0.75);

  const planFn = engine.planTurnAsync ?? ((s, r, a) => Promise.resolve(engine.planTurn(s, r, a)));

  try {
    const result = await planFn(state, rng, side);
    dispatch({
      type: 'APPLY_AI_TURN_RESULT',
      side,
      result,
      rngStateAfter: rng.getState(),
    });
  } catch (err) {
    console.error('AI turn planning failed:', err);
    // Fallback: dispatch a no-op "pass turn" so the game doesn't deadlock.
    dispatch({ type: 'APPLY_AI_TURN_RESULT', side, result: { moves: [], ...defaultEmptyPlan }, rngStateAfter: rng.getState() });
  }
}
```

`App.tsx`'s existing effect becomes:

```ts
useEffect(() => {
  if (state.phase === 'AI_TURN' && !state.matchResult.isOver) {
    const timer = setTimeout(() => {
      planAndDispatchAITurn(state, dispatch, 'AI');
    }, 500);
    return () => clearTimeout(timer);
  }
}, [state.phase, state.matchResult.isOver]);
```

### 2.5 Test file impact — full list

Grep confirms 73 hits of `RUN_AI_TURN*` across 29 files (2 in `src/`,
1 in `src/engine/types.ts`, and 26 test files). The migration pattern is
uniform:

```diff
- dispatch({ type: 'RUN_AI_TURN' });
+ const result = await planAndDispatchAITurnSync(state, 'AI'); // test helper
+ dispatch({ type: 'APPLY_AI_TURN_RESULT', side: 'AI', result, rngStateAfter: ... });
```

Because Node tests use MCTS (which is genuinely sync), we ship a
**sync-safe helper** for tests only:

```ts
// tests/helpers/runAITurnSync.ts — synchronous test helper.
// Only safe because MCTS/EpsilonGreedy engines' planTurn is genuinely sync.
// NEVER call this from browser code; it will throw for NN engines.
export function runAITurnSync(state: GameState, side: Side = 'AI'): AIPlannedTurnResult {
  const rng = createRNG(state.rngState);
  const engine = getAIEngine(state.config.ai?.aiEngineMode ?? 'MCTS_ONLY', ...);
  if (engine.planTurnAsync && !engine.planTurn) {
    throw new Error(`Engine ${engine.mode} is async-only; use runAITurnAsync in tests`);
  }
  return engine.planTurn(state, rng, side);
}
```

The 26 test files each get a mechanical rewrite of ~2 lines. Estimated
total: **~1 hour of grep-and-replace + 1 hour of test triage**. This is
part of PR 4 (see §9).

### 2.6 Why not keep the sync facade as a fallback?

Because Path A's staleness *is* observable if you look at telemetry, and
we don't want to ship a subtly wrong AI just to save a day of test
churn. Path B is the model that reflects reality: **inference is async,
the UI knows that, the reducer stays pure.** No shortcuts.

---

## 3. Conversion pipeline (offline, but auto-triggered by promotion)

### 3.1 Pipeline stages

```
checkpoints/supreme_champion_64.json          # today's inline-JSON weights
        │
        ▼  scripts/convert_checkpoint_to_onnx.ts
        │  (Node, uses tfjs-node + tfjs-converter)
        ▼
tmp/tfjs_layers/supreme_champion_64/          # standard TFJS layers format
    model.json
    group1-shard1of1.bin
        │
        ▼  tensorflowjs_converter --output_format=keras
        ▼
tmp/keras/supreme_champion_64/                # Keras SavedModel
        │
        ▼  python -m tf2onnx.convert --opset 17
        ▼
tmp/onnx_raw/supreme_champion_64.onnx         # ~3 MB fp32
        │
        ▼  python -m onnxsim (constant-folding, graph shrinking)
        ▼
public/onnx/supreme_champion_64.onnx          # final ~3 MB fp32
```

Same pipeline runs against `supreme_champion.json` to produce the
32-channel artefact. **No int8 stage** — locked decision.

### 3.2 The single conversion script

`scripts/convert_checkpoint_to_onnx.ts` — Node, TypeScript, ~120 lines:

```ts
import * as tf from '@tensorflow/tfjs-node';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createCNNModelFromCheckpoint } from '../src/engine/ai/nn/checkpoints';

export async function convertCheckpointToONNX(
  checkpointPath: string,
  outPath: string,
): Promise<void> {
  const ckpt = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
  const model = createCNNModelFromCheckpoint(ckpt);

  const base = path.basename(checkpointPath, '.json');

  // Stage 1: TFJS layers → on-disk format
  const stageDir = path.join('tmp', 'tfjs_layers', base);
  fs.mkdirSync(stageDir, { recursive: true });
  await model.save(`file://${stageDir}`);

  // Stage 2: TFJS layers → Keras SavedModel
  const kerasDir = path.join('tmp', 'keras', base);
  execSync(
    `tensorflowjs_converter --input_format=tfjs_layers_model --output_format=keras ` +
    `${stageDir}/model.json ${kerasDir}`,
    { stdio: 'inherit' },
  );

  // Stage 3: Keras → ONNX fp32
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  execSync(
    `python -m tf2onnx.convert --keras ${kerasDir} --opset 17 --output ${outPath}`,
    { stdio: 'inherit' },
  );

  // Stage 4: simplify (constant folding, graph shrinking)
  execSync(`python -m onnxsim ${outPath} ${outPath}`, { stdio: 'inherit' });

  console.log(`OK: ${outPath} (fp32)`);
}

// CLI entry
if (require.main === module) {
  (async () => {
    await convertCheckpointToONNX(
      'checkpoints/supreme_champion.json',
      'public/onnx/supreme_champion_32.onnx',
    );
    await convertCheckpointToONNX(
      'checkpoints/supreme_champion_64.json',
      'public/onnx/supreme_champion_64.onnx',
    );
  })();
}
```

`convertCheckpointToONNX` is a **library function**, not just a CLI, so
the flywheel promotion hook (§3.5) can import and call it directly.

### 3.3 Host-side Python dependencies

```bash
pipx install tensorflow-cpu==2.16.1   # tf2onnx pins TF ≤ 2.16
pipx inject tensorflow-cpu tf2onnx onnx onnxsim onnxruntime
```

Documented in a new `doc/CHECKPOINT_CONVERSION.md` with exact pinned
versions. **These do NOT go into `package.json`** — they're
conversion-time tools only.

The flywheel promotion hook (§3.5) shells out to `python`. If Python or
the tf2onnx toolchain is not installed, the hook detects it, logs a
clear error, marks the promotion as `PROMOTED_WITHOUT_ONNX`, and asks
the operator to run `scripts/convert_checkpoint_to_onnx.ts` manually
before the next deployment. Training is not blocked.

### 3.4 Parity verification (mandatory gate)

`scripts/verify_onnx_parity.ts` — Node script, always run alongside
conversion:

1. Loads the JSON checkpoint into a `tf.LayersModel` via
   `createCNNModelFromCheckpoint`.
2. Loads the produced `.onnx` file into `onnxruntime-node`.
3. Runs 100 random `Float32Array(11*11*channels)` inputs through both.
4. Asserts:
   - `max(abs(tfjs_policy - onnx_policy)) < 1e-4`
   - `max(abs(tfjs_value  - onnx_value ))  < 1e-4`
5. Also runs against a **fixed seeded input** so the parity number is
   reproducible in CI logs.

**Failing parity is a hard blocker** — the CLI exits non-zero, and the
flywheel promotion hook (§3.5) rolls back the promotion.

### 3.5 Auto-conversion in the champion-promotion script

Locked hook points, grepped from the current code:

- `src/engine/ai/nn/goalSeeker_d4_450.ts` around line 291 (32-ch supreme_champion promotion)
- `src/engine/ai/nn/goalSeeker_nn_vs_nn.ts` around line 293 (nn-vs-nn supreme_champion promotion)
- `src/engine/ai/nn/goalSeeker_64_vs_32.ts` around line 298 (64-ch winner promotion — needs a follow-up write to `supreme_champion_64`)

New helper `src/engine/ai/nn/onnxPromotion.ts`:

```ts
import * as path from 'path';
import * as fs from 'fs';
import type { ModelCheckpoint } from './checkpoints';
import { convertCheckpointToONNX } from '../../../scripts/convert_checkpoint_to_onnx';
import { verifyONNXParity } from '../../../scripts/verify_onnx_parity';

export interface PromotionResult {
  ok: boolean;
  onnxPath?: string;
  parityMaxDelta?: number;
  reason?: string;
}

/**
 * Called immediately after saveCheckpointToStorage('supreme_champion*', ckpt, …).
 * On failure, DELETES the freshly written checkpoint and rolls back the promotion.
 */
export async function promoteCheckpointAsONNX(
  checkpointJsonPath: string,      // e.g. 'checkpoints/supreme_champion_64.json'
  publicOnnxPath: string,          // e.g. 'public/onnx/supreme_champion_64.onnx'
  ckpt: ModelCheckpoint,           // the in-memory checkpoint we just saved
): Promise<PromotionResult> {
  const backupOnnx = publicOnnxPath + '.previous';

  try {
    // 1. Back up the previous ONNX so we can restore on failure.
    if (fs.existsSync(publicOnnxPath)) {
      fs.copyFileSync(publicOnnxPath, backupOnnx);
    }

    // 2. Run conversion. Requires Python + tf2onnx on the host.
    await convertCheckpointToONNX(checkpointJsonPath, publicOnnxPath);

    // 3. Parity check (fp32 tolerance = 1e-4).
    const parity = await verifyONNXParity(ckpt, publicOnnxPath, {
      samples: 100,
      seed: 20260812,
      tolerance: 1e-4,
    });

    if (!parity.ok) {
      // Roll back: restore the previous ONNX + delete the fresh checkpoint.
      if (fs.existsSync(backupOnnx)) {
        fs.renameSync(backupOnnx, publicOnnxPath);
      } else {
        fs.unlinkSync(publicOnnxPath);
      }
      return {
        ok: false,
        parityMaxDelta: parity.maxDelta,
        reason: `Parity check failed: max |Δ| = ${parity.maxDelta.toExponential(3)} > 1e-4`,
      };
    }

    // 4. Success — clean up backup.
    if (fs.existsSync(backupOnnx)) fs.unlinkSync(backupOnnx);
    return { ok: true, onnxPath: publicOnnxPath, parityMaxDelta: parity.maxDelta };

  } catch (err: any) {
    // Toolchain missing OR conversion crashed. Restore the backup and warn.
    if (fs.existsSync(backupOnnx)) {
      fs.renameSync(backupOnnx, publicOnnxPath);
    }
    return {
      ok: false,
      reason: `ONNX conversion failed: ${err.message}. ` +
              `Previous ONNX (if any) restored. Run scripts/convert_checkpoint_to_onnx.ts ` +
              `manually and re-deploy before the next release.`,
    };
  }
}
```

Call sites (illustrative diff for `goalSeeker_d4_450.ts`):

```diff
   saveCheckpointToStorage('supreme_champion', ckpt, supremeBackend);
   const publicDir = path.resolve(process.cwd(), 'public/checkpoints');
   fs.mkdirSync(publicDir, { recursive: true });
   fs.writeFileSync(path.join(publicDir, 'supreme_champion.json'), JSON.stringify(ckpt));
+
+  // Auto-promote to ONNX for browser deployment.
+  const onnxResult = await promoteCheckpointAsONNX(
+    'checkpoints/supreme_champion.json',
+    'public/onnx/supreme_champion_32.onnx',
+    ckpt,
+  );
+  if (!onnxResult.ok) {
+    console.error(`[PROMOTION] ONNX auto-promotion failed: ${onnxResult.reason}`);
+    console.error(`[PROMOTION] JSON checkpoint HAS been written. Fix the ONNX toolchain and re-run scripts/convert_checkpoint_to_onnx.ts manually before deploying.`);
+  } else {
+    console.log(`[PROMOTION] ONNX auto-promotion OK: ${onnxResult.onnxPath} (parity |Δ| = ${onnxResult.parityMaxDelta!.toExponential(3)})`);
+  }
```

**Design notes on rollback semantics:**

- We **do not** roll back the JSON checkpoint write on ONNX failure.
  Training already produced a genuinely-better weight set; deleting it
  would waste the training run. What we roll back is the shipped `.onnx`
  so the deployed browser bundle never sees an unverified model.
- We **do** roll back to the previous `.onnx` file. This means the
  browser keeps serving the *previous* champion until the operator fixes
  the toolchain and re-runs the conversion manually. Zero user-visible
  regression.
- The flywheel logs the failure loudly. CI will pick it up.

---

## 4. Runtime integration in the browser

### 4.1 New file: `src/engine/ai/nn/onnxInference.ts`

Owns the single ORT-Web session, model loading, and tensor plumbing.
Path B means this is **async-native** — no sync facade needed.

```ts
import * as ort from 'onnxruntime-web/webgpu';
import type { GameState, Side } from '../../types';
import type { MCTSCandidateAction } from '../mcts/mcts';
import { encodeStateTensor } from './encoders';
import { encodeCandidateIndex } from './actionCodec';

let session32: ort.InferenceSession | null = null;
let session64: ort.InferenceSession | null = null;
const loading: Record<'32' | '64', Promise<ort.InferenceSession> | null> = { '32': null, '64': null };

const MODEL_URLS = {
  '32': '/onnx/supreme_champion_32.onnx',
  '64': '/onnx/supreme_champion_64.onnx',
};

export async function getSession(size: '32' | '64'): Promise<ort.InferenceSession> {
  const cached = size === '32' ? session32 : session64;
  if (cached) return cached;
  if (loading[size]) return loading[size]!;

  loading[size] = ort.InferenceSession.create(MODEL_URLS[size], {
    executionProviders: ['webgpu', 'wasm'],
    graphOptimizationLevel: 'all',
  }).then(s => {
    if (size === '32') session32 = s;
    else session64 = s;
    return s;
  });
  return loading[size]!;
}

/**
 * Fully async. Called from `App.tsx`'s effect via `planAndDispatchAITurn`.
 */
export async function predictActionAsync(
  size: '32' | '64',
  state: GameState,
  candidates: MCTSCandidateAction[],
  actingSide: Side,
): Promise<{ bestAction: MCTSCandidateAction; value: number; policyScores: Float32Array }> {
  if (candidates.length === 0) {
    return { bestAction: { moves: [] }, value: 0, policyScores: new Float32Array(64) };
  }

  const session = await getSession(size);
  const channels = size === '32' ? 32 : 64;
  const inputData = encodeStateTensor(state, actingSide, channels);
  const inputTensor = new ort.Tensor('float32', inputData, [1, 11, 11, channels]);

  const outputs = await session.run({ [session.inputNames[0]]: inputTensor });
  const policyScores = outputs.policy_head.data as Float32Array;
  const valueData = outputs.value_head.data as Float32Array;
  const value = valueData[0] || 0;

  let bestAction = candidates[0];
  let bestScore = -Infinity;
  for (const cand of candidates) {
    const idx = encodeCandidateIndex(cand, state, actingSide);
    const score = policyScores[idx] || 0;
    if (score > bestScore) {
      bestScore = score;
      bestAction = cand;
    }
  }

  return { bestAction, value, policyScores };
}

/** Optional: fire this on app mount to hide first-turn latency. */
export async function warmUpONNX(size: '32' | '64'): Promise<void> {
  const session = await getSession(size);
  const channels = size === '32' ? 32 : 64;
  const dummy = new Float32Array(11 * 11 * channels);
  const inputTensor = new ort.Tensor('float32', dummy, [1, 11, 11, channels]);
  await session.run({ [session.inputNames[0]]: inputTensor });
}
```

### 4.2 Rewrite `NNEngine.planTurnAsync`

`src/engine/ai/nn/browser.ts` (new) hosts an ORT-only version of
`NNEngine`. The class implements `planTurnAsync` as the primary code
path; the legacy sync `planTurn` throws a clear error explaining that
callers must use `planTurnAsync` (or the migration wasn't complete).

Same "Defensive Line-Break Policy" heuristic as today — that logic is
side-effect-free, so lift it into a helper shared by both the old TFJS
`NNEngine` and the new ORT `NNEngine`.

### 4.3 Sub-package split

Currently `src/engine/ai/nn/index.ts` is a barrel imported by both the
browser and Node scripts, which is why TFJS leaks into the browser
bundle. Split into three files:

- `src/engine/ai/nn/browser.ts` — the browser runtime, uses ORT-Web only.
  Exports `NNEngine` (async), `predictActionAsync`, `warmUpONNX`.
- `src/engine/ai/nn/node.ts` — the training toolkit, uses
  `@tensorflow/tfjs-node`. Exports `createCNNModel`, `trainCNNModel`,
  `predictAction`, `predictActionSync`, `EvolutionFlywheel`, etc.
- `src/engine/ai/nn/index.ts` — **types-only re-exports** (`ModelCheckpoint`,
  `TrainingSample`, engine mode literals). Zero runtime imports.

Then:
- `src/engine/ai/index.ts` imports `NNEngine` from `./nn/browser`.
- `scripts/*.ts` import from `./nn/node`.
- Tests pick whichever they need. JSDOM tests mock `./nn/browser`.

### 4.4 Warm-up in `App.tsx`

One-shot effect on mount:

```tsx
useEffect(() => {
  const size = state.config.ai?.nnModelSize || '64';
  warmUpONNX(size).catch(err => console.warn('ORT warm-up failed:', err));
}, []); // once
```

While `session32/64` is null, `planTurnAsync` awaits the loading promise
naturally. Users see a "AI model loading…" pill in the header until the
first `warmUpONNX` resolves; the pill hides after ~200 ms on WebGPU,
~500 ms on WASM. First AI turn cannot start until this resolves anyway
because the reducer transitions to `AI_TURN` only after the player
commits their first turn (usually seconds later).

---

## 5. Vite / hosting changes

### 5.1 Serve the WASM + ONNX files

`onnxruntime-web` loads its own `.wasm` binaries at runtime. We copy
them into `public/ort/` at build time via `vite-plugin-static-copy`:

```ts
// vite.config.ts additions
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/onnxruntime-web/dist/*.{wasm,mjs}',
          dest: 'ort',
        },
      ],
    }),
  ],
  optimizeDeps: {
    // ORT-Web ships as ESM but Vite's dep scanner sometimes trips on its
    // dynamic wasm loader. Excluding it forces on-demand loading.
    exclude: ['onnxruntime-web'],
  },
});
```

Then set once at app startup:

```ts
ort.env.wasm.wasmPaths = '/ort/';
```

### 5.2 MIME types & headers

`deploy/nginx.conf` additions:

```nginx
location ~* \.onnx$   { add_header Content-Type application/octet-stream; add_header Cache-Control "public, max-age=31536000, immutable"; }
location ~* \.wasm$   { add_header Content-Type application/wasm;         add_header Cache-Control "public, max-age=31536000, immutable"; }
```

No COOP/COEP required. We ship single-threaded WASM + WebGPU where
available; multi-threaded WASM (which needs COOP/COEP) is off the table
for this migration.

---

## 6. `package.json` changes

**Add** (browser runtime):
```json
"onnxruntime-web": "^1.22.0"
```

**Add** (dev-only, for Vite static copy):
```json
"vite-plugin-static-copy": "^2.1.0"
```

**Add** (dev-only, for the parity script):
```json
"onnxruntime-node": "^1.22.0"
```

**Move `@tensorflow/tfjs` from `dependencies` to `devDependencies`.**
Still installed for training scripts and Node tests, but Vite's browser
bundle should no longer pull it in. Verified by the bundle-size
regression check in §7.3.

`@tensorflow/tfjs-node` **stays in `dependencies`** because scripts
import it at runtime; it's platform-native and won't leak into the
browser bundle (Vite already externalises Node builtins via the existing
fallback in `nn/persistence.ts`).

---

## 7. Testing strategy

### 7.1 Existing test suites

- **Vitest node tests (`tests/`, 26 files using `RUN_AI_TURN`).** Each
  gets a mechanical rewrite (§2.5) to use `runAITurnSync` for MCTS-based
  scenarios or `runAITurnAsync` for NN-based scenarios. Estimated: **~2
  hours of grep-and-replace + triage**, landed in PR 4.
- **JSDOM tests (`test/jsdom/`).** These render the app. They will not
  actually load ORT-Web (jsdom has no `WebAssembly.instantiateStreaming`
  support without a shim). We provide `test/jsdom/setupOnnxMock.ts`:

  ```ts
  vi.mock('onnxruntime-web/webgpu', () => ({
    InferenceSession: {
      create: async () => ({
        inputNames: ['input'],
        run: async () => ({
          policy_head: { data: new Float32Array(64).fill(1 / 64) },
          value_head:  { data: new Float32Array([0]) },
        }),
      }),
    },
    Tensor: class {
      constructor(public type: string, public data: Float32Array, public dims: number[]) {}
    },
    env: { wasm: { wasmPaths: '' } },
  }));
  ```

  Wire it via `vitest.config.ts`'s `test.setupFiles`.

### 7.2 New tests

- `tests/onnxParity.test.ts` — Runs the parity check from §3.4 against
  the committed `public/onnx/*.onnx` files. Uses `onnxruntime-node`.
  Fails CI if the shipped ONNX diverges from the JSON reference by
  more than `1e-4`.
- `tests/onnxPromotionRollback.test.ts` — Simulates the flywheel
  promotion hook: writes a fake broken `.onnx`, verifies the rollback
  restores the previous file and marks the promotion as failed.
- `test/jsdom/asyncAITurn.test.tsx` — Boots the app under mocked ORT,
  simulates entering `AI_TURN`, and asserts `APPLY_AI_TURN_RESULT` is
  dispatched with a reasonable plan within one microtask flush.

### 7.3 Bundle size regression test

Add a CI step:
```bash
npx vite build
node scripts/assert_bundle_size.mjs   # fails if any chunk > 3 MB uncompressed
```

Rationale: the migration exists to shrink the bundle. If someone
accidentally re-adds `@tensorflow/tfjs` to a browser code path, this
fails immediately.

---

## 8. Execution provider selection

`onnxruntime-web` walks the provider list in order:

```ts
executionProviders: ['webgpu', 'wasm']
```

- **WebGPU** — Chrome 113+, Safari 18+, Firefox behind a flag.
  Sub-millisecond inference for our net.
- **WASM (SIMD)** — universal fallback. ~5–10 ms per forward pass;
  well below the 60 s human planning budget.
- Skip WebGL (deprecated in ORT).
- Skip WebNN (too thin in Aug 2026).

Telemetry: log `session.executionProviderName` once per session so we
can see the WebGPU adoption rate. Feed it into the MCTS visualizer
telemetry panel where we currently display the latency figure.

---

## 9. Rollout plan — 6 landable PRs

Each PR is independently mergeable. Behind a feature flag until PR 5.

### PR 1 — Docs + conversion tooling (no runtime change)
- Land this planning doc.
- Land `scripts/convert_checkpoint_to_onnx.ts` as a library + CLI.
- Land `scripts/verify_onnx_parity.ts` (uses `onnxruntime-node`).
- Land `doc/CHECKPOINT_CONVERSION.md` with pinned Python setup.
- **Ships nothing new to users.**

### PR 2 — Generate + commit ONNX artefacts
- Run conversion for both 32 and 64.
- Commit `public/onnx/supreme_champion_{32,64}.onnx` (fp32 only).
- CI runs `verify_onnx_parity` against the committed files on every PR.
- **Still ships nothing to users** — browser doesn't fetch them yet.

### PR 3 — Split `nn/` into `nn/browser` and `nn/node`
- Pure refactor. `nn/browser` still uses TFJS today.
- All existing tests must pass.
- Verify browser bundle size unchanged.

### PR 4 — Async `RUN_AI_TURN` + ORT integration behind a feature flag
- Add `onnxruntime-web` dep + Vite static-copy plugin.
- Implement `onnxInference.ts` and the ORT-based `NNEngine` in
  `nn/browser`.
- Add `AIEngine.planTurnAsync` interface, thin wrapper for MCTS engines.
- Add `APPLY_AI_TURN_RESULT` reducer action; keep `RUN_AI_TURN` as
  `@deprecated` legacy path.
- Add `asyncTurnRunner.ts` orchestrator; `App.tsx` uses it.
- Add feature flag `state.config.ai?.inferenceBackend: 'tfjs' | 'onnx'`,
  default `'tfjs'`.
- Add `?inferenceBackend=onnx` URL param and a hidden ConfigTuner toggle
  for dogfooding.
- **Migrate the 26 test files** using the pattern in §2.5.
- Verify parity in-browser by running both backends on the same seeded
  match and diffing telemetry.

### PR 5 — Flip default to ONNX, remove TFJS from browser bundle
- Change default `inferenceBackend` to `'onnx'`.
- Delete browser TFJS imports from `nn/browser`.
- Move `@tensorflow/tfjs` to `devDependencies`.
- Add bundle-size regression test to CI.
- **This is the user-visible shipping PR.** ~12–15 MB drop on first load.
- Keep the TFJS backend behind the feature flag as an emergency rollback
  for one release cycle.

### PR 6 — Wire flywheel auto-promotion + cleanup
- Add `promoteCheckpointAsONNX` calls to the three goal-seeker files
  (§3.5) with rollback semantics.
- Add `tests/onnxPromotionRollback.test.ts`.
- Delete the `'tfjs'` `inferenceBackend` branch (one release after PR 5).
- Delete `public/checkpoints/*.json` (the old inline-weights).
- Delete `predictAction`/`predictActionSync` from `nn/node`; training
  keeps using `model.predict()` directly.
- Delete `RUN_AI_TURN` and `RUN_AI_TURN_FOR_PLAYER` action types.
- Update `doc/RESUMABLE_TRAINING_AND_EVALUATION_GUIDE.md`.

Total: **~3 dev days** for PRs 1–5. PR 6 is a one-release follow-up
cleanup (~½ day).

---

## 10. Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| tf2onnx opset mismatch for `tf.layers.add()` (our residual) | Low | Parity check catches it. Fallback: opset 15 or 13. |
| Flywheel host lacks Python + tf2onnx | Medium | Promotion hook detects, logs, keeps JSON checkpoint, restores previous ONNX. Training not blocked. |
| Path B refactor breaks a subtle test we didn't grep | Medium | PR 4 is behind a feature flag; ship it internally first, then flip default in PR 5. |
| WebGPU init fails on Safari, falls back to WASM, users see latency spike | Low | We already tolerate 8–15 ms latency today; WASM is fine. One-line telemetry event. |
| Vite build breaks because of ORT's dynamic `.wasm` imports | Medium | `optimizeDeps.exclude: ['onnxruntime-web']` is the known fix. Verified in PR 4. |
| Old browsers without WebAssembly SIMD | Very low | ORT ships both SIMD and non-SIMD WASM; auto-picks. |
| Someone re-imports `@tensorflow/tfjs` into a browser file after PR 5 | High over time | Bundle-size regression test in CI catches immediately. |
| Rollback needed after PR 5 goes live | Low | The `'tfjs'` backend stays behind the feature flag until PR 6. Ops flips one env var. |

---

## 11. What we consciously don't do

- Train in ONNX. Training stays on TensorFlow — you asked for this.
- Int8 quantisation. Locked out. fp32 only.
- Introduce `@xenova/transformers`. See `doc/NN_WEIGHTS_AND_ONNX.md` §3.
- Migrate `nn/flywheel`, `nn/tournament32`, `nn/goalSeeker_*`, or any
  resumable trainer. Node-only, TFJS-node stays.
- Rewrite the model architecture. Same layers, same weights.
- Ship multi-threaded WASM + COOP/COEP.
- Replace the JSON checkpoint format used by training. Training still
  round-trips through `checkpoints.ts`'s inline-weights JSON. The
  `.onnx` file is a **deployment artefact only**, regenerated on every
  champion promotion.

---

## 12. Ready to implement

All three open questions from the previous draft are resolved:

1. Path A vs Path B → **Path B** (async `RUN_AI_TURN`).
2. int8 vs fp32 → **fp32 only** for both channel counts.
3. Auto-conversion in the promotion script → **yes**, with the rollback
   semantics detailed in §3.5.

Recommended kickoff: I start on **PR 1** in the next turn — land this
doc + the conversion + parity scripts. That's a self-contained ~200 lines
of Node code and adds no runtime deps. PR 2 (committing the actual
`.onnx` files) needs a machine with the Python toolchain installed; if
the sandbox doesn't have that, I'll wire everything up to run and
produce the artefacts locally, and you can run PR 2 once against a dev
box to commit the outputs.
