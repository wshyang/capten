# Side-Agnostic AI Plan — From `aiCaptain`/`aiCarrier` to `ourCaptain`/`ourCarrier`

**Date:** 2026-08-09  
**Branch:** `arena/019fe604-capten` (at `c6a93e5`)  
**Goal:** AI can play from either side — top (row 0, `aiScoringCell`) or bottom (row 10, `playerScoringCell`) — with no hardcoded `aiCaptain`/`aiCarrier`/`AI` constants inside `src/engine/ai/*`.  
**Status:** Assessment + executable plan (no code changed yet). `evaluate.ts` is the reference implementation.

---

## 1. TL;DR — How Hard Is It?

**Difficulty: LOW-MEDIUM for `src/engine/ai/*`, MEDIUM for `rollout.ts` alone. Total ~2–4 engineer-days to correctness, 1 extra day to confidence.**

| Module | Hardcoded today? | Difficulty to make side-agnostic | Lines to touch | Risk |
|--------|------------------|----------------------------------|----------------|------|
| `evaluate.ts` | ✅ **Done** — already `ourSide/enemySide`, `ourCaptain/enemyCaptain`, `ourCarrier/enemyCarrier`, `ourScoringCell/enemyScoringCell` | **0** — template | 0 | None |
| `mcts.ts` | 85% done — `actingSide` threaded, but `selectAIPosture`/`evaluateStage*Cards` calls still hardcoded | **Low** — 3 call-site fixes + import rename | ~10 | Low |
| `cardSearch.ts` | 100% hardcoded `aiHand/aiCarrier/aiPieces` | **Low** — pure rename + param | ~70 | Low |
| `posture.ts` | 100% hardcoded `aiPieces/aiHasBall` | **Trivial** — 10 lines | ~15 | Low |
| `rollout.ts` | 95% hardcoded `aiPieces/aiCarrier/aiCaptain` + row logic `row>2?-1` | **Medium** — the only file needing new domain logic (attack direction mirror) | ~120 | **Medium** — if pocket detection wrong, AI plays backwards |
| `mctsAnalysis.ts` | Copy-paste fossil, hardcoded | **Low** if kept, or delete | ~80 if kept | Low |
| `reducer.ts` (engine, not AI) | Correctly side-specific — *should* stay `score.AI`/`PLAYER` | **Do not change** | 0 | — |
| `control.ts` / `interception.ts` | Already side-agnostic (uses `p.side`, `thrower.side`) | 0 | 0 | — |

> **Analogy:** `evaluate.ts` is the proof this is easy — 100 lines went from 30 hardcoded branches to 0 with `ourSide = actingSide; enemySide = actingSide==='AI'?'PLAYER':'AI'`. Every other file is the same mechanical transform, except `rollout.ts` which also needs to mirror *geometric* attack logic (rows).

**If you want the AI to play *literally* from top vs bottom (swap who starts at row 0):** no board change needed. `actingSide` already encodes "which side we are". `ourScoringCell = actingSide==='AI' ? aiScoringCell : playerScoringCell` *is* "where is my captain / where do I attack". The board never moves; the AI just looks up its own captain location via `actingSide`.

---

## 2. What "Hardcoded" Means — Inventory

Searched `src/engine/ai/*` for `AI|ai_|aiCaptain|aiCarrier` (counts after this audit):

```
evaluate.ts:     7 hits — all are `actingSide==='AI'? AI:PLAYER` ternaries (correct)
mcts.ts:        11 hits — 3 hardcoded calls (posture/cards), rest correct ternaries
posture.ts:      3 hits — 100% hardcoded
cardSearch.ts:   7 hits — 100% hardcoded
rollout.ts:     12 hits — ~10 hardcoded + row geometry
```

### 2.1 Per-file catalog

#### `posture.ts:3-5` — 10 lines, 3 variables
```ts
const aiPieces = state.pieces.filter(p=>p.side==='AI');
const aiHasBall = aiPieces.some(p=>p.hasBall);
const playerCarrier = playerPieces.find(p=>p.hasBall);
```
All `AI`/`PLAYER` literals. Should be `ourPieces/enemyPieces`, `ourHasBall`, `enemyCarrier`.

