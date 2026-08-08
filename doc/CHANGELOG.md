# THE CAPTAIN'S COMBINE — Comprehensive Engineering & Enhancement Changelog

## Overview
**The Captain's Combine** (v3.1 Tabletop Edition) is a solo grid-based tabletop tactical game featuring deterministic Monte Carlo Tree Search (MCTS) AI, a 26-card Momentum card economy across 6 dimensions, a 3D Area-of-Control (AoC) interception engine, and an automated 6-axis aptitude assessment radar chart (`RESOURCE`, `RISK`, `COMPOSURE`, `TEAMWORK`, `SPATIAL`, `LEADERSHIP`).

---

## 🎨 1. Cartoon Hand-Drawn Tabletop Aesthetic & Uniform Avatar Modernization

Inspired by vintage nautical treasure maps and comic storybook tabletop art:
- **Parchment Sand Court**:
  - Sand-textured canvas with deckle-edge borders, organic ink variations, and hand-inked grid lines.
  - Removed confusing colored column overlay strips from the court edges, keeping the beach sand canvas clean and clear.
- **Hand-Drawn Illustrated Framing Artwork**:
  - **Top Left**: Waving Jolly Roger pirate flag on a bamboo pole with monstera palm leaves, pink starfish, and seashells.
  - **Top Right**: Rolled antique treasure map scroll with red 'X' and dotted navigation trail.
  - **Bottom Left**: Rustic pirate wooden treasure chest with brass bands, gold keyhole clasp, palm leaves, and coiled hemp rope.
  - **Bottom Center**: Curling ocean waves with white crested sea foam and surf splashing against the shore.
  - **Bottom Right**: Detailed antique brass mariner's astrolabe / 8-point compass rose with glass bevel reflection.
- **Uniform Athletic Cartoon Character Avatars (Zero Legacy Role Icons)**:
  - Completely eliminated all legacy position letters/icons (`p_hub`, `C`, `P`, `D`):
    - All court players are uniform, generic athletic cartoon characters (`P1`–`P5` for Blue Athletics; `A1`–`A5` for Red Pirates) with clean embroidered nautical anchor and crossbones crests.
    - Each player's clear uniform badge (`P1`–`P5`, `A1`–`A5`, `★ Captain`) is rendered cleanly above the avatar in `PieceLayer.tsx` alongside real-time energy gauges and compounding rest streak counters.
    - The Captain stands atop the 4-legged wooden stool with raised receiving arms.
- **Tactical Parchment Cards & UI**:
  - Cards styled as antique parchment scrolls with deckle borders, wax seal dimension stamps, and golden doubloon momentum tokens.
  - Results Radar styled as the **"Admiral's Combine Scouting Dossier"** on aged parchment.

---

## 👥 2. 7 Players Per Side (14 Total Court Pieces) & Designated Blockers

Expanded team roster to 7 pieces per side (14 total pieces on the court), introducing a dedicated designated Blocker / Goal Guard on each team:

### Player Team (Blue Athletics — 7 Pieces)
1. `p_captain`: Captain on wooden stool at `(5, 10)`
2. `p_1`: Center-line Player 1 (`P1`) at `(5, 4)`
3. `p_2`: Left Wing Player 2 (`P2`) at `(2, 3)`
4. `p_3`: Right Wing Player 3 (`P3`) at `(8, 3)`
5. `p_4`: Right Guard Player 4 (`P4`) at `(8, 2)`
6. `p_5`: Left Guard Player 5 (`P5`) at `(2, 2)`
7. `p_blocker`: **Designated Blocker (`🛡️ Blocker`)** stationed at `(5, 1)` inside the AI Captain's defense circle, wearing goalkeeper kit and protective shield.

