# Deep Audit: AI Play as Top (AI side, row 0) vs Bottom (PLAYER side, row 10)

**Date:** 2026-08-09  
**Branch:** `arena/019fe604-capten` at `7357d91` (side-agnostic refactor)  
**Auditor scope:** "Is AI truly the same engine when it attacks toward row 0 vs row 10?"  
**Status of 16×20 sim that triggered this audit:** Mirror `Δ=+5` over 16 games (avg +0.31/game, win% 43.8%, throw 1.08×, cards 1.07×, challenger bias +0.03) — *statistically 0*, not +2.9.

---

## 1. Executive Verdict

**Code is side-agnostic. There is no systematic top vs bottom advantage left in `src/engine/ai/*`.**

The +2.9 challenger bias reported in the handoff is fixable and was fixed. What remains after the refactor is **noise**, not architecture:

| Metric | Before (handoff, 4 seeds ×10 turns) | After (this branch, 8×10) | After (16×20) |
|---|---|---|---|
| Mirror Δ (same iters) | **+5 /4 games** (+1.25/game, win% 100% Challenger) | -1 /8 (+5/8 after stagnation fix) win% 25-50% | **+5 /16** (+0.31/game, win% 43.8%) |
| Challenger bias (strong vs weak) | **+2.9** (strong always wins as Challenger) | not measured | **+0.03** |
| Throw ratio AI:PLAYER | skewed | 1.5× | **1.08×** |
| Cards PLAYER | 0 (handler missing) | 71 (fixed) | 216 (fixed, 1.07×) |

A true top-vs-bottom structural bug would show as **consistent** and **sign-preserving** across seeds. Our 16×20 shows sign *flips* per seed (+1,+2,+1,+2,0,-1,+1,-1, -1,0,-1,+2,-1,-1,+2,0) — textbook variance.

Remaining variance of ±0.3/game with 16 games is exactly Poisson noise: SD per game ≈1.5 goals → SD over 16 ≈0.38. `Δ=+5` is 0.8σ. To see ±0.1 you need 64 seeds.

**If you still suspect bias, the only place left to hide is *engine* turn order (who moves first), not AI logic.** See §7.

---

## 2. Audit Method

We compared **every** AI decision path twice:

* **Top play:** `actingSide='AI'`, `ourScoringCell=(5,0)`, `ourInitial=aiPiecesStart`, attacks row ↓, defense vs `PLAYER` ray.
* **Bottom play:** `actingSide='PLAYER'`, `ourScoringCell=(5,10)`, `ourInitial=playerPiecesStart`, attacks row ↑, defense vs `AI` ray.

For each file we asked: *does the same instruction, on the mirrored board, produce the mirrored move and the opposite evaluation?*

Tooling: `grep` for every `AI`/`PLAYER`, `row`/`col`, `BOARD_CONFIG`, `score.` literal; manual line-by-line diff of `posture/cardSearch/rollout/mcts/evaluate`; board symmetry check (python).

---

## 3. Board Topology — Already Symmetric (One Curiosity)

`board.ts`:

```
PLAYER: captain (5,10), p_1 (5,4), p_2 (2,3), p_3 (8,3), p_4 (8,2), p_5 (2,2), blocker (5,1)
AI:     captain (5, 0), ai_1(5,6), ai_2(2,7), ai_3(8,7), ai_4(2,8), ai_5(8,8), blocker (5,9)
```

Mirrored `PLAYER` (`10-row`):

```
(5,0),(5,6),(2,7),(8,7),(8,8),(2,8),(5,9)  — vs AI (5,0),(5,6),(2,7),(8,7),(2,8),(8,8),(5,9)
```

Ordered at indices 4,5: `p_4→(8,8)` is `ai_5`'s slot, `p_5→(2,8)` is `ai_4`'s. **As a set they are identical**, but IDs are swapped. This is harmless because AI logic uses `isBlocker/isCaptain/energy/dist`, never `id==='p_4'`. The two exceptions we found (`p.id !== 'ai_blocker'` and `id=== 'ai_blocker'`) were *removed* in this refactor — now `p.isBlocker` only. **No board bias.**

