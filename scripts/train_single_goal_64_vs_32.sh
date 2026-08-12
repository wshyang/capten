#!/usr/bin/env bash
#
# scripts/train_single_goal_64_vs_32.sh — Standalone Goal-Seeking 64-Channel vs. 32-Channel Champion Flywheel
#
# DESCRIPTION:
#   This autonomous script executes a single-model curriculum flywheel loop to train and evaluate
#   a 64-Channel Residual ConvNet (788,801 parameters, promoted from reigning 32-channel champion)
#   against the reigning 32-Channel Supreme Champion (checkpoints/supreme_champion.json, 386,305 parameters)
#   across 16 symmetric home-and-away audit matches with full sub-generation crash-safe checkpointing.
#
# CONFIGURABLE PARAMETERS:
#   CHECKPOINT_DIR     Directory to persist model checkpoints & replay buffer (default: ./checkpoints/goal_seeker_64_vs_32)
#   CHAMPION_PATH      Path to benchmark Supreme Champion JSON (default: ./checkpoints/supreme_champion.json)
#   TARGET_WIN_RATE    Target win rate percentage vs champion (default: 75)
#   EVAL_MATCHES       Number of evaluation matches for statistical significance (default: 16)
#   TOURNAMENT_ROUNDS  Turns per match game for evaluation (default: 20)
#   MCTS_ITERS         MCTS iterations for teacher self-play data (default: 450)
#   MCTS_DEPTH         Lookahead rollout depth for teacher self-play data (default: 10)
#   SAMPLES_PER_GEN    Number of self-play training samples generated per generation (default: 24)
#   EPOCHS_PER_GEN     Training epochs per generation on accumulating replay buffer (default: 3)
#   MAX_GENERATIONS    Max flywheel generations before returning (default: 10)
#   REPLAY_WINDOW_SIZE Max sliding window size for accumulated replay buffer (default: 120)
#

set -euo pipefail

export CHECKPOINT_DIR="${CHECKPOINT_DIR:-./checkpoints/goal_seeker_64_vs_32}"
export CHAMPION_PATH="${CHAMPION_PATH:-./checkpoints/supreme_champion.json}"
export TARGET_WIN_RATE="${TARGET_WIN_RATE:-75}"
export EVAL_MATCHES="${EVAL_MATCHES:-16}"
export TOURNAMENT_ROUNDS="${TOURNAMENT_ROUNDS:-20}"
export MCTS_ITERS="${MCTS_ITERS:-450}"
export MCTS_DEPTH="${MCTS_DEPTH:-10}"
export SAMPLES_PER_GEN="${SAMPLES_PER_GEN:-24}"
export EPOCHS_PER_GEN="${EPOCHS_PER_GEN:-1}"
export MAX_GENERATIONS="${MAX_GENERATIONS:-10}"
export REPLAY_WINDOW_SIZE="${REPLAY_WINDOW_SIZE:-120}"

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
echo " CAPTEN GOAL-SEEKING 64-CHANNEL vs. 32-CHANNEL FLYWHEEL — TARGETING SUPREME CHAMPION"
echo "═══════════════════════════════════════════════════════════════════════════════════════"
echo " • Checkpoint Dir:    ${CHECKPOINT_DIR}"
echo " • Worker Threads:    ${NUM_WORKERS} parallel CPU cores detected"
echo " • Benchmark Target:  32-Channel Supreme Champion (${CHAMPION_PATH})"
echo " • Target Objective:  Win rate >= ${TARGET_WIN_RATE}% vs Champion across ${EVAL_MATCHES} matches (${STAT_NOTE})"
echo " • Teacher Config:    64-channel MCTS d${MCTS_DEPTH}@${MCTS_ITERS} (${SAMPLES_PER_GEN} samples/gen, ${EPOCHS_PER_GEN} epochs/gen)"
echo " • Max Generations:   ${MAX_GENERATIONS} generations"
echo "═══════════════════════════════════════════════════════════════════════════════════════"

mkdir -p "${CHECKPOINT_DIR}"

echo "[train_single_goal_64_vs_32.sh] Launching autonomous 64 vs 32 goal-seeking runner..."
npx tsx src/engine/ai/nn/goalSeeker_64_vs_32.ts "$@"

echo "[train_single_goal_64_vs_32.sh] Flywheel execution finished."
echo "═══════════════════════════════════════════════════════════════════════════════════════"
