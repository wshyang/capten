# Interception Logic: Complete Guide

## Overview

The interception system in Captain's Combine determines whether a throw is caught by the intended receiver or intercepted by a defender. This guide explains the complete interception logic, including the new balance improvements.

---

## Core Interception Formula

### Basic Interception Probability

When a throw crosses an enemy Area-of-Control (AoC) cell, an interception check occurs:

```
p_intercept = (f_effective × E_def) / (f_effective × E_def + E_att)
```

Where:
- **f_effective**: Effective control factor (0.0 to 1.0)
- **E_def**: Defender's energy (0.0 to 10.0)
- **E_att**: Attacker's (thrower's) energy after throw cost (0.0 to 10.0)

### Effective Control Factor

The effective control factor accounts for throw height and defender height:

```
f_effective = f_raw × (1 - clear_relief)
```

Where:
- **f_raw**: Raw area-of-control factor (0.0 to 1.0)
- **clear_relief**: Height advantage relief (0.0 to 0.5)

#### Clear Relief Calculation

```
clear_relief = min(0.5, max(0.0, (throw_loft - defender_height) × 0.25))
```

**Throw Loft Values:**
- FLAT: 0 (ground-level throw)
- LOB: 1 (medium arc)
- HIGH_LOB: 2 (high arc, used for Captain passes)

**Defender Heights:**
- Ground players: 0
- Blockers: 1
- Captains: 2 (on stool)

**Example:**
- HIGH_LOB (loft=2) over ground defender (height=0)
- clear_relief = min(0.5, (2-0) × 0.25) = min(0.5, 0.5) = 0.5
- f_effective = f_raw × (1 - 0.5) = f_raw × 0.5

This means high lobs reduce ground defender effectiveness by 50%!

---

## Area-of-Control (AoC) System

### Control Factor by Distance

Each piece projects control onto nearby cells:

| Distance | Control Factor | Description |
|----------|----------------|-------------|
| 0 cells (same cell) | 1.0 | Direct control |
| 1 cell orthogonal | 0.5 | Adjacent horizontally/vertically |
| 1 cell diagonal | 0.25 | Adjacent diagonally |
| 2+ cells | 0.0 | No control |

**Example:**
```
. . . . .
. 0.25 0.5 0.25 .
. 0.5 [P] 0.5 .
. 0.25 0.5 0.25 .
. . . . .
```

Where [P] is the piece position.

### Stacking Control

Multiple pieces can stack their control on the same cell:

```
f_raw = sum of all control factors from pieces of the same side
```

**Example:** Two defenders adjacent to a cell:
- Defender 1: 0.5 control
- Defender 2: 0.25 control
- Total: 0.75 control factor

---

## New Balance Features (v2.0)

### 1. Exponential Throw Cost

**Old Formula (Linear):**
```
E_throw = distance / 3.0
```

**New Formula (Exponential):**
```
E_throw = (distance^1.5) / 3.0
```

**Impact:**
| Distance | Old Cost | New Cost | Increase |
|----------|----------|----------|----------|
| 2 cells | 0.67e | 0.94e | +40% |
| 4 cells | 1.33e | 2.67e | +100% |
| 6 cells | 2.00e | 4.90e | +145% |
| 8 cells | 2.67e | 7.54e | +182% |
| 10 cells | 3.33e | 10.54e | +216% |

**Strategic Impact:**
- Short passes (2-4 cells) remain affordable
- Long passes (6+ cells) become expensive
- Encourages tactical positioning over "Hail Mary" throws

### 2. Distance-Based Interception Bonus

**New Formula:**
```
distance_bonus = distance × 0.02 (2% per cell)
```

**Impact:**
| Distance | Distance Bonus |
|----------|----------------|
| 2 cells | +4% |
| 4 cells | +8% |
| 6 cells | +12% |
| 8 cells | +16% |
| 10 cells | +20% |

**Strategic Impact:**
- Longer throws face higher base interception risk
- Represents difficulty of accurate long-distance throws
- Rewards shorter, safer passing chains

### 3. Defensive Proximity Bonus

