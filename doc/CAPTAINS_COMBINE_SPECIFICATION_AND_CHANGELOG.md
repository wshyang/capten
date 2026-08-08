# THE CAPTAIN'S COMBINE — Comprehensive Specification & Enhancement Dossier

## 1. Project Overview & Rules Engine Architecture
**The Captain's Combine** (Tabletop v3.1 Engine) is an 11×11 grid-based tabletop sports tactics game with:
- Deterministic Monte Carlo Tree Search (MCTS) AI with UCB1 candidate action expansion and heuristic cascade rollouts.
- 26-card tactical Momentum card economy across 6 dimensions (`RESOURCE`, `RISK`, `COMPOSURE`, `TEAMWORK`, `SPATIAL`, `LEADERSHIP`).
- Continuous 3D Area-of-Control (AoC) field generation with additive stacking and raycasted interception roulette.
- Automated 6-axis Aptitude Assessment Scouting Radar chart emitted from seeded event log replays.

---

## 2. Complete Summary of Changes & Enhancements

### 🎨 1. Cartoon Hand-Drawn Tabletop Aesthetic
- **Parchment Sand Court**:
  - Sand-textured canvas with vintage deckle edges, subtle paper grain, and hand-inked grid lines.
  - Removed confusing colored full-column overlay strips from the court sides, keeping the beach canvas clean and unobstructed.
- **Hand-Drawn Illustrated Framing Elements**:
  - **Top Left**: Weathered Jolly Roger pirate skull & crossbones flag on a wooden pole with tropical monstera leaves and starfish.
  - **Top Right**: Rolled antique treasure map scroll with navigation trail and sea shells.
  - **Bottom Left**: Rustic pirate wooden treasure chest with brass bands, gold keyhole clasp, monstera leaves, and coiled hemp rope.
  - **Bottom Center**: Detailed cartoon hand-drawn ocean waves with crested white foam rollers, sea spray, and sea shells along the shore.
  - **Bottom Right**: Antique brass mariner's astrolabe / 8-point compass rose with glass lens highlight.
- **Illustrated Cartoon Character Avatars**:
  - **Player Team (Blue Athletics)**: Uniform athletic cartoon character avatars (`CarrierPlayerIllustration` when carrying the ball, `CutterPlayerIllustration` when cutting/defending, and `CaptainPlayerIllustration` when standing on the stool).
  - **AI Team (Red Pirates)**: Uniform crimson pirate character avatars (`PieceAIIllustration` and `CaptainAIIllustration` on the stool).

---

### 👥 2. 6 Players Per Side (12 Total Court Pieces) & Generic Standardization
All player pieces on both teams are standardized to be completely uniform, generic, and interchangeable (no hub/wing/guard distinction):

| Team | Captain (Stool) | Court Player 1 | Court Player 2 | Court Player 3 | Court Player 4 | Court Player 5 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Player (Blue Team)** | `p_captain` (`5, 10`) | `p_1` (`5, 4` - Center) | `p_2` (`2, 3`) | `p_3` (`8, 3`) | `p_4` (`8, 2`) | `p_5` (`2, 2`) |
| **AI (Red Pirates)** | `ai_captain` (`5, 0`) | `ai_1` (`5, 6` - Center) | `ai_2` (`2, 7`) | `ai_3` (`8, 7`) | `ai_4` (`2, 8`) | `ai_5` (`8, 8`) |

---

### 🏃 3. 1-Step Receiver Pivot/Catch Rule & Order of Reconciliation
- **1-Step Move Allowance for Throw Recipients**:
  - A throw recipient may take a **maximum of 1 cell** cut/pivot move in the same turn (distance $\le 1.42$, i.e. 1 orthogonal or diagonal step).
  - Moving $> 1.42$ cells distance marks the piece as ineligible to receive a pass in that turn.
- **Reconciliation Order**:
  1. The recipient of the throw (and any moving teammates) is **moved first** to its new staged position.
  2. The **trajectory of the throw is evaluated against the recipient's new position** (raycasting and interception checks against defending Area-of-Control from the thrower to the recipient's new position).
  3. The catch, clean pass refund, interception, or goal is resolved at the new position.

---

### ⏱️ 4. 60-Second Planning Timer & Dynamic Inverse-Latency MCTS
- **Turn Timer**: Extended player planning budget to **60 seconds** (`turnTimerSeconds: 60`).
- **Explicit Inverse-Latency Formulation**:
  $$T_{\text{human}} = \text{Elapsed planning time (seconds)}$$
  $$T_{\text{AI\_budget}} = \max\left(1.0\text{s},\, 60\text{s} - T_{\text{human}}\right)$$
  $$\text{Speed Ratio } R = \max\left(0.0,\, \min\left(1.0,\, \frac{T_{\text{AI\_budget}}}{60\text{s}}\right)\right)$$