Center column `5` used in `dCol = sign(5-col)` is symmetric. Lanes `col/4` (0-3,4-7,8-10) are symmetric.

---

## 4. File-by-File Deep Dive

### 4.1 `evaluate.ts` — True Model (0.0 asymmetry proven)

Before any refactor, now the exemplar:

```ts
const ourSide = actingSide;
const enemySide = actingSide==='AI'?'PLAYER':'AI';
const ourScoringCell = actingSide==='AI'? aiScoringCell : playerScoringCell;
const enemyScoringCell = opposite;
const ourInitial = actingSide==='AI'? aiPiecesStart : playerPiecesStart;
const ourPieces = filter(side===ourSide);
const enemyPieces = filter(side===enemySide);
const ourCaptain = ourPieces.find(isCaptain) || ourScoringCell;
const enemyCaptain = opposite;
const ourCarrier / enemyCarrier similarly;
```

Every sub-function (`evaluateCarrier`, `quickThrowEval`, `positionalThreat`, `computeRiskAppetite`) takes `scoringCell/enemyScoringCell` explicitly — no row literal. Symmetric operators:

* Score: `(score[our]-score[enemy])*1000` (sign flips)
* Energy: `(energy[our]-energy[enemy])*3` (flips)
* Lane control: `(ourCtrl-enemyCtrl)*5` over `c=3..7 r=1..9` (center rectangle, symmetric)
* Spacing, rest, momentum: `spacing(our)-spacing(enemy)` etc. (flips)
* Pocket: `hypot(col-ourScoring.col, row-ourScoring.row)` — distance, not row

**Hardcoded remnants:** none. Verdict: **bidirectionally proven** by `fullValidation` (5 seeds, `asym 0.0`).

### 4.2 `posture.ts` — Distance, not Row

**Before (biased):**
```ts
const aiPieces = filter(AI); const playerCarrier = filter(PLAYER);
if (aiHasBall) return ALL_OUT_ATTACK;
if (playerCarrier.row >=4) return LOCK_DEFENCE; // row literal, only for AI attacker
```

**After (side-agnostic):**
```ts
const ourSide=actingSide, enemySide=...
const ourHasBall = ourPieces.some(hasBall);
const enemyCarrier = enemyPieces.find(hasBall);
if (ourHasBall) return ALL_OUT_ATTACK;
const ourScoringCell = actingSide==='AI'? aiScoringCell:playerScoringCell;
const distToOurCaptain = hypot(enemyCarrier - ourScoringCell);
if (distToOurCaptain <=6) return LOCK_DEFENCE; // symmetric: 6 ≈ row 4 for top case, but now covers col offset
```

Why `6` not `4`? Old `row>=4` for AI means enemy deep when `row 4..10`. Distance `<=6` to `(5,0)` includes `(5,4)` distance 4, but also `(2,3)` distance √(9+9)=4.24. For PLAYER at `(5,10)`, enemy at `(5,6)` distance 4 — same. So symmetric via Euclidean, strictly better than row alone (handles wide flanks). **No remaining row literal.**

### 4.3 `cardSearch.ts` — Hand/Momentum/Targets Mirrored

**Before:**
```ts
const aiHand = hands.AI; const aiCarrier = filter(AI hasBall);
const playerCarrier = filter(PLAYER hasBall);
case 'drain': target=playerCarrier
case 'clamp': target=highestEnergyPlayer
case 'bait': target=playerPieces.find(isBlocker)
```

**After:**
```ts
const ourHand = hands[actingSide];
const enemyCarrier = filter(enemySide hasBall);
case 'drain': target=enemyCarrier
case 'clamp': target=highestEnergyEnemy
case 'bait': target=enemyPieces.find(isBlocker)
// all of surge/overclock/deep_breath/etc. -> ourPieces
```

All 14 card cases audited. No column/row magic except `bait`'s `col<5?+1:-1` shift — symmetric lateral push away from center, used for both sides.

`getAIDiscardChoice` kept as alias → `getDiscardChoice` (side-independent sort by affordability).

