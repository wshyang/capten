# RESUMABLE TRAINING, EVALUATION & AI HARNESS ARCHITECTURE GUIDE

This document serves as the canonical reference for the **Capten AI Training Harness, Evaluation Protocols, Board Geometry Formations, Sample Size Budgeting, and Crash-Safe Resumable Retraining Pipelines** (v3.2).

---

## 1. Executive Summary & Design Decisions

### A. Dynamic Spatial Encoding & Why NN Retraining Is Optional for Formation Changes
Our Dual-Head Residual ConvNet (`ResNet`) architecture (`src/engine/ai/nn/`) evaluates board states as spatial `11x11xC` tensors (`C = 32` for 32-channel models, `C = 64` for 64-channel models).
1. **No Static Coordinate Memorization:**  
   Unlike flat Multi-Layer Perceptrons (MLPs), convolutional kernels (`3x3` and `1x1`) slide across the spatial grid to learn *relational rules* (e.g., passing safety relative to friendly/enemy Area-of-Control intensity, blocker proximity, and reachability).
2. **Real-Time Watercolor AoC Planes:**  
   Channels `9` and `10` encode normalized Area-of-Control (`controlMap[col][row][sideIdx] / 2.0`). In 64-channel mode, Channels `35..40` encode 1-turn reachability grids, remaining stamina margins, and interception danger maps. Any change in starting piece coordinates is automatically and instantaneously reflected in these input planes.

---

### B. Sample Size Budgeting: Why 64 Samples vs. 6,400 Samples
A frequent question when designing training harnesses is why our automated verification scripts default to `SAMPLES_COUNT = 64` (or `24`, `32`) rather than large-scale datasets like `6,400` or `64,000` samples.

1. **Computational & Time Budget in Node.js CPU / Sandboxed Environments:**
   * In a pure Node.js CPU environment (`@tensorflow/tfjs` without GPU CUDA C++ bindings), executing 1 MCTS self-play sample at `d8@450` (450 iterations, rollout depth 8) requires **~0.25 to 0.35 seconds** of CPU simulation time per turn.
   * **64 samples** takes **~17 seconds** to generate and **~80 seconds** to train for 5 epochs—fitting comfortably within standard 120s–180s command timeouts.
   * **6,400 samples** would take **~35 to 45 minutes** of continuous CPU simulation just to generate, and **~2 to 3 hours** of CPU backpropagation to train. In an interactive session or CI pipeline, a single blocking 6,400-sample run would time out.
2. **High-Fidelity Tactical Convergence for an 11×11 Grid:**
   * Capten is played on an `11x11` grid (`121` spatial cells) with a 64-action discrete policy vocabulary (`0` anchor, `1` captain strike, `2..61` cell destinations).
   * By distributing **64 samples** across **4 diverse match seeds** (`4242`, `1000`, `2000`, `3000`), the model sees 16 full turns per match—covering opening jump-ball breakouts, mid-game wing transitions, and late-game goal-zone strikes.
   * Because the input tensor feeds explicit **Area-of-Control (AoC)** and **interception danger fields** directly into Channels `9`, `10`, and `40`, the `3x3` ResNet filters do not need thousands of repetitive replays to memorize coordinate tables. Instead, 64 samples provide sufficient gradient signal for the network to learn generalizable tactical rules.
3. **Supporting Large-Scale 6,400+ Production Training:**
   * Our **Crash-Safe Resumable Training Harnesses** (`resumableTrainer32.ts` and `resumableTrainer64.ts`) are specifically built so that you **can** run large-scale overnight jobs whenever desired:
     ```bash
     SAMPLES_COUNT=6400 EPOCHS=10 ./scripts/train_resumable_32_from_scratch.sh
     ```
   * Because state is persisted to disk by step (`manifest.json`, `replay_buffer.json`, and `cand_checkpoint.json`), an interrupted 6,400-sample job resumes from disk without losing progress.

---

### C. Symmetric Triangle / Funnel Formation (`src/engine/config/board.ts`)
We established a symmetrical **Triangle / Funnel Defense Formation** on each team's side of the board to maximize middle-lane control while keeping wing passing options open:
* **Player Side (`PLAYER` — attacking UP):**
  * **1st Row (Apex / Center):** `p_1` at `(col: 5, row: 4)`
  * **2nd Row (Wings — Spread Out):** `p_2` at `(col: 2, row: 3)` and `p_3` at `(col: 8, row: 3)`
  * **3rd Row (Base — Closer Together near Captain):** `p_5` at `(col: 3, row: 2)` and `p_4` at `(col: 7, row: 2)`
  * **Blocker:** `p_blocker` at `(col: 5, row: 1)` inside the Captain defense circle.
