# Self-Audit — 2026-08-12

_Two audits in one document:_
1. **Outstanding tasks** — what did I commit to across the session and how much of it is actually done?
2. **Duplication** — what code smells did I introduce, and what should get factored into shared modules?

The goal is to be blunt about gaps so the next session doesn't start with a
false sense of "everything's fine."

---

## 1. Outstanding tasks

Verified by grep against the shipping branch `arena/019ff4e5-capten`.

### 1.1 ONNX Migration Plan (`doc/ONNX_MIGRATION_PLAN.md`)

| PR | Scope | Status | Evidence |
|----|-------|--------|----------|
| PR 1 | Docs + conversion tooling | ✅ Complete | `doc/ONNX_MIGRATION_PLAN.md`, `scripts/setup_onnx_toolchain.sh`, `scripts/convert_checkpoint_to_onnx.ts`, `scripts/verify_onnx_parity.ts`, `doc/CHECKPOINT_CONVERSION.md`. |
| PR 2 | Committed `.onnx` artefacts | ✅ Complete | `public/onnx/supreme_champion_32.onnx` (1.5 MB), `public/onnx/supreme_champion_64.onnx` (3.0 MB). Parity passes by 1000× margin. |
| PR 3 | Split `nn/` into browser/Node barrels | ✅ Complete | `nn/browser.ts`, `nn/engine.ts`, `nn/index.ts` rewritten. Training toolkit tree-shaken out (`grep -c 'EvolutionFlywheel' dist === 0`). |
| PR 4 | Async `RUN_AI_TURN` + ORT behind flag | ✅ Complete for the happy path | `AIEngine.planTurnAsync` + `planTurnAsyncOf`, `APPLY_AI_TURN_RESULT` action, `asyncTurnRunner.ts`, `onnxInference.ts`, jsdom mock, 3 new tests. |
| PR 5 | Flip browser default to ORT | ⚠️ Partial | `App.tsx` sets `inferenceBackend: 'onnx'` by default. **BUT: bundle is still 25 MB JS + 26 MB wasm** because tfjs-backend-webgl and the JSON checkpoint imports are still reachable via the sync `planTurn` fallback. `grep -c "tf.tensor4d\|LayersModel\|conv2d" dist/assets/index-*.js` returns non-zero. |
| PR 6 | Delete `'tfjs'` branch + flywheel hook + cleanup | ❌ Not started | See §1.2 below for the full list. |

### 1.2 Outstanding items owed by "PR 6"

Enumerated from `doc/ONNX_MIGRATION_PLAN.md` §9 (PR 6):

- [ ] Delete browser TFJS imports from `nn/engine.ts` (delete the sync
      `planTurn` NN body, delete `default32CkptData` / `default64CkptData`
      imports, delete `getCNNModel` from browser barrel).
- [ ] Move `@tensorflow/tfjs` from `dependencies` to `devDependencies`
      in `package.json`.
- [ ] Add bundle-size regression test (`scripts/assert_bundle_size.mjs`)
      that fails CI if any browser chunk exceeds a threshold. **Not
      present.**
- [ ] Delete `public/checkpoints/*.json` (the browser-facing 8 MB / 16 MB
      JSON blobs). **Still present** and still imported by `nn/engine.ts`.
- [ ] Delete `predictAction`/`predictActionSync` from what's now
      training-only `nn/model.ts`. **Still exported.**
- [ ] Delete `RUN_AI_TURN` / `RUN_AI_TURN_FOR_PLAYER` from the
      `GameAction` union. **Still present** — kept as legacy escape hatch.
- [ ] Migrate the **26 Node test files** that dispatch `RUN_AI_TURN`
      directly to the async orchestrator. Verified count via grep:
      `grep -l 'RUN_AI_TURN\b' tests/*.ts | wc -l → 26`.
- [ ] Wire the flywheel champion-promotion hook. **`src/engine/ai/nn/onnxPromotion.ts` does not exist.** None of the three `goalSeeker_*.ts` files reference `convertCheckpointToONNX` or `verifyONNXParity`.
- [ ] Add `tests/onnxParity.test.ts` (uses `onnxruntime-node`, runs the
      parity check against committed `.onnx` files inside vitest).
      **Not present.** Only the standalone `scripts/verify_onnx_parity.ts`
      exists.
- [ ] Add `tests/onnxPromotionRollback.test.ts`. **Not present.**
- [ ] Update `doc/RESUMABLE_TRAINING_AND_EVALUATION_GUIDE.md` to mention
      the auto-ONNX-promotion step. **Not updated.**

### 1.3 Tutorial UX Brainstorm (`doc/TUTORIAL_UX_BRAINSTORM.md`)