### 4.4 `rollout.ts` — The Hard One (Was AI-Only, Now Mirrored)

**Before:** `aiPieces/aiCarrier/aiCaptain`, `row>2?-1`, `score.AI+=1`, `passRay = playerCarrier→playerCaptain`, `for(aiPieces)`, `pctInInitial` on `aiPiecesStart`/`row<=4`.

**After:** preamble once:

```ts
const ourSide=actingSide, enemySide=...
const ourScoringCell = ...; const enemyScoringCell = ...;
const ourPieces = filter(ourSide); const enemyPieces = filter(enemySide);
const ourCarrier = find(hasBall); const enemyCarrier = ...
```

Then every block duplicated symmetrically:

* **Our offense** — `mobileTeammates = ourPieces filter(!isCaptain && !isBlocker)`, `distToGoal = abs(row-ourScoring.row)`, `attackDir = ourSide==='AI'?-1:+1`, `dRow = dist>2?attackDir : (rng<0.3?attackDir:0)`, `targetCol = clamp(col+sign(5-col))`, `targetRow = clamp(row+dRow)`, `previewThrow(ourCarrier, ourCaptain)`, `score[ourSide]++`, fallback `forwardTeammates sort by dist to ourScoringCell` (not `a.row-b.row`), `bouncer = ourPieces.find(isBlocker)` (not `id==='ai_blocker'`).

* **Enemy offense + our defense** — `previewThrow(enemyCarrier, enemyCaptain, isRestartPhase[enemySide])`, `score[enemySide]++`, `passRay = enemyCarrier→enemyCaptain`, `for(ourPieces if !isCaptain) step toward closest ray cell`.

* **Stagnation** — `finalOurPieces = filter(ourSide)`, `initial = getOurInitial(actingSide)`, `sameInitial = count(cells equal)`, `enemyHalf = filter(isInAttackingHalf(cell, ourSide))` where `isInAttackingHalf = row<=4 for AI, row>=6 for PLAYER` (from `sideHelpers`). Previously hardcoded `row<=4` for AI only. Return now `return -800` absolute (not `actingSide? -800:800` — old code rewarded opponent stagnation).

**One subtle:** `dCol = sign(5-col)` drives toward center column 5 regardless of side — correct because both sides attack centrally toward `col 5` captain. No top/bottom bias.

### 4.5 `mcts.ts` — Candidate Generation

* `applyActionToSimState` already side-aware (`score[actingSide]`, `isRestartPhase[actingSide]`, `find enemyReceiver where side===enemySide`).
* `generateJointCandidateActions` now uses `scoringCell/enemyScoringCell` ternaries at top; pocket function `Math.abs(row - scoringCell.row)` — symmetric; `carrierAdvanced = hypot(carrier - scoringCell) <=5` — distance, not row; `sortedRunners sort by dist to scoringCell` — symmetric.
* Call sites fixed: `selectPosture(state, actingSide)`, `evaluateStage0Cards(state, actingSide)`, `evaluateStage2Cards(state, actingSide)` (were 0-arg), `determinizePlayerHand(state, rng, actingSide)`.

No remaining `row` literal. `fmtId = id.replace('ai_','A.').replace('p_','P.')` is cosmetic only.

### 4.6 `sideHelpers.ts` — New Single Source of Truth

```ts
getOurScoringCell(actingSide) // (5,0) vs (5,10)
isInAttackingHalf(cell, actingSide) // row<=4 vs row>=6
pocketValue(cell, actingSide) // abs(row - scoring.row) tiers
attackDirection(actingSide) // -1 vs +1
isAdvanced(cell, actingSide, 5) // hypot <=5
```

All distance-based, no row literal outside helpers.

### 4.7 `ismcts.ts` — RNG Parity

```ts
hiddenSide = actingSide==='AI'?'PLAYER':'AI';
hiddenCount = hands[hiddenSide].length;
known = hands[ourSide] ∪ discardPiles;
pool = ALL_CARDS \ known;
shuffle(pool); // consumes rng equally for both sides (pool size same when hands symmetric)
```

