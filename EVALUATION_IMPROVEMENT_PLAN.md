# Implementation Plan: Evaluation Improvements

## Problem Summary

The evaluation function has 8 identified issues ranked by impact. The most critical is a **Player-side bias** revealed by mirror match tests (+3 to +4 Δ), which invalidates all AI vs AI comparisons.

---

## Phase 1: Fix Player-Side Bias (Critical)

### Root Cause Analysis

`evaluateState()` is hardcoded for AI perspective. When MCTS runs for PLAYER, the score is negated, but several terms don't properly mirror:

| Term | AI Acting | Player Acting (negated) | Problem |
|------|-----------|------------------------|---------|
| Attacking formation | AI pieces in rows 0-4 get +35/+25/+20 | Negated: -35/-25/-20 for AI being well-formed | Player gets NO bonus for its own pieces in rows 6-10 |
| Carrier position | AI carrier in rows 0-4 gets +40/+25/+20 | Negated: penalty for AI carrier position | Player carrier position not evaluated |
| Stagnation | AI pieces in initial positions → -500 | Negated: +500 when AI is stagnant | Player's own stagnation not penalized |
| Blocker danger | -300 for AI blocker with ball | Negated: +300 | Player blocker danger not evaluated |
| Option density | Computed for AI carrier only | Negated | Player's options not directly evaluated |

**Net effect**: Player sees an AI-centric evaluation flipped upside down, instead of a Player-centric evaluation. The asymmetry creates a ~+3 Δ bias.

### Fix: Parameterize `evaluateState` by `actingSide`

**File**: `src/engine/ai/evaluate.ts`

**Changes**:
1. Add `actingSide: Side = 'AI'` parameter
2. Define side-relative variables at the top:
   ```typescript
   const ourSide = actingSide;
   const enemySide: Side = actingSide === 'AI' ? 'PLAYER' : 'AI';
   const ourScoringCell = actingSide === 'AI' ? BOARD_CONFIG.aiScoringCell : BOARD_CONFIG.playerScoringCell;
   const enemyScoringCell = actingSide === 'AI' ? BOARD_CONFIG.playerScoringCell : BOARD_CONFIG.aiScoringCell;
   const ourInitialPositions = actingSide === 'AI' ? BOARD_CONFIG.aiPiecesStart : BOARD_CONFIG.playerPiecesStart;
   const forwardDir = actingSide === 'AI' ? -1 : 1; // row direction toward enemy
   ```
3. Replace all `aiPieces`/`playerPieces` with `ourPieces`/`enemyPieces`
4. Replace hardcoded row checks (rows 0-4) with `actingSide`-relative checks:
   ```typescript
   // Old: if (r === 2 || r === 3) score += 35
   // New: const distToScoring = Math.abs(p.cell.row - ourScoringCell.row);
   //      if (distToScoring === 2 || distToScoring === 3) score += 35
   ```
5. The function returns score from `actingSide`'s perspective (positive = good for actingSide)
6. **Remove the negation in MCTS** — the eval now returns the correct sign directly

**Caller changes**:
- `src/engine/ai/mcts.ts`: Pass `actingSide` to `evaluateState`, remove `score = actingSide === 'AI' ? rawScore : -rawScore`
- `src/engine/ai/rollout.ts`: Pass `actingSide` (always 'AI' in rollout since it evaluates from AI perspective — but if rollout evaluates for both sides, parameterize)

**Testing**: Run mirror match (d=4@750 vs d=4@750). Target: Δ ≈ 0 (within ±1 noise).

**Effort**: Medium (careful refactoring of ~200 lines, ~15 variable renames)
**Risk**: Low (mechanical change, no algorithm changes)

---

## Phase 2: Remove Double-Counting

