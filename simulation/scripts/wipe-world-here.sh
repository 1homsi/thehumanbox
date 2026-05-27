#!/usr/bin/env bash
# Archive the current live world and start a fresh one (on THIS machine).
#
# Default behaviour (--archive, the default):
#   1) stop thehumanbox
#   2) write a minimal meta.json into the current worlds/<hash>/ dir so it
#      shows in the archived-worlds list (peak/era/lineage stats stay
#      unknown because we don't replay the save here)
#   3) remove the _live marker so the next boot mints a new hash
#   4) start thehumanbox — new live world begins in its own folder
#
# Destructive mode (--destroy):
#   1) stop thehumanbox
#   2) rm -rf worlds/<live_hash>/  (loses world.save + world.sqlite + meta)
#   3) clear _live, restart
#
# Usage:
#   sudo bash scripts/wipe-world-here.sh                # archive + restart
#   sudo bash scripts/wipe-world-here.sh --yes          # skip prompt
#   sudo bash scripts/wipe-world-here.sh --destroy      # nuke instead
#   sudo bash scripts/wipe-world-here.sh --destroy --yes

set -euo pipefail

UNIT="${UNIT:-thehumanbox.service}"
MODE="archive"
SKIP_PROMPT=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --archive) MODE="archive";  shift ;;
    --destroy) MODE="destroy";  shift ;;
    --yes)     SKIP_PROMPT=1;   shift ;;
    --help|-h)
      sed -n '1,22p' "$0"; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

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

LIVE_HASH=""
if [[ -f "$LIVE_MARKER" ]]; then
  LIVE_HASH="$(cat "$LIVE_MARKER")"
fi

echo "Unit:             $UNIT"
echo "WorkingDirectory: $WORK_DIR"
echo "Mode:             $MODE"
if [[ -n "$LIVE_HASH" && -d "$WORLDS/$LIVE_HASH" ]]; then
  echo "Current live:     $WORLDS/$LIVE_HASH"
  du -sh "$WORLDS/$LIVE_HASH" 2>/dev/null | sed 's/^/                  /'
fi
if [[ -f "$LEGACY_SAVE" ]]; then
  echo "Legacy save:      $LEGACY_SAVE"
fi

if [[ -z "$LIVE_HASH" && ! -f "$LEGACY_SAVE" ]]; then
  echo "Nothing to do — no live world or legacy save found."
  exit 0
fi

if [[ "$SKIP_PROMPT" != 1 ]]; then
  if [[ "$MODE" == "destroy" ]]; then
    read -r -p 'Type DESTROY to confirm (irreversible): ' answer
    [[ "$answer" == "DESTROY" ]] || { echo "aborted."; exit 1; }
  else
    read -r -p 'Type RESET to confirm (current world is archived, new one starts): ' answer
    [[ "$answer" == "RESET" ]] || { echo "aborted."; exit 1; }
  fi
fi

echo "==> stopping $UNIT"
systemctl stop "$UNIT"

if [[ -f "$LEGACY_SAVE" ]]; then
  echo "==> removing legacy save $LEGACY_SAVE"
  rm -fv "$LEGACY_SAVE" "$LEGACY_SAVE.tmp" "$LEGACY_SAVE.bak"
fi

if [[ "$MODE" == "destroy" ]]; then
  if [[ -n "$LIVE_HASH" && -d "$WORLDS/$LIVE_HASH" ]]; then
    echo "==> removing live world dir $WORLDS/$LIVE_HASH"
    rm -rfv "$WORLDS/$LIVE_HASH"
  fi
else
  if [[ -n "$LIVE_HASH" && -d "$WORLDS/$LIVE_HASH" ]]; then
    META_PATH="$WORLDS/$LIVE_HASH/meta.json"
    if [[ ! -f "$META_PATH" ]]; then
      NOW_MS=$(( $(date +%s) * 1000 ))
      # Started_at is unknown without replaying the save; use current
      # time so the archive list still sorts sensibly by ended_at.
      cat > "$META_PATH" <<JSON
{
  "hash": "$LIVE_HASH",
  "started_at_ms": $NOW_MS,
  "ended_at_ms": $NOW_MS,
  "final_tick": 0,
  "final_population": 0,
  "peak_population": 0,
  "top_era": "",
  "lineage_count": 0,
  "top_lineage": null,
  "top_lineage_pop": 0
}
JSON
      echo "==> wrote placeholder meta $META_PATH"
    else
      echo "==> meta.json already present at $META_PATH"
    fi
    echo "==> preserved $WORLDS/$LIVE_HASH as historical archive"
  fi
fi

if [[ -f "$LIVE_MARKER" ]]; then
  echo "==> clearing live marker $LIVE_MARKER"
  rm -fv "$LIVE_MARKER"
fi

echo "==> starting $UNIT (mints fresh world)"
systemctl start "$UNIT"
sleep 2
systemctl --no-pager --lines=10 status "$UNIT" | head -15
