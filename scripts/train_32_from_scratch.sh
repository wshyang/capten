#!/usr/bin/env bash
set -eo pipefail

echo "═══════════════════════════════════════════════════════════════════════════════════════"
echo " RUNNING: TRAINING 32-LAYER RESNET FROM SCRATCH & EVALUATING VS 75% EPSILON-64"
echo "═══════════════════════════════════════════════════════════════════════════════════════"

npx tsx scripts/train_32_from_scratch.ts
