# Checkpoint Conversion — TF/JSON → ONNX Runtime Web

_Last verified: 2026-08-12, Debian 12 / Python 3.11 / Node 22._

This document covers **how to convert our inline-JSON `ModelCheckpoint`
files to `.onnx` graphs** that the browser can load via ONNX Runtime Web,
and **how the automated host bootstrap works**.

> See `doc/ONNX_MIGRATION_PLAN.md` for the wider migration plan (async
> `RUN_AI_TURN`, browser-side loader rewrite, flywheel promotion hook,
> etc.). This document is only about the conversion pipeline.

---

## TL;DR

```bash
# One-time host bootstrap (installs Python venv + pinned toolchain)
npm run onnx:setup

# Convert both 32- and 64-channel supreme_champion checkpoints
npm run onnx:convert

# Verify the .onnx files match the TFJS reference to fp32 tolerance
npm run onnx:verify
```

The three commands are idempotent and safe to re-run. Setup takes 2–4
minutes the first time (TensorFlow + tf2onnx wheels are large) and is a
no-op afterwards.

Output artefacts land in `public/onnx/`:

| File                                  | Size    | Source checkpoint                             |
|--------------------------------------|---------|-----------------------------------------------|
| `public/onnx/supreme_champion_32.onnx` | ~1.5 MB | `checkpoints/supreme_champion.json` (8.0 MB) |
| `public/onnx/supreme_champion_64.onnx` | ~3.0 MB | `checkpoints/supreme_champion_64.json` (16 MB) |

That is a **~5.3× payload reduction** for the same model, before we even
gzip the file on the wire.

---

## 1. Why this exists

Today `public/checkpoints/*.json` files are ~8 MB and ~16 MB blobs whose
weights are stored as decimal JSON strings (see
`doc/NN_WEIGHTS_AND_ONNX.md` §1). The browser `fetch`es and
`JSON.parse`s them at startup, then feeds the numbers into
`@tensorflow/tfjs`.

We want the browser to instead fetch a compact `.onnx` file and run it
through `onnxruntime-web`. Training stays on TensorFlow-Node exactly as
today — this pipeline is **inference-artefact-only**.

The pipeline in one picture:

```
checkpoints/supreme_champion.json
        │  scripts/convert_checkpoint_to_onnx.ts
        │  (Node + @tensorflow/tfjs)
        ▼
tmp/tfjs_layers/supreme_champion/
    model.json + group1-shard1of1.bin
        │  tensorflowjs_converter (Python)
        ▼
tmp/keras/supreme_champion/
    saved_model.pb + variables/
        │  tf2onnx.convert (Python)
        ▼
tmp/onnx_raw/supreme_champion.onnx
        │  onnxsim (Python — graph simplification)
        ▼
public/onnx/supreme_champion_32.onnx    ← final artefact
```

---

## 2. Host prerequisites

The bootstrap script (`scripts/setup_onnx_toolchain.sh`) checks these
for you and installs anything missing that it can install without
manual intervention. What it **cannot** install (and will ask you to
install) is Python itself.

| Requirement          | How the bootstrap handles it                                              |
|---------------------|---------------------------------------------------------------------------|
| Python 3.9–3.12     | Aborts with a clear error if missing or 3.13+ (tf2onnx incompatible).    |
| `python3-venv`      | On Debian/Ubuntu, auto-installs via `sudo apt-get` if sudo is available. |
| ~2 GB free disk     | TensorFlow-cpu wheel is fat. Not automated — just needs to be true.      |
| Internet access to PyPI | Required for the pip installs. If your CI blocks PyPI, mirror the wheels. |

Node.js side is already handled by `npm install` — no extra Node deps
are needed for conversion (we use plain `@tensorflow/tfjs`, not the
native `@tensorflow/tfjs-node`, so nothing is downloaded from
`storage.googleapis.com`).

---

## 3. Bootstrap: `npm run onnx:setup`

Creates a Python virtualenv at `.venv-onnx/` (gitignored) and installs
the pinned toolchain into it:

| Package         | Pinned version | Reason for pin                                    |
|----------------|---------------:|---------------------------------------------------|
| tensorflow-cpu | 2.16.2         | Latest TF that tf2onnx 1.16 supports.             |
| tensorflowjs   | 4.22.0         | Ships the `tensorflowjs_converter` CLI.           |
| tf2onnx        | 1.16.1         | Last release supporting TF 2.16.                  |
| onnx           | 1.16.2         | Matches tf2onnx expectations.                     |
| onnxsim        | 0.4.36         | Constant-folding / graph shrink.                  |
| onnxruntime    | 1.19.2         | For parity-check runs in `verify_onnx_parity.ts`. |
| setuptools     | <70            | tensorflow_hub imports `pkg_resources`, which was removed in setuptools 71+. Without this pin, `tensorflowjs_converter` fails at import time. |