### Problem
Three functions independently evaluate the carrier's throw options:
1. `findBestThrowTarget()` → CEV, clean bonus, risk
2. `previewThrow(carrier, captain)` → clean lane check (redundant with #1)
3. `computeOptionDensity()` → re-runs `computeChainEV` for all targets (redundant with #1)

### Fix: Single Computation, Multiple Derivations

**File**: `src/engine/ai/evaluate.ts`

**Changes**:
1. Call `findBestThrowTarget()` once at the top
2. Derive option count from the result: `optionCount = bestThrow.all.filter(t => t.cev > 0.1).length`
3. Derive clean lane from the result: `hasCleanLane = bestThrow.best?.cleanBonus > 0`
4. Remove the separate `previewThrow(carrier, captain)` call
5. Remove the separate `computeOptionDensity()` call
6. The fallback ball-progress gradient `(11 - dist) × ballProgress × 0.5` can stay as it provides positional signal when no throws are viable

**Effort**: Low (remove ~30 lines, restructure ~10 lines)
**Risk**: Low (simplification, no new logic)
**Performance gain**: ~40% fewer `previewThrow` calls per evaluation

---

## Phase 3: Game State Awareness

### Problem
No urgency scaling. A team leading 2-0 at turn 38 plays identically to a team at 0-0 turn 1.

### Fix: Risk Appetite Multiplier

**File**: `src/engine/ai/evaluate.ts`

**New function**:
```typescript
function computeRiskAppetite(
  ourScore: number, enemyScore: number,
  turn: number, maxTurns: number, pointsToWin: number
): number {
  const scoreDiff = ourScore - enemyScore;
  const turnsRemaining = maxTurns - turn;
  const turnsFraction = turn / maxTurns; // 0 = start, 1 = end

  // Late game urgency
  if (turnsFraction > 0.75) {
    if (scoreDiff > 0) return 0.3;   // Leading late: ultra-conservative
    if (scoreDiff < 0) return 2.5;   // Trailing late: desperate
    return 1.5;                       // Tied late: moderately aggressive
  }

  // Mid game
  if (turnsFraction > 0.4) {
    if (scoreDiff > 0) return 0.7;   // Leading: slightly conservative
    if (scoreDiff < 0) return 1.5;   // Trailing: slightly aggressive
    return 1.0;                       // Tied: balanced
  }

  // Early game: standard
  return 1.0;
}
```

**Integration**:
```typescript
const riskAppetite = computeRiskAppetite(ourScore, enemyScore, state.turn, state.config.board.maxTurns, state.config.board.pointsToWin);

// Scale CEV by risk appetite (aggressive = value scoring more)
totalScore += cev * tempoFactor * weights.ballProgress * 2.5 * riskAppetite;

// Scale possession risk inversely (conservative = penalize risk more)
totalScore -= risk * 40.0 * (2.0 - riskAppetite);

// When very conservative and we have the ball, add "hold ball" bonus
if (riskAppetite < 0.5 && ourCarrier) {
  totalScore += 20.0; // Incentivize not throwing
}
```

**Effort**: Low (new function ~20 lines, 3 integration points)
**Risk**: Medium (could make leading AI too passive; needs tuning)

---

## Phase 4: Non-Linear Momentum Value

### Problem
`momentumDiff × 15` treats all momentum equally. The 2→3 threshold (unlocks Surge/Overclock/No Look Pass at cost 3) is much more valuable than 0→1.

### Fix: Step Function

**File**: `src/engine/ai/evaluate.ts`

**Replace**:
```typescript
// Old
totalScore += momentumDiff * 15.0;
if (state.momentum.AI >= 3) totalScore += 10.0;
if (state.momentum.PLAYER >= 3) totalScore -= 10.0;
```

**With**:
```typescript
function momentumValue(m: number): number {
  if (m >= 3) return 45;   // Premium cards unlocked (Surge, Overclock, No Look Pass)
  if (m >= 2) return 25;   // Mid-tier cards (Threaded Pass, Drain, Steady Hands, etc.)
  if (m >= 1) return 10;   // Basic cards (Deep Breath, Reset, Bait, etc.)
  return 0;                 // No cards playable
}

totalScore += momentumValue(ourMomentum) - momentumValue(enemyMomentum);
```

**Effort**: Trivial (~10 lines)
**Risk**: None

---

## Phase 5: Gradual Stagnation Penalty

### Problem
Binary -500 penalty when >40% pieces in initial position AND no enemy half progress. One piece moving can swing eval by 500.

### Fix: Continuous Development Score

**File**: `src/engine/ai/evaluate.ts`

**Replace**:
```typescript
// Old: binary -500
if (pctInInitial > 0.40 && enemyHalfCount <= initialEnemyHalfCount && !state.matchResult.isOver) {
  totalScore -= 500.0;
}
```

**With**:
```typescript
// New: gradual penalty based on how undeveloped the formation is
let totalDisplacement = 0;
for (const p of ourPieces) {
  if (p.isCaptain) continue;
  const init = ourInitialPositions.find(x => x.id === p.id);
  if (init) {
    const dist = Math.hypot(p.cell.col - init.cell.col, p.cell.row - init.cell.row);
    totalDisplacement += dist;
  }
}
// Expected displacement grows with turn count
const expectedDisplacement = Math.min(ourPieces.length * 3.0, state.turn * 1.5);
const developmentDeficit = Math.max(0, expectedDisplacement - totalDisplacement);
totalScore -= developmentDeficit * 8.0; // Gradual: ~8 per cell of deficit
```

**Effect**: At turn 1, expected displacement is ~1.5 cells total. At turn 10, ~15 cells. The penalty scales smoothly.

**Effort**: Low (~15 lines replacing ~10 lines)
**Risk**: Low

---

## Phase 6: Blocker as Scoring Weapon

### Problem
Blanket -300 for blocker with ball prevents legitimate 1-cell relay to captain.

### Fix: Evaluate Blocker Relay Properly

**File**: `src/engine/ai/evaluate.ts`

**Replace**:
```typescript
// Old
if (ourCarrier.isBlocker || ourCarrier.id === 'ai_blocker' || distToEnemyCaptain <= 2.0) {
  totalScore -= 300.0;
}
```

**With**:
```typescript
// New: evaluate blocker's actual scoring potential vs turnover risk
if (ourCarrier.isBlocker) {
  // Blocker can relay to captain in ~1 cell — check if it's clean
  const captain = ourPieces.find(p => p.isCaptain);
  if (captain) {
    const relayPreview = previewThrow(ourCarrier, captain.cell, state.pieces, controlMap, state.temporaryState);
    if (relayPreview.isClean || relayPreview.cumulativeCaptureRisk < 0.3) {
      // Clean relay is extremely valuable!
      totalScore += relayPreview.catchRate * 80.0; // Near-guaranteed goal
    } else {
      // Risky relay: turnover here is catastrophic
      const turnoverDanger = relayPreview.cumulativeCaptureRisk * 60.0;
      totalScore -= turnoverDanger;
    }
  }
  // Holding ball near enemy captain is still risky (fumbles, missed catches)
  totalScore -= 30.0; // Moderate base penalty (was -300)
}
```

**Effort**: Low (~20 lines replacing ~5 lines)
**Risk**: Low

---

## Phase 7: Dynamic Formation Bonuses

### Problem
Row-based bonuses (+35 for rows 2-3) are static and don't adapt to opponent defense.

### Fix: Per-Piece Scoring Threat

**File**: `src/engine/ai/evaluate.ts`

**Replace**:
```typescript
// Old: static row bonuses
for (const p of ourPieces) {
  if (p.isCaptain || p.isBlocker) continue;
  const r = p.cell.row;
  if (r === 2 || r === 3) score += 35.0;
  else if (r === 4 || r === 1) score += 25.0;
  else if (r === 0) score += 20.0;
}
```

**With**:
```typescript
// New: each piece's value as a potential relay/receiver
for (const p of ourPieces) {
  if (p.isCaptain) continue;
  
  // How good is this piece as a throw target from the carrier?
  if (ourCarrier && p.id !== ourCarrier.id) {
    const chain = computeChainEV(ourCarrier, p, state.pieces, controlMap, 
      state.temporaryState, ourScoringCell, 2);
    totalScore += chain.totalCEV * 20.0; // Piece's contribution to scoring chains
  }
  
  // Positional value: proximity to scoring pocket (2-3 cells from captain)
  const distToCaptain = Math.hypot(p.cell.col - ourScoringCell.col, p.cell.row - ourScoringCell.row);
  if (distToCaptain >= 2 && distToCaptain <= 4) {
    totalScore += 15.0; // In the scoring pocket
  }
}
```

**Note**: This partially overlaps with Phase 2 (option density from `findBestThrowTarget`). The two can be combined — the `bestThrow.all` array already contains CEV for all targets.

**Effort**: Medium (~30 lines, need to avoid re-computing CEV)
**Risk**: Low

---

## Phase 8: Opponent Response Modeling (1-Ply Minimax)

### Problem
The eval doesn't consider what the opponent does next. A throw that looks good now might set up an opponent counter-attack.

### Fix: Lightweight Response Evaluation

**File**: `src/engine/ai/evaluate.ts`

**Add after main scoring terms**:
```typescript
// Evaluate opponent's best counter if they get the ball next turn
const enemyCarrier = enemyPieces.find(p => p.hasBall);
if (enemyCarrier) {
  const enemyBestThrow = findBestThrowTarget(
    enemyCarrier, state.pieces, controlMap, state.temporaryState,
    state, enemyScoringCell, ourScoringCell, enemyMomentum, 1 // depth 1 for speed
  );
  if (enemyBestThrow.best) {
    // Opponent's scoring threat reduces our position value
    totalScore -= enemyBestThrow.best.cev * weights.ballProgress * 1.5;
  }
}
```

**Note**: This is already partially done in the `else if (playerCarrier)` branch for when the opponent currently has the ball. The improvement is to ALSO evaluate the opponent's threat when WE have the ball (to penalize risky throws that could lead to counter-attacks).

**Effort**: Low (~15 lines)
**Risk**: Medium (could make the AI overly cautious; needs weight tuning)
**Performance**: Adds one `findBestThrowTarget` call per evaluation

---

## Implementation Order & Dependencies

```
Phase 1: Player-Side Bias (CRITICAL)
  │
  ├── Phase 2: Remove Double-Counting (simplifies Phase 7)
  │     │
  │     └── Phase 7: Dynamic Formation (uses cleaned-up structure)
  │
  ├── Phase 3: Game State Awareness (independent)
  │
  ├── Phase 4: Non-Linear Momentum (trivial, do anytime)
  │
  ├── Phase 5: Gradual Stagnation (independent)
  │
  ├── Phase 6: Blocker as Weapon (independent)
  │
  └── Phase 8: Opponent Response (depends on Phase 1 for correct side handling)
```

**Recommended execution order**:
1. **Phase 1** (bias fix) — must be first, everything else builds on correct evaluation
2. **Phase 2** (double-counting) — cleanup that makes later phases cleaner
3. **Phase 4** (momentum) — trivial, quick win
4. **Phase 5** (stagnation) — simple, independent
5. **Phase 6** (blocker) — simple, independent
6. **Phase 3** (game state) — medium effort, high impact
7. **Phase 7** (dynamic formation) — depends on Phase 2 cleanup
8. **Phase 8** (opponent response) — last, as it adds compute cost

---

## Testing Strategy

After each phase, run:

| Test | Purpose | Pass Criteria |
|------|---------|---------------|
| Mirror match (d=4@750 vs d=4@750) | Verify no side bias | Δ ∈ [-1, +1] |
| Smoke test (5 AI vs AI games) | Basic functionality | Both sides score, no stuck games |
| Full test suite (54 tests) | No regressions | All pass |
| d=6@400 vs T1 grid cell | Performance check | Δ ≥ +2 (at least as good as before) |

### Phase 1 Validation
The mirror match is the primary validation. Current: +3 to +4 Δ. Target: |Δ| ≤ 1.

### Overall Validation
After all phases, re-run the full 2-axis grid test and compare with baseline results. The improved eval should:
1. Show no side bias in mirror matches
2. Show steeper iteration scaling (eval captures more → iterations matter less)
3. Show better absolute performance (d=4@300 should beat d=6@400 by a wider margin)