- **Scaled MCTS Parameters**:
  - **Rollout Iterations**: $N = 300 + \text{round}(R \times 4,700)$ (scales from $300$ up to $5,000$ iterations).
  - **Lookahead Depth**: $D = 3 + \text{round}(R \times 3)$ ($3$ to $6$ turns forward horizon).
  - **IS-MCTS Hand Samples**: $S = 1 + \text{round}(R \times 5)$ ($1$ to $6$ hidden hand permutations).
  - **Adaptive Tiers**:
    - $R \ge 0.75$ ($<15\text{s}$ human response): `T4 Deep Grandmaster`
    - $R \ge 0.50$ ($<30\text{s}$ human response): `T3 Master Lookahead`
    - $R \ge 0.25$ ($<45\text{s}$ human response): `T2 Tactician`
    - $R < 0.25$: `T1 Standard Cadet`

---

### 🎯 5. Goal Concession & Baseline Restart Mechanics with Mandatory Midfield Pass Rule
- **Ball to Conceding Team**: When a team scores, ball possession is awarded to the conceding team at their baseline/goal line.
- **Scoring Team Retreat**:
  - All players on the scoring team retreat to their own defensive half ($\ge 3$ cells away from the opponent's goal line) to provide clean passing space.
- **Mandatory Midfield Court Pass Rule (Official Tournament Regulations)**:
  - After a baseline restart, the restarting team **must complete at least one mandatory pass to an active court player (`P1`–`P5` / `A1`–`A5`)** before legally attempting to throw or score to the Captain.
  - Direct passes to the Captain straight from the baseline restart are strictly prohibited and locked in the UI / engine.
  - The initial inbound baseline restart pass to a court player is **protected from interception (`isClean: true`)**, ensuring an unblocked restart into active play.
- **Interactive Restart Thrower Selection (`CHOOSE_RESTART_THROWER`)**:
  - The conceding player can choose which piece takes the ball:
    - **Captain** atop the stool at `(5, 10)`, OR
    - **Any court player (`P1`–`P5`)**, who moves to the baseline goal line at `(5, 9)` to execute the restart pass!

---

### ⚖️ 6. Symmetric Holding Foul Rule & Referee Pea Whistle
- **Symmetric Holding Foul**:
  - If either Player or AI ball carrier ends a turn holding the ball without executing a pass, a **`HOLDING_FOUL_TURNOVER`** immediately occurs, transferring possession to the opponent.
- **Procedural Referee Whistle (`soundEngine.playFoulWhistle()`)**:
  - Synthesizes an authentic dual-frequency pea-whistle sound ($\approx 2150\text{Hz}$ / $2450\text{Hz}$ with $45\text{Hz}$ tremolo modulation).

### 🛡️ 7. Defender Interception Capture & Energy Deduction Mechanics
- **Defender Movement to Capture Cell**:
  - When a thrown ball travels across a cell in a piece's Area of Control and the interception roulette roll succeeds in the defender's favor (`PASS_INTERCEPTED`), the defending piece **captures the ball and immediately moves to the exact cell where the interception was made** (`resolution.interceptedAtCell`).
- **Lunge / Interception Move Cost Deduction**:
  - The defending piece **pays the Euclidean move energy cost** for this capture sprint:
    $$E_{\text{defender, new}} = \max\left(0,\, E_{\text{defender, initial}} - \text{cost}(\text{cell}_{\text{initial}},\, \text{cell}_{\text{intercept}})\right)$$
  - The defender takes active ball possession (`hasBall: true`, `movedLastTurn: true`), and ball holder ID updates to the defender.
- **Event Telemetry**:
  - The `PASS_INTERCEPTED` game event records `interceptedAtCell`, `interceptedByPieceId`, `lungeCost`, and `postInterceptEnergy`.

### 🧠 8. Defensive AI Intelligence & Passing Lane Interposition Cuts
- **Full Goal Gravity Threat Scaling**:
  - The evaluation function now scales impending human goal passes against the full terminal goal weight ($w_{\text{goal}} = 1000.0$):
    $$\text{Penalty}_{\text{goal\_threat}} = -(1.0 - P_{\text{capture}}) \times w_{\text{goal}} \times 0.85$$
  - Eliminates the previous $-50.0$ underweighting blindspot, ensuring the AI treats open player shots with maximum defensive urgency.
- **Passing Corridor Interposition Cuts**:
  - MCTS candidate generation sorts defender reachable cells primarily by distance to the active passing ray connecting the ball carrier and the Captain.
  - Generates single and joint wall cuts placing defenders directly on the corridor cells (`col 5, row 5–9`) to maximize interception capture probability.
- **Defensive Rollout Foresight**:
  - Cascade rollouts simulate the human's potential scoring throws, allowing tree backpropagation to immediately identify and reject branches that surrender un-defended scoring opportunities.

---

## 🧪 8. Test Verification & Line Coverage
- **48 unit tests across 19 test files** passing with 100% determinism.
- Tests verify:
  - Single-ball invariant across all transitions.
  - Euclidean Pythagorean movement and raycasting.
  - 1-step receiver movement and distance limits.
  - Symmetric holding fouls on Player and AI.
  - 26 tactical cards across all 6 dimensions.
  - Goal-seeking cascade rollout policy and UCB1 search convergence.
  - Seeded Mulberry32 PRNG reproducibility.
