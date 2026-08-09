# Complete MCTS System Asymmetry Audit

## Executive Summary

The codebase has **systemic AI-hardcoding** across all layers. There are 7 categories of asymmetry totaling ~30 distinct issues. The most critical:

1. **evaluateState()** — offensive evaluation only exists for AI carrier; PLAYER gets a different (defensive) branch
2. **runSeededMCTS()** — no `actingSide` parameter; generates moves for AI pieces only
3. **RUN_AI_TURN_FOR_PLAYER** — action type and handler don't exist; AI vs AI testing is impossible
4. **Game flow** — energy regen and card draw happen in different handlers for each side; an AI vs AI flow would skip one side's regen/cards

---

## Layer 1: Evaluation Function (evaluate.ts) — CRITICAL

### E1: No `actingSide` parameter
`evaluateState(state)` always returns from AI perspective. No way to get PLAYER-perspective evaluation.

### E2: Asymmetric carrier evaluation
- **AI has ball** (lines 34-97): Computes ball-progress, clean lane, carrier safety, formation bonuses, carrier position bonus, stagnation penalty, blocker danger — **8 distinct terms**
- **PLAYER has ball** (lines 99-132): Computes ball-progress (negated), clean lane threat (different formula: `goal * 0.95` vs `cleanScoringLane * 2.0`), carrier safety (negated), defensive obstruction — **4 different terms**

The offensive and defensive branches compute completely different things. When the eval is negated for PLAYER, the AI offensive terms don't match the PLAYER defensive terms.

### E3: Formation bonuses hardcoded to AI attack direction
```typescript
// Lines 65-73: Only AI pieces get formation bonuses
if (r === 2 || r === 3) score += 35.0;  // AI sweet spot
else if (r === 4 || r === 1) score += 25.0;
else if (r === 0) score += 20.0;
```
PLAYER pieces in equivalent positions (rows 7-8 for attacking toward row 10) get **zero** formation bonus.

### E4: Stagnation check is AI-only
```typescript
// Lines 178-192: Only checks AI pieces against aiPiecesStart
const initialPositions = BOARD_CONFIG.aiPiecesStart;
```
PLAYER can sit in initial positions forever with no penalty.

### E5: Blocker danger hardcoded to AI blocker ID
```typescript
// Line 95: Checks aiCarrier.id === 'ai_blocker'
if (aiCarrier.isBlocker || aiCarrier.id === 'ai_blocker' || ...)
```
The string `'ai_blocker'` is meaningless for PLAYER. Should use `p.isBlocker` only.

### E6: Spacing only computed for AI
```typescript
// Lines 157-166: Only aiSpacing computed, added as positive
totalScore += (aiSpacing / 3.0) * weights.spacing;
```
PLAYER spacing is not computed or subtracted. This gives AI a bonus for spreading out while PLAYER gets nothing.

---

## Layer 2: MCTS Core (mcts.ts) — CRITICAL

### M1: No `actingSide` parameter
```typescript
export function runSeededMCTS(state: GameState, rng: SeededRNG): AIPlannedTurnResult
```
Always operates on AI pieces.

### M2: `applyActionToSimState` hardcodes AI
```typescript
const carrier = simState.pieces.find(p => p.side === 'AI' && p.hasBall);
simState.score.AI += 1;  // Only scores for AI
simState.matchResult.winner = 'AI';
```

### M3: `generateJointCandidateActions` filters AI only
```typescript
const aiPieces = state.pieces.filter(p => p.side === 'AI');
```
Only generates moves for AI pieces.

### M4: Attacking pocket hardcoded to AI rows
```typescript
if (r === 2 || r === 3) return 50.0 - dist * 1.5;  // AI sweet spot
```

### M5: Holding foul turnover hardcoded
```typescript
const playerReceiver = simState.pieces.find(p => p.side === 'PLAYER' && !p.isCaptain);
```
When AI holds ball, turnover goes to a player. For PLAYER holding ball, should go to AI.

---

## Layer 3: Card Search (cardSearch.ts) — HIGH

### C1: Reads AI hand/momentum only
```typescript
const aiHand = state.hands.AI;
const aiMomentum = state.momentum.AI;
```

### C2: Card targeting hardcoded to AI perspective
- Drain targets `playerCarrier` (enemy carrier)
- Second Wind targets AI pieces (own pieces)
- All targeting assumes AI is the acting side

---

## Layer 4: Posture (posture.ts) — MEDIUM

### P1: Checks AI ball possession
```typescript
const aiHasBall = aiPieces.some(p => p.hasBall);
```

---

## Layer 5: Rollout (rollout.ts) — HIGH

### R1: AI attack phase hardcoded
AI teammates always move toward rows 2-3. AI carrier always throws to AI captain.

### R2: Defense phase hardcoded
AI defenders always block player passing ray.

### R3: Final evaluation always AI perspective
```typescript
return evaluateState(simState);  // No actingSide
```

### R4: Stagnation check AI-only
Only checks AI pieces against aiPiecesStart.

---

## Layer 6: Reducer Game Flow (reducer.ts) — CRITICAL

### G1-G2: RUN_AI_TURN_FOR_PLAYER doesn't exist
Neither the action type nor the handler exist. AI vs AI is impossible.

### G3-G4: Regen happens in different handlers
- **AI regen**: END_PLAYER_TURN (line 1520) — energy + rest streak + card draw + momentum
- **Player regen**: START_PLAYER_TURN (line 2155) — energy + rest streak + card draw + momentum

An AI vs AI flow must trigger BOTH regen phases per turn.

### G5-G7: Turn advancement and card management
- Turn counter increments only in START_PLAYER_TURN
- AI hand limit enforced in END_PLAYER_TURN
- Player hand limit... not enforced anywhere for automatic play

### G8: Restart phase not handled for AI vs AI
`isRestartPhase` is set after goals but the mandatory court pass rule is only enforced in STAGE_THROW/THROW_BALL (human actions), not in the AI execution path.

---

## Layer 7: Types (types.ts) — CRITICAL

### T1: RUN_AI_TURN_FOR_PLAYER missing from GameAction union

---

## Required Fix Summary

| Priority | Files | What |
|----------|-------|------|
| P0 | types.ts | Add `RUN_AI_TURN_FOR_PLAYER` action |
| P0 | evaluate.ts | Rewrite with `actingSide` parameter, symmetric `evaluateCarrier()` |
| P0 | mcts.ts | Add `actingSide` to all functions, side-aware piece filtering |
| P0 | reducer.ts | Add `RUN_AI_TURN_FOR_PLAYER` handler with full regen/cards/turn parity |
| P1 | cardSearch.ts | Add `actingSide` to card evaluation |
| P1 | posture.ts | Add `actingSide` to posture selection |
| P1 | rollout.ts | Add `actingSide`, symmetric simulation, pass to evaluateState |