Do NOT bump those pins casually. tf2onnx has a very narrow supported TF
range and newer TensorFlow releases regularly break the ONNX export path.
After a successful install, the versions get written into
`.venv-onnx/.installed-versions` and used to detect stale venvs on
subsequent runs.

### Bootstrap flags

```bash
./scripts/setup_onnx_toolchain.sh            # install / repair
./scripts/setup_onnx_toolchain.sh --force    # delete .venv-onnx first
./scripts/setup_onnx_toolchain.sh --check    # verify only (exit 1 if bad)
./scripts/setup_onnx_toolchain.sh --help     # show usage
```

### Common bootstrap failures and fixes

**"Python 3.13 is not supported by tf2onnx 1.16"**  → Use Python
3.9–3.12. On Debian 12 the default `python3` is 3.11, which is fine.
On macOS with Homebrew, `brew install python@3.11`.

**"python3-venv module not available"**  → On Debian/Ubuntu the script
will `sudo apt-get install python3-venv` automatically if you have
passwordless sudo. Otherwise it prints the command and aborts.

**"tensorflowjs_converter cannot import its dependencies"**  → The
pinned `setuptools<70` guard failed to apply. Nuke and retry:
```bash
./scripts/setup_onnx_toolchain.sh --force
```

**pip is slow or ECONNRESET on PyPI**  → Your network is blocking parts
of PyPI. Retry, or point pip at a mirror:
```bash
export PIP_INDEX_URL=https://your-mirror/simple
./scripts/setup_onnx_toolchain.sh --force
```

---

## 4. Convert: `npm run onnx:convert`

Runs `scripts/convert_checkpoint_to_onnx.ts` via `tsx`. It auto-locates
the `.venv-onnx/bin` directory and prepends it to `PATH`, so you do
**not** need to `source .venv-onnx/bin/activate` yourself.

### Default behaviour

Converts both bundled checkpoints:

- `checkpoints/supreme_champion.json`    → `public/onnx/supreme_champion_32.onnx`
- `checkpoints/supreme_champion_64.json` → `public/onnx/supreme_champion_64.onnx`

Prints per-stage progress. Total wall-clock on the sandbox host is
~15 s per checkpoint (dominated by protobuf parsing in tf2onnx).

### Flags

```bash
# Only convert the 32-channel model
npm run onnx:convert -- --only=32

# Custom source/target pair
npm run onnx:convert -- \
  --in=checkpoints/some_experimental_model.json \
  --out=public/onnx/experiment.onnx

# Keep intermediates for debugging (tmp/tfjs_layers, tmp/keras)
npm run onnx:convert -- --keep-intermediates
```

### What the four stages do

1. **JSON → TFJS Layers on disk.** The script loads the JSON checkpoint
   through `createCNNModelFromCheckpoint` (in
   `src/engine/ai/nn/checkpoints.ts`), then writes a two-file layout
   compatible with `tensorflowjs_converter`:
   - `tmp/tfjs_layers/<name>/model.json`             (topology)
   - `tmp/tfjs_layers/<name>/group1-shard1of1.bin`   (packed fp32 weights)

   We write these files manually with `tf.io.withSaveHandler` so we
   don't need `@tensorflow/tfjs-node` (whose native addon has to
   download libtensorflow from Google's CDN and often gets blocked by
   corporate firewalls / sandboxes).

2. **TFJS Layers → Keras SavedModel.** `tensorflowjs_converter` shells
   out to TensorFlow inside the venv and materialises a full Keras
   SavedModel (variables/, saved_model.pb, keras_metadata.pb).

3. **Keras → ONNX fp32.** `python -m tf2onnx.convert --saved-model …
   --opset 17` walks the Keras graph and emits ONNX ops. Opset 17
   supports every op our net uses (Conv, Add, MatMul, Relu, Softmax,
   Tanh, Reshape, Transpose).

4. **onnxsim simplification.** Constant-folds initializers, removes
   dead identities, fuses Transpose pairs. For our net it typically
   drops ~7 ops without changing outputs. Result lands in
   `public/onnx/`.

### Library API for the flywheel

`convertCheckpointToONNX({checkpointJsonPath, outputOnnxPath})` is
exported from the same file. The flywheel champion-promotion hook (see
`doc/ONNX_MIGRATION_PLAN.md` §3.5) calls it right after
`saveCheckpointToStorage('supreme_champion*', …)`.

---

## 5. Verify: `npm run onnx:verify`

Runs `scripts/verify_onnx_parity.ts`. This is the **mandatory quality
gate** before we ship an `.onnx` file to users.

The script feeds identical seeded random input tensors through both:

1. The original JSON checkpoint via `@tensorflow/tfjs`.
2. The generated `.onnx` file via `onnxruntime-node`.

…and asserts that the outputs agree to **`max|Δ| < 1e-4`** across 100
samples on both the policy head (softmax over 64 actions) and the value
head (single tanh scalar).

