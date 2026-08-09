# Defensive Proximity Bonus - Reassessment

## Surprise Finding: Defensive Bonus WAS Helping!

After removing the defensive proximity bonus, the balance got **WORSE**, not better:

| Configuration | Direct Throw Dominance | Status |
|---------------|------------------------|--------|
| Baseline (no changes) | 26,345x | ❌ Too dominant |
| With defensive bonus (V1+V7) | Not in top 5 | ✅ Balanced |
| Without defensive bonus (V1 only) | 27,551x | ❌ Even more dominant |

## What This Means

### The Defensive Proximity Bonus WAS Having Impact

Our earlier threshold analysis tested **blocker multiplier values** (0.0 to 1.0) while keeping the defensive proximity bonus **enabled**. This showed the blocker multiplier didn't matter.

But now we've **removed the defensive proximity bonus entirely**, and the balance collapsed. This means:

1. **The defensive proximity bonus was providing meaningful balance**
2. **It was making direct throws less viable**
3. **Without it, direct throws become dominant again**

### Why the Overlap is Actually Good

Your insight about overlap was correct, but the overlap is **beneficial**, not problematic:

**Base AoC System:**
- Measures control over specific cells
- Binary: either you control the cell or you don't
- Falls off quickly (0 beyond 1 cell)

**Defensive Proximity Bonus:**
- Measures closeness to throw path
- Gradual: rewards being near even if not controlling
- Extends to 2.0 cells

**The "Overlap":**
- When throw passes through controlled cell: defender gets BOTH bonuses
- This is actually **intentional stacking** for strong defense
- Rewards defenders who position well

### Why This Works

**Scenario:** Defender at (5,2), throw through (5,1)

**Base AoC:**
- Defender controls (5,1) with 0.5 (orthogonal)
- Provides base interception: ~39%

**Defensive Proximity Bonus:**
- Defender is 1.0 cell from path
- Adds +10% bonus
- Total interception: ~49%

**Result:** Defender is rewarded for:
1. Controlling the cell (base AoC)
2. Being near the path (defensive bonus)
3. **Both contributions are meaningful**

### Why Direct Throws Become Dominant Without It

**Without defensive proximity bonus:**
- Only base AoC matters
- Defenders must be ON the path to matter
- Easier to find undefended paths
- Direct throws become viable again

**With defensive proximity bonus:**
- Defenders near the path also matter
- Harder to find undefended paths
- Zone defense is effective
- Direct throws remain unviable

## Reassessment: Keep the Defensive Proximity Bonus

### Why Keep It?

1. **It Provides Meaningful Balance**
   - Makes direct throws less viable
   - Rewards defensive positioning
   - Creates strategic depth

2. **The "Overlap" is Intentional**
   - Base AoC: "Do you control this cell?"
   - Defensive bonus: "Are you near the path?"
   - Both questions matter for defense

3. **Simpler Than Alternatives**
   - Removing it breaks balance
   - Keeping it works well
   - No need for complex alternatives

4. **Blocker Balance is Already Good**
   - Blockers get 50% reduction
   - Prevents overpowered stacking
   - Maintains strategic depth

### Updated Recommendation

**Keep the defensive proximity bonus WITH blocker reduction:**

```typescript
// Base AoC: Full strength for all pieces
// Defensive Proximity Bonus: 
//   - Normal defenders: +10% per cell (full)
//   - Blockers: +5% per cell (50% reduction)
```

**This provides:**
✅ Meaningful balance (direct throws not viable)  
✅ Strategic depth (positioning matters)  
✅ Blocker balance (not overpowered)  
✅ Clear systems (base AoC + defensive bonus)  

## Revised Understanding

### The Two Systems Serve Different Purposes

**Base AoC:**
- **Question:** "Does this piece control this specific cell?"
- **Purpose:** Fundamental territory control
- **Range:** 0-1 cells
- **Values:** 1.0, 0.5, 0.25, 0.0

**Defensive Proximity Bonus:**
- **Question:** "Is this piece near the throw path?"
- **Purpose:** Reward defensive positioning
- **Range:** 0-2 cells
- **Values:** +20% to +0%

### The "Overlap" is Actually Stacking

When a defender both controls a cell AND is near the path:
- They get base AoC (for controlling the cell)
- They get defensive bonus (for being near the path)
- **Both rewards are earned and meaningful**

This is like a basketball defender who:
- Is in the right position (base AoC)
- AND is close to the passing lane (defensive bonus)
- Deserves both rewards for good defense

## Final Recommendation

### ✅ Keep Current Configuration

**Systems:**
1. Base AoC (same for all pieces)
2. Defensive Proximity Bonus (blockers get 50% reduction)
3. Exponential Throw Cost
4. Distance-Based Interception

**Why:**
- Provides excellent balance
- Direct throws not viable (good!)
- Multiple viable strategies
- Strategic depth preserved
- Blockers balanced (not overpowered)

### ❌ Do NOT Remove Defensive Proximity Bonus

**Why:**
- Removing it breaks balance
- Direct throws become dominant again
- Loses strategic depth
- Makes defense less meaningful

### ✅ Accept the "Overlap" as a Feature

**Why:**
- It's intentional stacking for good defense
- Both systems measure different things
- Both rewards are meaningful
- Creates interesting decisions

## Conclusion

Your insight about overlap was correct, but the overlap is **beneficial**, not problematic. The defensive proximity bonus provides meaningful balance that the base AoC system alone cannot achieve.

**Final Answer:** Keep the defensive proximity bonus with blocker reduction. The "overlap" is actually well-designed stacking that rewards good defensive positioning.

---

**Document Version:** 2.0 (Revised)  
**Last Updated:** 2026-01-23  
**Status:** ✅ Reassessment Complete, Keep Current Configuration