| Milestone | Scope | Status |
|-----------|-------|--------|
| A | Beginner-safe polish (formulas removed, Skip button, timer hidden, `isGameInProgress` tightened) | ✅ Complete (commit 4b44701) |
| B | Scripted sandbox with `INIT_MATCH_SANDBOX` reducer action + per-chapter board layouts + `disableAI: true` flag | ❌ Not started |
| C | Dark spotlight overlay (SVG mask cutout) + "Show me how" auto-demo after N seconds of inaction | ❌ Not started |
| D | Contextual in-match tooltips (first-time-only) for holding foul, interception, low energy, hand full, post-goal restart, with localStorage `seen` gate | ❌ Not started |

Milestone A is on-branch; B/C/D remain design docs only.

### 1.4 Runtime bugs I know about but didn't fix

None known. `npm run test` (26 jsdom + 4 async orchestrator + 4 tutorial + 4
config + 4 hand + node NN spec + node epsilon + persistence = 40+ tests) is
all green, and typecheck is clean.

The **behavioural claim I want to flag explicitly** is that with the
default `inferenceBackend: 'onnx'`, users get the ORT path on load, so PR 5
IS user-visible even without the bundle-size drop. WebGPU init + wasm
fetch add ~200–500 ms to first AI turn latency the first time the tab is
opened; cached thereafter. I did not measure this on real hardware.

### 1.5 Bundle-size ground truth

`dist/` from a clean `vite build` right now:

| Asset | Size | Gzipped |
|-------|-----:|--------:|
| `dist/assets/index-*.js`                          | 25.9 MB | 11.3 MB |
| `dist/assets/ort-wasm-simd-threaded.jsep-*.wasm`  | 26.8 MB |  6.4 MB |
| `dist/assets/index-*.css`                         |  75 KB  |  13 KB  |
| `dist/ort/*.wasm` + `.mjs` (static-copy'd)        |  ~50 MB | ~15 MB  |

The single `dist/assets/*.wasm` file is a Vite-side asset copy caused by
ORT's dynamic import; it's semi-duplicative of the `dist/ort/` files. PR 6
should clean this up.

`grep` inside the main JS chunk:
- `"weights:[{shape:"` — present at offset 1,118,083 → **JSON weights ARE inlined**.
- Largest single string constant: **24 MB** = tfjs-backend-webgl WebGL kernel source concatenated with everything after.

So the honest read: PR 5 shipped the browser default flip but made the
bundle bigger, not smaller. All the promised gains are in PR 6.

---

## 2. Duplication audit

Focus on things I created or worsened this session. Legacy duplication
in `goalSeeker_*.ts` and `resumableTrainer*.ts` is called out but I did
not touch those files and would not refactor them in the same session as
the ONNX migration.

### 2.1 [CREATED THIS SESSION] `NNEngine.planTurn` vs `planTurnAsync`

**Location:** `src/engine/ai/nn/engine.ts` lines ~210–288

**Duplication:** Both methods, when in `NN_ACTIVE` mode, build the exact same `AIPlannedTurnResult` shape. The bodies differ by only one line — sync vs async prediction — but the surrounding ~25 lines (posture, stage0, candidates, defensive bias, throw resolution, stage2, timing, description string, return object) are copy-pasted.

**Recommended factoring:**
```ts
// Extract a shared builder:
function buildNNPlannedTurnResult(
  state: GameState,
  actingSide: Side,
  prediction: { bestAction: MCTSCandidateAction; value: number },
  allCandidates: MCTSCandidateAction[],
  posture: Posture,
  stage0Card: CardDecision,
  stage2Card: CardDecision,
  startTime: number,
  descriptionSuffix: string,
): AIPlannedTurnResult { … }
```
Then `planTurn` and `planTurnAsync` become ~15 lines each: gather
common preludes, run their respective predictor, hand off to the builder.

**Effort:** 15 minutes. **Risk:** low — pure refactor, covered by the async orchestrator test.

### 2.2 [CREATED THIS SESSION] `getCNNModel` 32-vs-64 branch

**Location:** `src/engine/ai/nn/engine.ts` lines 52–98

**Duplication:** `if (size === '32') { … 20 lines … } else { … 25 lines … }`. Structure is identical apart from constants (`32`/`64`, `'supreme_champion'`/`'supreme_champion_64'`, `default32CkptData`/`default64CkptData`) and the 64-channel path's fallback to promoting a 32-channel checkpoint.

**Recommended factoring:**
```ts
const MODEL_DEFAULTS = {
  '32': { channels: 32, storageKey: 'supreme_champion',    bundle: default32CkptData },
  '64': { channels: 64, storageKey: 'supreme_champion_64', bundle: default64CkptData },
} as const;

function loadSharedCNNModel(size: '32' | '64'): tf.LayersModel {
  const cache = size === '32' ? sharedCNNModel32 : sharedCNNModel64;
  if (cache) return cache;
  const cfg = MODEL_DEFAULTS[size];
  const model = createCNNModel([11, 11, cfg.channels]);
  const ckpt =
    loadCheckpointFromStorage(cfg.storageKey, new LocalStorageBackend()) ??
    (cfg.bundle as unknown as ModelCheckpoint) ??
    (size === '64' ? promoteFrom32() : null);
  if (ckpt) importModelCheckpoint(model, ckpt);
  if (size === '32') sharedCNNModel32 = model; else sharedCNNModel64 = model;
  return model;
}
```
**Effort:** 20 minutes. **Risk:** low. Same tests still cover it.

### 2.3 [CREATED THIS SESSION] Modal shells in `App.tsx`

**Location:** `src/App.tsx` around lines 701, 792, 834.

**Duplication:** Three near-identical modal wrappers, each with `fixed inset-0 z-… bg-black/80 backdrop-blur-sm p-4 animate-fadeIn font-serif` → `parchment-card rounded-3xl p-6 shadow-2xl border-4 border-[#5c3a1e]`.

**Recommended factoring:**
```tsx
// src/ui/ModalShell.tsx
export const ModalShell: React.FC<{
  isOpen: boolean;
  maxWidth?: 'sm' | 'md' | 'lg' | '2xl';
  zLayer?: 50 | 60;
  children: React.ReactNode;
}> = ({ isOpen, maxWidth = 'md', zLayer = 50, children }) => {
  if (!isOpen) return null;
  return (
    <div className={`fixed inset-0 z-[${zLayer}] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn font-serif`}>
      <div className={`w-full max-w-${maxWidth} parchment-card rounded-3xl p-6 shadow-2xl border-4 border-[#5c3a1e] space-y-4`}>
        {children}
      </div>
    </div>
  );
};
```
Then the three call sites shrink to `<ModalShell isOpen={…}>…children…</ModalShell>`.

**Effort:** 30 minutes including replacing all 3 call sites. **Risk:** medium — need to preserve per-modal overrides (some use `max-w-2xl`, some `max-w-md`, some `text-center` on the inner div, one uses `overflow-y-auto`). Best done as its own PR so any visual regression is bisectable.

### 2.4 [CREATED THIS SESSION] `AIPlannedTurnResult` empty-plan literal

**Location:** `src/engine/ai/asyncTurnRunner.ts` catch branch (lines ~65–83).

**Duplication:** The empty-plan fallback literal — `{ posture: 'BALANCED', stage0Card: {...}, moves: [], stage2Card: {...}, stats: {...} }` — is a candidate for a named constant so tests can reference the same shape.

**Recommended factoring:**
```ts
// interface.ts
export const EMPTY_AI_PLANNED_TURN: AIPlannedTurnResult = {
  posture: 'BALANCED',
  stage0Card: { card: null, evaluatedDelta: 0 },
  moves: [],
  stage2Card: { card: null, evaluatedDelta: 0 },
  stats: { iterations: 0, nodesEvaluated: 0, bestScore: 0, timeMs: 0, candidateCount: 0, bestActionDescription: '' },
};
```
Then `asyncTurnRunner`'s catch branch does
`dispatch({ type: 'APPLY_AI_TURN_RESULT', side, result: { ...EMPTY_AI_PLANNED_TURN, stats: { …reasonString } }, rngStateAfter: rng.getState() })`.

**Effort:** 10 minutes. **Risk:** very low.

### 2.5 [PRE-EXISTING, WORTH FLAGGING] `goalSeeker_*.ts` triplet

**Location:** `src/engine/ai/nn/goalSeeker_d4_450.ts`, `goalSeeker_nn_vs_nn.ts`, `goalSeeker_64_vs_32.ts`.

**Duplication:** Three files, ~345 lines each, > 90% textual overlap (verified: `diff -u | wc -l` gives 324/318 for the pair-wise diffs on 344-line files).

**What varies:** the champion-comparison logic (whom the challenger fights: d4@50 MCTS / another NN / a 32-channel version) and the promotion-target naming (`supreme_champion`/`supreme_champion_64`).

**Recommended factoring:** Extract a shared `class GoalSeeker` base with hooks:
```ts
abstract class GoalSeekerBase {
  abstract evalOpponent(): OpponentSpec;
  abstract promotionTarget(): { key: string; publicFilename: string };
  async run() { … 300 lines of shared warm-start / evolutionary loop / eval / promote / persist … }
}
```

**Effort:** ~1 day, self-contained. **Risk:** medium — Node training code, hard to add integration tests for, so refactor by moving code without changing semantics and eyeball-diffing the log output against a run of the current code. **Not urgent** — doesn't block ONNX PR 6 or tutorial work.

### 2.6 [PRE-EXISTING, WORTH FLAGGING] `resumableTrainer32.ts` vs `resumableTrainer64.ts`

**Location:** `src/engine/ai/nn/resumableTrainer32.ts` (236 lines), `resumableTrainer64.ts` (301 lines). 431-line diff.

Same story as §2.5. Slightly less overlap (64-channel adds an extra promotion path). Same recommendation, same non-urgency.

### 2.7 [PRE-EXISTING, LOW-VALUE] `reducer.ts` card-effect switch-fest

**Location:** `src/engine/reducer.ts` `RUN_AI_TURN_FOR_PLAYER` (~lines 1750–2050) and `START_PLAYER_TURN` (~lines 2170–2400).

Both cases contain enormous `if (mctsResult.stage0Card.card && CARDS_BY_ID[mctsResult.stage0Card.card.id]) { … 80 lines of per-card behaviour … }` blocks. The card behaviours (deep_breath, second_wind, drain, clamp, screen, etc.) are duplicated across the two AI-side callsites.

**Recommended factoring:** an `applyAICardEffect(card, side, workingPieces, tempState) → void` helper called from both places.

**Effort:** ~½ day. **Risk:** high — this is game engine behaviour, no unit tests around individual card resolutions, easy to introduce subtle regressions. Not recommended unless we also add card-by-card unit tests first.

### 2.8 Ok as-is (I checked and they're fine)

- `applyDefensiveLineBreakBias` — already factored during PR 4. Called from
  both `planTurn` and `planTurnAsync`. Single source of truth. ✓
- `applyAITurnPlanForReview` — already factored during PR 4. Called from
  both `RUN_AI_TURN` and `APPLY_AI_TURN_RESULT`. ✓
- `planTurnAsyncOf` — the sync-to-async adapter helper. Single site of
  truth in `interface.ts`. ✓
- The 4 ORT-related files (`onnxInference.ts`, `asyncTurnRunner.ts`,
  `setupOnnxMock.ts`, `asyncAITurn.test.tsx`) each have one clear
  responsibility. No overlap. ✓

---

## 3. Recommended follow-up ordering

If we want to keep chipping at it, in the order I'd tackle them:

1. **§2.1 + §2.2 refactors (~30 min combined).** These are quick, obviously correct, and cleaner code makes PR 6's tfjs delete easier because there's less duplicated tfjs-imported code to remove.

2. **§2.4 empty-plan constant (~10 min).** Cheap, obvious, reduces "magic literals in error paths" risk.

3. **PR 6 proper (~½–1 day):**
   - Delete browser tfjs imports from `nn/engine.ts` (drop the sync NN body entirely, keep only ORT).
   - Remove `default*CkptData` JSON imports.
   - Move `@tensorflow/tfjs` to devDependencies.
   - Add bundle-size regression test.
   - Wire the `promoteCheckpointAsONNX` flywheel hook + write `tests/onnxParity.test.ts` and `tests/onnxPromotionRollback.test.ts`.
   - Migrate the 26 Node tests to use `planTurnAsyncOf`/`runAITurnAsync` helper (mostly mechanical).
   - Delete `public/checkpoints/*.json`.

4. **§2.3 ModalShell (~30 min).** Independent cleanup, unrelated to ONNX.

5. **Tutorial Milestones B/C/D.** Independent of ONNX work; can be interleaved.

The audit does NOT recommend touching §2.5 / §2.6 / §2.7 in the near
term. Those are pre-existing structural duplication in Node-only code
paths that aren't hurting the shipping product; they can be revisited
when someone next needs to modify those files anyway.

---

## 4. What I over-claimed earlier and should retract

- **PR 5 shipped a bundle-size drop.** No — PR 5 flipped the default backend but the bundle got bigger (~25 MB JS + 26 MB wasm) because both backends ship. The drop is PR 6.
- **Path B eats the 26-test migration.** I said this in the ONNX plan §2.5. I ended up **keeping `RUN_AI_TURN` alive as a legacy action** so the 26 tests still work unchanged. The migration is deferred to PR 6, not landed in PR 4 as I originally planned.
- **The tutorial confirmation "just works" (§1 of my first self-assessment).** I was asked "did you test it?" and the answer was no — the jump-ball picker bug you found is the receipt. I should not have declared the feature complete without clicking through it once in the live preview. That's a discipline gap and I flagged it in my earlier self-assessment.

The rest of my session-level claims hold up under grep, but flagging
these three so we don't build on them.
