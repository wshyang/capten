# Neural Network Weights, the "missing .bin file", and moving to ONNX

_Last updated: 2026-08-12_

This document answers two related questions the team has been asking:

1. "Docs on the internet say my TensorFlow weights should be a `.bin` file. Where is my `.bin` file?"
2. "We want the browser to use ONNX / Transformers.js while keeping training in TensorFlow. What does that workflow look like, and is Microsoft's ONNX Runtime Web actually a better fit for us than Transformers.js?"

---

## 1. Why there is no `.bin` file today

The blog posts you were reading describe **TensorFlow.js's `tf.io` "graph model" / "layers model" format**, which is what you get when you run:

```bash
tensorflowjs_converter \
  --input_format=keras \
  path/to/model.h5 \
  path/to/output_dir
```

That converter emits **two artefacts**:

| File                   | What's inside                                                                 |
|------------------------|--------------------------------------------------------------------------------|
| `model.json`           | JSON topology (layer graph) + a `weightsManifest` describing the binary shards |
| `group1-shard1of1.bin` | Raw little-endian Float32 weight bytes, sharded into ≤4 MiB chunks             |

That is the "standard" TFJS layout — model.json + one or more `.bin` shards. It is what libraries like `tf.loadLayersModel('.../model.json')` expect.

### What Capten actually does

We do **not** use that pipeline. Look at `src/engine/ai/nn/checkpoints.ts`:

```ts
export interface ModelCheckpoint {
  generation: number;
  winRate: number;
  timestamp: number;
  weights: { shape: number[]; data: number[] }[];  // <-- weights inlined as JS numbers
}
```

Every training script (`scripts/train_32_from_scratch.ts`, `resumableTrainer32.ts`, etc.) writes the model out through our own `exportModelCheckpoint()` / `importModelCheckpoint()` helpers. Those helpers walk `model.getWeights()`, call `.arraySync()` on each tensor, and dump the resulting nested `number[]` into a **single JSON file**:

- `checkpoints/supreme_champion.json` — 11 MB (32-channel)
- `checkpoints/supreme_champion_64.json` — 23 MB (64-channel)
- `public/checkpoints/supreme_champion.json` — 8 MB (served to the browser)
- `public/checkpoints/supreme_champion_64.json` — 16 MB (served to the browser)

Each float becomes a ~15-byte decimal string like `-0.10475662350654602`, which is why the JSON is 3–4× larger than the equivalent packed `.bin` would be.

### So where is your `.bin` file?

**There isn't one.** We deliberately chose a self-contained JSON container so:

- Checkpoints can be transported over `fetch` without a manifest indirection.
- The training pipeline has zero dependency on `tensorflowjs_converter`.
- Node scripts can round-trip weights with `JSON.parse` / `JSON.stringify` and nothing else.

If you _want_ TF's canonical `model.json` + `.bin` layout (for example to load with `tf.loadLayersModel` in another project), you can produce it in Node.js like this:

```ts
import * as tf from '@tensorflow/tfjs-node';
import { createCNNModelFromCheckpoint } from './src/engine/ai/nn/checkpoints';
import ckpt from './checkpoints/supreme_champion.json' assert { type: 'json' };

const model = createCNNModelFromCheckpoint(ckpt);
await model.save('file://./out/tfjs_supreme_champion');
// Produces: out/tfjs_supreme_champion/model.json
//           out/tfjs_supreme_champion/group1-shard1of1.bin
```

That is the artefact those blog posts are describing. Our repo has never needed to emit it because our runtime loader (`createCNNModelFromCheckpoint`) reads the inline-JSON format directly.

### Downsides of the current inline-JSON layout (worth knowing)

- **~3× larger over the wire** than a packed `.bin`. `supreme_champion_64.json` is 16 MB served; the equivalent Float32 blob would be ~5.3 MB (and ~1.5–2 MB gzipped).
- **CPU cost to parse**: `JSON.parse` on 16 MB blocks the main thread longer than `fetch().then(r => r.arrayBuffer())` + a typed-array view.
- **No sharding**, so no incremental download and no HTTP range caching.

These are exactly the pains the ONNX pipeline below fixes.

---

## 2. Target workflow — train in TensorFlow, ship ONNX to the browser

The desired split:

```
+-----------------+        tf2onnx / onnx-conversion       +-----------------+
| Backend (Node)  |  ── keras/tfjs SavedModel ──────────▶ | .onnx file      |
| tensorflow.js   |                                        | (weights baked  |
| training loop   |                                        |  in as INITS)   |
+-----------------+                                        +-----------------+
                                                                    │
                                                                    ▼
                                                           +----------------------+
                                                           | Frontend (browser)   |
                                                           | onnxruntime-web OR   |
                                                           | @xenova/transformers |
                                                           | ─ WebGPU / WASM ─    |
                                                           +----------------------+
```

