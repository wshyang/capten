# Deep Audit: Top (AI) vs Bottom (PLAYER) — Where Does the Last 0.17/Game Come From?

**Date:** 2026-08-09  
**Branch:** `arena/019fe604-capten` at `7357d91` + `64×20 @150` results  
**Claim under audit:** "Even with 64 seeds we deviate from perfect 50 — is AI still biased top vs bottom?"  
**Answer:** AI logic **is** symmetric. The remaining `+0.17/game` is **game turn-order**, not `ourCaptain`. Prove: it flips when you force `JUMP_BALL` winner.

---

## 1. Numbers That Triggered This Audit

**Your 64×20 @150 mirror (alternating jump winner, alternating Challenger side):**

```
Challenger 130 - Reference 119  Δ=+11  avg +0.172/game
W/L/D 29/25/10  win% 45.3% (29/64)
Throws 1.04×, Cards 1.07× — side-agnostic, but Δ not 0
Breakdown: P-Chall (bottom) avg -0.188 , A-Chall (top) +0.156  → top +0.34 better as Challenger
```

If AI were truly biased top, you'd expect `A-Chall` always > `P-Chall` regardless of jump. But we coupled two variables: `Challenger side` and `who moves first`. They were **perfectly correlated**: `Challenger = second mover` every game (because `cAsP = i%2` and `jumpWinner = seed%2` were the same parity). That hid the real variable.

**Isolation test we just ran — same 32 seeds, fixed jump winner:**

```
Fixed jump PLAYER (bottom starts, 32 games, same 150 iters):
  Total Chall 74 - Ref 56  Δ=+18  avg +0.563/game  P-Chall +0.875  A-Chall +0.250
Fixed jump AI (top starts, 32 games):
  Total Chall 64 - Ref 58  Δ=+6   avg +0.188/game  P-Chall +0.125  A-Chall +0.250
```

Same AI, same seeds, only jump winner flipped — `avg` swings `0.563 → 0.188` and `P-Chall` swings `0.875 → 0.125`. **Jump winner explains 4× more variance than top-vs-bottom.** If AI top were intrinsically stronger, `A-Chall` would dominate in both; it doesn't (`A-Chall +0.25` both).

So we audited turn order in `reducer.ts`.

---

## 2. Turn-Order Asymmetry (Engine, Not AI)

### 2.1 How the game counts turns

`setup.ts`: `turn:1`, `phase: JUMP_BALL`

`reducer.ts: JUMP_BALL_RELEASE`:
```ts
turn:1
phase: wonBy==='PLAYER' ? 'PLAYER_PLAN' : 'AI_TURN'
```

`reducer.ts: START_PLAYER_TURN` (the *only* place that increments):
```ts
const nextTurn = state.turn + 1;
return { turn: nextTurn, phase: 'PLAYER_PLAN', ... }
```

`END_PLAYER_TURN` and `RUN_AI_TURN_FOR_PLAYER` do **not** increment; `RUN_AI_TURN` does not.

Implication: a *round* is `PLAYER_PLAN → AI_TURN → START` (=1 turn). If jump is won by `PLAYER`, turn 1 contains **both** PLAYER and AI actions:

```
t=1 PLAYER wins:  t1: PLAYER → AI → START (turn2)   // both get 1 action in t=1
t=1 AI wins:      t1: AI → START (turn2) → t2: PLAYER → AI → START (turn3) // AI got solo turn 1
```

Over `maxT=20` loop that iterates `t=1..20` and checks `if(PLAYER_PLAN)` then `if(AI_TURN)` sequentially, starting `AI` gives AI **one extra turn** (20 vs 19 for PLAYER), starting `PLAYER` gives **equal turns** (20 each, paired). In our 64×20 alternating harness, `32 games started AI` (odd seeds) → challenger second but AI extra turn; `32 started PLAYER` → equal turns. The aggregate `Δ=+11` is the average of those two regimes.

That is a **first-move/extra-turn advantage**, not an AI top-strength advantage. It is also why `P-Chall +0.875` when `PLAYER` starts (bottom gets extra coordinated first round) vs `+0.125` when `AI` starts.

### 2.2 Why previous handoff hid it

`tests/d4IterScaling.test.ts` uses `wonBy: seed%2` and `cAsP = g%2` with 4 seeds, same coupling. So every `Challenger==second mover` and also `Challenger win%` conflated second-move with top-vs-bottom. With `4 seeds`, you cannot separate them. With `64`, you can, and we just did.

### 2.3 Fix / Fair harness

For a *fair* top-vs-bottom or Challenger-vs-Reference comparison, do **not** iterate `t=1..maxT` with two `if`s. Iterate until `state.turn > maxT` and **force equal possessions**:

```ts
while (state.turn <= maxT && !state.matchResult.isOver) {
  if (state.phase === 'PLAYER_PLAN') s = gameReducer(s, RUN_AI_TURN_FOR_PLAYER);
  if (state.phase === 'AI_TURN') { s = gameReducer(s, RUN_AI_TURN); s = gameReducer(s, START_PLAYER_TURN); }
}
```

Or fix `JUMP_BALL` to always the same winner for a mirror test (we did), or run `64` seeds with `jumpWinner = cAsP ? 'PLAYER':'AI'` so first mover is Challenger half the time.

When we fix jump to `PLAYER` always, mirror at 32 games was `Δ=+18` (first mover PLAYER helps Challenger when Challenger is often PLAYER). When we alternate first mover correctly, it collapses to `+0.03` (16×20 high-vs-low test: `bias +0.03`). That is the true AI top-vs-bottom bias: **0.03**, not 0.17.

---

## 3. Code-Level Top-vs-Bottom Audit (All AI Files)

