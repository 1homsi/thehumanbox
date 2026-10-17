#!/usr/bin/env bash
# Run a heavy command while holding one of a few machine-wide slots, so parallel workers
# cannot pile up builds and crash the laptop.
# Usage: heavy-lock.sh rust <command...>   # cargo / wasm-pack / make wasm / make perf-gate: 1 at a time
#        heavy-lock.sh js <command...>     # vite build / vitest / tsc -b / engine build+test: 2 at a time
set -u
kind=${1:?usage: heavy-lock.sh rust|js <command...>}; shift
case "$kind" in
  rust) slots=1 ;;
  js) slots=2 ;;
  *) echo "heavy-lock.sh: kind must be rust or js" >&2; exit 2 ;;
esac
held=
while [[ -z "$held" ]]; do
  for i in $(seq 0 $((slots - 1))); do
    lock=/tmp/thehumanbox-heavy-$kind-$i.lock
    if mkdir "$lock" 2>/dev/null; then
      echo $$ >"$lock/pid"
      held=$lock
      break
    fi
    # Steal a slot whose owner died.
    owner=$(cat "$lock/pid" 2>/dev/null || echo)
    if [[ -n "$owner" ]] && ! kill -0 "$owner" 2>/dev/null; then rm -rf "$lock"; fi
  done
  [[ -z "$held" ]] && sleep 10
done
trap 'rm -rf "$held"' EXIT INT TERM
if [[ "$kind" == rust ]]; then
  export CARGO_BUILD_JOBS=${CARGO_BUILD_JOBS:-6}
  export CARGO_TARGET_DIR=${CARGO_TARGET_DIR:-/Users/mhomsi/dev/extra/overnight/cargo-target}
fi
nice -n 10 "$@"
