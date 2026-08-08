# 📜 The Captain's Combine — Tactical Cards & Card Economy Reference (v3.1)

**The Captain's Combine** features a **26-card Momentum economy** spanning six psychological and tactical aptitude dimensions:
- **`RESOURCE`** (Energy management, stamina, recovery)
- **`RISK`** (Passing accuracy, trajectory protection, interception evasion)
- **`COMPOSURE`** (Debuff negation, state recovery, timer management)
- **`TEAMWORK`** (Free movement, passing synergy, control stacking)
- **`SPATIAL`** (Area-of-Control manipulation, lane clogging, zone denial)
- **`LEADERSHIP`** (Team-wide tempo shifts, stamina boosts, momentum surges)

---

## ⚡ Card Economy & Rules Overview

1. **Momentum Doubloons ($M$)**:
   - Players earn $+1M$ per turn naturally (up to a hard cap of $10M$).
   - Clean assist to the Captain awards **$+2M$ bonus**.
   - Intercepting an opponent's throw awards **$+2M$ to $+4M$ bonus** (scaled by intercepting piece's rest streak).
2. **Hand Limit & Cycling**:
   - Hand limit is strictly **3 cards** (`handLimit: 3`).
   - Draw $+1$ card at the start of each turn.
   - If holding $>3$ cards, the player must deploy or **discard down to 3 cards** before the turn can be committed.
3. **Swing Cards (⚡)**:
   - High-impact tactical cards that require both **Momentum Doubloons ($3M$)** and an immediate **$3.0\text{e}$ Swing Energy deduction** from the highest-energy piece on the team.
   - Examples: `No-Look Pass`, `Full-Court Press`, `Surge`.
4. **Seamless In-UI Targeting**:
   - Zero modal popups, dropdown menus, or text input boxes.
   - Clicking **DEPLOY** on a targeted card arms in-UI targeting. The player clicks the target piece/cell directly on the 11×11 sand court or uses the quick-select chips on the card.

---

## 📊 Complete 26-Card Catalog by Dimension

| Dimension | Card Name | Momentum Cost | Swing Energy | Target Type | Core Ability |
| :--- | :--- | :---: | :---: | :--- | :--- |
| **`RESOURCE`** | **Deep Breath** | $1M$ | — | `FRIENDLY_PIECE` | $+2$ rest streak instantly, accelerating compounding energy regen. |
| **`RESOURCE`** | **Second Wind** | $2M$ | — | `FRIENDLY_PIECE` | $+4.0\text{e}$ energy restored instantly to a chosen piece (capped at $10.0\text{e}$). |
| **`RESOURCE`** | **Slow Burn** | $2M$ | — | `FRIENDLY_PIECE` | $-0.5\text{e}$ move cost per cell on chosen piece for the next 3 turns. |
| **`RESOURCE`** | **Drain** | $2M$ | — | `ENEMY_PIECE` | $-2.0\text{e}$ energy drained from targeted enemy defender. |
| **`RESOURCE`** | **Overclock** | $3M$ | — | `FRIENDLY_PIECE` | $2\times$ move range this turn ($50\%$ energy discount); $0\text{e}$ regen next turn. |
| **`RISK`** | **Insurance** | $1M$ | — | `NONE` | If next throw is intercepted, ball is safely retained at origin cell. |
| **`RISK`** | **Threaded Pass** | $2M$ | — | `NONE` | Next throw ignores the first enemy Area-of-Control cell it crosses. |
| **`RISK`** | **Steady Hands** | $2M$ | — | `NONE` | $+50\%$ effective throw energy ($E_{\text{att}}$) on interception checks for next throw. |
| **`RISK`** | **Long Bomb** | $2M$ | — | `NONE` | $2\times$ throw range at half throw energy cost this turn. |
| **`RISK`** | **No-Look Pass** | $3M$ | $3.0\text{e}$ | `NONE` | ⚡ **Swing Card**: Short throw ($\le 4.5$ cells) that is **100% uninterceptable**. |
| **`COMPOSURE`**| **Reset** | $1M$ | — | `FRIENDLY_PIECE` | Abort & re-plan piece's action with full energy ($10.0\text{e}$) restored. |
| **`COMPOSURE`**| **Ice in the Veins** | $2M$ | — | `NONE` | Negate the next debuff or disruptive card played against your team. |
| **`COMPOSURE`**| **Anchor** | $2M$ | — | `FRIENDLY_PIECE` | Targeted piece is immune to forced movement, drain, and bait this turn. |
| **`COMPOSURE`**| **Timeout** | $3M$ | — | `NONE` | $+15\text{s}$ planning timer refund and $+1.5\text{e}$ energy across all team pieces. |
| **`TEAMWORK`** | **Give-and-Go** | $1M$ | — | `FRIENDLY_PIECE` | After passing the ball, the passer may immediately move 1 cell for free. |
| **`TEAMWORK`** | **Spacing** | $2M$ | — | `TWO_FRIENDLY` | Nudge two chosen teammates 1 cell each toward open space for free. |
| **`TEAMWORK`** | **Screen** | $2M$ | — | `FRIENDLY_PIECE` | Targeted teammate projects $+0.5$ additional control factor on all aura cells. |
| **`TEAMWORK`** | **Overlap** | $3M$ | — | `TWO_FRIENDLY` | Two adjacent teammates merge and double their stacked control fields this turn. |
| **`SPATIAL`**  | **Bait** | $1M$ | — | `ENEMY_PIECE` | Force an enemy defender 1 cell toward a designated empty cell. |
| **`SPATIAL`**  | **Jam the Lane** | $2M$ | — | `CELL` | Project a temporary $1.0$ control zone on any empty cell for 1 turn. |
| **`SPATIAL`**  | **Clamp** | $2M$ | — | `ENEMY_PIECE` | Halve a targeted enemy piece's Area-of-Control factors for 1 turn. |
| **`SPATIAL`**  | **Full-Court Press**| $3M$ | $3.0\text{e}$ | `NONE` | ⚡ **Swing Card**: All pieces' control fields expand $+1$ cell radius this turn. |
| **`LEADERSHIP`**| **Tempo Change** | $1M$ | — | `NONE` | $+1.5\text{e}$ energy to every teammate that remained stationary last turn. |
| **`LEADERSHIP`**| **Set the Play** | $2M$ | — | `NONE` | $-0.8\text{e}$ movement cost discount across all court players this turn. |
| **`LEADERSHIP`**| **Rally** | $2M$ | — | `NONE` | Whole team gains $+25\%$ effective energy multiplier on interception checks. |
| **`LEADERSHIP`**| **Surge** | $3M$ | $3.0\text{e}$ | `NONE` | ⚡ **Swing Card**: Whole team gains $+2.0\text{e}$ energy boost and tempo dominance. |

