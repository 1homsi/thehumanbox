#!/usr/bin/env bash
set -euo pipefail

# Deterministic multi-seed regression gate. Keep this separate from the
# profiler itself so contributors can reproduce the exact CI budget locally.
#
# Every tick is recorded (not every 100th: those are the heavy periodic
# ticks), and each run is judged on mean, p99 and max. Two classes of run:
#   short  SEEDS x TICKS            early game, several seeds
#   long   LONG_SEEDS x LONG_TICKS  a mature world (cost per tick is ~5x higher
#                                   after tick 15000 than before 6000), judged
#                                   on its last quarter as well as the whole run
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
BIN=${HEADLESS_BIN:-"${CARGO_TARGET_DIR:-$ROOT/target}/release/headless"}
TICKS=${TICKS:-8000}
SEEDS=${SEEDS:-"42 1337 2026"}
LONG_TICKS=${LONG_TICKS:-24000}
LONG_SEEDS=${LONG_SEEDS:-"42"}
MAX_TICK_MS=${MAX_TICK_MS:-400}
MAX_P99_MS=${MAX_P99_MS:-80}
MAX_MEAN_MS=${MAX_MEAN_MS:-12}
LONG_MAX_TICK_MS=${LONG_MAX_TICK_MS:-400}
LONG_MAX_P99_MS=${LONG_MAX_P99_MS:-60}
LONG_MAX_LATE_MEAN_MS=${LONG_MAX_LATE_MEAN_MS:-30}
MAX_MEAN_INSTR=${MAX_MEAN_INSTR:-100000000}
LONG_MAX_MEAN_INSTR=${LONG_MAX_MEAN_INSTR:-150000000}
MAX_RSS_MB=${MAX_RSS_MB:-256}
TMPDIR=${TMPDIR:-/tmp}/thehumanbox-perf-$$
mkdir -p "$TMPDIR"
trap 'rm -rf "$TMPDIR"' EXIT

if [[ ! -x "$BIN" ]]; then
  echo "missing headless binary: $BIN" >&2
  exit 2
fi

# Linux runners may expose retired instructions through perf; probe once and
# fall back cleanly when the host or container denies access to the counter.
PERF_INSTRUCTIONS=0
if [[ "$(uname -s)" == Linux ]] && command -v perf >/dev/null 2>&1 \
  && perf stat -x, -e instructions -o "$TMPDIR/perf-probe" -- true >/dev/null 2>&1; then
  PERF_INSTRUCTIONS=1
fi

# Keep runs sequential: simultaneous seeds compete for the same CPU and turn
# scheduling delay into a false per-tick regression.
runs=()
for seed in $SEEDS; do
  runs+=("short:$seed:$TICKS")
done
for seed in $LONG_SEEDS; do
  runs+=("long:$seed:$LONG_TICKS")
done
over() { awk -v actual="$1" -v max="$2" 'BEGIN { exit !(actual > max) }'; }