**New Formula:**
```
For each defender within 2.0 cells of throw path:
  proximity_bonus = (2.0 - distance) × 0.10 (10% per cell)

Special Case - Blockers:
  If defender is a blocker:
    proximity_bonus *= 0.5 (50% reduction)

Total defensive bonus = sum of all proximity bonuses (max 50%)
```

**Why Blocker Reduction?**
Blockers are permanently positioned near the enemy captain to defend against scoring throws. Without reduction, they would get defensive bonus on EVERY captain throw, making them overpowered and throws to captain nearly impossible.

**Impact:**
| Defender Distance | Normal Bonus | Blocker Bonus |
|-------------------|--------------|---------------|
| 2.0 cells | 0% | 0% |
| 1.5 cells | 5% | 2.5% |
| 1.0 cells | 10% | 5% |
| 0.5 cells | 15% | 7.5% |
| 0.0 cells (on path) | 20% | 10% |

**Multiple Defenders Stack:**
- 2 normal defenders at 1.0 cells: 20% bonus
- 1 blocker at 1.0 cells: 5% bonus (reduced)
- 1 blocker + 1 defender at 1.0 cells: 15% bonus
- Maximum: 50% bonus

**Strategic Impact:**
- Rewards defensive positioning near throw paths
- Makes "zone defense" viable
- Encourages contesting throwing lanes

---

## Complete Interception Calculation

### Step-by-Step Process

1. **Calculate Throw Cost**
   ```
   E_throw = (distance^1.5) / 3.0
   E_att = E_carrier - E_throw (attacker's energy after throw)
   ```

2. **For Each Cell on Throw Path:**
   
   a. **Check if cell has enemy control**
   ```
   f_raw = sum of enemy control factors on this cell
   If f_raw == 0: no interception check needed
   ```
   
   b. **Calculate effective control**
   ```
   clear_relief = min(0.5, max(0.0, (throw_loft - defender_height) × 0.25))
   f_effective = f_raw × (1 - clear_relief)
   ```
   
   c. **Calculate base interception probability**
   ```
   p_base = (f_effective × E_def) / (f_effective × E_def + E_att)
   ```
   
   d. **Add distance bonus**
   ```
   p_distance = p_base + (distance × 0.02)
   ```
   
   e. **Add defensive proximity bonus**
   ```
   For each enemy piece within 2.0 cells:
     proximity_bonus = (2.0 - piece_distance) × 0.10
   p_defensive = p_distance + sum(proximity_bonuses)
   ```
   
   f. **Cap at 95%**
   ```
   p_intercept = min(0.95, p_defensive)
   ```
   
   g. **Roll for interception**
   ```
   roll = random(0.0, 1.0)
   If roll < p_intercept: INTERCEPTED!
   ```

3. **If Intercepted:**
   - Ball is caught by the defender with highest control on that cell
   - Defender lunges to interception cell (pays movement cost)
   - Possession changes to defending team

---

## Special Cases

### Clean Pass Refund

If a throw path crosses **zero** enemy AoC cells:
- Throw is automatically successful (no interception checks)
- **100% of throw energy is refunded** (E_throw = 0.0e)

**Strategic Impact:**
- Rewards finding open passing lanes
- Encourages court spacing
- Makes patient play viable

### Restart Pass Protection

The first pass after a goal (baseline restart) is **protected**:
- No interception checks on the restart pass
- Must pass to a court player (not directly to Captain)
- After the protected pass, normal interception rules apply

### Threaded Pass Card

When "Threaded Pass" card is active:
- First enemy AoC cell on throw path is ignored
- Reduces interception risk for throws through light defense

### No-Look Pass Card

When "No-Look Pass" card is active:
- Throw is automatically successful if distance ≤ 4.5 cells
- No interception checks
- Represents quick, deceptive passes

---

## Interception Examples

### Example 1: Short Safe Pass

**Scenario:**
- Thrower at (3,5) with 8.0e energy
- Receiver at (4,5) - 1 cell distance
- No defenders nearby

**Calculation:**
```
E_throw = (1^1.5) / 3.0 = 0.33e
E_att = 8.0 - 0.33 = 7.67e
Distance bonus = 1 × 0.02 = 2%
Defensive bonus = 0% (no defenders)
p_intercept = 0% (no enemy control)
```