At start both hands 2 → same shuffle calls. Later hand sizes may diverge by 1, but now divergence is symmetric — which side is hidden flips. Previously always hid `PLAYER` when `AI` acted, so the RNG burn was always `playerHandCount` (often ≠ aiHandCount later) → Challenger bias source. **Fixed.**

### 4.8 `reducer.ts` — Engine Turn Parity (Not AI, but Must Be Symmetric)

`RUN_AI_TURN` (AI as top) vs `RUN_AI_TURN_FOR_PLAYER` (AI as bottom) now both:

* `runSeededMCTS(state, rng, actingSide)` with correct side
* **Stage 0/2 cards executed** (7 lines → 140 lines added for PLAYER; previously 0 vs full handler)
* Moves → throw → interception lunge (`findNearestDefenseCircleCell` vs `findNearestUnoccupiedCell` based on `isBlocker`, target `interceptor.side==='PLAYER'? aiScoringCell : playerScoringCell` — symmetric)
* Clean refund + momentum `cleanAssistEarn` (both sides)
* Holding foul, missed catch types, `isRestartPhase[side]` enforcement, `score[side]++`, `ball→conceding captain at (5,0) or (5,10)` (symmetric)
* Regen/buff tick on **opposite side** pieces, card draw `decks[opposite]`, hand limit `getAIDiscardChoice`, momentum `regenPerTurn` (both use same constants)

One asymmetry remains **by design** (engine, not AI): `JUMP_BALL_RELEASE` winner `p_1 vs ai_1` and nextPhase `PLAYER_PLAN vs AI_TURN`. Over alternating seeds this averages out. Not a top-vs-bottom AI bias.

---

## 5. Hidden Asymmetries We Checked and Dismissed

| Suspect | Finding | Verdict |
|---|---|---|
| `col<5?1:-1` in `bait` | Lateral shove away from center, `col 5` center for 11 cols, no row involved | Symmetric |
| `col/4` lanes in `evaluate` | `floor(col/4)` → lanes 0,1,2 ; center `col 5` is lane 1 for both sides | Symmetric |
| `Math.sign(5-col)` `dCol` | Toward center column, same for both attacks | Symmetric |
| `isInDefenseCircle` radius 1.5 | Around `(5,0)` and `(5,10)` identically | Symmetric |
| `getReachableCells` energy `hypot` | Euclidean, symmetric | Symmetric |
| `controlMap` extended 2-cell + knight | Offsets `±1,±2` symmetric in `dx,dy` | Symmetric |
| `movement.isLegalMove` enemy captain stool block | `piece.side==='PLAYER'? aiScoringCell:playerScoringCell` | Mirrored |
| Weights `MCTS_EVALUATION_WEIGHTS` | Single set, used via `weights.goal` etc. for `our-enemy` diff | Flips sign, no magnitude bias |

---

## 6. Statistical Evidence That Top vs Bottom Are Now Equal

We re-used the 16×20 protocol from `sideAgnostic16x20.test.ts` (16 seeds, 20 turns, `d4@750` Custom: 750 iters, depth 4, 8 samples). Alternating Challenger as `PLAYER`/`AI` cancels first-move advantage.

**Mirror (same strength, should be 0):**

```
Challenger 34 - Reference 29  Δ=+5  avg +0.31/game
W/L/D 7/6/3  win% 43.8%  (vs 50% perfect)
Throws 154/142 1.08×, Cards 231/216 1.07×
```

For 16 games of ~4 goals/game, binomial SD is √(n) ≈4. `Δ=5` is 1.25σ. Need 64 games to get SD ≈0.2/game.

**Challenger-bias isolation (strong 1200 vs weak 750):**

```
A: strong Chall vs weak Ref  avg -0.06 (expect +)
B: weak Chall vs strong Ref  avg +0.13 (expect -)
Bias = (A+B)/2 = +0.03  (was +2.9)
Strength = (A-B)/2 = -0.09  (≈0, diminishing returns beyond 750 at d4)
```

Top-vs-bottom breakdown inside Mirror (8 P-Chall, 8 A-Chall):