#### `cardSearch.ts:13-25,46-60` — 70 lines, 2 exported fns
```ts
const aiHand = state.hands.AI;
const aiMomentum = state.momentum.AI;
const aiPieces = state.pieces.filter(p=>p.side==='AI');
const aiCarrier = aiPieces.find(p=>p.hasBall);
const playerCarrier = playerPieces.find(...); // used as drain target (enemy)
```
Also `clamp` picks highest energy `playerPieces`, `bait` picks `playerPieces.isBlocker`, `jam_the_lane` averages `playerCarrier+playerCaptain` — all assume AI=our, PLAYER=enemy. Needs `ourHand/enemyHand`, `ourPieces/enemyPieces`.

#### `rollout.ts:23-209` — 120 lines, deepest
Hardcoded *and* geometrically asymmetric:
- `aiPieces/aiCarrier/aiCaptain` (line 23-25) — protagonist
- Teammate cut: `dRow = teammate.row >2 ? -1 : ...` (line 34) — AI attacks toward 0; PLAYER attacks toward 10 (`row<8 ? +1`)
- Pocket comment: "rows 2-3 shooting pocket, baseline flank rows 0-1" — should be rows `7-8` / `10` for bottom
- `previewThrow(aiCarrier, aiCaptain.cell)` / `score.AI+=1` (line 48,58) — no symmetric PLAYER branch
- Fallback `sort(a.cell.row - b.cell.row)` (line 86) — "lower row = forward" true for AI (0 is forward), false for PLAYER (10 is forward; should be `b.row - a.row` or `distance to scoringCell`)
- `bouncer.id==='ai_blocker'` (line 84,106) — should be `p.isBlocker`
- Defense: `passRay = getThrowPathCells(playerCarrier, playerCaptain)` + `for(p of aiPieces)` (line 165) — always AI defends; needs `enemyCarrier/enemyCaptain` + `ourPieces` defending
- Stagnation: `finalAIPieces = filter(side==='AI')` / `aiPiecesStart` / `row<=4` (line 200,208) — should be `ourPieces` / `ourInitial` / `isInOurAttackingHalf(cell)` 

#### `mcts.ts:134, 135, 197, 210, 226, 285` — 10 lines
- `selectAIPosture(state)` → missing `actingSide` (line 134)
- `evaluateStage0Cards(state)` / `evaluateStage2Cards(state)` → missing `actingSide` (line 135,197)
- `fmtId = id.replace('ai_','A.').replace('p_','P.')` (line 226) — cosmetic, not a bug, but will swap labels if bottom side is told to be "AI" — keep or generalize to side-aware label
- `scoringCell/enemyScoringCell` ternaries (line 285-286, also 49,211 in `applyActionToSimState`) — **already correct**, example to copy

#### `evaluate.ts:203-212` — 0 bugs, template
Already the desired pattern: `ourSide=actingSide` then every derived value is ternary on `actingSide`. `evaluateCarrier(ourCarrier, ourCaptain, enemyCaptain, ourPieces, ..., ourRisk, enemySide)` is the canonical side-agnostic signature.

---

## 3. Target Design — `ourX` / `enemyX` + Attack-Zone Helper

### 3.1 The core abstraction (copy from `evaluate.ts`)

Every AI function that today takes `state` should take `state, actingSide: Side`:

