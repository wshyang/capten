#!/usr/bin/env bash
set -eo pipefail

echo "═══════════════════════════════════════════════════════════════════════════════════════"
echo " RUNNING CRASH-SAFE RESUMABLE HARNESS: TRAIN 32-LAYER RESNET FROM SCRATCH"
echo "═══════════════════════════════════════════════════════════════════════════════════════"

npx tsx src/engine/ai/nn/resumableTrainer32.ts
