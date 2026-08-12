#!/usr/bin/env bash
set -eo pipefail

echo "═══════════════════════════════════════════════════════════════════════════════════════"
echo " RUNNING CRASH-SAFE RESUMABLE HARNESS: TRAIN 64-LAYER RESNET FROM SCRATCH"
echo " Backend: @tensorflow/tfjs-node (C++ libtensorflow)"
echo "═══════════════════════════════════════════════════════════════════════════════════════"
echo " SAMPLES_COUNT=${SAMPLES_COUNT:-12800}  EPOCHS=${EPOCHS:-20}  GAME_MAX_TURNS=${GAME_MAX_TURNS:-100}"
echo " EVAL_MATCHES=${EVAL_MATCHES:-64}  TARGET_WIN_RATE=${TARGET_WIN_RATE:-55.0}  MAX_RETRIES=${MAX_RETRIES:-10}"
echo " AUDIT_OPPONENT=${AUDIT_OPPONENT:-MCTS}  AUDIT_MCTS_ITERATIONS=${AUDIT_MCTS_ITERATIONS:-450}  AUDIT_MCTS_DEPTH=${AUDIT_MCTS_DEPTH:-8}"
echo "═══════════════════════════════════════════════════════════════════════════════════════"

export MAX_RETRIES="${MAX_RETRIES:-10}"
export GAME_MAX_TURNS="${GAME_MAX_TURNS:-100}"
export AUDIT_OPPONENT="${AUDIT_OPPONENT:-MCTS}"
export AUDIT_MCTS_ITERATIONS="${AUDIT_MCTS_ITERATIONS:-450}"
export AUDIT_MCTS_DEPTH="${AUDIT_MCTS_DEPTH:-8}"
export AUDIT_ROUNDS="${AUDIT_ROUNDS:-300}"
export SAMPLES_COUNT="${SAMPLES_COUNT:-12800}"
export EPOCHS="${EPOCHS:-20}"
export EVAL_MATCHES="${EVAL_MATCHES:-64}"
export TARGET_WIN_RATE="${TARGET_WIN_RATE:-55.0}"

npx tsx src/engine/ai/nn/resumableTrainer64.ts