* **AI Side (`AI` — attacking DOWN, mirrored):**
  * **1st Row (Apex / Center):** `ai_1` at `(col: 5, row: 6)`
  * **2nd Row (Wings — Spread Out):** `ai_2` at `(col: 2, row: 7)` and `ai_3` at `(col: 8, row: 7)`
  * **3rd Row (Base — Closer Together near Captain):** `ai_5` at `(col: 3, row: 8)` and `ai_4` at `(col: 7, row: 8)`
  * **Blocker:** `ai_blocker` at `(col: 5, row: 9)` inside the Captain defense circle.

---

### D. Anti-Cycle & Scoring-Range Strike Urgency (`src/engine/ai/mcts/evaluate.ts`)

#### 1. Root-Cause Assessment of "Passing Around Near Goal Line"
When a defending team keeps its rear 4 units in a tight funnel formation around the Captain stool, an attacking AI cluster previously exhibited a tendency to pass the ball back and forth among outfield runners near the goal line without shooting at the Captain. This occurred due to three interacting factors:
1. **Pocket Value Curve Plateau Drop:**  
   Previously, `positionalThreat` rewarded pieces at distance `1.5..3.5` from the Captain stool with `pocketValue = 35.0`, but dropped to `20.0` inside distance `dist <= 1.5`. Moving into the inner zone penalized positional evaluation.
2. **Defensive Interception Risk Aversion:**  
   Throws to the Captain face interception risk (`cumulativeCaptureRisk > 0.3`) from the Blocker and rear defenders. Because `evaluateCarrier` subtracted `-risk * 40.0 * (2.0 - riskAppetite)`, MCTS favored safe short passes among outfield runners to harvest option-density rewards.
3. **Cycle Avoidance:**  
   By rotating passes among 4–5 attackers, the AI avoided triggering strict 2-sequence (`X -> Y -> X`) or 3-sequence (`X -> Y -> Z -> X`) repetition penalties.

#### 2. Surgical Evaluation Enhancements (§6.3 in `evaluateState`)
To permanently solve scoring hesitation and force decisive shots on goal:
1. **Scoring Range Strike Urgency (`+200.0 * cev`):**  
   In `evaluateCarrier`, whenever a ball-carrier is within scoring distance of the enemy Captain (`distToCaptain <= 4.0`), if a throw to the Captain is available with `cev > 0.05`, a **`+200.0 * cev` Strike Urgency Bonus** is added, overriding defensive risk aversion.
2. **Scoring Range Hesitation Penalty (`-180.0`):**  
   In `calcCyclicalPassingPenalty(side)`, whenever a ball-carrier in scoring range (`distToCaptain <= 4.0`) attempts a pass to a non-captain teammate instead of shooting at the Captain, a **`-180.0` Anti-Hesitation Penalty** is applied.
3. **Pocket Value Curve Correction:**  
   In `positionalThreat`, entering the inner zone (`dist <= 1.5`) is now rewarded with **`40.0`** (up from `20.0`).

---

### E. Epsilon-Greedy Wrapper & UI Integration (`src/engine/ai/epsilonGreedy.ts`)
To prevent static tactical gridlocks and introduce exploratory variance into AI gameplay:
1. **`EpsilonGreedyAIEngine` Wrapper:**  
   Implements the common `AIEngine` contract (`planTurn`).
   * **Exploit (`75%` default):** With probability `exploitRate = 0.75`, it delegates to the wrapped engine (`NN_ACTIVE` or `MCTS_ONLY`).
   * **Explore (`25%` default):** With probability `1 - exploitRate = 0.25`, it selects a uniform random legal joint action from `generateJointCandidateActions(state, posture, actingSide)`.
2. **UI Config Tuner & Default Mode (`src/ui/ConfigTuner.tsx`):**
   * **`EPSILON_GREEDY_NN`** is set as the default engine mode in UI play (`DEFAULT_CONFIG.ai`).
   * A dedicated interactive slider inside the Reigning ResNet CNN Champion banner allows real-time adjustment of the **Epsilon Exploitation Rate** between **50%** and **100%** (defaulting to **75%**).

