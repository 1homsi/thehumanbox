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

# One run at a time. Running the four at once on a CI runner (two cores, four threads) made them share
# cores with each other, and the same code measured anywhere from 5.1 to 8.5 ms a tick on seed 42 from one
# run to the next: the gate failed main itself. Alone, a run is timed on a core of its own.
run_one() {
  local seed=$1 ticks=$2
  "$BIN" --seed "$seed" --ticks "$ticks" --every "$ticks" \
    --profile "$TMPDIR/$seed-$ticks.csv" --profile-every "$PROFILE_EVERY" >"$TMPDIR/$seed-$ticks.out" ||
    { echo "headless run failed (seed $seed, $ticks ticks)" >&2; exit 1; }
}
for seed in $SEEDS; do
  run_one "$seed" "$TICKS"
done
run_one "$LONG_SEED" "$LONG_TICKS"

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
  # What the run simulated, so a slower tick can be told from a bigger world: the people alive at the end,
  # and a checksum of the world's printed history (timing lines left out) to compare with a local run of
  # `headless --seed <seed> --ticks <ticks> --every <ticks>` on another machine.
  local out="$TMPDIR/$seed-$ticks.out" alive world
  alive=$(awk -v t="$ticks" '$1 == t && NF > 3 { print $2; exit }' "$out")
  world=$(grep -v -e 'µs' -e 'wall' "$out" | cksum | awk '{ print $1 }')
  echo "seed=$seed ticks=$ticks mean_tick_ms=$mean_ms p99_tick_ms=$p99_ms max_tick_ms=$max_ms peak_rss_mb=$peak_rss_mb alive=${alive:-?} world=$world budgets=${max_tick}ms/${max_p99}ms/${max_mean}ms/${MAX_RSS_MB}MB"
  awk -v max="$max_tick" -v actual="$max_ms" 'BEGIN { exit actual > max }' || {
    echo "performance budget exceeded for seed $seed: ${max_ms}ms > ${max_tick}ms" >&2
    return 1
  }
  awk -v max="$max_p99" -v actual="$p99_ms" 'BEGIN { exit actual > max }' || {
    echo "p99 tick budget exceeded for seed $seed: ${p99_ms}ms > ${max_p99}ms" >&2
    return 1
  }
  awk -v max="$max_mean" -v actual="$mean_ms" 'BEGIN { exit actual > max }' || {
    echo "mean tick budget exceeded for seed $seed: ${mean_ms}ms > ${max_mean}ms" >&2
    return 1
  }
  if [[ "$peak_rss_kb" -gt 0 ]]; then
    awk -v max="$MAX_RSS_MB" -v actual="$peak_rss_mb" 'BEGIN { exit actual > max }' || {
      echo "memory budget exceeded for seed $seed: ${peak_rss_mb}MB > ${MAX_RSS_MB}MB" >&2
      return 1
    }
  fi
}

# Every run is checked and reported before the gate fails, so one slow seed does not hide the others.
failed=0
for seed in $SEEDS; do
  check_run "$seed" "$TICKS" "$MAX_TICK_MS" "$MAX_P99_MS" "$MAX_MEAN_MS" || failed=1
done
check_run "$LONG_SEED" "$LONG_TICKS" "$MAX_LONG_TICK_MS" "$MAX_LONG_P99_MS" "$MAX_LONG_MEAN_MS" || failed=1
exit "$failed"