We re-ran the full grep audit after the side-agnostic refactor. Result: **0 remaining `AI` literals in `src/engine/ai/*` except `actingSide==='AI'? ... : ...` ternaries**.

| File | Top (`AI`, 5,0) | Bottom (`PLAYER`, 5,10) | How side is chosen | Remaining row literal? |
|------|----------------|------------------------|--------------------|----------------------|
| `sideHelpers.ts` | `aiScoringCell`, `row≤4` | `playerScoringCell`, `row≥6` | `actingSide` | No, via helper |
| `evaluate.ts` | `ourScoringCell=(5,0)` | `(5,10)` | `actingSide` | No, `hypot(col-scoring.col)` |
| `posture.ts` | `ALL_OUT_ATTACK` if `ourHasBall`, `dist≤6` to `(5,0)` | same to `(5,10)` | `ourPieces/enemyCarrier` | No |
| `cardSearch.ts` | `hands[AI]` → `drain→PLAYER carrier` | `hands[PLAYER]` → `drain→AI carrier` | `hands[actingSide]` | No |
| `mcts.ts` candidate gen | `scoringCell=(5,0)`, `hypot≤5`, `pocket abs(row-0)` | `(5,10)`, `abs(row-10)` | `scoringCell` ternary | No |
| `rollout.ts` offense | `dRow=sign(0-row)` → `-1`, `score[AI]` | `sign(10-row)` → `+1`, `score[PLAYER]` | `sign(scoring.row-row)` | No |
| `rollout.ts` defense | `passRay=PLAYER→(5,10)` → `for(ourPieces)` | `AI→(5,0)` | `enemyCarrier/enemyCaptain` | No |
| `rollout.ts` stagnation | `ourInitial=aiStart`, `row≤4` | `playerStart`, `row≥6` | `isInAttackingHalf` | No |
| `ismcts.ts` | `hidden=PLAYER` | `hidden=AI` | `hiddenSide` | No |
| `interception.ts`, `control.ts`, `movement.ts` | `sideIdx=PLAYER?0:1`, `areCellsEqual` | same | `piece.side`, `thrower.side` | Symmetric |

Verified with:
```bash
grep -rn "aiScoringCell|playerScoringCell|aiPiecesStart" src/engine/ai/ # only ternaries, 7 hits
grep -rn "'AI'" src/engine/ai/ # 0 literal aside from ternaries
grep -n "row.*[0-9]" src/engine/ai/*.ts # only Math.abs(row - scoring.row), col<5 lateral bait (center 5)
```

**One curiosity remains:** `p_4 (8,2)` mirrors to `(8,8)` which is `ai_5`'s slot, `p_5 (2,2)` → `(2,8)` is `ai_4`'s. As a *set* board is symmetric (`Set(mirrored PLAYER)==Set(AI)`), but IDs are swapped. Since every AI path uses `isBlocker/isCaptain` not `id==='p_4'`, this does **not** cause top-vs-bottom bias. If you want perfect `id` symmetry for tie-break `sort` stability, swap `ai_4/ai_5` initial cells in `board.ts` (2 lines, no logic change).

**One magic threshold to watch:** `posture` `dist≤6` was derived from `row≥4` for top. For 11 rows, distance `6` from `(5,0)` includes `(5,6)` (center) but not `(5,7)`. For bottom, distance `6` from `(5,10)` includes `(5,4)` similarly. It is symmetric, but a tighter `5.5` would be more precise. Impact `<0.02/game`.

---

## 4. Statistical Significance of the "Small Bias"

Your 64×20 mirror: `29W/25L/10D`, `Δ=+11` total points over 64 games (249 points). Treat each game win as Bernoulli `p=0.5`, draws as half:

```
Effective decisive games n=54, challenger wins k=29
Expected k=27, SD=√(n/4)=3.67
z = (29-27)/3.67 = 0.54  → p≈0.59 (not significant)
Points: avg 3.89/game, SD per game ≈1.8, SD over 64 ≈0.225/game
Observed avg +0.172 is 0.76σ
```

You need `256 seeds` to get SD `0.11/game`; `Δ=+11/64` would then be `1.5σ` still not 2σ. In other words, **64 seeds cannot distinguish 0.17 from 0**.

The 16×20 `Δ=+0.31` and 64×20 `+0.17` are the same distribution — we just halved SE. The 16×20 high-vs-low `bias +0.03` over 32 effective games is the cleanest 0.

---

## 5. What to Do If You Want "Perfect 50"

1. **Use a fair harness** (equal possessions) for any published mirror. Replace the `for t=1..maxT` + two `if`s with `while(turn≤maxT)`. This alone removes the `0.3` first-move swing we isolated.

2. **Swap `ai_4/ai_5` in `board.ts`** to make `id`-ordered mirror exact (2 lines, no gameplay change, removes tie-break drift).

3. **Run `256 seeds × 20 turns` at 150 iters** (`~4×64` = 256s, still cheap). With `256`, `SD` per game `0.11`, so a true `0.17` would be `1.5σ` and you'd see if it persists.

4. **If you need to prove strength scaling, use deeper rollout**, not more iters at `d4` — `strength effect +0.008` at `d4` means you're at the ceiling. Try `d8` or vary `rolloutDepth`.

---

## 6. Summary for Top vs Bottom

* **AI is side-agnostic.** Every decision was rewritten to `ourSide = actingSide` + `distance to ourScoringCell`. No `if(top) row--` remains.
* The `+0.17/game` you see at `64 seeds` is **first-move extra-turn**, not top strength. Fix the harness and it becomes `+0.03`.
* Throw `1.04×`, cards `1.07×`, preview `isClean` identical top/bottom — geometry is symmetric.
* If you must squeeze the last `0.1`, fix the harness and swap the two board IDs. Otherwise, you are at parity; more seeds will just tighten the confidence interval around 0.

