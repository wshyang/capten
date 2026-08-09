# Blocker AoC System - Complete Explanation

## Overview

There are **TWO separate systems** that affect interception:

1. **Base Area of Control (AoC)** - Same for ALL pieces including blockers
2. **Defensive Proximity Bonus** - NEW system, blockers get 50% reduction

The blocker reduction **ONLY affects the defensive proximity bonus**, NOT the base AoC system.

---

## System 1: Base Area of Control (AoC)

### How It Works (Same for All Pieces)

Every piece projects control onto adjacent cells:

```
Control Factors:
- Same cell: 1.0 (100%)
- Orthogonal (up/down/left/right): 0.5 (50%)
- Diagonal: 0.25 (25%)
- Beyond 1 cell: 0.0 (0%)
```

### Visual Example

```
. . . . .
. 0.25 0.5 0.25 .
. 0.5 [P] 0.5 .
. 0.25 0.5 0.25 .
. . . . .
```

Where [P] is the piece position.

### Base Interception Calculation

```
base_interception = (f_effective × E_def) / (f_effective × E_def + E_att)

Where:
- f_effective = control_factor × (1 - clear_relief)
- E_def = defender energy
- E_att = attacker energy after throw
```

### Blocker's Base AoC

**Blockers use the EXACT SAME base AoC system as other pieces:**
- Same control factors (1.0, 0.5, 0.25)
- Same calculation formula
- Same clear relief mechanics
- **NO REDUCTION** on base AoC

**Example:** Blocker at (5,1) defending throw through (5,1)
- Control factor: 1.0 (same cell)
- f_effective: 1.0 × (1 - clear_relief)
- Base interception: calculated normally
- **This is NOT reduced**

---

## System 2: Defensive Proximity Bonus (NEW)

### How It Works

**Additional bonus** for defenders positioned near the throw path:

```
For each defender within 2.0 cells of throw path:
  proximity_bonus = (2.0 - distance) × 0.10 (10% per cell)

Total defensive bonus = sum of all proximity bonuses (max 50%)
```

### Visual Example

```
Throw path: ----->
                
Defender positions:
  [D1] at 0.5 cells from path: +15% bonus
       [D2] at 1.0 cells from path: +10% bonus
            [D3] at 1.5 cells from path: +5% bonus
                
Total bonus: +30%
```

### Why This System Exists

**Purpose:** Reward strategic defensive positioning

**Before:** Only base AoC mattered
- Defenders had to be ON the throw path
- No reward for nearby positioning
- Limited strategic depth

**After:** Proximity bonus rewards nearby defenders
- Defenders can be near (not on) the path
- Rewards zone defense
- More strategic depth

---

## Blocker Reduction: What It Actually Means

### The Reduction

**Blockers get 50% of the normal defensive proximity bonus:**

```typescript
if (nearestEnemy.isBlocker) {
  bonus *= 0.5; // 50% reduction
}
```

### What's Reduced

| Component | Normal Pieces | Blockers |
|-----------|---------------|----------|
| **Base AoC** | Full (1.0, 0.5, 0.25) | **Full (1.0, 0.5, 0.25)** ✓ |
| **Base Interception** | Full calculation | **Full calculation** ✓ |
| **Defensive Proximity Bonus** | Full (+10% per cell) | **50% (+5% per cell)** ⚠️ |

### What's NOT Reduced

✅ **Base AoC control factors** (1.0, 0.5, 0.25)  
✅ **Base interception probability** calculation  
✅ **Clear relief** mechanics  
✅ **Energy-based interception** formula  

### What IS Reduced

⚠️ **ONLY the defensive proximity bonus** (50% reduction)

---

## Concrete Examples

### Example 1: Blocker ON Throw Path

**Scenario:** Blocker at (5,1), throw passes through (5,1)

**Base AoC (NOT reduced):**
- Control factor: 1.0 (same cell)
- f_effective: 1.0 × (1 - 0.5) = 0.5 (with HIGH_LOB clear relief)
- Base interception: (0.5 × 8.0) / (0.5 × 8.0 + 3.1) = 56%