```ts
export function anything(state: GameState, actingSide: Side = 'AI'): Result {
  const ourSide: Side = actingSide;
  const enemySide: Side = actingSide === 'AI' ? 'PLAYER' : 'AI';

  const ourScoringCell: Cell  = actingSide === 'AI' ? BOARD_CONFIG.aiScoringCell     : BOARD_CONFIG.playerScoringCell;
  const enemyScoringCell: Cell= actingSide === 'AI' ? BOARD_CONFIG.playerScoringCell : BOARD_CONFIG.aiScoringCell;

  const ourInitial: typeof BOARD_CONFIG.aiPiecesStart =
                                  actingSide === 'AI' ? BOARD_CONFIG.aiPiecesStart   : BOARD_CONFIG.playerPiecesStart;
  const enemyInitial =            actingSide === 'AI' ? BOARD_CONFIG.playerPiecesStart: BOARD_CONFIG.aiPiecesStart;

  const ourPieces   = state.pieces.filter(p => p.side === ourSide);
  const enemyPieces = state.pieces.filter(p => p.side === enemySide);
  const ourCaptain  = ourPieces.find(p => p.isCaptain)   || { cell: ourScoringCell, id: 'captain' };
  const enemyCaptain= enemyPieces.find(p => p.isCaptain) || { cell: enemyScoringCell, id: 'enemy_captain' };
  const ourCarrier  = ourPieces.find(p => p.hasBall);
  const enemyCarrier= enemyPieces.find(p => p.hasBall);

  const ourHand     = state.hands[ourSide];
  const enemyHand   = state.hands[enemySide];
  const ourMomentum = state.momentum[ourSide];
  // ... use only ourX/enemyX thereafter
}
```

After this preamble, **ban** `state.pieces.filter(p.side==='AI')`, `state.hands.AI`, `BOARD_CONFIG.aiScoringCell` directly — every use must go through `ourX/enemyX` locals.

### 3.2 What is "my attack zone"?

You asked for explicit `if/else` for top vs bottom. Concretely:

- **My captain location:** `ourScoringCell` (above).
- **My attack direction:** not a boolean but a derived helper — distance to `ourScoringCell` already encodes it. Do **not** write `if (actingSide==='AI') row-- else row++` scattered; centralize:

```ts
// src/engine/ai/helpers.ts (new, ~30 lines)
export function isInAttackingHalf(cell: Cell, actingSide: Side): boolean {
  // AI attacks row 0 → enemy half is rows 0-4
  // PLAYER attacks row 10 → enemy half is rows 6-10
  return actingSide === 'AI' ? cell.row <= 4 : cell.row >= 6;
}
export function pocketValue(cell: Cell, actingSide: Side): number {
  const scoring = actingSide==='AI' ? BOARD_CONFIG.aiScoringCell : BOARD_CONFIG.playerScoringCell;
  const dist = Math.abs(cell.row - scoring.row);
  // rows 2-3 for AI  <->  rows 7-8 for PLAYER  (distance to scoring cell =2-3)
  if (dist===2 || dist===3) return 50;
  if (dist===1 || dist===4) return 38;
  if (dist===0)             return 28;
  if (dist===5)             return 15;
  return -Math.hypot(cell.col - scoring.col, cell.row - scoring.row);
}
export function forwardSortForSide(a: Piece, b: Piece, actingSide: Side): number {
  const s = actingSide==='AI' ? BOARD_CONFIG.aiScoringCell : BOARD_CONFIG.playerScoringCell;
  return Math.hypot(a.cell.col - s.col, a.cell.row - s.row)
       - Math.hypot(b.cell.col - s.col, b.cell.row - s.row); // closer to enemy captain = more forward
}
```

Then `mcts.ts:322-331` today:
```ts
if (distToScoring===2||distToScoring===3) return 50 - dist*1.5;
```
becomes
```ts
return pocketValue(b.cell, actingSide) - dist*1.5;
```
and `rollout.ts:34` today `dRow = row>2 ? -1 : ...` becomes
```ts
const attacksUp = actingSide==='PLAYER'; // toward row 10
const dRow = attacksUp
  ? (teammate.cell.row < 8 ? +1 : (teammate.cell.row < 10 && rng.nextFloat()<0.3 ? +1 : 0))
  : (teammate.cell.row > 2 ? -1 : (teammate.cell.row > 0   && rng.nextFloat()<0.3 ? -1 : 0));
```
or cleaner: `dRow = Math.sign(ourScoringCell.row - teammate.cell.row) * (shouldStep?1:0)`.