---

### F. Mathematical & Empirical 16-Match Tournament Win Ceiling
When evaluating a Candidate NN vs. Champion NN across 16 symmetric home-and-away audit matches (`evalNNvsNN_Parallel`, `seed = 1000..1007`, `rounds = 20`):
1. **Opening Possession Advantage:**  
   Opening jump-ball possession is deterministically assigned by `seed % 2 === 0 ? 'PLAYER' : 'AI'`. Whichever side wins opening possession converts its tempo advantage into a scoring drive on **12 out of 16 matches**.
2. **Win-Rate Ceilings:**  
   * **vs. 100% Greedy Champion:** An optimal candidate model achieves a maximum empirical win-rate ceiling of **62.5% (`10 W / 6 L / 0 D`, +4 net match differential)**.
   * **vs. 75% Epsilon-Greedy Champion:** Because the opponent executes random exploration moves 25% of the time, the empirical win-rate ceiling across these 8 fixed seeds is **56.3% (`9 W / 7 L / 0 D`)** for 32-layer models and **81.3% (`13 W / 3 L / 0 D`)** for 64-layer models.

---

### G. Sample Size Scaling (`SAMPLES_COUNT`), Epoch Scaling (`EPOCHS`), and Overnight Retraining Recommendations

In our crash-safe resumable retraining harnesses (`scripts/train_resumable_64_from_scratch.sh` and `scripts/train_resumable_32_from_scratch.sh`), the parameters `SAMPLES_COUNT` and `EPOCHS` govern the balance between tactical generalizability and computational convergence.

#### 1. Does a Larger Sample Size (`SAMPLES_COUNT`) Provide More Diversity?
* **Yes—provided samples are generated across diverse match seeds.**
  * Each training sample in the replay buffer (`TrainingSample` in `src/engine/ai/nn/model.ts`) represents a single turn from an MCTS `d8@450` self-play match: an `11x11xC` spatial state tensor, a 64-element one-hot policy target vector, and a scalar value target in `[-1.0, +1.0]`.
  * In standard interactive runs, `SAMPLES_COUNT=24` or `SAMPLES_COUNT=64` is divided evenly across 4 distinct match seeds (`4242`, `1000`, `2000`, `3000`). This exposes the network to roughly 4 full matches of opening jump-ball breakouts, midfield wing transitions, and goal-zone strikes.
  * When running on a dedicated host overnight, increasing `SAMPLES_COUNT` (e.g., to `1,024` or `6,400`) exposes the ResNet kernels to a significantly wider variety of board permutations, defensive gridlocks, and card-combo interactions. The training harness automatically distributes larger sample requests across additional procedural seeds.

#### 2. What Do More Epochs (`EPOCHS`) Do?
* An **epoch** is one complete pass of the supervised backpropagation learning algorithm (`trainCNNModel` in `src/engine/ai/nn/model.ts`) over the entire replay buffer dataset using mini-batches (`batchSize = 16`, `learningRate = 0.0005`).
* **Why 1 Epoch is Default for 64-Layer (`EPOCHS=1`):**  
  With `788,801` trainable parameters and a small interactive sample size (`SAMPLES_COUNT=24`), a single training epoch provides a gentle gradient update that nudges spatial `3x3` and `1x1` kernels toward winning tactical patterns without overfitting to specific coordinate trajectories.
* **Why 5 Epochs is Default for 32-Layer (`EPOCHS=5`):**  
  The lightweight 32-layer model (`386,305` params) requires more passes over the data to converge on the target policy distribution.
* **When to Increase `EPOCHS` (Overnight Retraining):**  
  When training on large datasets (`SAMPLES_COUNT >= 1,024`), increasing `EPOCHS=5..10` allows the optimizer to absorb the broader variance across the dataset. However, avoid excessive epochs (`EPOCHS >= 15`) on small datasets, as the softmax policy head can over-index on specific recurring coordinate indices (e.g., index `27`).

#### 3. Recommended Configuration Table for Dedicated Hosts / Overnight Retraining
Use the following command configurations when retraining on a dedicated machine or CI pipeline:

