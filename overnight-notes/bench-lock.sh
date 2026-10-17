#!/usr/bin/env bash
# Run a command while holding a machine-wide lock, so only one browser benchmark runs at a time.
# Usage: bench-lock.sh <command...>
set -u
LOCK=/tmp/thehumanbox-bench.lock
while ! mkdir "$LOCK" 2>/dev/null; do
  # Steal a lock whose owner died.
  owner=$(cat "$LOCK/pid" 2>/dev/null || echo)
  if [[ -n "$owner" ]] && ! kill -0 "$owner" 2>/dev/null; then
    rm -rf "$LOCK"
    continue
  fi
  sleep 5
done
echo $$ >"$LOCK/pid"
# Headless bench Chromes whose runner died keep rendering at 60 fps and skew every later run.
for p in $(ps -Ao pid,ppid,args | awk '$2==1 && /--headless=new/ && /thb-bench-chrome/ {print $1}'); do kill "$p" 2>/dev/null; done
trap 'rm -rf "$LOCK"' EXIT INT TERM
"$@"
