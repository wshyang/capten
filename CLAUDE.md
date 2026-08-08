# 📜 THE CAPTAIN'S COMBINE — Claude Engineering Guide & Core Directives (v3.1)

## 📌 Architecture & Design Principles
**The Captain's Combine** is an 11×11 grid-based tabletop game featuring a deterministic Monte Carlo Tree Search (MCTS) AI opponent, a 26-card Momentum card economy across 6 dimensions, a continuous 3D Area-of-Control (AoC) interception engine, and an automated six-attribute aptitude assessment radar chart.

---

## 🏗️ Core Gameplay Directives & Invariants

1. **Roster Structure (7 Pieces per Side, 14 Total Pieces)**:
   - **Player Blue Team (7 Pieces)**:
     - `p_captain`: Captain on wooden stool at `(5, 10)` (stationary scoring target).
     - `p_1`–`p_5`: 5 uniform court players (uniform badges `P1`–`P5`, shirts numbered `1`–`5`).
     - `p_blocker`: **Designated Blocker / Goal Guard** stationed inside AI Captain's defense circle at `(5, 1)`.
   - **AI Red Pirates (7 Pieces)**:
     - `ai_captain`: AI Captain on wooden stool at `(5, 0)` (stationary scoring target).
     - `ai_1`–`ai_5`: 5 uniform AI court players (uniform badges `A1`–`A5`, shirts numbered `1`–`5`).
     - `ai_blocker`: **Designated AI Blocker / Goal Guard** stationed inside Player Captain's defense circle at `(5, 9)`.
   - **Blocker Movement & Lunge Rules**:
     - Blockers wear distinct padded goalkeeper uniforms (`BlockerPlayerIllustration` with gold armor shield; `BlockerAIIllustration` with iron pirate shield).
     - The designated blocker **may only move within the cells in the opposing Captain's defense circle** ($r \le 1.5$ from $(5, 0)$ or $(5, 10)$).
     - The blocker **may not move or lunge outside this permitted zone**.
     - General field runners (`P1`–`P5` / `A1`–`A5`) cannot enter the defense circles.
   - **Zero legacy position letters (`p_hub`, `C`, `P`, `D`) permitted anywhere in code or UI.**

2. **1-Step Receiver Cut/Pivot Rule**:
   - If a throw recipient moves in the same turn, it is strictly limited to **1 cell in any direction (orthogonal or diagonal)** ($\max(|\Delta c|, |\Delta r|) \le 1$, $\text{distance} \le 1.42$).
   - Moving $> 1$ cell makes the piece strictly ineligible to receive a pass in that turn.
   - **Order of Reconciliation**: Recipient moves first; throw trajectory and Area-of-Control raycasting evaluate against the recipient's **new position**.

3. **Defender Interception Capture & Energy Cost**:
   - When an interception occurs, the intercepting defender captures the ball and **immediately lunges to the exact cell where the interception occurred** (`resolution.interceptedAtCell`).
   - The defending piece pays the Euclidean movement energy cost:
     $$E_{\text{defender, new}} = \max\left(0,\, E_{\text{defender, initial}} - \text{cost}(\text{cell}_{\text{initial}},\, \text{cell}_{\text{intercept}})\right)$$
   - Active ball possession transfers to the intercepting piece (`hasBall: true`, `movedLastTurn: true`).

4. **Goal Concession & Baseline Restart with Mandatory Midfield Pass**:
   - After a goal, possession goes to the conceding team at their baseline/goal line. Scoring team retreats $\ge 3$ cells.
   - **Mandatory Midfield Court Pass**: Restarting team **must complete at least 1 pass to an active court player (`P1`–`P5`)** before attempting to throw or score to Captain (`isRestartPhase`). Direct baseline-to-Captain passes are prohibited.
   - The inbound baseline pass to a court player is protected from interception (`isClean: true`).

5. **Compounding Rest & Energy Recovery**:
   - Normalized energy pool: $10.0\text{e}$.
   - Movement costs: Euclidean Pythagorean distance $\sqrt{\Delta c^2 + \Delta r^2} \times 1.0\text{e}$.
   - Throw costs: $\text{distance} / 3.0$.
   - Compounding rest on stationary pieces: $E_{\text{regen}} = 1.0\text{e} + \text{restStreak}$ (Turn 1: $+2.0\text{e}$, Turn 2: $+3.0\text{e}$, Turn 3: $+4.0\text{e}$).
   - Moving resets `restStreak` to 0.