**Rule:** any `row <` / `row >` literal is a bug unless guarded by `actingSide`.

### 3.3 What does `ourCaptain` vs `aiCaptain` mean concretely?

| Today | After |
|-------|-------|
| `const aiCaptain = aiPieces.find(p.isCaptain) \|\| {cell: aiScoringCell}` | `const ourCaptain = ourPieces.find(p.isCaptain) \|\| {cell: ourScoringCell}` |
| `if (aiCarrier)` | `if (ourCarrier)` |
| `simState.score.AI += 1` | `simState.score[ourSide] += 1` |
| `p.id !== 'ai_blocker'` | `!p.isBlocker` (never use IDs) |
| `playerCarrier` (implicit enemy) | `enemyCarrier` |
| `playerCaptain` (implicit enemy captain) | `enemyCaptain` |

---

## 4. File-by-File Plan (in dependency order)

### Phase 0 — Baseline (0.5h)
- `npm install && npx tsc --noEmit` (clean) — already ✅
- `npx vitest run tests/fullValidation.test.ts` — 4/4 (0.0 asym) ✅
- Add `tests/sideAgnostic.test.ts` skeleton (fails until done):

```ts
import { evaluateState } from '../src/engine/ai/evaluate';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
it('posture is symmetric', ()=>{ /* run selectAIPosture(state,'AI') vs flip */ });
it('cardSearch symmetric', ()=>{ /* hands swapped -> mirrored */ });
it('rollout mirror', ()=>{ /* simulateCascadeRollout(board,'AI') ≈ -simulateCascadeRollout(flip(board),'PLAYER') */ });
it('mcts mirror +2 still within', ()=>{ /* d4@750 vs d4@750 Δ=0 ±1 over 8 seeds */ });
```

### Phase 1 — `posture.ts` (0.5h, Trivial)
**Before:**
```ts
export function selectAIPosture(state): Posture {
  const aiPieces = state.pieces.filter(p=>p.side==='AI');
  const aiHasBall = aiPieces.some(p=>p.hasBall);
  if (aiHasBall) return 'ALL_OUT_ATTACK';
  if (playerCarrier.cell.row >=4) return 'LOCK_DEFENCE';
}
```
**After:**
```ts
export function selectPosture(state: GameState, actingSide: Side='AI'): Posture {
  const ourSide=actingSide, enemySide:Side=actingSide==='AI'?'PLAYER':'AI';
  const ourPieces=state.pieces.filter(p=>p.side===ourSide);
  const enemyPieces=state.pieces.filter(p=>p.side===enemySide);
  const ourHasBall=ourPieces.some(p=>p.hasBall);
  const enemyCarrier=enemyPieces.find(p=>p.hasBall);
  if (ourHasBall) return 'ALL_OUT_ATTACK'; // now means "I have ball, I attack"
  if (enemyCarrier){
    // LOCK if enemy is deep in MY half (distance to MY captain small)
    const ourCaptainCell=actingSide==='AI'?BOARD_CONFIG.aiScoringCell:BOARD_CONFIG.playerScoringCell;
    const distToOurCaptain=Math.hypot(enemyCarrier.cell.col-ourCaptainCell.col, enemyCarrier.cell.row-ourCaptainCell.row);
    if (distToOurCaptain <= 6) return 'LOCK_DEFENCE'; // was row>=4 hardcoded for PLAYER only
    if (enemyCarrier.energy<4) return 'COLLAPSE_ON_BALL';
    return 'SPREAD_CONTROL';
  }
  return 'BALANCED';
}
export const selectAIPosture = selectPosture; // keep alias to avoid breaking imports during migration
```
**Check:** row threshold now symmetric via distance, not `row>=4`.

### Phase 2 — `cardSearch.ts` (1h, Low)
Rename `getAIDiscardChoice` → `getDiscardChoice` (keep alias). Add `actingSide` to both fns.

