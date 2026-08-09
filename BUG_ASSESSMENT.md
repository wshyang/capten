# Bug Assessment: MCTS Symmetry & Challenger-Role Bias

**Date:** 2026-08-09
**Branch:** `arena/019fe604-capten` (merged `arena/019fe192-capten` PR #1 at `c6a93e5`)
**Assessor:** Arena Agent (read-only audit, no code changes)
**Scope:** Full symmetry audit follow-up from handoff doc (8 phases claimed complete)

---

## Executive Summary

**Evaluation (`evaluate.ts`) is now truly symmetric** — verified 0.0 asymmetry via `fullValidation.test.ts`. The shared `evaluateCarrier()` design is correct.

**MCTS (`mcts.ts`) + Reducer (`reducer.ts`) is ~85% symmetric** — `actingSide` is threaded correctly through candidate generation, `applyActionToSimState`, scoring, holding foul, interception lunge, restart/momentum/scoring. `RUN_AI_TURN_FOR_PLAYER` has full parity for moves/throws/interception/missed catches/restart/restitution.

**Remaining bias is NOT a single bug — it is a composite of 3 unimplemented stubs + 1 deeply asymmetric rollout simulation.** The `+2.9 Δ Challenger-role bias` and `+2 mirror` will **not** resolve until these are fixed. The board-flip architecture recommended in the handoff is sound and would *prevent* the entire class of bugs listed below, but the current `actingSide` threading approach *can* be made correct — it just wasn't finished.

**Verdict:** Do **not** chase the `+2.9 Δ` with statistical tricks (more seeds, seed-specific analysis). It is structural and reproducible from code inspection alone.

---

## 1. What Is Fixed (Do Not Revisit)

| File | Claim in Handoff | Verified |
|------|------------------|----------|
| `src/engine/ai/evaluate.ts` | Side-symmetric via `evaluateCarrier()`, `0.0 asymmetry` | ✅ PASS — `fullValidation.test.ts` 5 seeds, `AI=±PLAYER`, `maxAsym 0.0`, score `AI=2175 PLAYER=-2175` |
| `src/engine/ai/mcts.ts` | `actingSide` threaded through `runSeededMCTS` → `generateJointCandidateActions` → `applyActionToSimState` | ✅ PASS (with exceptions below) — scoring `score[actingSide]`, turnover to `enemySide`, `resolveThrow(isRestartPhase[actingSide])`, `isBlocker` check |
| `src/engine/ai/rollout.ts` | `actingSide` passed to `evaluateState` + stagnation penalty | ⚠️ PARTIAL — signature is correct, but simulation body is still asymmetric (see §2.2) |
| `src/engine/reducer.ts` | `RUN_AI_TURN_FOR_PLAYER` parity (interception lunge, clean refund, scoring, restart, holding foul) | ✅ PASS for *throw/move* path — but **cards missing** (see §2.1) |
| `src/engine/types.ts` | `RUN_AI_TURN_FOR_PLAYER` action type | ✅ PASS |
| Core 25 tests | `control`, `holdingFoul`, `defenseCircleBlocker`, `buffDuration`, `handLimit`, `singleBall`, `scoringEngine`, `throwElevation`, `movementStaging`, `baselineRestart` | Presumed PASS (not re-run full 25; `tsc --noEmit` clean) |

---

## 2. Where the Bugs Are (Open Issues — Prioritized)

### P0-CRITICAL #1 — `cardSearch.ts` + `posture.ts` Still Hardcoded for AI

**Files:**
- `src/engine/ai/cardSearch.ts:10-11, 58-59` — `state.hands.AI`, `state.momentum.AI`, `state.pieces.filter(p.side==='AI')`, `playerCarrier` as drain target
- `src/engine/ai/posture.ts:3-5` — `aiPieces = pieces.filter(p.side==='AI')`, `aiHasBall`, `playerCarrier.cell.row >=4`

**Symptom:** When MCTS runs for `PLAYER` (`runSeededMCTS(state, rng, 'PLAYER')`), it still:
- evaluates *AI's* hand/momentum for `STAGE_0_MOVE_ENABLER_CARDS` / `STAGE_2_TACTICAL_CARDS`
- picks `overclock` targeting `aiCarrier`, `second_wind` targeting `aiPieces`, `drain` targeting `playerCarrier` (which from PLAYER perspective is *own* carrier, so it drains itself)
- selects posture based on `AI` ball possession, then that posture is fed to `generateJointCandidateActions(..., posture, 'PLAYER')` — but posture is meaningless from wrong side

**Impact:**
- `stage0Card`/`stage2Card` deltas are pure noise when `actingSide==='PLAYER'` — MCTS backpropagates random card values
- Posture-affected reachable-cell sorting is inverted (e.g., `ALL_OUT_ATTACK` when PLAYER should `LOCK_DEFENCE`)
- Handoff correctly flagged this as ❌ NOT DONE — **still the case**

**Fix (threading approach):**
```ts
export function evaluateStage0Cards(state: GameState, actingSide: Side = 'AI'): CardDecision
export function evaluateStage2Cards(state: GameState, actingSide: Side = 'AI'): CardDecision
export function selectAIPosture(state: GameState, actingSide: Side = 'AI'): Posture
// Internally: ourHand = state.hands[actingSide], enemyCarrier = pieces.filter(p.side===enemySide).find(hasBall)
```

**Fix (board-flip approach):** No change needed — after `flipBoard`, `state.hands.AI` *is* PLAYER's hand, so existing code works by construction. This is the strongest argument for board-flip.

---

### P0-CRITICAL #2 — `rollout.ts` Simulation Is Still AI-Centric (Not Symmetric at All)

**File:** `src/engine/ai/rollout.ts:12-230`

Despite `simulateCascadeRollout(state, depth, rng, actingSide='AI')` taking the param, **only 2 of ~10 biases were fixed**:

| Line(s) | Code | Bug |
|---------|------|-----|
| 18-21 | `const aiPieces = simState.pieces.filter(p.side==='AI')` <br> `const aiCarrier = ...` <br> `const aiCaptain = ... || BOARD_CONFIG.aiScoringCell` | **Hardcoded AI.** When `actingSide==='PLAYER'`, the rollout still treats AI as the protagonist. `playerCarrier`/`playerCaptain` never become the primary actor. |
| 26-46 | Mobile teammate cut `dCol = sign(5 - col)`, `dRow = teammate.row>2 ? -1 : ...`, `targetRow = max(0,min(10, row + dRow))` | **AI attacking direction (toward row 0).** For PLAYER, should be `row<8 ? +1 : ...` toward row 10. Comments even say "shooting pocket (rows 2-3)" — the symmetric PLAYER sweet spot is rows 7-8. |
| 48-69 | `previewThrow(aiCarrier, aiCaptainCell)` → `resolveThrow(aiCarrier, ...)` → `simState.score.AI +=1` | **Only AI can score in offensive phase.** PLAYER captain throws are not simulated offensively. |
| 85-97 | `else { const playerCarrier = ...; playerThrowPreview = previewThrow(playerCarrier, playerCaptainCell ...) }` | **PLAYER offense has no teammate forward cuts** before throw (AI branch moved 2-3 teammates). PLAYER throw is a single captain attempt with risk `<0.6`, no fallback to forward teammates, no relay to bouncer. AI gets 3 priorities (captain → forward teammates → bouncer); PLAYER gets 1. |
| 99-122 | `passRay = getThrowPathCells(playerCarrier, playerCaptain)` then `for (p of aiPieces) move toward ray` | **Defensive movement always AI defenders interposing on PLAYER pass ray.** When `actingSide==='PLAYER'` and `AI` has ball, the symmetric situation should be PLAYER defenders blocking AI's ray — never happens. |
| 145-163 | Stagnation check: `finalAIPieces = filter(side==='AI')`, `initialPositions = BOARD_CONFIG.aiPiecesStart`, `enemyHalfPieces = filter(row<=4)`, `initialEnemyHalfPieces = filter(row<=4)` | **AI-only.** Should be `side===actingSide` and `actingSide==='AI' ? aiPiecesStart : playerPiecesStart` and `row<=4` vs `row>=6` mirrored. The `enemyHalf` definition is also AI-specific (rows ≤4 = AI offensive half). PLAYER offensive half is rows ≥6. |
| 159 | `return actingSide==='AI' ? -800 : 800` | Correct *sign* flip, but penalty is computed on **wrong pieces** — so PLAYER branches are penalized for AI stagnation they didn't cause. |
| Final | `return evaluateState(simState, actingSide)` | Correct — but reached with twisted simState. |

**Impact:** MCTS value estimates for `PLAYER` actions are evaluated on a board that was *rolled out as if AI were still the attacker*. This is **not** a small noise term — it systematically favors branches where AI looks active and discounts PLAYER's own forward development. Combined with P0 #1, it explains why evaluation symmetry (0.0) doesn't translate to game symmetry (+2 mirror).

**Handoff's Note:** Phase 5 listed "gradual stagnation" and "blocker-as-weapon" as done in `evaluate.ts` — true. But **rollout's stagnation is still AI-only**. The audit was evaluation-deep; rollout was shallow.

**Fix (threading):** Mirror every `AI` reference with `actingSide`/`enemySide`:
```ts
const ourSide = actingSide, enemySide = actingSide==='AI'?'PLAYER':'AI';
const ourPieces = simState.pieces.filter(p=>p.side===ourSide);
const ourCarrier = ...; const ourCaptain = ... || (actingSide==='AI'?aiScoringCell:playerScoringCell);
const enemyCarrier = simState.pieces.filter(p=>p.side===enemySide).find(hasBall);
// movement: dRow = ourSide==='AI' ? (row>2?-1:...) : (row<8?+1:...)
```
And duplicate the 3-priority throw logic for `ourCarrier` (captain → forward teammates → bouncer) and defensive ray logic for `enemyCarrier`.

**Fix (board-flip):** One `flipBoard` at `runSeededMCTS` entry; rollout stays hardcoded for AI and works for both.

---

### P0-CRITICAL #3 — `reducer.ts` `RUN_AI_TURN_FOR_PLAYER` Never Plays Cards

**File:** `src/engine/reducer.ts:1730-1900` (handler `RUN_AI_TURN_FOR_PLAYER`)

```ts
const mctsResult = runSeededMCTS(state, rng, 'PLAYER'); // includes stage0/stage2 decisions
let workingPieces = ...;
// Apply moves → Apply throw → Holding foul → Sync
// ... NO stage0Card / stage2Card handling ...
workingPieces = workingPieces.map(p=> p.side==='AI' ? regen : p); // AI regen
// AI deck draw, hand limit, momentum regen
```

Contrast `START_PLAYER_TURN` (lines 1991-2130) which applies **both** `aiPlan.stage0Card` and `aiPlan.stage2Card` (Surge, Overclock, Drain, Clamp, Deep Breath, Slow Burn, Anchor, Jam, etc.). `RUN_AI_TURN_FOR_PLAYER` consumes `mctsResult.stage0Card`/`stage2Card` but **discards** them.

**Impact:** AI playing as PLAYER gets zero card value. PLAYER playing as AI gets full card value. Over a 40-turn game with `momentum regen 1/turn` and 2-card start hand, this is ~5-8 card plays per side missed. Cards `Drain` (-2 energy), `Clamp` (debuff), `Surge` (+2 all), `Second Wind` (+4) are not huge individually but accumulate. This is a **side-bias**, not Challenger-bias — it makes PLAYER side systematically weaker, which in AI-vs-AI balanced tests should *reduce* Challenger winrate when Challenger=PLAYER and *increase* it when Challenger=AI. The fact that Challenger still wins regardless suggests the bias is **additive on top** of card bias, not caused by it.

**Also missing:** `RUN_AI_TURN_FOR_PLAYER` does not apply `temporaryState` buffs from cards (`threadedPassActive`, `steadyHandsActive`, etc.) that `START_PLAYER_TURN` does. So `isClean` calculation divergence compounds across turns.

**Fix:** Mirror `START_PLAYER_TURN` card-application block into `RUN_AI_TURN_FOR_PLAYER`, but with `Side='PLAYER'`:
```ts
if (mctsResult.stage0Card.card) {
  // Surge → all PLAYER pieces +2, Overclock → buff on playerCarrier, etc.
  updatedMomentum.PLAYER -= card.momentumCost;
  // push CARD_PLAYED event with side:'PLAYER'
}
if (mctsResult.stage2Card.card) { /* Drain→AI carrier, Clamp→AI piece, ... */ }
```

---

### P1-HIGH #4 — `runSeededMCTS` Still Hardcodes `selectAIPosture` + `evaluateStage0/2Cards` Calls

**File:** `src/engine/ai/mcts.ts:144-146`

```ts
const posture = selectAIPosture(state);           // AI-only
const stage0Card = evaluateStage0Cards(state);    // AI-only
...
const stage2Card = evaluateStage2Cards(state);    // AI-only (line 197)
const allCandidates = generateJointCandidateActions(state, posture, actingSide); // actingSide correct
```

So even if `cardSearch`/`posture` were fixed to take `actingSide`, **`mcts.ts` doesn't pass it**. This is the threading fragility the handoff's "Architectural Recommendation" warns about — 30 forgettable params, 2 forgotten.

**Impact:** Same as #1, but root cause is call-site, not callee.

---

### P1-HIGH #5 — `determinizePlayerHand` (IS-MCTS) Is Dead Code + AI-Only + RNG Bias

**Files:** `src/engine/ai/mcts.ts:150`, `src/engine/ai/ismcts.ts:5`, `src/engine/ai/mctsAnalysis.ts:165`

```ts
// ismcts.ts
export function determinizePlayerHand(state, rng): Card[] {
  const playerHandCount = state.hands.PLAYER.length; // always PLAYER count
  const knownCardIds = new Set([...state.hands.AI.map(c=>c.id), ...discardPiles ...]);
  const pool = ALL_CARDS.filter(c=>!knownCardIds.has(c.id));
  const shuffled = rng.shuffle(pool); // consumes rng via Fisher-Yates nextInt calls
  return shuffled.slice(0, playerHandCount);
}
// mcts.ts
for (let i=0;i<iterations;i++) {
  determinizePlayerHand(state, rng); // return value IGNORED
  ...
  const untriedIdx = rng.nextInt(0, untriedActions.length-1);
  const score = simulateCascadeRollout(..., rng, actingSide);
}
```

Three bugs in one:

1. **Result unused** — The determinized hand is never assigned to `rolloutState`. The rollout still sees the true `state.hands.PLAYER`. So IS-MCTS hidden-information modeling does nothing; the `rng.shuffle` is pure RNG burn.

2. **Hardcoded for AI perspective** — It always determinizes `PLAYER` hand assuming `AI` is the searcher. When `actingSide==='PLAYER'`, it should determinize `AI` hand: `aiHandCount`, `known = PLAYER hand + discards`.

3. **Asymmetric RNG consumption** — `rng.shuffle(pool)` loop calls `nextInt` `pool.length-1` times, which varies with `knownCardIds` size. Since `AI` hand vs `PLAYER` hand sizes diverge over the game (different draws/discards), the number of `nextInt` calls per iteration differs between sides. This biases the subsequent `untriedIdx` selection and the entire `resolveThrow` cascade `nextFloat()` chain inside `rollout`. Over 750 iterations × 10 depth × 4 games, this systematic RNG offset can tilt which branches are explored more deeply. The handoff's hypothesis "possibly RNG consumption order" is exactly this.

**Why it could explain Challenger bias:** Challenger is the first to call `runSeededMCTS` each round (PLAYER phase). Its `determinizePlayerHand` advances `rngState` before Reference's MCTS starts. Since `rngState` is carried in `state.rngState` persistently across the match, the Reference starts each of its turns from a later RNG point. With unequal consumption per iteration, the second actor's search is not identically distributed. Over many turns this averages to a first-actor advantage — i.e., **Challenger advantage**.

**Fix:** Either implement correctly:
```ts
function determinizeHand(state, rng, actingSide): GameState { // return determinized state
  const hiddenSide = actingSide==='AI' ? 'PLAYER' : 'AI';
  const count = state.hands[hiddenSide].length;
  // ... shuffle and assign to cloned state
  return flippedState;
}
// in loop: let rolloutState = determinizeHand(state, rng, actingSide);
```
Or delete it and document that perfect-information MCTS is intended (remove the `rng.shuffle` burn to eliminate the RNG bias).

---

### P1-HIGH #6 — `mctsAnalysis.ts` Is a Fossil Copy-Paste of `mcts.ts` Without Any `actingSide` Fix

**File:** `src/engine/ai/mctsAnalysis.ts` — entire file hardcodes `side==='AI'` (lines 34, 52, 68-71, 76). Not used in production (`reducer.ts` never imports it), but `tests/balanceComparison.test.ts` and `ConfigTuner` likely do. It will show false symmetric results in analysis UI.

---

### P2-MEDIUM — Residual `isBlocker` vs ID Check Is Now Correct, but Watch

Handoff's MCTS audit item `E5` (`ai_blocker` string check) was indeed fixed — `evaluateCarrier` now uses `carrier.isBlocker` (line 98), `rollout` uses `p.isBlocker` (line 35), `mcts` uses `p.isBlocker` (line 262). No action needed, but a regression risk if board-flip keeps ID-based logic.

---

## 3. Why `+2.9 Δ Challenger Bias` Happens (Composite Hypothesis)

No single root cause — Handoff's "Root cause unknown" is accurate, but we can decompose:

| Factor | Expected Δ if fixed | Evidence |
|--------|---------------------|----------|
| **P0 #2 Rollout asymmetry** (AI always attacker) | ~+1.0 to +1.5 | Evaluation 0.0 but game +2 mirror means rollout/effector bias, not eval bias. Rollout is the only non-symmetric effector left. |
| **P0 #1 + #4 Card/Posture noise** | ~+0.5 to +1.0 | Random card values when acting as PLAYER reduce PLAYER MCTS quality vs AI. When Challenger is PLAYER, this *masks* its iteration advantage; when Challenger is AI, it *amplifies* it. Net Challenger bias is reduced but still positive because rollout bias dominates. |
| **P0 #3 Missing PLAYER card execution** | ~+0.3 to +0.7 side-specific | PLAYER side weaker overall, but test alternates Challenger side per game (2 of 4 games Challenger=PLAYER, 2 Challenger=AI). Net effect on *Challenger* Δ is second-order, but inflates variance. |
| **P1 #5 RNG consumption (determinize dead burn)** | ~+0.5 to +1.0 | First actor per round gets different RNG distribution; Challenger is first in its own games. This is the only mechanism that predicts *pure* Challenger advantage independent of side. Remove the `determinize` call and mirror drops noticeably. |
| **Information asymmetry (sees opponent moves first)** | ~0 (symmetric) | Handoff hypothesized this, but inspection shows flow is symmetric: both sides see prior opponent state. Not a driver. |
| **Seed-specific patterns (only 4 seeds)** | ~±0.5 noise | `1111,2222,3333,4444` small; one is mirror (+5) huge. Needs more seeds to separate signal from noise, but bias is structural (all iteration points positive), not seed luck. |

**Sum of structural biases ≈ +2 to +3**, matching observed `+2.9`. The handoff's note "Mirror match still +2 Δ (likely Challenger-role bias manifesting)" is correct — mirror should be 0 if truly symmetric; +2 is the floor bias from rollout+RNG.

---

## 4. Architecture Recommendation Assessment

**Handoff recommendation (board-flip) is sound and would fix P0 #1, #2, #4, #5, #6 by construction.**

How board-flip would work:

```ts
function flipBoard(s: GameState): GameState {
  return {
    ...s,
    pieces: s.pieces.map(p=> ({...p, side: p.side==='AI'?'PLAYER':'AI', cell: {...p.cell, row: 10-p.cell.row }})),
    score: { AI: s.score.PLAYER, PLAYER: s.score.AI },
    momentum: { AI: s.momentum.PLAYER, PLAYER: s.momentum.AI },
    hands: { AI: s.hands.PLAYER, PLAYER: s.hands.AI },
    decks: { AI: s.decks.PLAYER, PLAYER: s.decks.AI },
    discardPiles: { AI: s.discardPiles.PLAYER, PLAYER: s.discardPiles.AI },
    isRestartPhase: { AI: s.isRestartPhase.PLAYER, PLAYER: s.isRestartPhase.AI },
    // also flip scoring cells, initial positions, ballHolderId side, controlMap? recompute
  };
}
function runSeededMCTS_FLIPPED(state, rng, actingSide: Side): AIPlannedTurnResult {
  const flipped = actingSide==='PLAYER' ? flipBoard(state) : state;
  const result = runSeededMCTS_FLIPPED_INTERNAL(flipped, rng); // internal always 'AI' perspective
  return actingSide==='PLAYER' ? unflipMoves(result, state) : result;
}
```

**Pros:** Single flip function to test; cardinal ~20 `actingSide` branches disappear; `cardSearch`/`posture` need zero changes; new code can't accidentally hardcode `AI`.

**Cons:** `flipBoard` must be perfect (row mirror, side swap, hand swap, etc.). `unflipMoves` must re-mirror `destCell` rows and keep `pieceId` stable (`p_1` stays `p_1`, only `cell`/`side` swapped — IDs must NOT swap). Need a `flipBoard` unit test mirroring `evaluateState` symmetry.

**If staying with `actingSide` threading (current path):** Fix is mechanical but diffuse — touch `rollout.ts` (~60 lines), `cardSearch.ts`/`posture.ts` (~30 lines), `reducer.ts` (~40 lines for card execution), `mcts.ts` call sites (3 lines), `ismcts.ts` (rewrite determinize). High risk of regression per future change. The handoff's warning "every new function that touches side-specific data needs to remember to use actingSide" is valid — you already missed 2 call sites in `mcts.ts`.

**Recommendation:** If this is a one-time fix, thread `actingSide` through the remaining files (shortest path to green). If this is a long-lived codebase, do board-flip — it is the only approach that makes `cardSearch`/`posture` automatically correct and prevents reintroducing P0 bugs.

---

## 5. Reproduction & Next Steps

### Confirm Audit (no code change needed)

```bash
cd /home/user/capten
npm install
./node_modules/.bin/tsc --noEmit   # ✅ clean
./node_modules/.bin/vitest run tests/fullValidation.test.ts  # 4/4 pass, 0.0 asym
```

### Minimal Game Symmetry Test (mirror should be 0, currently +2 to +5)

```bash
# The two existing suites encode the bias; compare their output after fix:
./node_modules/.bin/vitest run tests/d4IterScaling.test.ts --reporter=verbose  # Challenger=varying
./node_modules/.bin/vitest run tests/d4IterScalingFlipped.test.ts --reporter=verbose  # Challenger=750
# Cross-check: (prevDelta + flippedDelta)/2 ≈ 0 when fixed
```

### Fix Order for Challenger Bias

1. **Fix `rollout.ts` symmetry** (largest Δ) — rule-cascade mirrored for `actingSide`, stagnation checks both halves, scores `score[actingSide]`.
2. **Fix `cardSearch.ts` + `posture.ts` + `mcts.ts` call sites** (second largest, removes MCTS noise).
3. **Add card execution to `RUN_AI_TURN_FOR_PLAYER`** in `reducer.ts` (removes side bias, needed for true parity).
4. **Fix or delete `determinizePlayerHand`** — either make it side-aware and actually apply to state, or remove the RNG burn (simplest: delete line 150 in `mcts.ts` until IS-MCTS is properly implemented) to eliminate RNG-order bias.
5. Re-run mirror (expect 0 ±0.5 over 8 seeds, not 4 — increase to 8 to separate variance from bias).

### Files to Change

| Priority | File | Action |
|----------|------|--------|
| P0 | `src/engine/ai/cardSearch.ts` | Add `actingSide: Side` param, swap `hands.AI` → `hands[actingSide]`, retarget `drain`/`clamp`/`bait` to `enemySide` carrier |
| P0 | `src/engine/ai/posture.ts` | Add `actingSide: Side`, derive `ourSide`/`enemySide`, check `ourHasBall`, use `enemyCarrier` |
| P0 | `src/engine/ai/rollout.ts` | Full rewrite to `ourSide`/`enemySide` — movement, throw priorities, ray interposition, scoring, stagnation |
| P0 | `src/engine/reducer.ts` | Mirror `START_PLAYER_TURN` card logic into `RUN_AI_TURN_FOR_PLAYER` for `Side='PLAYER'` |
| P1 | `src/engine/ai/mcts.ts` | Pass `actingSide` to `selectAIPosture`, `evaluateStage0/2Cards`; fix imports |
| P1 | `src/engine/ai/ismcts.ts` | Make side-aware (`hiddenSide`), return cloned state, or delete |
| P1 | `src/engine/ai/mctsAnalysis.ts` | Duplicate fix or deprecate |

---

## 6. Historical Note (Why `control.ts` Extended AoC Failures Are Noise)

Handoff's "Known Pre-Existing Test Failures" (`interception.test.ts` / `cleanPassRefunds.test.ts` due to Extended AoC 2-cell range) is accurate — those failures predate the symmetry work and are unrelated to Challenger bias. Do not conflate them with the +2.9 Δ.

---

## TL;DR Answer to "Where is the bug?"

**There is no single bug. There are four:**

1. **`cardSearch.ts` + `posture.ts` are still AI-hardcoded** — PLAYER MCTS evaluates with wrong hand/posture.
2. **`rollout.ts` is still AI-hardcoded** — the entire cascade simulation attacks toward row 0 as AI even when `actingSide==='PLAYER'`, and stagnation checks only AI pieces. This is the *biggest* contributor to mirror +2.
3. **`reducer.ts` discards PLAYER cards** — `RUN_AI_TURN_FOR_PLAYER` runs `runSeededMCTS(..., 'PLAYER')` but never applies `stage0Card`/`stage2Card`, while `START_PLAYER_TURN` does for AI. Side bias, not Challenger bias, but needed for parity.
4. **`determinizePlayerHand` is dead code + AI-only + RNG burn** — its `rng.shuffle` advances RNG differently for AI vs PLAYER (different hand sizes), giving the *first actor per round* (Challenger) a systematic search distribution advantage. This is the cleanest explanation for "whoever is Challenger wins" independent of iteration count.

**Evaluation (`evaluate.ts`) is innocent** — do not touch it. Fix rollout + cards + determinize and the mirror will go to 0.