Typical result on the current committed checkpoints:

```
[✓ PASS] 32-channel
       channels          : 32
       samples           : 100
       max policy delta  : 7.451e-8
       max value  delta  : 2.906e-7
       tolerance         : 1e-4

[✓ PASS] 64-channel
       channels          : 64
       samples           : 100
       max policy delta  : 2.593e-6
       max value  delta  : 1.788e-7
       tolerance         : 1e-4
```

Both models pass by margins ~1000× tighter than tolerance. Tiny drift
comes from opset-17 op fusion in `onnxsim` + fp32 rounding order.

### Flags

```bash
npm run onnx:verify -- --samples=1000       # more paranoid
npm run onnx:verify -- --tolerance=1e-5     # tighter gate
npm run onnx:verify -- --seed=999           # different random seed
npm run onnx:verify -- --only=64            # only 64-channel
npm run onnx:verify -- \
  --checkpoint=checkpoints/exp.json \
  --onnx=public/onnx/exp.onnx               # custom pair
```

Exit code is 0 only if every pair passes.

---

## 6. Regenerating after training a new champion

Whenever a training run promotes a new `supreme_champion*.json`:

```bash
npm run onnx:convert   # regenerate .onnx artefacts
npm run onnx:verify    # check parity vs the new JSON reference
git add public/onnx/supreme_champion_{32,64}.onnx checkpoints/supreme_champion*.json
git commit -m "Promote new supreme champion (with matching ONNX artefacts)"
```

The plan is to automate this inside the flywheel promotion script
itself (see `doc/ONNX_MIGRATION_PLAN.md` §3.5) — the `PR 6` milestone.
Once that lands, the hook will call `convertCheckpointToONNX()` and
`verifyONNXParity()` immediately after `saveCheckpointToStorage`, and
roll back the ONNX if parity fails.

---

## 7. Directory reference

```
capten/
├── checkpoints/                        # ← training-side JSON checkpoints (source of truth)
│   ├── supreme_champion.json           # 32-channel, 8 MB
│   ├── supreme_champion_64.json        # 64-channel, 16 MB
│   └── …
├── public/
│   ├── checkpoints/                    # ← today's browser-facing JSON (will be deleted in PR 6)
│   │   └── supreme_champion*.json
│   └── onnx/                           # ← new browser-facing ONNX artefacts
│       ├── supreme_champion_32.onnx    # 1.5 MB
│       └── supreme_champion_64.onnx    # 3.0 MB
├── scripts/
│   ├── setup_onnx_toolchain.sh         # bootstrap the Python venv
│   ├── convert_checkpoint_to_onnx.ts   # JSON → ONNX pipeline (also a library)
│   └── verify_onnx_parity.ts           # parity gate (also a library)
├── tmp/                                # intermediate artefacts (gitignored)
│   ├── tfjs_layers/<name>/             # stage 1 output
│   ├── keras/<name>/                   # stage 2 output
│   └── onnx_raw/<name>.onnx            # stage 3 output (pre-simplify)
└── .venv-onnx/                         # Python venv (gitignored)
    ├── bin/{python,pip,tensorflowjs_converter,…}
    └── .installed-versions             # pin-manifest sentinel
```

---

## 8. Design decisions

**Why not `@tensorflow/tfjs-node` for the conversion script?**
tfjs-node needs a ~200 MB `libtensorflow` C library downloaded at
install time from `storage.googleapis.com`. Corporate networks and
sandboxed CI runners routinely block that host, which broke us during
development. Plain `@tensorflow/tfjs` is pure JS, works everywhere, and
the "slow forward pass" cost doesn't matter because the conversion
script does **zero** forward passes — it only materialises the topology
+ weights to disk.

**Why not `pipx`?**
pipx creates one venv per tool. We need six tools that must live in
the *same* venv (they share TensorFlow), so `python -m venv .venv-onnx`
+ `pip install` is the right primitive.

**Why not int8 quantisation?**
Explicitly declined by the team (see `doc/ONNX_MIGRATION_PLAN.md`
locked-decisions block). fp32 only.

**Why pin setuptools<70?**
`tensorflow_hub` (a transitive dep of `tensorflowjs`) still does
`from pkg_resources import parse_version`. `pkg_resources` was removed
from setuptools 71+. Without this pin the CLI dies at import time with
`ModuleNotFoundError: No module named 'pkg_resources'`. This will be
fixed upstream someday; until then, pinning is the correct workaround.

**Why write `model.json` + `.bin` manually instead of `model.save('file://…')`?**
`model.save('file://…')` requires `@tensorflow/tfjs-node` (which we
dropped, see above). `tf.io.withSaveHandler` gives us the `ModelArtifacts`
object in memory; writing the two files ourselves is ~30 lines and
matches the exact format `tensorflowjs_converter` expects.