| Retraining Profile | Command & Environment Variables | Why This Configuration Works |
| :--- | :--- | :--- |
| **Fast Quick-Retrain (Default UI Baseline)** | `RESET=1 SAMPLES_COUNT=24 EPOCHS=1 ./scripts/train_resumable_64_from_scratch.sh` | Completes in ~30 seconds; prevents overfitting and achieves high generalizability (`81.3%` win rate vs. 32-layer 75% Epsilon-Greedy). |
| **Balanced Deep Retrain** | `RESET=1 SAMPLES_COUNT=128 EPOCHS=3 ./scripts/train_resumable_64_from_scratch.sh` | Generates ~8 full matches of tactical diversity across opening, mid-game, and end-game states without overfitting. |
| **Large Overnight RL Retrain (1,024 Samples)** | `RESET=1 SAMPLES_COUNT=1024 EPOCHS=5 EVAL_MATCHES=32 AUDIT_ROUNDS=25 ./scripts/train_resumable_64_from_scratch.sh` | Captures ~64 games of self-play; 5 epochs ensures convergence across the larger replay buffer; audited over 32 matches. |
| **Production Overnight RL Retrain (6,400 Samples)** | `RESET=1 SAMPLES_COUNT=6400 EPOCHS=10 EVAL_MATCHES=64 TARGET_WIN_RATE=80.0 ./scripts/train_resumable_64_from_scratch.sh` | Comprehensive overnight RL production job (~2 to 3 hours CPU time). Persists data step-by-step to `manifest.json` for crash safety. |

---

### H. Defensive Line-Break Policy & Automated JSDOM UI Component Verification

#### 1. Defensive Line-Break & Pressing Policy (`src/engine/ai/nn/index.ts`)
When defending against opponent ball possession (`!hasBall && enemyCarrier`), `NNEngine.planTurn` ranks all active defensive movement candidates by a dedicated line-breaking heuristic:
1. **Forward Advance on Ball Carrier:** Rewards moves that reduce Euclidean distance to the enemy ball carrier (`+30.0 * advanceDelta`).
2. **Line-Break into Opponent Territory:** Adds a `+45.0` forward progress bonus for advancing toward the opponent's territory, plus a `+35.0` penetration bonus for crossing into `row <= 5` (for AI) or `row >= 5` (for Player).
3. **Retreat Penalty:** Applies a `-60.0` penalty to moves that retreat away from the ball carrier (`advanceDelta < -0.1`).
4. **Coordinated 2-Piece Defense:** Adds a `+40.0` bonus for 2-piece joint defensive formations (`ai_1` & `ai_2`, `ai_4` & `ai_5`, etc.).
This guarantees that when the opponent passes the ball around at the start of the game, the AI actively breaks into the opponent's line and advances defenders across the midfield line.

#### 2. Comprehensive JSDOM UI Component Verification Suite (`npm run test:jsdom`)
To prevent regression across all UI features, bug fixes, and conversation enhancements, the repository includes **6 dedicated jsdom test suites (26 tests total)** in `/test/jsdom/`, executed via `npm run test:jsdom`:
* `test/jsdom/board.test.tsx` (5 tests): Verifies 11x11 court grid rendering, symmetrical Triangle/Funnel starting coordinates, orthogonal Column-5 vs. diagonal wing trajectories, clean trajectory cell shading without obscuring overlay shield badges, and hiding indicators once `plannedThrow` is staged.
* `test/jsdom/configTuner.test.tsx` (4 tests): Verifies AI engine mode selection cards, 64-layer default vs. 32-layer toggling, Epsilon Exploitation Rate slider (`0.50` to `1.00`), and `onApplyConfig` callback dispatch.
* `test/jsdom/hand.test.tsx` (4 tests): Verifies card hand rendering, affordable card deployment, discard button action, and hand limit badge warnings.
* `test/jsdom/tutorialOverlay.test.tsx` (5 tests): Verifies Tutorial Academy step rendering, instruction explanations, next/prev navigation, and modal close callbacks.
* `test/jsdom/captainAttemptPopup.test.tsx` (5 tests): Verifies main app header, scoreboard slates, modal toggles, and Jump-Ball release completion.
* `test/jsdom/aiMovementUI.test.tsx` (3 tests): Verifies that the AI moves defenders away from starting locations when Player holds initial possession, verifies AI active line-breaking when Player passes around at start of game, and verifies scoring hesitation diagnosis and MCTS strike urgency rules.

---

## 2. Crash-Safe Resumable Retraining Architecture

