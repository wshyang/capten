#!/usr/bin/env bash
#
# scripts/train_single_goal_d4_450.sh — Standalone Goal-Seeking Single Model Training Flywheel
#
# DESCRIPTION:
#   This autonomous script executes a single-model curriculum flywheel loop to verifiably
#   defeat the d4@450 MCTS baseline (450 iterations, depth 4) at >= 75% win rate across
#   16 symmetric home-and-away audit matches (p < 0.05 exact binomial statistical proof).
#   It does NOT spawn a 32-instance population; instead, it focuses on evolving one
#   single 32-channel ResNet CNN weight using an accumulating replay buffer of high-quality
#   d4@450 teacher experience.
#
# CONFIGURABLE PARAMETERS:
#   CHECKPOINT_DIR     Directory to persist model checkpoints & replay buffer (default: ./checkpoints/goal_seeker_450)
#   TARGET_WIN_RATE    Target win rate percentage vs baseline (default: 75)
#   EVAL_MATCHES       Number of evaluation matches for statistical significance (default: 16)
#   TOURNAMENT_ROUNDS  Turns per match game for evaluation (default: 12)
#   MCTS_ITERS         MCTS iterations for self-play data and baseline target (default: 450)
#   MCTS_DEPTH         Lookahead rollout depth for MCTS (default: 4)
#   SAMPLES_PER_GEN    Number of self-play training samples generated per generation (default: 6)
#   EPOCHS_PER_GEN     Training epochs per generation on accumulating replay buffer (default: 4)
#   MAX_GENERATIONS    Max flywheel generations before returning (default: 10)
#   REPLAY_WINDOW_SIZE Max sliding window size for accumulated replay buffer (default: 100)
#

set -euo pipefail

export CHECKPOINT_DIR="${CHECKPOINT_DIR:-./checkpoints/goal_seeker_450}"
export TARGET_WIN_RATE="${TARGET_WIN_RATE:-75}"
export EVAL_MATCHES="${EVAL_MATCHES:-16}"
export TOURNAMENT_ROUNDS="${TOURNAMENT_ROUNDS:-20}"
export MCTS_ITERS="${MCTS_ITERS:-450}"
export MCTS_DEPTH="${MCTS_DEPTH:-4}"
export SAMPLES_PER_GEN="${SAMPLES_PER_GEN:-20}"
export EPOCHS_PER_GEN="${EPOCHS_PER_GEN:-6}"
export MAX_GENERATIONS="${MAX_GENERATIONS:-10}"
export REPLAY_WINDOW_SIZE="${REPLAY_WINDOW_SIZE:-160}"

# Detect available CPU cores (respecting container/cgroup limits)
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
echo " CAPTEN GOAL-SEEKING SINGLE MODEL FLYWHEEL — TARGETING d4@${MCTS_ITERS}"
echo "═══════════════════════════════════════════════════════════════════════════════════════"
echo " • Checkpoint Dir:    ${CHECKPOINT_DIR}"
echo " • Worker Threads:    ${NUM_WORKERS} parallel CPU cores detected"
echo " • Target Objective:  Win rate >= ${TARGET_WIN_RATE}% vs d4@${MCTS_ITERS} across ${EVAL_MATCHES} matches (${STAT_NOTE})"
echo " • Training Config:   ${SAMPLES_PER_GEN} samples/gen, ${EPOCHS_PER_GEN} epochs/gen, replay cap=${REPLAY_WINDOW_SIZE}"
echo " • Max Generations:   ${MAX_GENERATIONS} generations"
echo "═══════════════════════════════════════════════════════════════════════════════════════"

mkdir -p "${CHECKPOINT_DIR}"

echo "[train_single_goal_d4_450.sh] Launching autonomous single-model goal-seeking runner..."
npx tsx src/engine/ai/nn/goalSeeker_d4_450.ts "$@"

echo "[train_single_goal_d4_450.sh] Flywheel execution finished."
echo "═══════════════════════════════════════════════════════════════════════════════════════"