---

## 🔍 In-Depth Breakdown by Attribute Dimension

### 1. 🧭 RESOURCE (Stamina & Energy Optimization)
*Tactical Focus: Maximizing movement efficiency, maintaining high reserves for interception escape velocity, and compounding rest curves.*

#### `deep_breath` — Deep Breath
- **Cost**: $1M$ | **Target**: `FRIENDLY_PIECE`
- **Effect**: Instantly awards $+2$ to the piece's `restStreak`.
- **Tactical Synergy**: Triggers compounding regeneration early ($E_{\text{regen}} = 1.0 + \text{streak}$). Ideal on a primary cutter or defender preparing to anchor a lane.

#### `second_wind` — Second Wind
- **Cost**: $2M$ | **Target**: `FRIENDLY_PIECE`
- **Effect**: Restores $+4.0\text{e}$ energy directly (clamped to max $10.0\text{e}$).
- **Tactical Synergy**: Instantly recharges an exhausted ball carrier or interceptor so they can throw at high velocity or sprint to open space.

#### `slow_burn` — Slow Burn
- **Cost**: $2M$ | **Target**: `FRIENDLY_PIECE`
- **Effect**: Deducts $-0.5\text{e}$ from all movement costs for that piece over the next 3 turns (minimum $0.5\text{e}/\text{cell}$).
- **Tactical Synergy**: Best used on mobile wing cutters (`P2`, `P3`) who perform frequent multi-cell positioning runs.

#### `drain` — Drain
- **Cost**: $2M$ | **Target**: `ENEMY_PIECE`
- **Effect**: Drains $-2.0\text{e}$ from a targeted enemy piece.
- **Tactical Synergy**: Weakens an enemy interceptor situated directly in your planned passing lane, drastically lowering their capture probability $P_{\text{capture}}$.

#### `overclock` — Overclock (Stage 0 Enabler)
- **Cost**: $3M$ | **Target**: `FRIENDLY_PIECE`
- **Effect**: Halves movement energy cost for the turn ($2\times$ reach), but gives $0\text{e}$ regen on the subsequent turn.
- **Tactical Synergy**: Enables a deep break sprint across the court to get in position for a winning goal.

---

### 2. ⚓ RISK (Passing Trajectory & Interception Evasion)
*Tactical Focus: Manipulating passing risk equations, bypassing enemy Area-of-Control, and protecting possession.*