failed=0
run_means="$TMPDIR/means.tsv"
: >"$run_means"
for run in "${runs[@]}"; do
  IFS=: read -r kind seed ticks <<<"$run"
  profile="$TMPDIR/$kind-$seed.csv"
  if [[ "$PERF_INSTRUCTIONS" == 1 ]]; then
    run_command=(perf stat -x, -e instructions -o "$profile.perf" -- "$BIN")
  else
    run_command=("$BIN")
  fi
  if ! "${run_command[@]}" --seed "$seed" --ticks "$ticks" --every "$ticks" \
    --profile "$profile" --profile-every 1 >/dev/null; then
    echo "headless run failed for $kind seed $seed" >&2
    exit 1
  fi
  # A profile with no samples (only the header) makes every awk below
  # report 0, so the budget check passed while measuring nothing.
  profile_rows=$(awk 'NR > 1' "$profile" | wc -l | tr -d ' ')
  if [[ "$profile_rows" -eq 0 ]]; then
    echo "no performance samples collected for $kind seed $seed (ticks=$ticks)" >&2
    exit 1
  fi
  # mean, max over all ticks and the mean over the last quarter; p99 is the
  # nearest-rank value of the sorted times (plain awk: no asort on mawk/BWK).
  ticks_ms="$TMPDIR/$kind-$seed.ms"
  awk -F, 'NR > 1 { print $3 }' "$profile" >"$ticks_ms"
  read -r mean_ms max_ms late_mean_ms < <(
    awk '{ v[NR] = $1; sum += $1; if ($1 > max) max = $1 }
      END {
        from = NR - int(NR / 4) + 1
        for (i = from; i <= NR; i++) late += v[i]
        printf "%.3f %.3f %.3f\n", sum / NR, max, late / (NR - from + 1)
      }' "$ticks_ms"
  )
  p99_ms=$(sort -n "$ticks_ms" | awk '{ v[NR] = $1 }
    END { i = int(NR * 0.99); if (i < 1) i = 1; printf "%.3f", v[i] }')
  tick_instrs="$TMPDIR/$kind-$seed.instr"
  awk -F, 'NR > 1 && $5 > 0 { print $5 }' "$profile" >"$tick_instrs"
  if [[ -s "$tick_instrs" ]]; then
    mean_instr=$(awk '{ sum += $1; n++ } END { printf "%.0f", sum / n }' "$tick_instrs")
    p99_instr=$(sort -n "$tick_instrs" | awk '{ v[NR] = $1 } END { i = int(NR * 0.99); if (i < 1) i = 1; printf "%.0f", v[i] }')
  elif [[ "$PERF_INSTRUCTIONS" == 1 ]]; then
    total_instr=$(awk -F, '$3 == "instructions" && $1 ~ /^[0-9]+$/ { print $1; exit }' "$profile.perf")
    if [[ -n "$total_instr" ]]; then
      mean_instr=$(awk -v total="$total_instr" -v ticks="$ticks" 'BEGIN { printf "%.0f", total / ticks }')
      p99_instr=unavailable
    else
      mean_instr=unavailable
      p99_instr=unavailable
    fi
  else
    mean_instr=unavailable
    p99_instr=unavailable
  fi
  peak_rss_kb=$(awk -F, 'NR > 1 && $4 > max { max = $4 } END { printf "%.0f", max + 0 }' "$profile")
  peak_rss_mb=$(awk -v kb="$peak_rss_kb" 'BEGIN { printf "%.1f", kb / 1024 }')
  if [[ "$kind" == long ]]; then
    max_budget=$LONG_MAX_TICK_MS
    p99_budget=$LONG_MAX_P99_MS
    mean_budget=$LONG_MAX_LATE_MEAN_MS
    mean_actual=$late_mean_ms
    mean_label=late_mean_ms
    instr_budget=$LONG_MAX_MEAN_INSTR
  else
    max_budget=$MAX_TICK_MS
    p99_budget=$MAX_P99_MS
    mean_budget=$MAX_MEAN_MS
    mean_actual=$mean_ms
    mean_label=mean_tick_ms
    instr_budget=$MAX_MEAN_INSTR
  fi
  if [[ "$mean_instr" == unavailable ]]; then
    instr_display="instructions=unavailable"
  else
    instr_display="mean_instr_tick=$mean_instr p99_instr_tick=$p99_instr"
    printf '%s\t%s\t%s\t%s\t%s\n' "$kind" "$seed" "$mean_ms" "$p99_ms" "$mean_instr" >>"$run_means"
  fi
  echo "$kind seed=$seed ticks=$ticks mean_tick_ms=$mean_ms late_mean_ms=$late_mean_ms p99_tick_ms=$p99_ms max_tick_ms=$max_ms peak_rss_mb=$peak_rss_mb $instr_display budgets=mean${mean_budget}/p99${p99_budget}/max${max_budget}ms/${MAX_RSS_MB}MB/instr${instr_budget}"
  # Report every run before failing so one log shows all the numbers.
  if over "$max_ms" "$max_budget"; then
    echo "performance budget exceeded for $kind seed $seed: max ${max_ms}ms > ${max_budget}ms" >&2
    failed=1
  fi
  if over "$p99_ms" "$p99_budget"; then
    echo "performance budget exceeded for $kind seed $seed: p99 ${p99_ms}ms > ${p99_budget}ms" >&2
    failed=1
  fi
  if over "$mean_actual" "$mean_budget"; then
    echo "performance budget exceeded for $kind seed $seed: $mean_label ${mean_actual}ms > ${mean_budget}ms" >&2
    failed=1
  fi
  if [[ "$mean_instr" != unavailable ]] && over "$mean_instr" "$instr_budget"; then
    echo "instruction budget exceeded for $kind seed $seed: mean ${mean_instr} > ${instr_budget} instructions/tick" >&2
    failed=1
  fi
  if [[ "$peak_rss_kb" -gt 0 ]] && over "$peak_rss_mb" "$MAX_RSS_MB"; then
    echo "memory budget exceeded for $kind seed $seed: ${peak_rss_mb}MB > ${MAX_RSS_MB}MB" >&2
    failed=1
  fi
done
median() {
  sort -n | awk '{ v[NR] = $1 } END {
    if (NR == 0) exit
    if (NR % 2) printf "%.3f", v[(NR + 1) / 2]
    else printf "%.3f", (v[NR / 2] + v[NR / 2 + 1]) / 2
  }'
}
for kind in short long; do
  if [[ -n "$(awk -F '\t' -v kind="$kind" '$1 == kind { found = 1 } END { print found }' "$run_means")" ]]; then
    mean_median=$(awk -F '\t' -v kind="$kind" '$1 == kind { print $3 }' "$run_means" | median)
    p99_median=$(awk -F '\t' -v kind="$kind" '$1 == kind { print $4 }' "$run_means" | median)
    instr_median=$(awk -F '\t' -v kind="$kind" '$1 == kind { print $5 }' "$run_means" | median)
    echo "$kind median across seeds: mean_tick_ms=$mean_median p99_tick_ms=$p99_median mean_instr_tick=$instr_median"
  fi
done
exit $failed
