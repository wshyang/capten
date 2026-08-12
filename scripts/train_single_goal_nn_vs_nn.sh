#!/usr/bin/env bash
#
# scripts/train_single_goal_nn_vs_nn.sh — Standalone Goal-Seeking NN vs. Supreme Champion Flywheel
#
# DESCRIPTION:
#   This autonomous script executes a single-model curriculum flywheel loop to verifiably
#   defeat the reigning Supreme Champion (checkpoints/supreme_champion.json) at >= 75% win rate
#   across 16 symmetric home-and-away audit matches (p < 0.05 exact binomial statistical proof).
#   It uses deep MCTS d6@450 teacher self-play to teach a new candidate ResNet CNN advanced
#   lane-denial and passing combinations that outperform the reigning Depth-4 champion.
#
# CONFIGURABLE PARAMETERS:
#   CHECKPOINT_DIR     Directory to persist model checkpoints & replay buffer (default: ./checkpoints/goal_seeker_nn_vs_nn)
#   CHAMPION_PATH      Path to benchmark Supreme Champion JSON (default: ./checkpoints/supreme_champion.json)
#   TARGET_WIN_RATE    Target win rate percentage vs champion (default: 75)
#   EVAL_MATCHES       Number of evaluation matches for statistical significance (default: 16)
#   TOURNAMENT_ROUNDS  Turns per match game for evaluation (default: 20)
#   MCTS_ITERS         MCTS iterations for teacher self-play data (default: 450)
#   MCTS_DEPTH         Lookahead rollout depth for teacher self-play data (default: 6)
#   SAMPLES_PER_GEN    Number of self-play training samples generated per generation (default: 24)
#   EPOCHS_PER_GEN     Training epochs per generation on accumulating replay buffer (default: 6)
#   MAX_GENERATIONS    Max flywheel generations before returning (default: 10)
#   REPLAY_WINDOW_SIZE Max sliding window size for accumulated replay buffer (default: 160)
#

set -euo pipefail

export CHECKPOINT_DIR="${CHECKPOINT_DIR:-./checkpoints/goal_seeker_nn_vs_nn}"
export CHAMPION_PATH="${CHAMPION_PATH:-./checkpoints/supreme_champion.json}"
export TARGET_WIN_RATE="${TARGET_WIN_RATE:-75}"
export EVAL_MATCHES="${EVAL_MATCHES:-16}"
export TOURNAMENT_ROUNDS="${TOURNAMENT_ROUNDS:-20}"
export MCTS_ITERS="${MCTS_ITERS:-450}"
export MCTS_DEPTH="${MCTS_DEPTH:-10}"
export SAMPLES_PER_GEN="${SAMPLES_PER_GEN:-24}"
export EPOCHS_PER_GEN="${EPOCHS_PER_GEN:-3}"
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
echo " CAPTEN GOAL-SEEKING NN vs. NN FLYWHEEL — TARGETING SUPREME CHAMPION"
echo "═══════════════════════════════════════════════════════════════════════════════════════"
echo " • Checkpoint Dir:    ${CHECKPOINT_DIR}"
echo " • Worker Threads:    ${NUM_WORKERS} parallel CPU cores detected"
echo " • Benchmark Target:  Supreme Champion (${CHAMPION_PATH})"
echo " • Target Objective:  Win rate >= ${TARGET_WIN_RATE}% vs Champion across ${EVAL_MATCHES} matches (${STAT_NOTE})"
echo " • Teacher Config:    MCTS d${MCTS_DEPTH}@${MCTS_ITERS} (${SAMPLES_PER_GEN} samples/gen, ${EPOCHS_PER_GEN} epochs/gen)"
echo " • Max Generations:   ${MAX_GENERATIONS} generations"
echo "═══════════════════════════════════════════════════════════════════════════════════════"

mkdir -p "${CHECKPOINT_DIR}"

echo "[train_single_goal_nn_vs_nn.sh] Launching autonomous NN vs NN goal-seeking runner..."
npx tsx src/engine/ai/nn/goalSeeker_nn_vs_nn.ts "$@"

echo "[train_single_goal_nn_vs_nn.sh] Flywheel execution finished."
echo "═══════════════════════════════════════════════════════════════════════════════════════"
