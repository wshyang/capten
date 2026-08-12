#!/usr/bin/env bash
set -eo pipefail

echo "═══════════════════════════════════════════════════════════════════════════════════════"
echo " RUNNING BENCHMARK: CURRENT 32-v2 CHAMPION vs. 64-LAYER (85% EPSILON-GREEDY WRAPPER)"
echo "═══════════════════════════════════════════════════════════════════════════════════════"

npx tsx scripts/benchmark_current_vs_epsilon64.ts
