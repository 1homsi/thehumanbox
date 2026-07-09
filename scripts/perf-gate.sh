#!/usr/bin/env bash
set -euo pipefail

# Deterministic multi-seed regression gate. Keep this separate from the
# profiler itself so contributors can reproduce the exact CI budget locally.
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
BIN=${HEADLESS_BIN:-"$ROOT/simulation/target/release/headless"}
TICKS=${TICKS:-8000}
PROFILE_EVERY=${PROFILE_EVERY:-100}
MAX_TICK_MS=${MAX_TICK_MS:-80}
SEEDS=${SEEDS:-"42 1337 2026"}
TMPDIR=${TMPDIR:-/tmp}/thehumanbox-perf-$$
mkdir -p "$TMPDIR"
trap 'rm -rf "$TMPDIR"' EXIT

if [[ ! -x "$BIN" ]]; then
  echo "missing headless binary: $BIN" >&2
  exit 2
fi

for seed in $SEEDS; do
  profile="$TMPDIR/$seed.csv"
  "$BIN" --seed "$seed" --ticks "$TICKS" --every "$TICKS" \
    --profile "$profile" --profile-every "$PROFILE_EVERY" >/dev/null
  max_ms=$(awk -F, 'NR > 1 && $3 > max { max = $3 } END { printf "%.3f", max + 0 }' "$profile")
  mean_ms=$(awk -F, 'NR > 1 { sum += $3; n += 1 } END { printf "%.3f", n ? sum / n : 0 }' "$profile")
  echo "seed=$seed mean_tick_ms=$mean_ms max_tick_ms=$max_ms budget_ms=$MAX_TICK_MS"
  awk -v max="$MAX_TICK_MS" -v actual="$max_ms" 'BEGIN { exit actual > max }' || {
    echo "performance budget exceeded for seed $seed: ${max_ms}ms > ${MAX_TICK_MS}ms" >&2
    exit 1
  }
done