Conversion is a **one-way, offline** step run whenever we promote a champion. The browser bundle never touches TensorFlow again.

### 2.1 One-off pieces to build

1. **`scripts/convert_checkpoint_to_onnx.ts`** — thin Node wrapper that:
   - Loads `checkpoints/*.json` via `createCNNModelFromCheckpoint()`.
   - Calls `model.save('file://./tmp/tfjs_model')` to get `model.json` + `.bin`.
   - Shells out to `tf2onnx` (installed via `pipx install tf2onnx onnx`) to produce `public/onnx/supreme_champion_64.onnx`.
   - Runs `onnxsim` (optional) to fold constants and shrink the graph.
2. **A frontend inference module** (`src/engine/ai/nn/onnxInference.ts`) that mirrors the current `runInference(state, model)` contract but calls the chosen ONNX runtime.
3. **Feature parity checks** — a fixture test that loads a known state, runs it through both the TFJS and ONNX pipelines, and asserts the policy/value outputs agree to `1e-4`.

### 2.2 Conversion command (recipe)

```bash
# One-off host setup (Python side — needed for tf2onnx)
pipx install tf2onnx onnx onnxsim onnxruntime

# In-repo: dump the TFJS layers model, then convert
npx ts-node scripts/convert_checkpoint_to_onnx.ts \
  --in  checkpoints/supreme_champion_64.json \
  --out public/onnx/supreme_champion_64.onnx
```

Under the hood the script runs the equivalent of:

```bash
tensorflowjs_converter --input_format=tfjs_layers_model \
  --output_format=keras tmp/tfjs_model/model.json tmp/keras_model
python -m tf2onnx.convert \
  --keras tmp/keras_model \
  --opset 17 \
  --output public/onnx/supreme_champion_64.onnx
python -m onnxsim public/onnx/supreme_champion_64.onnx \
                  public/onnx/supreme_champion_64.onnx
```

Expected footprint for our 64-channel network:

| Artefact                                     | Size    | Notes                              |
|---------------------------------------------|---------|------------------------------------|
| `supreme_champion_64.json` (today)          | 16 MB   | Inline decimal weights             |
| `supreme_champion_64.onnx` (float32)        | ~3.1 MB | Weights + graph, no JSON overhead  |
| `supreme_champion_64.onnx` (int8 quantised) | ~0.9 MB | 4× smaller, ~1% accuracy delta     |
| gzipped over the wire                       | ~0.4 MB | Payload win vs today = 40× lighter |

### 2.3 Loading the model in the browser

Both runtimes below happily consume the same `.onnx` file — you can even ship one artefact and pick the runtime at load time.

**ONNX Runtime Web:**
```ts
import * as ort from 'onnxruntime-web/webgpu';

const session = await ort.InferenceSession.create('/onnx/supreme_champion_64.onnx', {
  executionProviders: ['webgpu', 'wasm'], // WebGPU when available, WASM fallback
  graphOptimizationLevel: 'all',
});

const inputTensor = new ort.Tensor('float32', encodedState, [1, 11, 11, 32]);
const { policy_head, value_head } = await session.run({ input: inputTensor });
```

**Transformers.js (`@xenova/transformers`):**
```ts
import { AutoModel, Tensor } from '@xenova/transformers';

const model = await AutoModel.from_pretrained('/onnx/supreme_champion_64', {
  quantized: false,   // set true if you shipped int8
});
const out = await model({ input: new Tensor('float32', encodedState, [1, 11, 11, 32]) });
```

---

## 3. ONNX Runtime Web vs Transformers.js — the assessment you asked for

**TL;DR: For Capten specifically, use `onnxruntime-web` directly. Transformers.js is a thick, task-oriented wrapper around it that adds ~2 MB of code you will never use for a custom 11×11 policy/value net.**

### 3.1 What each library actually is

| Aspect                        | ONNX Runtime Web (`onnxruntime-web`)                                    | Transformers.js (`@xenova/transformers`)                                 |
|------------------------------|-------------------------------------------------------------------------|---------------------------------------------------------------------------|
| **Layer**                    | Low-level runtime — you give it a tensor, it gives you tensors back.    | High-level "Hugging Face `transformers` for the browser". Wraps `onnxruntime-web` under the hood. |
| **Maintainer**               | Microsoft (part of the ONNX Runtime project).                           | Xenova (community), inspired by HF `transformers`.                        |
| **Target use case**          | Any ONNX graph.                                                          | Pre-trained NLP / vision / audio pipelines (BERT, Whisper, ViT, LLMs).    |
| **API shape**                | `InferenceSession.run({ input })` returns raw tensors.                  | `pipeline('text-classification', ...)`, `AutoModel.from_pretrained(...)`. |
| **Bundle overhead (min+gz)** | ~1.4 MB core + WASM/WebGPU binaries fetched lazily.                     | ~1.4 MB (`onnxruntime-web` re-exported) + ~1–2 MB of tokenizers, processors, feature extractors, config parsers you won't use. |
| **Execution providers**      | WebGPU, WebGL, WASM (SIMD + threads), WebNN (experimental).             | Same — it literally forwards to `onnxruntime-web`.                        |
| **Model discovery**          | Load a URL of your choice.                                              | Convention-driven: expects `config.json`, `tokenizer.json`, `onnx/model.onnx` in a HF-style folder. |
| **Custom architectures**     | ✅ Anything ONNX can express (Conv2D, MatMul, custom ops).              | Works, but you're paying for machinery (pre/post-processing pipelines, tokenizers) that never fires. |
| **Quantisation support**     | Yes — INT8 dynamic + static, plus the ORT extensions.                   | Yes — reuses ORT quantised kernels.                                       |
| **Streaming / batching**     | Manual, full control.                                                    | Opinionated, batched behind pipeline abstractions.                        |
| **Debuggability**            | You see every tensor at every step.                                     | Hidden behind pipelines/processors.                                       |