Mechanical mapping table for each `case`:

| Case | Today (AI-centric) | Our-agnostic |
|------|--------------------|--------------|
| `overclock` | `aiCarrier` | `ourCarrier` |
| `surge` | `aiPieces.every(energy>=3)` | `ourPieces.every(...)` |
| `drain` | `playerCarrier` (enemy) | `enemyCarrier` |
| `clamp` | `highestEnergyPlayer` | `highestEnergyEnemy = [...enemyPieces].sort((a,b)=>b.energy-a.energy)[0]` |
| `bait` | `playerPieces.isBlocker` | `enemyPieces.find(p.isBlocker)` |
| `jam_the_lane` | `(playerCarrier+playerCaptain)/2` | `(enemyCarrier+enemyCaptain)/2` |
| `deep_breath`/`second_wind`/`slow_burn`/`screen`/`anchor`/`reset`/`spacing`/`overlap` | `aiPieces` | `ourPieces` |
| `give_and_go` | `aiCarrier` | `ourCarrier` |

Keep `getAIDiscardChoice` alias: `export const getAIDiscardChoice = getDiscardChoice;`

**Verify:** `tsc` + `fullValidation` still passes (cards not used in that test).

### Phase 3 — `helpers.ts` NEW (0.5h, Low)
Create `src/engine/ai/sideHelpers.ts` with `isInAttackingHalf`, `pocketValue`, `isInOurPocket(cell, actingSide)`, `attackDirection(actingSide)` helpers. Used by next two phases. Unit-test in isolation (4 rows).

### Phase 4 — `mcts.ts` call-site (0.5h, Low)
Line 134-197:
```ts
const posture = selectPosture(state, actingSide);
const stage0Card = evaluateStage0Cards(state, actingSide);
// ...
const stage2Card = evaluateStage2Cards(state, actingSide);
```
That's it. `generateJointCandidateActions` and `applyActionToSimState` are already correct — they are the template. The pocket heuristic inside `generateJointCandidateActions` (lines 322-331) currently computes `distToScoring = abs(row - scoringCell.row)` — **already side-agnostic** (uses `scoringCell` ternary). So no geometry fix needed there beyond using the helper for readability.

`fmtId` cosmetic: leave `ai_->A., p_->P.` or switch to `ourSide==='AI'?'A.':'P.'` — not functional.

### Phase 5 — `rollout.ts` (1–1.5 days, Medium — the crux)
This is the only file needing *logic inversion*, not just rename.

**Step 5a — Preamble mirroring `evaluate.ts` (10 lines):**
```ts
const ourSide = actingSide, enemySide: Side = actingSide==='AI'?'PLAYER':'AI';
const ourScoringCell = actingSide==='AI'?BOARD_CONFIG.aiScoringCell:BOARD_CONFIG.playerScoringCell;
const enemyScoringCell = actingSide==='AI'?BOARD_CONFIG.playerScoringCell:BOARD_CONFIG.aiScoringCell;
const ourPieces = simState.pieces.filter(p=>p.side===ourSide);
const enemyPieces = simState.pieces.filter(p=>p.side===enemySide);
const ourCarrier = ourPieces.find(p=>p.hasBall);
const ourCaptain = ourPieces.find(p=>p.isCaptain) || {cell: ourScoringCell, id:'our_captain'};
const enemyCarrier = enemyPieces.find(p=>p.side===enemySide && p.hasBall); // also fetched in else
const controlMap = computeControlMap(simState.pieces, simState.temporaryState);
```