6. **26-Card Momentum Economy & Seamless In-UI Targeting**:
   - 6 Dimensions: `RESOURCE`, `RISK`, `COMPOSURE`, `TEAMWORK`, `SPATIAL`, `LEADERSHIP`.
   - Hand limit: strictly **3 cards** (`handLimit: 3`). Draw $+1$ card per turn; discard down to 3 to commit.
   - Swing Cards (⚡): Require $3M$ and deduct $3.0\text{e}$ stamina from the highest-energy piece.
   - **Zero modal popups or dropdown select menus for card targeting**: Clicking DEPLOY arms in-UI targeting; click the target piece/cell directly on the court or use quick-select chips.

7. **Holding Fouls & Referee Double-Blast Whistle**:
   - Holding the ball without passing during a turn triggers a `HOLDING_FOUL_TURNOVER` and procedural dual-frequency referee whistle blast ($\approx 2150\text{Hz}$ / $2450\text{Hz}$).

8. **Procedural Stadium Crowd Cheering & Planning Timer "Doo" Tick**:
   - **Interception Lunge Cheer (`playCrowdCheer`)**: When a defender executes a successful interception lunge, the sound engine synthesizes an authentic stadium crowd roar ($600\text{Hz} \to 1150\text{Hz} \to 700\text{Hz}$) with clapping shimmer and an excited rising 5-note harmonic chord.
   - **Planning Timer "Doo" Rhythm Tick (`playTimerTick`)**: During each second of the planning countdown, a warm, rounded low-mid "doo" sound ($240\text{Hz} \to 180\text{Hz}$, $0.09\text{s}$) plays. In the **last 10 seconds ($\le 10\text{s}$)**, the "doo" is **longer and louder** ($320\text{Hz} \to 210\text{Hz}$, $0.26\text{s}$, $0.28$ peak gain) with an urgent pulse!

9. **MCTS Search Tier Hierarchy (v3.1 Calibrated)**:
   - **`T1 Standard Cadet`**: Calibrated to former T3 strength ($2,500$ iterations, $5$-turn lookahead depth, $4$ hand samples).
   - **`T2 Tactician`**: Advanced depth ($5,000$ iterations, $6$-turn lookahead depth, $6$ hand samples).
   - **`T3 Grandmaster`**: Deep positional foresight ($7,500$ iterations, $7$-turn lookahead depth, $8$ hand samples).
   - **`T4 Deep Combine Engine`**: Maximum tactical foresight ($10,000$ iterations, $8$-turn lookahead depth, $10$ hand samples).
   - **`CUSTOM`**: Fully user-specified parameters via `ConfigTuner.tsx`.

---

## 🧪 Testability Directive: Unique Entity IDs (`data-testid`)

Every interactive and informational UI element must contain a descriptive, deterministic `data-testid` attribute to ensure automated unit and end-to-end testability:

| UI Component | Entity ID Convention (`data-testid`) | Description |
| :--- | :--- | :--- |
| **Court Grid Cell** | `court-cell-${col}-${row}` | Individual 11×11 grid cell |
| **Court Pieces** | `piece-${piece.id}` | Character avatar on the court |
| **Jersey Number** | `jersey-number-${piece.id}` | Inked 1–5 or ★ on shirt |
| **Energy Gauge** | `energy-gauge-${piece.id}` | Vintage stamina meter |
| **Rest Badge** | `rest-badge-${piece.id}` | Compounding rest streak counter |
| **Piece Buff Badge** | `buff-badge-${piece.id}-${buffType}` | Active buff/debuff duration badge |
| **Throw Button** | `stage-throw-btn-${piece.id}` | Action toolbar throw staging button |
| **Tactical Card** | `card-${card.id}` | Parchment card in hand |
| **Deploy Card Button** | `deploy-card-btn-${card.id}` | Card deploy button |
| **Discard Card Button** | `discard-card-btn-${card.id}` | Card cycle/discard button |
| **Momentum Gauge** | `momentum-doubloons-counter` | Golden doubloons counter |
| **Commit Turn Button** | `commit-turn-button` | End player turn action |
| **Start AI Turn Button** | `start-turn-button` | Resolve AI moves button |
| **Opponent Action Feed** | `opponent-tactical-feed` | Live play-by-play log |
| **Tactical Buffs Bar** | `active-tactical-buffs-bar` | Court-level team enchantment banner |
| **MCTS Visualizer HUD** | `mcts-visualizer-hud` | Real-time tree search diagnostics |
| **Tutorial Modal/HUD** | `tutorial-step-overlay` | Interactive progressive tutorial |

---

## 🎓 Progressive Tutorial Mode Curriculum

Tutorial Mode walks the player through 12 progressive steps, spotlighting and illuminating the corresponding UI elements:

1. **Step 1: The Sand Court & Captains** (`court-cell-5-10`, `court-cell-5-0`)
   - Introduces the 11×11 sand court grid, the Captain as a stationary scoring target atop the stool, and generic court players `P1`–`P5`.
2. **Step 2: The Energy Pool (10.0e Stamina)** (`energy-gauge-p_1`, `energy-gauge-p_2`)
   - Explains the normalized 10.0e stamina pool per piece, color thresholds (Green >50%, Amber 25–50%, Red <25%), and stamina consumption.
3. **Step 3: How to Move & Movement Energy Costs** (`piece-p_2`, `court-cell-2-4`)
   - Walks through selecting a teammate, viewing reachable cells with cost tags, and Euclidean Pythagorean distance: $E_{\text{move}} = \sqrt{\Delta c^2 + \Delta r^2} \times 1.0\text{e}$ (Orthogonal = $1.0\text{e}$, Diagonal = $1.41\text{e}$). Moving resets rest streak.
4. **Step 4: Ball Possession & "No Running" Rule** (`piece-p_1`, `throw-action-toolbar`)
   - Explains that the active ball carrier cannot move to other cells; advancement across the court is exclusively via throwing.
5. **Step 5: How to Throw & Throwing Costs (3:1 Ratio & Clean Refund)** (`throw-action-toolbar`, `stage-throw-btn-p_2`)
   - Explains how to throw: select carrier $\to$ click teammate $\to$ golden throw vector. Throw cost: $E_{\text{throw}} = \text{Distance} / 3.0$. Passes through open air are 100% Clean ($0.0\text{e}$ refund).
6. **Step 6: The 1-Step Receiver Cut/Pivot Rule (dist ≤ 1.42)** (`stage-throw-btn-p_2`, `court-cell-2-4`)
   - Demonstrates that throw recipients may move up to 1 cell ($\max(|\Delta c|, |\Delta r|) \le 1$, $\text{dist} \le 1.42$) and still catch the ball in the same turn. Moving $>1$ cell disqualifies the catch.
7. **Step 7: Area-of-Control & Interceptions** (`control-shading-layer`)
   - Illustrates watercolor AoC shading, raycasting, thrower remaining energy ($E_{\text{att}}$) acting as escape velocity, and defender lunge sprints.
8. **Step 8: Scoring & Baseline Restart (Mandatory Midfield Pass)** (`court-cell-5-10`, `restart-thrower-toolbar`)
   - Explains scoring a point, post-goal baseline concession, and the mandatory 1 pass to court player (`P1`–`P5`) before shooting to Captain.
9. **Step 9: Compounding Rest & Energy Recovery** (`rest-badge-p_3`, `energy-gauge-p_3`)
   - Explains the exponential reward for stationary positioning ($E_{\text{regen}} = 1.0\text{e} + \text{streak}$), recharging to full in 3 turns.
10. **Step 10: Momentum Doubloons & 26 Tactical Cards** (`momentum-doubloons-counter`, `card-deep_breath`)
    - Introduces earning Momentum doubloons, the 3-card hand limit, and $3.0\text{e}$ Swing Cards across the 6 dimensions.
11. **Step 11: Direct In-UI Card Targeting & Buff Badges** (`deploy-card-btn-deep_breath`, `active-tactical-buffs-bar`)
    - Demonstrates arming cards, clicking board targets directly, and reading emerald buff/crimson debuff halos and duration counters (`Slow Burn (3T)`).
12. **Step 12: Holding Fouls & Opponent Tactical Action Feed** (`commit-turn-button`, `opponent-tactical-feed`)
    - Teaches avoiding holding foul turnovers, referee whistle audio, and following live play-by-play telemetry in the Opponent Feed.

10. **Defense Circle & The Blocker Rule**:
   - **Goal/Defense Circle ($r = 1.5$ cells)**: Located around each Captain's stool (`(5, 10)` for Player, `(5, 0)` for AI).
   - **The Blocker / Goal Guard**: Exactly **ONE generic defender from the defending team** (e.g. an AI defender at `(5, 10)` or a Player defender at `(5, 0)`) is permitted inside the defense circle with the opposing Captain to actively guard the perimeter and block passes.
   - **Overcrowding Invariant**: At most 1 defender may occupy the defense circle; a second defender is rejected.
   - **Attacking Runners**: Zero (0) attacking field players may step inside their own Captain's goal circle (all scoring is via throwing from the court).

---

## 💻 Build & Test Commands

```bash
# Run complete test suite (105 unit tests across 31 test files)
npm test

# Build production bundle with maximum strictness TypeScript checking
npm run build

# Start dev server on 0.0.0.0:5173
npm run dev -- --host 0.0.0.0
```
