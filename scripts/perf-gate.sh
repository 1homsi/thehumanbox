#!/usr/bin/env bash
set -euo pipefail

# Deterministic multi-seed regression gate. Keep this separate from the
# profiler itself so contributors can reproduce the exact CI budget locally.
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
BIN=${HEADLESS_BIN:-"$ROOT/target/release/headless"}
TICKS=${TICKS:-8000}
# Every tick is sampled. Periodic work (every 60/100/300/... ticks) makes some
# ticks several times heavier, so sampling only those skews the mean.
PROFILE_EVERY=${PROFILE_EVERY:-1}
MAX_TICK_MS=${MAX_TICK_MS:-80}
MAX_P99_MS=${MAX_P99_MS:-60}
MAX_MEAN_MS=${MAX_MEAN_MS:-8}
MAX_RSS_MB=${MAX_RSS_MB:-256}
SEEDS=${SEEDS:-"42 1337 2026"}
# One long run of a single seed reaches the mature world, where a tick costs
# about 5x the early game and the worst ticks are 100+ ms.
LONG_SEED=${LONG_SEED:-42}
LONG_TICKS=${LONG_TICKS:-25000}
MAX_LONG_TICK_MS=${MAX_LONG_TICK_MS:-300}
MAX_LONG_P99_MS=${MAX_LONG_P99_MS:-120}
MAX_LONG_MEAN_MS=${MAX_LONG_MEAN_MS:-20}
TMPDIR=${TMPDIR:-/tmp}/thehumanbox-perf-$$
mkdir -p "$TMPDIR"
trap 'rm -rf "$TMPDIR"' EXIT

if [[ ! -x "$BIN" ]]; then
  echo "missing headless binary: $BIN" >&2
  exit 2
fi

# Seeds are independent, so run them at once (CI runners have several
# cores) and check each profile afterwards. The long run goes in the same
# batch so it does not add to the wall time of the short ones.
pids=()
for seed in $SEEDS; do
  "$BIN" --seed "$seed" --ticks "$TICKS" --every "$TICKS" \
    --profile "$TMPDIR/$seed-$TICKS.csv" --profile-every "$PROFILE_EVERY" >/dev/null &
  pids+=("$!")
done
"$BIN" --seed "$LONG_SEED" --ticks "$LONG_TICKS" --every "$LONG_TICKS" \
  --profile "$TMPDIR/$LONG_SEED-$LONG_TICKS.csv" --profile-every "$PROFILE_EVERY" >/dev/null &
pids+=("$!")
for pid in "${pids[@]}"; do
  wait "$pid" || { echo "headless run failed (pid $pid)" >&2; exit 1; }
done

# check_run <seed> <ticks> <max_tick_ms> <max_p99_ms> <max_mean_ms>
check_run() {
  local seed=$1 ticks=$2 max_tick=$3 max_p99=$4 max_mean=$5
  local profile="$TMPDIR/$seed-$ticks.csv"
  # A profile with no samples (only the header) makes every awk below
  # report 0, so the budget check passed while measuring nothing. This is
  # reachable via the documented `make perf-gate TICKS=<small>`, which has
  # no lower bound against PROFILE_EVERY.
  local profile_rows
  profile_rows=$(awk 'NR > 1' "$profile" | wc -l | tr -d ' ')
  if [[ "$profile_rows" -eq 0 ]]; then
    echo "no performance samples collected for seed $seed (TICKS=$ticks PROFILE_EVERY=$PROFILE_EVERY)" >&2
    echo "raise TICKS or lower PROFILE_EVERY so at least one tick is sampled" >&2
    exit 1
  fi
  local max_ms mean_ms p99_ms peak_rss_kb peak_rss_mb
  max_ms=$(awk -F, 'NR > 1 && $3 > max { max = $3 } END { printf "%.3f", max + 0 }' "$profile")
  mean_ms=$(awk -F, 'NR > 1 { sum += $3; n += 1 } END { printf "%.3f", n ? sum / n : 0 }' "$profile")
  p99_ms=$(awk -F, 'NR > 1 { print $3 }' "$profile" | sort -n |
    awk '{ v[NR] = $1 } END { printf "%.3f", NR ? v[int((NR * 99 + 99) / 100)] : 0 }')
  peak_rss_kb=$(awk -F, 'NR > 1 && $4 > max { max = $4 } END { printf "%.0f", max + 0 }' "$profile")
  peak_rss_mb=$(awk -v kb="$peak_rss_kb" 'BEGIN { printf "%.1f", kb / 1024 }')
  echo "seed=$seed ticks=$ticks mean_tick_ms=$mean_ms p99_tick_ms=$p99_ms max_tick_ms=$max_ms peak_rss_mb=$peak_rss_mb budgets=${max_tick}ms/${max_p99}ms/${max_mean}ms/${MAX_RSS_MB}MB"
  awk -v max="$max_tick" -v actual="$max_ms" 'BEGIN { exit actual > max }' || {
    echo "performance budget exceeded for seed $seed: ${max_ms}ms > ${max_tick}ms" >&2
    exit 1
  }
  awk -v max="$max_p99" -v actual="$p99_ms" 'BEGIN { exit actual > max }' || {
    echo "p99 tick budget exceeded for seed $seed: ${p99_ms}ms > ${max_p99}ms" >&2
    exit 1
  }
  awk -v max="$max_mean" -v actual="$mean_ms" 'BEGIN { exit actual > max }' || {
    echo "mean tick budget exceeded for seed $seed: ${mean_ms}ms > ${max_mean}ms" >&2
    exit 1
  }
  if [[ "$peak_rss_kb" -gt 0 ]]; then
    awk -v max="$MAX_RSS_MB" -v actual="$peak_rss_mb" 'BEGIN { exit actual > max }' || {
      echo "memory budget exceeded for seed $seed: ${peak_rss_mb}MB > ${MAX_RSS_MB}MB" >&2
      exit 1
    }
  fi
}

for seed in $SEEDS; do
  check_run "$seed" "$TICKS" "$MAX_TICK_MS" "$MAX_P99_MS" "$MAX_MEAN_MS"
done
check_run "$LONG_SEED" "$LONG_TICKS" "$MAX_LONG_TICK_MS" "$MAX_LONG_P99_MS" "$MAX_LONG_MEAN_MS"