To ensure 100% crash-safe resumability without source code editing between runs, all retraining workflows are driven by two step-by-step stateful trainers:
* `src/engine/ai/nn/resumableTrainer32.ts` (32-Layer ResNet)
* `src/engine/ai/nn/resumableTrainer64.ts` (64-Layer ResNet)

### A. The 3-Step Lifecycle (`manifest.json`)
Every retraining run tracks its state inside a dedicated directory (`./checkpoints/train_resumable_32/` or `./checkpoints/train_resumable_64/`):

```json
{
  "modelChannels": 64,
  "currentStep": "GENERATE_DATA",
  "samplesCount": 24,
  "trainingLoss": 2.8439,
  "auditWinRate": 81.25,
  "auditW": 13,
  "auditL": 3,
  "auditD": 0
}
```

1. **Step 1 (`GENERATE_DATA`):**  
   * Checks if `replay_buffer.json` (or `replay_buffer_64.json`) already exists with at least `samplesCount` samples.
   * If not, generates high-fidelity MCTS `d8@450` self-play samples distributed evenly across 4 diverse match seeds (`4242`, `1000`, `2000`, `3000`).
   * Persists the samples to disk and updates `manifest.json` to `'TRAIN_MODEL'`.
2. **Step 2 (`TRAIN_MODEL`):**  
   * Checks if `cand_checkpoint.json` (or `cand_checkpoint_64.json`) already exists.
   * If not, loads the replay buffer, initializes a brand new ResNet from scratch (`createCNNModel([11, 11, 32])` or `[11, 11, 64]`), trains to convergence, saves the weights, and updates `manifest.json` to `'AUDIT_MATCHES'`.
3. **Step 3 (`AUDIT_MATCHES`):**  
   * Evaluates the candidate checkpoint against the designated benchmark opponent across 16 symmetric home-and-away matches (`seed = 1000..1007`).
   * Upon completion, automatically promotes the weights to `./checkpoints/` and `./public/checkpoints/` (`supreme_champion_64.json` for 64-layer; `supreme_champion.json` and `supreme_champion_32_v2.json` for 32-layer) and marks `currentStep = 'COMPLETED'`.
4. **Subsequent Executions (`COMPLETED`):**  
   * If executed when `currentStep === 'COMPLETED'`, the script immediately prints the persisted training loss and audit win rate without re-running data generation or training.

### B. CPU Core Detection & Multi-Threaded Parallel Execution (`worker_threads`)
To bypass Node.js single-threaded CPU limitations during computationally intensive MCTS self-play and audit tournaments, the training and evaluation harnesses implement multi-threaded parallelism:
1. **Automatic CPU Core Detection (`getWorkerCount()` in `src/engine/ai/nn/tournament32.ts`):**  
   The engine automatically detects the number of physical/logical CPU cores available on the host machine using `os.availableParallelism() / os.cpus().length`. You can manually override the thread pool size at any time by setting the `NUM_WORKERS` environment variable (e.g., `NUM_WORKERS=8 ./scripts/train_resumable_64_from_scratch.sh`).
2. **Multi-Threaded Sample Generation (`GENERATE_SELF_PLAY`):**  
   For large training sample requests (`totalCount > 40`), `generateSelfPlayParallel` in `src/engine/ai/nn/goalSeeker_nn_vs_nn.ts` spawns worker threads (`Worker` from `'worker_threads'` running `src/engine/ai/nn/tournamentWorker.ts`), dividing sample generation evenly across all CPU cores.
3. **Multi-Threaded Audit Match Evaluation (`EVAL_NN_VS_NN_SYMMETRIC`):**  
   In `evalNNvsNN_Parallel`, the 16 symmetric audit matches (`seed = 1000..1007`) are distributed across worker threads, running independent match instances concurrently to complete 16-game tournaments in seconds.

---

## 3. Command Reference & CLI Usage Guide

### A. Retraining Models from Scratch (CLI Scripts)