#### `insurance` — Insurance
- **Cost**: $1M$ | **Target**: `NONE`
- **Effect**: If the next throw is intercepted along its flight ray, the ball is automatically refunded and returned to the thrower's hands.
- **Tactical Synergy**: Low-cost protection when throwing into high-risk, tight windows with $40\%+$ interception odds.

#### `threaded_pass` — Threaded Pass
- **Cost**: $2M$ | **Target**: `NONE`
- **Effect**: Ignores the very first enemy control cell crossed along the throw trajectory ($p_{\text{cell}} = 0$).
- **Tactical Synergy**: Allows a direct line-drive throw right past an opposing front-line guard (`A1`) to reach an open receiver.

#### `steady_hands` — Steady Hands
- **Cost**: $2M$ | **Target**: `NONE`
- **Effect**: Multiplies thrower's effective remaining energy by $1.5\times$ ($E_{\text{att}} \times 1.5$) during interception roll calculations.
- **Tactical Synergy**: Significantly lowers capture probability:
  $$P_{\text{capture}} = \frac{k_{\text{enemy}} \cdot E_{\text{def}}}{k_{\text{enemy}} \cdot E_{\text{def}} + (1.5 \cdot E_{\text{att}})}$$

#### `long_bomb` — Long Bomb
- **Cost**: $2M$ | **Target**: `NONE`
- **Effect**: Halves the energy cost of throwing ($E_{\text{throw}} / 2$), doubling effective throw distance.
- **Tactical Synergy**: Enables full-court passes from deep defensive baseline directly into the scoring third without depleting the passer.

#### `no_look_pass` — No-Look Pass (⚡ Swing Card)
- **Cost**: $3M$ + $3.0\text{e}$ Swing Energy | **Target**: `NONE`
- **Effect**: Any throw of distance $\le 4.5$ cells is guaranteed **$100\%$ clean and uninterceptable** ($P_{\text{capture}} = 0$).
- **Tactical Synergy**: Decisive game-winning card when passing into a crowded penalty box surrounded by defenders.

---

### 3. 🗝️ COMPOSURE (Debuff Negation & State Control)
*Tactical Focus: Recovering from fouls, negating opponent plays, and managing clock pressure.*

#### `reset` — Reset
- **Cost**: $1M$ | **Target**: `FRIENDLY_PIECE`
- **Effect**: Restores piece to maximum $10.0\text{e}$ energy and resets `movedLastTurn` to `false`.
- **Tactical Synergy**: Allows a piece that just moved to instantly become eligible to receive a pass in the same turn.

#### `ice_in_the_veins` — Ice in the Veins
- **Cost**: $2M$ | **Target**: `NONE`
- **Effect**: Grants team-wide debuff immunity, neutralizing the next enemy `Drain`, `Bait`, or `Clamp`.
- **Tactical Synergy**: Essential counter-play against aggressive AI disruption.

#### `anchor` — Anchor
- **Cost**: $2M$ | **Target**: `FRIENDLY_PIECE`
- **Effect**: Target piece gains immunity to `Bait`, forced displacement, and stamina drain for 1 turn.
- **Tactical Synergy**: Protects key defenders or receiving hubs at critical tactical junction cells.

#### `timeout` — Timeout
- **Cost**: $3M$ | **Target**: `NONE`
- **Effect**: Grants $+15\text{s}$ extra time on the planning timer and restores $+1.5\text{e}$ to all pieces on the team.
- **Tactical Synergy**: High-value recovery card during complex endgame turns facing timer expiry.

---

### 4. 🤝 TEAMWORK (Formations & Synergy)
*Tactical Focus: Multi-piece coordination, free cuts, and compounding defensive control.*

#### `give_and_go` — Give-and-Go
- **Cost**: $1M$ | **Target**: `FRIENDLY_PIECE`
- **Effect**: After releasing a pass, the passer is permitted to immediately execute a 1-cell move for free ($0\text{e}$).
- **Tactical Synergy**: Classic basketball/football dynamic that lets the passer relocate into an open passing lane immediately after distributing the ball.

#### `spacing` — Spacing
- **Cost**: $2M$ | **Target**: `TWO_FRIENDLY`
- **Effect**: Allows two friendly pieces to reposition 1 cell each for free ($0\text{e}$).
- **Tactical Synergy**: Quickly realigns defensive structures or breaks double-teams without spending move energy.