### AI Team (Red Pirates — 7 Pieces)
1. `ai_captain`: AI Captain on wooden stool at `(5, 0)`
2. `ai_1`: Center-line AI Player 1 (`A1`) at `(5, 6)`
3. `ai_2`: Left Wing AI Player 2 (`A2`) at `(2, 7)`
4. `ai_3`: Right Wing AI Player 3 (`A3`) at `(8, 7)`
5. `ai_4`: Left Guard AI Player 4 (`A4`) at `(2, 8)`
6. `ai_5`: Right Guard AI Player 5 (`A5`) at `(8, 8)`
7. `ai_blocker`: **Designated AI Blocker (`🛡️ Blocker`)** stationed at `(5, 9)` inside the Player Captain's defense circle, wearing pirate keeper kit and iron shield.

- **Blocker Zone Constraints**:
  - The designated blocker **may only move within the cells in the opposing Captain's defense circle** ($r \le 1.5$ from $(5, 0)$ or $(5, 10)$).
  - The blocker **may not move or lunge outside this permitted zone**.
  - General field runners (`P1`–`P5` / `A1`–`A5`) cannot enter the defense circles.

---

## ⏱️ 3. 60-Second Planning Timer & Dynamic Inverse-Latency Search Budget

- **Turn Timer**: Extended player planning budget to **60 seconds** (`turnTimerSeconds: 60`).
- **Dynamic Inverse-Latency MCTS Formulation**:
  - When the human moves quickly, the AI recognizes the fast tempo and allocates the remaining planning budget to run a deeper lookahead search:
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
- **Real-Time Visualizer HUD (`MCTSVisualizer.tsx`)**:
  - Displays human elapsed time vs AI target budget, active iterations, lookahead depth, and a dynamic power gauge.

---

## 🏃 4. 1-Step Receiver Pivot/Catch Rule (1 Cell Straight or Diagonal) & Reconciliation Order

- **Strict 1-Cell Move Allowance for Throw Recipients**:
  - When a recipient of another piece's throw also wants to move in that turn, it **may only move up to 1 cell, whether straight (orthogonal) or diagonal** ($\max(|\Delta c|, |\Delta r|) \le 1$, distance $\le 1.42$).
  - Moving $> 1$ cell in any direction (distance $> 1.42$) makes the piece strictly ineligible to receive a pass in that turn.
- **Reconciliation Order**:
  1. The recipient of the throw (and any moving teammates) is **moved first** to its new staged position.
  2. The **trajectory of the throw is evaluated against the recipient's new position** (raycasting and interception checks against defending Area-of-Control from the thrower to the recipient's new position).
  3. The catch, clean pass refund, interception, or goal is resolved at the new position.

---