**Result:** Clean pass, 100% energy refund (E_throw = 0.0e)

---

### Example 2: Medium Risk Pass

**Scenario:**
- Thrower at (3,5) with 6.0e energy
- Receiver at (6,5) - 3 cells distance
- 1 defender at (5,5) with 8.0e energy (on throw path)
- Throw type: FLAT (loft=0)

**Calculation:**
```
E_throw = (3^1.5) / 3.0 = 1.73e
E_att = 6.0 - 1.73 = 4.27e

Defender control: f_raw = 1.0 (direct control)
clear_relief = min(0.5, (0-0) × 0.25) = 0.0
f_effective = 1.0 × (1 - 0.0) = 1.0

p_base = (1.0 × 8.0) / (1.0 × 8.0 + 4.27) = 8.0 / 12.27 = 65.2%
Distance bonus = 3 × 0.02 = 6%
Defensive bonus = (2.0 - 0.0) × 0.10 = 20% (defender on path)

p_intercept = min(0.95, 0.652 + 0.06 + 0.20) = min(0.95, 0.912) = 91.2%
```

**Result:** Very high interception risk (91.2%)!

---

### Example 3: Long Lob Over Defense

**Scenario:**
- Thrower at (3,5) with 8.0e energy
- Receiver at (9,5) - 6 cells distance
- 2 defenders at (5,5) and (7,5) with 7.0e energy each
- Throw type: HIGH_LOB (loft=2)

**Calculation:**
```
E_throw = (6^1.5) / 3.0 = 4.90e
E_att = 8.0 - 4.90 = 3.10e

For cell (5,5):
  Defender at (5,5): f_raw = 1.0
  clear_relief = min(0.5, (2-0) × 0.25) = 0.5
  f_effective = 1.0 × (1 - 0.5) = 0.5
  p_base = (0.5 × 7.0) / (0.5 × 7.0 + 3.10) = 3.5 / 6.6 = 53.0%
  Distance bonus = 6 × 0.02 = 12%
  Defensive bonus = (2.0 - 0.0) × 0.10 = 20%
  p_intercept = min(0.95, 0.53 + 0.12 + 0.20) = 85%

For cell (7,5):
  Defender at (7,5): f_raw = 1.0
  clear_relief = 0.5 (same as above)
  f_effective = 0.5
  p_base = 53.0% (same as above)
  Distance bonus = 12% (same)
  Defensive bonus = 20% (same)
  p_intercept = 85%
```

**Result:** High risk at both cells (85% each). Overall success probability = (1-0.85)² = 2.25%

**Strategic Note:** HIGH_LOB reduces defender effectiveness by 50%, but the long distance and defensive proximity still create high risk!

---

## Strategic Guidelines

### For Attackers (Throwers)

1. **Maintain High Energy**
   - Rested throwers (8.0e+) face much lower interception risk
   - Use rest turns to recover before key throws

2. **Prefer Short Passes**
   - 2-4 cell passes are affordable and safer
   - Build attacks through positioning, not long throws

3. **Find Open Lanes**
   - Clean passes (no enemy AoC) get 100% energy refund
   - Use court spacing to create open passing lanes

4. **Use Height Advantage**
   - LOB and HIGH_LOB reduce ground defender effectiveness
   - Useful for throwing over defensive lines

5. **Avoid Throwing Through Clusters**
   - Multiple defenders stack their control
   - Defensive proximity bonuses make clustered defense very strong

### For Defenders

1. **Position Near Throw Paths**
   - Defensive proximity bonus rewards good positioning
   - Stay within 2.0 cells of likely passing lanes

2. **Maintain High Energy**
   - High-energy defenders have higher interception probability
   - Rest when not actively defending

3. **Use Zone Defense**
   - Multiple defenders covering the same area stack control
   - Create "no-fly zones" through coordinated positioning

4. **Contest Direct Lanes**
   - Position between thrower and likely receivers
   - Force attackers to take riskier throws

5. **Watch for Height Disadvantage**
   - Ground defenders are less effective against LOB/HIGH_LOB
   - Use blockers (height=1) to contest high throws