**Step 5b — Duplicate attack simulation (was lines 28-114, now `if(ourCarrier)`):**
- Replace `aiPieces` → `ourPieces`, `aiCarrier` → `ourCarrier`, `aiCaptain` → `ourCaptain`, `score.AI` → `score[ourSide]`.
- Replace `outfieldTeammates = aiPieces.filter(p=>p.id!=='ai_blocker')` → `ourPieces.filter(p=>!p.isCaptain && !p.isBlocker)`.
- Replace `forwardTeammates sort a.row - b.row` → `sort by distance to ourScoringCell` (or `forwardSortForSide` helper): `a` more forward = closer to `ourScoringCell`, so `distA - distB` already side-agnostic (dist to scoring). Keep that.
- Replace `dRow = row>2?-1` → side-aware helper (see §3.2) or `Math.sign(ourScoringCell.row - teammate.cell.row)`.
- Keep 3 priorities verbatim: captain → forward teammates → bouncer (`ourPieces.find(p.isBlocker)`).

**Step 5c — Defense simulation (was lines 120-192, now `else if(enemyCarrier)`):**
- Replace `playerCarrier/playerCaptain` → `enemyCarrier/enemyCaptain`.
- Replace `isRestartPhase.PLAYER` → `isRestartPhase[enemySide]` (or `[ourSide]`? check semantics: restart belongs to conceding side; use `enemySide` when enemy has ball? Actually `isRestartPhase[enemySide]` = did enemy just concede and now has ball at captain? Keep same check but parametrized.)
- Replace `for(p of aiPieces)` → `for(p of ourPieces)` (our defenders interpose on enemy ray).
- `passRay = getThrowPathCells(enemyCarrier.cell, enemyCaptain.cell)` (already enemy).

**Step 5d — Stagnation (lines 200-213):**
```ts
const finalOurPieces = simState.pieces.filter(p=>p.side===ourSide);
const ourInitial = actingSide==='AI'?BOARD_CONFIG.aiPiecesStart:BOARD_CONFIG.playerPiecesStart;
const sameInitial = finalOurPieces.filter(p=>{const init=ourInitial.find(x=>x.id===p.id); return init && areCellsEqual(init.cell,p.cell)}).length;
const pct = sameInitial / (finalOurPieces.length||7);
const ourEnemyHalf = finalOurPieces.filter(p=> isInAttackingHalf(p.cell, actingSide)).length;
const initialEnemyHalf = ourInitial.filter(p=> isInAttackingHalf(p.cell, actingSide)).length;
if (pct>0.40 && ourEnemyHalf <= initialEnemyHalf && !simState.matchResult.isOver) return actingSide==='AI'?-800:800; // actually sign already correct via actingSide
```

Keep final `return evaluateState(simState, actingSide)` (already correct).

**Step 5e — Why medium not low:** forward cut `dRow`, pocket detection, and forward sort all embed "which direction is forward". A wrong sign makes AI run *away* from its scoring cell — easy to introduce, hard to notice without visual. Must test with mirrored board: `simulateCascadeRollout(board, 'AI') ≈ -simulateCascadeRollout(flip(board), 'PLAYER')`.

### Phase 6 — `mctsAnalysis.ts` (0.5h or delete)
Either apply same preamble as `rollout.ts` / `mcts.ts`, or document as deprecated and exclude from build. Not on critical path.

### Phase 7 — `reducer.ts` engine note (0h — do not change for side-agnostic goal)
Engine correctly uses `score.AI`/`PLAYER`, `isRestartPhase.AI`, `side==='PLAYER'` because it *executes* the game, not the AI search. If you want AI to *play* as bottom side, you just call `runSeededMCTS(state, rng, 'PLAYER')` — reducer already supports `RUN_AI_TURN_FOR_PLAYER` (+ card application fix still TODO from prior audit). No engine change needed for side-agnostic property.

*(Card execution fix from prior `BUG_ASSESSMENT.md` — `RUN_AI_TURN_FOR_PLAYER` must apply `mctsResult.stage0/2Cards` — is orthogonal but should ship with this work.)*

---

## 5. Attack-Zone Determination — Concrete `if/else` Pattern

You asked: "determine which side we are playing for (we are top or bottom) and then using sensible if/else we determine what is our attack zone".

**Do not branch on `row`**. Branch on `actingSide` once, derive geometric constants, then use distances.