## 🎯 5. Goal Concession & Baseline Restart Mechanics with Mandatory Midfield Pass Rule
- **Post-Goal Baseline Possession**:
  - When a team scores, possession is awarded to the conceding team at their baseline/goal line.
  - The scoring team retreats to their own defensive half ($\ge 3$ cells away from the opponent's goal line) to provide clean passing space.
- **Mandatory Midfield Court Pass Rule (Official Tournament Regulations)**:
  - After a baseline restart, the restarting team **must complete at least one mandatory pass to an active court player (`P1`–`P5` / `A1`–`A5`)** before legally attempting to throw or score to the Captain.
  - Direct passes to the Captain straight from the baseline restart are strictly prohibited and locked in the UI / engine.
  - The initial inbound baseline restart pass to a court player is **protected from interception (`isClean: true`)**, ensuring an unblocked restart into active play.
- **Interactive Restart Thrower Selection (`CHOOSE_RESTART_THROWER`)**:
  - The conceding player can choose which piece takes the ball:
    - **Captain** atop the stool at `(5, 10)`, OR
    - **Any court player (`P1`–`P5`)**, who moves to the baseline goal line at `(5, 9)` to execute the restart pass!
  - The UI provides a dedicated **"Baseline Restart Thrower"** toolbar with clear status callouts.

---

## ⚖️ 6. Symmetric Holding Foul Rule & Referee Double-Blast Pea Whistle

- **Holding Foul Enforcement**:
  - If either Player or AI ball carrier ends a turn holding the ball without executing a pass, a **`HOLDING_FOUL_TURNOVER`** immediately occurs, transferring possession to the opponent.
- **Procedural Referee Whistle (`soundEngine.playFoulWhistle()`)**:
  - Synthesizes an authentic dual-frequency pea-whistle sound ($\approx 2150\text{Hz}$ / $2450\text{Hz}$ with $45\text{Hz}$ tremolo modulation):
    - **Blast 1**: Sharp high-frequency chirp ($0.12\text{s}$).
    - **Blast 2**: Long decisive referee whistle blast ($0.30\text{s}$).
  - Accompanied by a visual referee foul notification banner on the main HUD.

---

## 📜 9. Opponent Tactical Play-by-Play Feed & Inked Jersey Numbers (1–5)

- **Dedicated Opponent Tactical Action Feed (`OpponentTacticalFeed.tsx`)**:
  - Live conversational play-by-play telemetry logging all AI and Player actions in plain, natural English:
    - Movement: `AI moved P1 from (5,6) to (6,6) [-1.0e]`
    - Passing: `AI attempted throw from P1 to P2 at (2,7) (⚡ Clean Inbound)`
    - Cards: `✨ AI played card [Deep Breath] on P3 (+2 Rest Streak)`
    - Debuffs: `🩸 AI played DEBUFF card [Drain] on your P3 (-2.0e energy)!` / `🗜️ AI played DEBUFF card [Clamp] on your P2 (Halved Area-of-Control)!`
    - Fouls: `⚠️ REFEREE FOUL: AI committed holding foul on P1! Turnover to Player.`
    - Interceptions: `🛡️ AI INTERCEPTION! Ball snatched at (5,8) by P4! Defender lunges to ball [-2.0e].`
    - Goals: `⭐ GOAL SCORED! AI scored a point with ★ Captain! (Score: 1 - 1)`
  - Filter toggles: **All Actions**, **AI Actions Only**, and **Buffs & Debuffs**.
  - AI Planned Action Preview banner during `AI_PLANNED_REVIEW`.

- **Inked Numbered Jersey Crests (1–5 on Shirts)**:
  - All 10 court players across both sides (`P1`–`P5` for Player Blue; `P1`–`P5` for AI Red Pirates) feature a large, bold, high-contrast circular numbered badge (`1` to `5`) inked directly onto the chest of their jerseys in `HandDrawnCharacters.tsx`.
  - Captains feature a golden nautical crest with a star (`★ Captain`).

- **Glowing Buff & Debuff Auras & Status Badge Stack (`PieceLayer.tsx` & `Board.tsx`)**:
  - **Debuffs (`Drain`, `Clamp`)**: Crimson glowing warning halo (`bg-rose-500/35`) and red status badges.
  - **Buffs (`Slow Burn`, `Overclock`, `Anchor`, `Screen`, `Overlap`)**: Emerald glowing aura (`bg-emerald-400/30`) and duration counters (`🔥 Burn (3T)`, `⚡ Overclock (1T)`, `⚓ Anchor (1T)`).
  - **Team Buffs Banner**: Real-time display for `🛡️ Insurance`, `🎯 Threaded Pass`, `🧤 Steady Hands`, `🚀 Long Bomb`, `🔮 No-Look Pass`, `🚩 Rally (+25% Int)`, `📐 Set the Play (-0.8e)`.

---

## 🛡️ 7. Defender Interception Capture & Energy Deduction Mechanics
- **Defender Movement to Capture Cell**:
  - When a thrown ball travels across a cell in a piece's Area of Control and the interception roulette roll succeeds in the defender's favor (`PASS_INTERCEPTED`), the defending piece **captures the ball and immediately moves to the exact cell where the interception was made** (`resolution.interceptedAtCell`).
- **Lunge / Interception Move Cost Deduction**:
  - The defending piece **pays the Euclidean move energy cost** for this capture sprint:
    $$E_{\text{defender, new}} = \max\left(0,\, E_{\text{defender, initial}} - \text{cost}(\text{cell}_{\text{initial}},\, \text{cell}_{\text{intercept}})\right)$$
  - The defender takes active ball possession (`hasBall: true`, `movedLastTurn: true`), and ball holder ID updates to the defender.
- **Event Telemetry**:
  - The `PASS_INTERCEPTED` game event records `interceptedAtCell`, `interceptedByPieceId`, `lungeCost`, and `postInterceptEnergy`.

---

## 🧠 8. Defensive AI Intelligence & Passing Lane Interposition Cuts
- **Full Goal Gravity Threat Evaluation**:
  - Scaled the player's potential scoring pass directly against the full terminal goal weight ($w_{\text{goal}} = 1000.0$):
    $$\text{Penalty}_{\text{goal\_threat}} = -(1.0 - P_{\text{capture}}) \times w_{\text{goal}} \times 0.85$$
  - Clean player passes to the Captain trigger an immediate $-950.0$ penalty, eliminating the previous $-50.0$ underweighting blindspot.
- **Passing Corridor Interposition Cuts**:
  - Sorted defender candidate actions primarily by perpendicular distance to the active throw ray between `playerCarrier` and `playerCaptain`.
  - Added $+15.0$ evaluation reward per unit of defender control stacked across the player's direct scoring line.
  - Rollouts simulate potential player scoring throws, allowing MCTS backpropagation to immediately prune branches that surrender open shots.

---

## 🤖 10. MCTS Tier Hierarchy Calibration & Procedural Crowd Cheering Audio

- **Calibrated MCTS Search Tiers**:
  - **T1 Standard Cadet**: Calibrated to former T3 strength ($2,500$ iterations, $5$-turn rollout depth, $4$ hidden hand samples).
  - **T2 Tactician**: Advanced depth ($5,000$ iterations, $6$-turn rollout depth, $6$ hidden hand samples).
  - **T3 Grandmaster**: Deep positional foresight ($7,500$ iterations, $7$-turn rollout depth, $8$ hidden hand samples).
  - **T4 Deep Combine Engine**: Maximum tactical foresight ($10,000$ iterations, $8$-turn rollout depth, $10$ hidden hand samples).
  - **CUSTOM**: User-tunable sliders across all 4 parameters in `ConfigTuner.tsx`.
- **Procedural Stadium Crowd Cheering (`playCrowdCheer`)**:
  - When an interception and defender lunge occur, `soundEngine.playIntercepted()` triggers an authentic stadium crowd roar:
    - Dual resonant vocal formants ($650\text{Hz} \to 1150\text{Hz}$ and $2200\text{Hz} \to 2800\text{Hz}$).
    - Rapid excitement amplitude swell ($0.15\text{s}$) with sustained roar and smooth decay ($1.6\text{s}$).
    - Cheering harmonic fanfare ($\text{C4} \to \text{E4} \to \text{G4} \to \text{C5}$).

---

## 🧪 11. Test Suite & Coverage

- **105 unit tests across 31 test files** passing with 100% determinism (`npm test`).
- Tests cover:
  - Single-ball invariant across all transitions.
  - Euclidean Pythagorean movement and raycasting.
  - 1-step receiver movement and distance limits ($\le 1.42$).
  - Symmetric holding fouls on Player and AI.
  - 26 tactical cards cataloged across all 6 dimensions.
  - 2-step interactive Bait card targeting and forced displacement.
  - Staging throws followed by buff card plays applying upon commit.
  - Official Captain's Ball Defense Circle rule (permitting exactly 1 generic defender / Blocker inside the defense circle with the Captain).
  - Post-goal baseline concession and mandatory midfield court pass rule.
  - Single-occupancy invariant and non-restarting players retaining current positions.
  - Goal-seeking cascade rollout policy and UCB1 search convergence.
  - Seeded Mulberry32 PRNG reproducibility.
  - 12-step interactive tutorial academy curriculum.
  - Dynamic Jump-Ball with $\pm 25\%$ interval variance on a $250\text{ms}$ base window.
  - Custom MCTS tuner and parameter persistence.
  - Planning timer rhythm "doo" audio ticks with urgent final 10s countdown.