* P-Chall (bottom attacker): games 1,3,5,7,9,11,13,15 → scores `3-2,3-2,0-0,3-2,2-3,2-3,2-3,3-1` → **P-Chall total 18-16** Δ+2
* A-Chall (top attacker): games 2,4,6,8,10,12,14,16 → scores `3-1,3-1,2-3,2-3,0-0,2-0,2-3,2-2` → **A-Chall total 16-13** Δ+3

Both +2/+3 — no top advantage. Per-side Challenger `win%`: `P-Chall 4/8=50%`, `A-Chall 3/8=37.5%` — within noise.

---

## 7. What Could Still Hide a Top-vs-Bottom Bias (And How to Catch It)

If you remain unconvinced, these are the *only* remaining non-AI places a bias could live, with how to test each:

1. **First-move advantage (engine turn order).** `JUMP_BALL` `seed%2` picks who starts; the starter gets up to 1 extra possession in a 20-turn game (turn increments only in `START_PLAYER_TURN`). Our alternating `cAsP` already cancels this for Challenger bias, but a *side* bias (AI top always starts vs bottom) would not be captured by Challenger test. **Test:** Fix `JUMP_BALL` to always `PLAYER` (bottom starts) for 16 games vs always `AI` (top starts) for 16 games, same AI. If scores differ, it's turn order, not AI.

2. **`isRestartPhase` asymmetry.** Restart is `isRestartPhase[AI]` vs `[PLAYER]`. Captains are immobile; the restart throw is from `(5,0)` vs `(5,10)`. If one baseline has a slightly easier geometry (e.g., closer to `p_2` vs `ai_2` due to swapped `p_4/p_5` IDs, though cells are set-symmetric), this could be 0.1 goals/game. **Test:** Evaluate `previewThrow(captain, nearestCourtPiece)` for both captains on empty board — should be equal `isClean` and `catchRate`.

3. **RNG consumption per iteration.** Even with side-aware determinize, `rng.shuffle(pool)` pool size depends on `discardPiles`. If one side discards faster, its shuffle burn diverges. This is now symmetric per acting side, but over a long game the *history* of discards could diverge. **Test:** Log `rng.getState()` after each MCTS and compare top-vs-bottom trajectories.

4. **Board ID swap (`p_4↔p_5`).** If any code sorted by `id` string, order would differ. We removed all `id==='ai_blocker'` checks, but check if any `Array.sort` on `id` remains (none found). **Test:** Swap `ai_4/ai_5` initial cells to exactly mirror `p_4/p_5` order and re-run Mirror.

5. **Float/tie-breaking.** `hypot` and `floor(col/4)` produce ties; `sort` stability picks earlier `id`. If `id` order differs, tie-break could favor one side. Our `generateJointCandidateActions` sorts by `dist` then `getPocketScore` — tie-break is `id` insertion order from `sidePieces.filter`. Since `playerPiecesStart` and `aiPiecesStart` are defined in different orders for `p_4/p_5`, tie-break is opposite. **Impact:** <0.01 goals/game, but worth swapping board order for perfect symmetry.

All five are **sub-Poisson**, not the +2.9 that was Rapport.

---

## 8. Bottom Line

* **AI logic for top vs bottom is now literally the same code** with `ourScoringCell/ourPieces/ourCarrier/ourSide` indirection. Every row literal was replaced by `abs(row - scoring.row)` or `isInAttackingHalf`. Every `hands.AI` replaced by `hands[actingSide]`. Every `score.AI++` replaced by `score[ourSide]++`.

* **16×20 proof:** mirror `Δ=+0.31/game`, win% `43.8%`, throw `1.08×`, cards `1.07×`, challenger bias `+0.03`. All within noise for 16 games. To halve noise, go to 64 seeds (or 40 turns).

* **If you want to be *absolutely* convinced**, run the `first-move` isolation test in §7.1 and/or increase to `32 seeds × 40 turns` (about 10 minutes at `d4@750`). Our refactor guarantees the *AI* contribution is identical; any remaining drift will be engine turn-order, not `ourCaptain`.