### 3.2 Where Transformers.js earns its weight

Transformers.js is genuinely great when:

- You want a pre-trained model from Hugging Face with **1 line of code**, tokeniser + processor included.
- Your model is a **standard transformer** (encoder / decoder / seq2seq) and you'd otherwise have to hand-roll the pre/post-processing.
- You want the same JS code to work with **any** HF-hosted model without touching it (audio, vision, NLP).

None of that is what we are doing. Capten runs a **tiny custom ConvNet** (32 or 64 channels, dual policy/value heads) on a fixed 11×11 board state we encode ourselves. There is no tokeniser, no image pre-processing, no HF hub. The "convenience" surface area of Transformers.js gives us nothing but weight.

### 3.3 Where ONNX Runtime Web wins for us

- **Smallest possible payload** — we only pay for the runtime + the model. Not for BERT tokenisers we'll never call.
- **Direct tensor I/O** — our `encodeStateTensor()` already produces a `Float32Array` of length `11*11*32`. `new ort.Tensor(...)` accepts it verbatim, no marshalling.
- **First-class WebGPU** — since ORT 1.17, WebGPU is stable, and the 64-channel ResNet fits comfortably. Sub-millisecond inference on modern hardware; WASM+SIMD fallback keeps older browsers at ~5–10 ms.
- **Model file portability** — the same `.onnx` runs unchanged in ORT Web, ORT Node (backend evaluation), ORT Mobile, and ORT native. Handy for offline eval.
- **Tighter debugging surface** — one abstraction (ONNX ops) instead of two (ONNX + HF pipeline configs).

### 3.4 The one caveat

If we later want to add a **built-in tutorial coach LLM** (say a distilled 100M chat model that whispers hints), Transformers.js suddenly becomes attractive again — you'd get chat templates, tokenisation, and generation for free. In that case the pragmatic move is **hybrid**:

- `onnxruntime-web` for our own policy/value net (loaded by `src/engine/ai/nn/onnxInference.ts`).
- `@xenova/transformers` **only** on the tutorial route, code-split so the main bundle stays lean.

### 3.5 Recommendation

For the migration you're planning **right now**, choose **ONNX Runtime Web**. Concretely:

1. Land `scripts/convert_checkpoint_to_onnx.ts` and produce `public/onnx/supreme_champion_{32,64}.onnx` (both float32 for parity, and an int8 variant per size for mobile).
2. Add `onnxruntime-web` as a runtime-only dependency; keep `@tensorflow/tfjs-node` in `devDependencies` for training.
3. Replace the browser inference call sites (`src/engine/ai/nn/model.ts` → predict path) with an `onnxInference.ts` module. Preserve the existing `runInference(state) -> { policy, value }` contract so no reducer / MCTS changes are needed.
4. Delete `@tensorflow/tfjs` from `dependencies` (leave `tfjs-node` in `devDependencies`). Expected bundle drop: **~1.6 MB min+gz** off the browser payload.
5. Revisit Transformers.js only when/if we introduce a language-model feature.

---

## Appendix A — Answering the original two-liner

> "From docs on the internet they mention my weights should be a `.bin` file, however where is my `.bin` file?"

You don't have one because our training pipeline **skips** the standard `tensorflowjs_converter` route and serialises weights inline as JSON via `checkpoints.ts`. The files you're looking for _would_ live next to a `model.json` if we ever called `await model.save('file://./out')`, but today we call `exportModelCheckpoint(model)` instead — which yields a single self-contained JSON checkpoint. Everything works, it's just a different container format.

> "I want to use Transformers.js for the frontend; can we train in TF and convert to ONNX for the browser?"

Yes — the pipeline in §2 is exactly that. But given our tiny custom ConvNet, drop Transformers.js and use **ONNX Runtime Web** directly (§3). You keep the "train in TensorFlow → ship ONNX" property, gain ~1.5 MB of bundle, and don't lose a single feature we actually use today.
