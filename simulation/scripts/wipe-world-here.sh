#!/usr/bin/env bash
# Wipe the persisted world on THIS machine (run on the EC2 box).
# Stops thehumanbox, removes the live world's folder + the _live
# marker so the next boot mints a brand-new world, then restarts.
#
# Usage:
#   sudo bash scripts/wipe-world-here.sh           # prompts
#   sudo bash scripts/wipe-world-here.sh --yes     # skip prompt
#
# For the remote SSM-driven version, see wipe-world-prod.sh.

set -euo pipefail

UNIT="${UNIT:-thehumanbox.service}"
SKIP_PROMPT=0
[[ "${1:-}" == "--yes" ]] && SKIP_PROMPT=1

if ! systemctl cat "$UNIT" >/dev/null 2>&1; then
  echo "!! unit $UNIT not found. Set UNIT=<name> to override." >&2
  exit 1
fi

WORK_DIR="$(systemctl show "$UNIT" -p WorkingDirectory --value)"
if [[ -z "$WORK_DIR" || ! -d "$WORK_DIR" ]]; then
  echo "!! could not resolve WorkingDirectory for $UNIT" >&2
  exit 1
fi

WORLDS="$WORK_DIR/worlds"
LIVE_MARKER="$WORLDS/_live"
LEGACY_SAVE="$WORK_DIR/world.save"

echo "Unit:             $UNIT"
echo "WorkingDirectory: $WORK_DIR"

# Figure out what the live world is, if any.
LIVE_HASH=""
if [[ -f "$LIVE_MARKER" ]]; then
  LIVE_HASH="$(cat "$LIVE_MARKER")"
  if [[ -n "$LIVE_HASH" && -d "$WORLDS/$LIVE_HASH" ]]; then
    echo "Live world dir:   $WORLDS/$LIVE_HASH"
    du -sh "$WORLDS/$LIVE_HASH" 2>/dev/null | sed 's/^/                  /'
  fi
fi
if [[ -f "$LEGACY_SAVE" ]]; then
  echo "Legacy save:      $LEGACY_SAVE"
fi

if [[ -z "$LIVE_HASH" && ! -f "$LEGACY_SAVE" ]]; then
  echo "Nothing to wipe — no live world or legacy save found."
  exit 0
fi

if [[ "$SKIP_PROMPT" != 1 ]]; then
  read -r -p 'Type WIPE to confirm: ' answer
  [[ "$answer" == "WIPE" ]] || { echo "aborted."; exit 1; }
fi

echo "==> stopping $UNIT"
systemctl stop "$UNIT"

if [[ -n "$LIVE_HASH" && -d "$WORLDS/$LIVE_HASH" ]]; then
  echo "==> removing live world dir $WORLDS/$LIVE_HASH"
  rm -rfv "$WORLDS/$LIVE_HASH"
fi
if [[ -f "$LIVE_MARKER" ]]; then
  echo "==> removing live marker $LIVE_MARKER"
  rm -fv "$LIVE_MARKER"
fi
if [[ -f "$LEGACY_SAVE" ]]; then
  echo "==> removing legacy save $LEGACY_SAVE"
  rm -fv "$LEGACY_SAVE" "$LEGACY_SAVE.tmp" "$LEGACY_SAVE.bak"
fi

echo "==> starting $UNIT (will mint a fresh world)"
systemctl start "$UNIT"
sleep 2
systemctl --no-pager --lines=10 status "$UNIT" | head -15