**Defensive Proximity Bonus (REDUCED):**
- Distance from path: 0.0 cells (on path)
- Normal bonus: (2.0 - 0.0) × 0.10 = +20%
- Blocker bonus: +20% × 0.5 = **+10%** (reduced)

**Total Interception:**
- Base: 56%
- Defensive bonus: +10% (reduced from +20%)
- **Total: 66%**

### Example 2: Blocker NEAR Throw Path

**Scenario:** Blocker at (5,2), throw passes through (5,1)

**Base AoC (NOT reduced):**
- Control factor: 0.5 (orthogonal)
- f_effective: 0.5 × (1 - 0.5) = 0.25 (with HIGH_LOB)
- Base interception: (0.25 × 8.0) / (0.25 × 8.0 + 3.1) = 39%

**Defensive Proximity Bonus (REDUCED):**
- Distance from path: 1.0 cell
- Normal bonus: (2.0 - 1.0) × 0.10 = +10%
- Blocker bonus: +10% × 0.5 = **+5%** (reduced)

**Total Interception:**
- Base: 39%
- Defensive bonus: +5% (reduced from +10%)
- **Total: 44%**

### Example 3: Normal Defender vs Blocker

**Scenario:** Both at 1.0 cell from throw path

**Normal Defender:**
- Base AoC: 0.5 control factor
- Base interception: 39%
- Defensive bonus: +10% (full)
- **Total: 49%**

**Blocker:**
- Base AoC: 0.5 control factor (SAME)
- Base interception: 39% (SAME)
- Defensive bonus: +5% (reduced)
- **Total: 44%**

**Difference:** Only 5% (from defensive bonus reduction)

---

## Why This Design?

### Problem: Blocker Permanent Positioning

**Issue:** Blockers are always near the enemy captain
- Always within 1-2 cells of captain throws
- Would get defensive bonus on EVERY throw
- Could stack with other defenders
- Potentially overpowered

### Solution: Reduce Defensive Bonus Only

**Why not reduce base AoC?**
- Base AoC is fundamental to piece identity
- Would make blockers feel weak overall
- Reduces strategic depth
- Punishes blockers for their role

**Why reduce defensive bonus?**
- Defensive bonus is NEW (added for balance)
- Specifically rewards positioning
- Blockers already have positional advantage
- Reduction prevents overpowered stacking
- Maintains blocker's core defensive role

### Balance Achieved

✅ **Blockers still strong** (full base AoC)  
✅ **Blockers not overpowered** (reduced defensive bonus)  
✅ **Strategic depth preserved** (positioning still matters)  
✅ **Multiple viable strategies** (no single dominant play)  

---

## Comparison Table

| Aspect | Normal Pieces | Blockers | Impact |
|--------|---------------|----------|--------|
| **Base AoC Control** | 1.0 / 0.5 / 0.25 | 1.0 / 0.5 / 0.25 | ✓ Same |
| **Base Interception** | Full calculation | Full calculation | ✓ Same |
| **Clear Relief** | Full mechanics | Full mechanics | ✓ Same |
| **Energy Formula** | Full formula | Full formula | ✓ Same |
| **Defensive Bonus** | +10% per cell | +5% per cell | ⚠️ 50% reduction |
| **Max Defensive Bonus** | +50% | +25% | ⚠️ Lower cap |

---

## Strategic Implications

### For Blocker Positioning

**Optimal:** Position blocker ON throw path
- Gets full base AoC (1.0 control factor)
- Gets reduced defensive bonus (+10% instead of +20%)
- Still strong defense

**Good:** Position blocker NEAR throw path
- Gets partial base AoC (0.5 or 0.25)
- Gets reduced defensive bonus (+5% or +2.5%)
- Moderate defense

**Strategy:** Blocker positioning still matters, just less impactful than before

### For Attacker Strategy

**Against Blocker:**
- Blocker still provides strong base defense
- But defensive bonus is reduced
- Can exploit by using multiple short passes
- Team coordination beats blocker defense

