#!/usr/bin/env bash
set -eo pipefail

echo "═══════════════════════════════════════════════════════════════════════════════════════"
echo " RUNNING CRASH-SAFE RESUMABLE HARNESS: TRAIN 64-LAYER RESNET FROM SCRATCH"
echo "═══════════════════════════════════════════════════════════════════════════════════════"

npx tsx src/engine/ai/nn/resumableTrainer64.ts
