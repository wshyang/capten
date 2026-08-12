#!/usr/bin/env bash
#
# scripts/benchmark_deep_mcts.sh — Standalone Benchmark of Reigning ResNet CNN vs Deep MCTS (d8@450 & d10@450)
#
set -euo pipefail

export NUM_WORKERS="${NUM_WORKERS:-$(node -e 'const os = require("os"); console.log(os.availableParallelism ? os.availableParallelism() : os.cpus().length)')}"

npx tsx scripts/benchmark_supreme_vs_deep_mcts.ts "$@"
