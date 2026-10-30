#!/usr/bin/env bash
set -euo pipefail

# Compares how two headless builds change the world, gently and as cheaply as the question allows.
#
#   scripts/sim-compare.sh <base-headless> <new-headless>
#
# Both builds start each seed from the same saved world (made once by the base build at FROM ticks) and run
# to TO ticks, and the deaths in that window are compared seed by seed. Starting from a shared world removes
# most of the chance differences that two runs from tick 0 pile up, so far fewer seeds tell a real change
# from noise, and the ticks before FROM are not run again for every comparison.
#
# The checkpoints and the base build's results are cached by the base binary's contents
# (~/.cache/thehumanbox-sim), so comparing a second change against the same main runs only the new build.
# Every run is at the lowest priority, one at a time, on one thread: the machine stays usable.
#
# Settings (environment): SEEDS (default 1..16), FROM (6000), TO (10000), JOBS (1), CACHE.
# Prints each seed's window deaths, the totals, and per cause the mean change per seed with its standard
# error: a change within about two standard errors of zero is noise. Causes with fewer than 20 deaths
# between the two builds are too rare to judge this way; compare them over more seeds or longer windows.

BASE=${1:?usage: sim-compare.sh <base-headless> <new-headless>}
NEW=${2:?usage: sim-compare.sh <base-headless> <new-headless>}
SEEDS=${SEEDS:-$(seq 1 16)}
FROM=${FROM:-6000}
TO=${TO:-10000}
JOBS=${JOBS:-1}
CACHE=${CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/thehumanbox-sim}
export RAYON_NUM_THREADS=1

base_key=$(shasum "$BASE" | cut -c1-16)
store="$CACHE/$base_key"
mkdir -p "$store"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

deaths() { grep '^births:' || true; }

# run_to <out-line> <log> <bin> <args...>: the history line at the end of a headless run, at the lowest
# priority. A run that fails, or prints no history line, stops the comparison: a crash must never read as a
# seed with no deaths. Its stderr is kept in <log>.
run_to() {
  local out=$1 log=$2
  shift 2
  if ! nice -n 20 "$@" 2>"$log" | deaths >"$out.part" || [[ ! -s "$out.part" ]]; then
    rm -f "$out.part"
    echo "headless failed: $* (see the log below)" >&2
    tail -20 "$log" >&2
    return 1
  fi
  mv "$out.part" "$out"
}

# checkpoint <seed>: the base build's world at FROM (gzipped) and its history line there.
checkpoint() {
  local seed=$1 ck="$store/seed-$1-$FROM"
  if [[ ! -s "$ck.json.gz" || ! -s "$ck.line" ]]; then
    run_to "$work/ck-$seed.line" "$work/ck-$seed.log" \
      "$BASE" --seed "$seed" --ticks "$FROM" --every "$FROM" --save "$work/ck-$seed.json" || return 1
    gzip -c "$work/ck-$seed.json" >"$ck.json.gz.part" && mv "$ck.json.gz.part" "$ck.json.gz"
    mv "$work/ck-$seed.line" "$ck.line"
    rm -f "$work/ck-$seed.json"
  fi
}

# window <bin> <seed> <out>: the history line at TO, run from the seed's checkpoint.
window() {
  local bin=$1 seed=$2 out=$3 tag
  tag=$(basename "$out")
  gunzip -c "$store/seed-$seed-$FROM.json.gz" >"$work/$tag.json"
  run_to "$out" "$work/$tag.log" "$bin" --seed "$seed" --load "$work/$tag.json" --ticks "$TO" --every "$TO" ||
    return 1
  rm -f "$work/$tag.json"
}

one_seed() {
  local seed=$1
  checkpoint "$seed" || return 1
  local cached="$store/seed-$seed-$FROM-$TO.line"
  [[ -s "$cached" ]] || window "$BASE" "$seed" "$cached" || return 1
  window "$NEW" "$seed" "$work/new-$seed.line"
}

pids=()
for seed in $SEEDS; do
  while [[ $(jobs -r | wc -l) -ge $JOBS ]]; do sleep 0.5; done
  one_seed "$seed" &
  pids+=($!)
done
failed=0
for pid in "${pids[@]}"; do wait "$pid" || failed=1; done
if [[ $failed -ne 0 ]]; then
  echo "a seed failed to run; no comparison printed" >&2
  exit 1
fi

for seed in $SEEDS; do
  printf '%s\t%s\t%s\t%s\n' "$seed" "$(cat "$store/seed-$seed-$FROM.line")" \
    "$(cat "$store/seed-$seed-$FROM-$TO.line")" "$(cat "$work/new-$seed.line")"
done | python3 -c '
import re, sys, math
keys = ["births", "combat", "dehy", "old", "beasts", "starv", "sick", "drowned", "fire", "disaster"]
def parse(line):
    v = dict.fromkeys(keys, 0)
    m = re.search(r"births:\s+(\d+)", line)
    if m: v["births"] = int(m.group(1))
    for k, n in re.findall(r"(\w+)=(\d+)", line):
        if k in v: v[k] = int(n)
    return v
rows = []
for line in sys.stdin:
    seed, at, base, new = line.rstrip("\n").split("\t")
    a, b, c = parse(at), parse(base), parse(new)
    rows.append((seed, {k: b[k] - a[k] for k in keys}, {k: c[k] - a[k] for k in keys}))
print(f"window ticks {sys.argv[1]}..{sys.argv[2]}, {len(rows)} seeds (deaths in the window: base -> new)")
for seed, b, c in rows:
    print(f"  seed {seed:>4}: " + " ".join(f"{k}={b[k]}->{c[k]}" for k in keys if b[k] or c[k]))
print("TOTAL base " + " ".join(f"{k}={sum(r[1][k] for r in rows)}" for k in keys))
print("TOTAL new  " + " ".join(f"{k}={sum(r[2][k] for r in rows)}" for k in keys))
n = len(rows)
for k in keys:
    d = [r[2][k] - r[1][k] for r in rows]
    mean = sum(d) / n
    se = math.sqrt(sum((x - mean) ** 2 for x in d) / (n - 1) / n) if n > 1 else float("nan")
    events = sum(r[1][k] + r[2][k] for r in rows)
    # A cause with only a handful of deaths is too rare for this test: one seed with a death can look like a change.
    if events < 20:
        flag = "  (too few to tell)" if events else ""
    else:
        flag = "  <- beyond noise" if abs(mean) > 2 * se else ""
    print(f"  {k:9s} change per seed {mean:+7.2f} +/- {se:5.2f}{flag}")
' "$FROM" "$TO"
