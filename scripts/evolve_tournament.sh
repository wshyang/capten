#!/usr/bin/env bash
#
# scripts/evolve_tournament.sh — Standalone Autonomous Capten 32-Instance Evolutionary Tournament
#
# DESCRIPTION:
#   This autonomous script orchestrates a 3-phase evolutionary tournament:
#   1) Trains a base 32-channel ResNet CNN weight from scratch to beat the d4@50 MCTS baseline at 75% / 16 matches.
#   2) Trains up 32 independent instances of these weights in the pool, verifying each wins d4@50 at 75% / 16 matches.
#   3) Conducts an evolutionary tournament where these 32 instances compete and mutate until a
#      Reigning Champion model emerges that meets the 75% / 16 matches metric against both the pool and d4@50.
#
# CONFIGURABLE PARAMETERS (environment variables with default fallbacks):
#   CHECKPOINT_DIR     Directory to persist model checkpoints & manifest (default: ./checkpoints/tournament_32)
#   POPULATION_SIZE    Number of independent instances in tournament cohort (default: 32)
#   TOURNAMENT_ROUNDS  Turns per match game for evaluation (default: 12)
#   MCTS_ITERS         MCTS iterations for self-play dataset generation (default: 50)
#   MCTS_DEPTH         Lookahead rollout depth for MCTS self-play data (default: 4)
#   TARGET_WIN_RATE    Target win rate percentage vs baseline & pool (default: 75)
#   EVAL_MATCHES       Number of evaluation matches for statistical significance (default: 16)
#   BASE_SAMPLES       Number of self-play samples for Phase 1 base model (default: 8)
#   BASE_EPOCHS        Epochs for Phase 1 base model training (default: 5)
#   INST_SAMPLES       Number of bootstrap self-play samples per instance (default: 4)
#   INST_EPOCHS        Epochs for Phase 2 individual instance training (default: 3)
#   MAX_GENERATIONS    Max evolutionary tournament generations in Phase 3 (default: 15)
#

set -euo pipefail

# Set default configuration values if not exported by user
export CHECKPOINT_DIR="${CHECKPOINT_DIR:-./checkpoints/tournament_32}"
export POPULATION_SIZE="${POPULATION_SIZE:-32}"
export TOURNAMENT_ROUNDS="${TOURNAMENT_ROUNDS:-12}"
export MCTS_ITERS="${MCTS_ITERS:-50}"
export MCTS_DEPTH="${MCTS_DEPTH:-4}"
export TARGET_WIN_RATE="${TARGET_WIN_RATE:-75}"
export EVAL_MATCHES="${EVAL_MATCHES:-16}"
export BASE_SAMPLES="${BASE_SAMPLES:-8}"
export BASE_EPOCHS="${BASE_EPOCHS:-5}"
export INST_SAMPLES="${INST_SAMPLES:-4}"
export INST_EPOCHS="${INST_EPOCHS:-3}"
export MAX_GENERATIONS="${MAX_GENERATIONS:-15}"

# Detect available CPU cores (respecting container/cgroup limits), fallback to os.cpus().length
export NUM_WORKERS="${NUM_WORKERS:-$(node -e 'const os = require("os"); console.log(os.availableParallelism ? os.availableParallelism() : os.cpus().length)')}"

STAT_NOTE="fast test mode, not statistically significant at p<0.05"
if [ "${EVAL_MATCHES}" -ge 32 ]; then
  STAT_NOTE="statistically significant at p=0.003 < 0.01, >90% power"
elif [ "${EVAL_MATCHES}" -ge 24 ]; then
  STAT_NOTE="statistically significant at p=0.011 < 0.05, 80% power"
elif [ "${EVAL_MATCHES}" -ge 16 ]; then
  STAT_NOTE="statistically significant at p=0.038 < 0.05 exact binomial test"
fi

echo "═══════════════════════════════════════════════════════════════════════════════════════"
echo " CAPTEN AUTONOMOUS 32-INSTANCE EVOLUTIONARY TOURNAMENT — STANDALONE SCRIPT"
echo "═══════════════════════════════════════════════════════════════════════════════════════"
echo " • Checkpoint Dir:    ${CHECKPOINT_DIR}"
echo " • Population Size:   ${POPULATION_SIZE} instances"
echo " • Worker Threads:    ${NUM_WORKERS} parallel CPU cores detected"
echo " • Tournament Turns:  ${TOURNAMENT_ROUNDS} turns/game"
echo " • MCTS Config:       iters=${MCTS_ITERS}, depth=${MCTS_DEPTH}"
echo " • Target Win Rate:   ${TARGET_WIN_RATE}% across ${EVAL_MATCHES} matches (${STAT_NOTE})"
echo " • Phase 1 Base:      samples=${BASE_SAMPLES}, epochs=${BASE_EPOCHS}"
echo " • Phase 2 Instances: samples=${INST_SAMPLES}, epochs=${INST_EPOCHS}"
echo " • Phase 3 Max Gens:  ${MAX_GENERATIONS} generations"
echo "═══════════════════════════════════════════════════════════════════════════════════════"

# Ensure target checkpoint directory exists
mkdir -p "${CHECKPOINT_DIR}"

# Execute autonomous TypeScript runner using npx tsx
echo "[evolve_tournament.sh] Launching standalone tournament pipeline..."
npx tsx src/engine/ai/nn/tournament32.ts "$@"

echo "[evolve_tournament.sh] Pipeline execution completed successfully."
echo "═══════════════════════════════════════════════════════════════════════════════════════"