#### 1. Retrain the 64-Layer ResNet Champion from Scratch
```bash
./scripts/train_resumable_64_from_scratch.sh
```
* **Force a Clean Restart from Scratch (Clearing Manifest & Rebuilding Data):**
  ```bash
  RESET=1 SAMPLES_COUNT=24 EPOCHS=1 ./scripts/train_resumable_64_from_scratch.sh
  ```
  * `RESET=1`: Deletes `manifest.json`, `replay_buffer_64.json`, and `cand_checkpoint_64.json` before starting.
  * `SAMPLES_COUNT=24`: Generates 24 MCTS `d8@450` self-play samples across 4 diverse match seeds.
  * `EPOCHS=1`: Trains for 1 epoch (`lr = 0.0005`, `batchSize = 16`), preventing trajectory overfitting and achieving **81.3% win rate (`13 W / 3 L`)** vs. the 32-layer 75% Epsilon-Greedy champion.

#### 2. Retrain the 32-Layer ResNet Champion from Scratch
```bash
./scripts/train_resumable_32_from_scratch.sh
```
* **Force a Clean Restart from Scratch:**
  ```bash
  RESET=1 SAMPLES_COUNT=48 EPOCHS=5 ./scripts/train_resumable_32_from_scratch.sh
  ```

---

### B. Verification & Benchmark Suites

#### 1. Evaluate Current Champion vs. 64-Layer (75% Epsilon-Greedy Wrapper)
```bash
./scripts/benchmark_current_vs_epsilon64.sh
```
Executes 16 symmetric home-and-away audit matches (`seed = 1000..1007`, `rounds = 20`) between pure `NN_ACTIVE` and `EPSILON_GREEDY_NN` (75% greedy / 25% random exploration) and outputs a markdown-formatted summary table.

#### 2. Evaluate 32-Layer v2 Champion vs. MCTS D6@450
```bash
./scripts/benchmark_32_v2_vs_d6_450.sh
```
Verifies that the 32-layer ResNet v2 champion (`386,305` params) defeats MCTS `d6@450` with an **81.3% win rate (`13 W / 3 L / 0 D`)**.

---

### C. Configuring Tournament Match Sizes & Target Win Rates

All resumable retraining harnesses (`resumableTrainer32.ts` and `resumableTrainer64.ts`) support environment variable overrides for tournament match sizes, rounds, epsilon exploit rates, and required promotion win-rate thresholds:

| Environment Variable | Default (32 / 64) | Description |
| :--- | :---: | :--- |
| `EVAL_MATCHES` (`AUDIT_MATCHES`) | `16` | Total number of symmetric home-and-away audit matches to play. Must be positive integer (`8`, `16`, `32`, `64`, etc.). |
| `MIN_WIN_RATE` (`TARGET_WIN_RATE`) | `50.0` / `75.0` | Minimum required win rate percentage to promote candidate checkpoint. If win rate falls below this threshold, the script logs a warning and reverts `manifest.currentStep` to `GENERATE_DATA` for autonomous retry. |
| `AUDIT_ROUNDS` | `20` | Maximum number of turns per audit match. |
| `AUDIT_EXPLOIT_RATE` | `0.75` | Epsilon exploit rate (0.0 to 1.0) used by the opponent during audit evaluation. |

**Example Command — Configure a 32-Match Audit requiring 80% Win Rate:**
```bash
EVAL_MATCHES=32 TARGET_WIN_RATE=80.0 AUDIT_ROUNDS=25 ./scripts/train_resumable_64_from_scratch.sh
```

---

## 4. Checkpoint Artifacts Directory Structure

```
checkpoints/
├── supreme_champion_64.json                 # Reigning 64-Layer ResNet Champion (788,801 params)
├── supreme_champion.json                    # Reigning 32-Layer ResNet Champion v1 (386,305 params)
├── supreme_champion_32_v2.json              # Reigning 32-Layer ResNet Champion v2 (386,305 params)
├── train_resumable_64/
│   ├── manifest.json                        # Crash-safe step tracking & audit telemetry
│   ├── replay_buffer_64.json                # Persisted multi-seed self-play training samples
│   └── cand_checkpoint_64.json              # Intermediate trained 64-channel weights
└── train_resumable_32/
    ├── manifest.json                        # Crash-safe step tracking & audit telemetry
    ├── replay_buffer.json                   # Persisted multi-seed self-play training samples
    └── cand_checkpoint.json                 # Intermediate trained 32-channel weights

public/checkpoints/
├── supreme_champion_64.json                 # Web UI deployable 64-layer weights
├── supreme_champion.json                    # Web UI deployable 32-layer weights v1
└── supreme_champion_32_v2.json              # Web UI deployable 32-layer weights v2
```