```ts
// Single branching point per function:
const ourScoringCell = actingSide==='AI' ? BOARD_CONFIG.aiScoringCell : BOARD_CONFIG.playerScoringCell; // (5,0) vs (5,10)
const enemyScoringCell = actingSide==='AI' ? BOARD_CONFIG.playerScoringCell : BOARD_CONFIG.aiScoringCell;
const ourInitial = actingSide==='AI' ? BOARD_CONFIG.aiPiecesStart : BOARD_CONFIG.playerPiecesStart;

// Thereafter everything is distance-based, not row-literal:
const distToOurGoal = Math.hypot(piece.cell.col - ourScoringCell.col, piece.cell.row - ourScoringCell.row);
const isInSweetPocket = distToOurGoal <= 3.5 && distToOurGoal >= 1.5; // covers rows 2-3 for top, 7-8 for bottom
const carrierHasAdvanced = distToOurGoal <= 5; // "within 5 of my scoring cell"
const enemyHalfCount = ourPieces.filter(p=> isInAttackingHalf(p.cell, actingSide)).length;
```

If you must use `row` for a fast heuristic (rollout `dRow` step), use the helper:

```ts
function stepTowardGoal(cell: Cell, actingSide: Side, rng: SeededRNG): Cell {
  const goal = actingSide==='AI' ? BOARD_CONFIG.aiScoringCell : BOARD_CONFIG.playerScoringCell;
  const dCol = Math.sign(goal.col - cell.col);
  const dRow = Math.sign(goal.row - cell.row); // -1 for top-attacker, +1 for bottom-attacker
  // sweet pocket logic: if far (>3), step; if already deep and rng<0.3, sneak one more
  const far = Math.abs(cell.row - goal.row) > 2;
  const stepRow = far ? dRow : (Math.abs(cell.row - goal.row) > 0 && rng.nextFloat()<0.3 ? dRow : 0);
  return { col: clamp(cell.col+dCol), row: clamp(cell.row+stepRow) };
}
```

---

## 6. Alternative: Board-Flip (compare)

Handoff recommended flipping the board so internals always see `AI` perspective.

| Criterion | `ourX/enemyX` threading (this plan) | Board-flip |
|-----------|--------------------------------------|------------|
| Lines changed | ~220 across 4 files | ~80 (new `flipBoard` + `unflip`) + 0 in ai files |
| Risk of forgotten `actingSide` | Medium — every new AI function must remember param | Low — single boundary flip |
| `cardSearch.ts`/`posture.ts` after | Fixed once, but future edits can re-hardcode `AI` | Zero changes — works by construction (`hands.AI` *is* flipped PLAYER hand) |
| Rollout pocket logic after | Must keep two mirrored branches correct | Single branch (always AI toward row 0) |
| Testing burden | Need symmetry tests per function | Need one `flipBoard` invertibility test |
| Which you asked for | **Exactly what you asked for** ("if/else attack zone, ourCaptain") | Different mental model (not what you asked) |

**Recommendation:** Since you explicitly want `ourCaptain`/`ourCarrier` + `if(weAreTop)` attack-zone logic, do threading — it's what your team will understand and aligns with `evaluate.ts` already. Reserve board-flip for a later refactor if threading proves brittle (the audit found 2 missed call sites already — that risk is real).

---

## 7. Effort & Sequencing

| Phase | File | Effort | Can parallelize? |
|-------|------|--------|------------------|
| 0 | Baseline + test skeleton | 0.5h | — |
| 1 | `posture.ts` | 0.5h | yes with 2 |
| 2 | `cardSearch.ts` | 1h | yes with 1 |
| 3 | `helpers.ts` new | 0.5h | before 5 |
| 4 | `mcts.ts` call sites | 0.5h | after 1+2 |
| 5 | `rollout.ts` | 8–12h | after 3 |
| 6 | `mctsAnalysis.ts` | 0.5h | anytime |
| 7 | Validation | 2h | — |

**Calendar:** 1 engineer, ~16–20h to code + 4–6h to validate with `tsc`, `fullValidation`, and 8-seed mirror (`Δ=0±1`). **3–4 working days.**