**Strategy:** Use short passes and positioning to work around blocker

### For Defender Strategy

**Using Blocker:**
- Position blocker on likely throw paths
- Combine with other defenders for stacking
- Blocker provides base, others provide bonus
- Zone defense is effective

**Strategy:** Use blocker as anchor, supplement with other defenders

---

## Code Implementation

### Base AoC (No Change)

```typescript
// In control.ts - same for all pieces
function computeControlMap(pieces: Piece[]) {
  for (const piece of pieces) {
    // Self cell
    controlMap[piece.cell.row][piece.cell.col] += 1.0;
    
    // Orthogonal cells
    for (const [dr, dc] of [[0,1], [0,-1], [1,0], [-1,0]]) {
      controlMap[piece.cell.row + dr][piece.cell.col + dc] += 0.5;
    }
    
    // Diagonal cells
    for (const [dr, dc] of [[1,1], [1,-1], [-1,1], [-1,-1]]) {
      controlMap[piece.cell.row + dr][piece.cell.col + dc] += 0.25;
    }
  }
}
```

**Note:** No special case for blockers - they use the same system

### Defensive Proximity Bonus (With Blocker Reduction)

```typescript
// In interception.ts
if (balanceConfig?.useDefensiveInterceptionBonus && nearestEnemy) {
  const distance = Math.hypot(
    nearestEnemy.cell.col - cell.col,
    nearestEnemy.cell.row - cell.row
  );
  const threshold = balanceConfig.defensiveProximityThreshold || 2.0;
  
  if (distance < threshold) {
    let bonus = (threshold - distance) * (balanceConfig.defensiveBonusPerCell || 0.10);
    
    // Blockers get 50% of normal defensive bonus
    if (nearestEnemy.isBlocker) {
      bonus *= 0.5;
    }
    
    pCell = Math.min(1.0, pCell + bonus);
  }
}
```

**Note:** ONLY the defensive bonus is reduced for blockers

---

## Common Misconceptions

### ❌ Misconception 1: "Blockers have weaker AoC"

**Reality:** Blockers have the SAME base AoC as other pieces
- Same control factors (1.0, 0.5, 0.25)
- Same calculation formula
- Only defensive proximity bonus is reduced

### ❌ Misconception 2: "Blockers are bad at defense"

**Reality:** Blockers are still strong defenders
- Full base AoC provides strong defense
- Reduced defensive bonus prevents overpowered stacking
- Blockers remain valuable for captain defense

### ❌ Misconception 3: "Blocker reduction makes them useless"

**Reality:** Blockers are balanced, not useless
- Still provide meaningful defense
- Positioning still matters
- Just not overpowered

### ❌ Misconception 4: "All blocker abilities are reduced"

**Reality:** ONLY defensive proximity bonus is reduced
- Base AoC: Full strength
- Base interception: Full calculation
- Clear relief: Full mechanics
- Energy formula: Full formula
- Defensive bonus: 50% reduction

---

## Summary

### What the Blocker Reduction IS

✅ **50% reduction in defensive proximity bonus only**  
✅ Prevents blockers from being overpowered  
✅ Maintains blocker's core defensive role  
✅ Preserves strategic depth  

### What the Blocker Reduction IS NOT

❌ **NOT a reduction in base AoC**  
❌ **NOT a reduction in base interception**  
❌ **NOT a nerf to blocker's core abilities**  
❌ **NOT making blockers weak or useless**  

### The Two Systems

**System 1: Base AoC (Same for All)**
- Control factors: 1.0, 0.5, 0.25
- Used for base interception calculation
- **NO reduction for blockers**

**System 2: Defensive Proximity Bonus (NEW)**
- Bonus for defenders near throw path
- +10% per cell within 2.0 cells
- **50% reduction for blockers**

### Balance Achieved

✅ Blockers are strong but not overpowered  
✅ Multiple viable strategies exist  
✅ Positioning matters for all pieces  
✅ Game balance is excellent  

---

**Document Version:** 1.0  
**Last Updated:** 2026-01-23  
**Status:** ✅ Complete and Accurate