---

## Balance Philosophy

### Why These Changes?

**Problem:** Direct throw to captain was 26,000x better than alternatives
- Too easy to score from starting position
- No strategic depth
- No counterplay for defenders

**Solution:** Make long throws expensive and risky
- Exponential cost discourages "Hail Mary" throws
- Distance bonus increases base interception risk
- Defensive bonus rewards good positioning

**Result:** Multiple viable strategies
- Build attacks through positioning
- Use shorter, safer passes
- Defensive play is meaningful

### Risk/Reward Balance

| Throw Type | Energy Cost | Interception Risk | Strategic Use |
|------------|-------------|-------------------|---------------|
| Short (2-4 cells) | Low (0.9-2.7e) | Low (5-15%) | Safe ball movement |
| Medium (5-7 cells) | Medium (3.7-6.1e) | Medium (20-40%) | Tactical advancement |
| Long (8-10 cells) | High (7.5-10.5e) | High (50-80%) | Desperation plays |

### Counterplay Options

**For Defenders:**
1. Position near throw paths (defensive bonus)
2. Maintain high energy (higher interception probability)
3. Use zone defense (stacked control)
4. Contest direct lanes (force riskier throws)

**For Attackers:**
1. Use rest turns (higher thrower energy)
2. Find open lanes (clean pass refund)
3. Build through positioning (shorter passes)
4. Use height advantage (LOB/HIGH_LOB)

---

## Advanced Tactics

### The "Triangle Offense"

Position three players in a triangle formation:
```
    [R1]
   /    \
[T]------[R2]
```

- Thrower [T] has two short passing options
- If one receiver is covered, throw to the other
- Receivers can quickly advance the ball

### The "Zone Defense"

Position defenders to cover throwing lanes:
```
. . . . . . .
. [D1] [D2] .
. . . . . . .
. [D3] [D4] .
. . . . . . .
```

- Creates overlapping control zones
- High defensive proximity bonuses
- Forces attackers to take risky throws

### The "Give and Go"

1. Throw to nearby teammate (short, safe pass)
2. Immediately cut forward (1-step receiver rule)
3. Receive return pass in better position

**Benefits:**
- Advances ball safely
- Creates defensive confusion
- Exploits momentary gaps

### The "Pump Fake"

1. Stage throw to obvious receiver
2. Defender commits to interception position
3. Unstage and throw to different receiver

**Benefits:**
- Draws defenders out of position
- Creates open lanes
- Exploits defensive anticipation

---

## Common Mistakes to Avoid

### Attacker Mistakes

1. **Throwing with Low Energy**
   - Tired throwers (< 4.0e) face very high interception risk
   - Rest before key throws

2. **Ignoring Defensive Positioning**
   - Check defender positions before throwing
   - Avoid throwing through clusters

3. **Over-Reliance on Long Throws**
   - Long throws are expensive and risky
   - Build attacks through positioning

4. **Forgetting Clean Pass Refund**
   - Open lanes get 100% energy refund
   - Don't force throws through defense when open options exist

### Defender Mistakes

1. **Poor Positioning**
   - Stay near likely throw paths
   - Don't chase the ball carrier

2. **Wasting Energy**
   - Don't lunge for interceptions you can't make
   - Rest when not actively defending

3. **Ignoring Height Disadvantage**
   - Ground defenders struggle against LOB/HIGH_LOB
   - Use blockers to contest high throws

4. **Over-Committing**
   - Don't leave receivers unmarked to contest throws
   - Balance throw contesting and receiver coverage

---

## Summary

The interception system creates a rich tactical environment where:

✅ **Positioning matters** - Both attackers and defenders benefit from good positioning  
✅ **Energy management is critical** - Rested pieces perform better  
✅ **Multiple strategies are viable** - No single dominant play  
✅ **Counterplay exists** - Both sides have meaningful decisions  
✅ **Risk/reward is balanced** - Safe plays are affordable, risky plays are expensive  

The new balance improvements ensure that:
- Direct long throws are expensive and risky
- Defensive positioning is rewarded
- Team coordination matters
- The game has strategic depth

**Master the interception system, and master the game!** 🏀