#### `screen` — Screen
- **Cost**: $2M$ | **Target**: `FRIENDLY_PIECE`
- **Effect**: Targeted piece increases its Area-of-Control factor by $+0.5$ across all surrounding cells.
- **Tactical Synergy**: Turns a single defender into a wide barrier that shuts down adjacent passing corridors.

#### `overlap` — Overlap
- **Cost**: $3M$ | **Target**: `TWO_FRIENDLY`
- **Effect**: Merges the control fields of two adjacent teammates, doubling their total control factor on shared cells.
- **Tactical Synergy**: Creates a near-impenetrable interception wall along the opponent's direct route to their Captain.

---

### 5. 👁️ SPATIAL (Zone Control & Area-of-Control Denial)
*Tactical Focus: Manipulating grid geometry, cutting off passing lanes, and forcing enemy movement.*

#### `bait` — Bait
- **Cost**: $1M$ | **Target**: `ENEMY_PIECE`
- **Effect**: Displaces an enemy piece 1 cell toward a designated empty cell.
- **Tactical Synergy**: Pulls a key intercepting defender out of the direct passing line to the Captain.

#### `jam_the_lane` — Jam the Lane
- **Cost**: $2M$ | **Target**: `CELL`
- **Effect**: Creates an artificial $1.0$ control zone on any empty court cell for 1 turn.
- **Tactical Synergy**: Blocks an open passing ray even if no friendly piece is physically standing on that cell.

#### `clamp` — Clamp
- **Cost**: $2M$ | **Target**: `ENEMY_PIECE`
- **Effect**: Halves the Area-of-Control factor of a targeted enemy piece for 1 turn.
- **Tactical Synergy**: Weakens an AI interceptor's defensive reach, creating a temporary safe throwing corridor.

#### `full_court_press` — Full-Court Press (⚡ Swing Card)
- **Cost**: $3M$ + $3.0\text{e}$ Swing Energy | **Target**: `NONE`
- **Effect**: Expands the Area-of-Control radius of every piece on the team by $+1$ cell in all directions for 1 turn.
- **Tactical Synergy**: Blanket defensive suppression that forces turnovers and holding fouls by suffocating all viable passing angles.

---

### 6. 👑 LEADERSHIP (Morale, Tempo & Game Control)
*Tactical Focus: Team-wide multipliers, sudden tempo shifts, and decisive goal pushes.*

#### `tempo_change` — Tempo Change
- **Cost**: $1M$ | **Target**: `NONE`
- **Effect**: Awards $+1.5\text{e}$ energy to all teammates that remained stationary last turn.
- **Tactical Synergy**: Supercharges stationary zone defenses, rewarding disciplined positional play.

#### `set_the_play` — Set the Play (Stage 0 Enabler)
- **Cost**: $2M$ | **Target**: `NONE`
- **Effect**: Reduces movement cost across all team pieces by $-0.8\text{e}$ per cell this turn (minimum $0.5\text{e}/\text{cell}$).
- **Tactical Synergy**: Enables coordinated multi-piece team restructuring at minimal energy cost.

#### `rally` — Rally
- **Cost**: $2M$ | **Target**: `NONE`
- **Effect**: Multiplies effective energy on all interception rolls by $+25\%$ team-wide ($1.25\times$).
- **Tactical Synergy**: Increases interception capture odds across the entire defensive front line.

#### `surge` — Surge (⚡ Swing Card, Stage 0 Enabler)
- **Cost**: $3M$ + $3.0\text{e}$ Swing Energy | **Target**: `NONE`
- **Effect**: Grants $+2.0\text{e}$ energy boost to every piece on the team and establishes instant tempo dominance.
- **Tactical Synergy**: The ultimate clutch card for a full-team offensive blitz or high-pressure defensive stand.

---

## 🎯 Tactical Archetypes & Card Combos

1. **The Fast-Break Blitz**:
   - `Set the Play` ($-0.8\text{e}$ move cost) $\to$ Cut `P2` forward $\to$ `Long Bomb` ($2\times$ throw range) $\to$ Clean score to Captain.
2. **The Lockdown Defense**:
   - `Jam the Lane` on center passing ray $\to$ `Full-Court Press` (Expand AoC by $+1$ cell) $\to$ Opponent is forced into holding foul turnover.
3. **The Unstoppable Red-Zone Pass**:
   - `Threaded Pass` (Bypass first defender) + `Steady Hands` ($+50\%$ throw energy) $\to$ Bullet pass straight to Captain.
4. **The Kinetic Turnover Counter**:
   - Defender intercepts ball and lunges $\to$ `Second Wind` restores $+4.0\text{e}$ $\to$ `Give-and-Go` allows immediate counter-attack cut.