---

## 8. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Rollout runs away from goal (sign flip) | Add `flipBoard` harness: `assert simulateCascadeRollout(state,'AI') ≈ -simulateCascadeRollout(flip(state),'PLAYER')` across 5 seeds before merging |
| `row >=4` style threshold wrong for bottom | Replace thresholds with `distToOurCaptain <=6` or `isInAttackingHalf` — distance, not row |
| New AI function forgets `actingSide` | ESLint rule: `no-restricted-syntax` banning `state.hands.AI` / `.hands.PLAYER` inside `src/engine/ai/*` (allow in `reducer.ts`); or code-review checklist |
| `p.id==='ai_blocker'` regressions | Ban ID-literal checks in `src/engine/ai/*`; require `p.isBlocker`/`p.isCaptain` |
| Challenger bias not resolved | Re-run `d4IterScaling` + `d4IterScalingFlipped` with 8 seeds; compute `(prev+flipped)/2` — should be `0±0.5`, not `+2.9` |

---

## 9. Validation Plan (what green looks like)

```bash
npx tsc --noEmit
npx vitest run tests/fullValidation.test.ts              # 4/4, 0.0 asym
npx vitest run tests/sideAgnostic.test.ts                 # new: posture/card/rollout mirror
npx vitest run tests/d4IterScaling.test.ts                # 90s, mirror should be 0±1, not +2
npx vitest run tests/d4IterScalingFlipped.test.ts         # 90s, avg Challenger bias 0±0.5
# Extended (optional, 10 min):
npx vitest run tests/control.test.ts tests/holdingFoul.test.ts ... # 25/25 core suite
```

**Mirror success:** `d4@750 vs d4@750` over 8 seeds `Σ(C-R) ≈ 0`. Today it's `+2` to `+5` — the delta from fixing rollout + cards should bring it to noise floor.

---

## 10. Deliverable Checklist

- [ ] `src/engine/ai/sideHelpers.ts` created
- [ ] `src/engine/ai/posture.ts` → `selectPosture(state, actingSide)` + alias
- [ ] `src/engine/ai/cardSearch.ts` → `evaluateStage0/2Cards(state, actingSide)` + renamed `getDiscardChoice`
- [ ] `src/engine/ai/mcts.ts` → passes `actingSide` to posture/cards
- [ ] `src/engine/ai/rollout.ts` → full `ourSide/enemySide` + distance-based pocket + mirrored defense + mirrored stagnation
- [ ] `src/engine/ai/mctsAnalysis.ts` → same or deprecated
- [ ] `tests/sideAgnostic.test.ts` → mirror tests
- [ ] `npm run build` green, 8-seed mirror 0±1

---

## Appendix — Before/After Example (`rollout.ts` excerpt)

**Before (hardcoded):**
```ts
const aiPieces = simState.pieces.filter(p=>p.side==='AI');
const aiCarrier = aiPieces.find(p=>p.hasBall);
const aiCaptain = aiPieces.find(p=>p.isCaptain) || {cell: BOARD_CONFIG.aiScoringCell};
if (aiCarrier){
  const mobile = aiPieces.filter(p=>p.id!==aiCarrier.id && !p.isCaptain);
  dRow = teammate.row>2 ? -1 : ...
  simState.score.AI +=1;
}
```

**After (this plan):**
```ts
const ourPieces = simState.pieces.filter(p=>p.side===ourSide);
const ourCarrier = ourPieces.find(p=>p.hasBall);
const ourCaptain = ourPieces.find(p=>p.isCaptain) || {cell: ourScoringCell};
if (ourCarrier){
  const mobile = ourPieces.filter(p=>p.id!==ourCarrier.id && !p.isCaptain);
  dRow = Math.sign(ourScoringCell.row - teammate.cell.row) * (far?1:0);
  simState.score[ourSide] +=1;
}
```

Every rule after this preamble reads as "we" — which is exactly what makes the AI side-agnostic.

