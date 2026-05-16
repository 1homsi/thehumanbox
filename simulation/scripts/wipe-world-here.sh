#!/usr/bin/env bash
# Wipe the persisted world.save on THIS machine (run on the EC2 box).
# Stops thehumanbox, deletes world.save + siblings, restarts.
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

if ! systemctl list-unit-files --no-pager | grep -q "^$UNIT"; then
  echo "!! unit $UNIT not found. Set UNIT=<name> or pass --help." >&2
  exit 1
fi

# Resolve WorkingDirectory from the unit file - that's where world.save lives.
WORK_DIR="$(systemctl show "$UNIT" -p WorkingDirectory --value)"
if [[ -z "$WORK_DIR" || ! -d "$WORK_DIR" ]]; then
  echo "!! could not resolve WorkingDirectory for $UNIT" >&2
  exit 1
fi

SAVE="$WORK_DIR/world.save"
echo "Unit:             $UNIT"
echo "WorkingDirectory: $WORK_DIR"
echo "Will delete:      $SAVE (+ .tmp, .bak siblings)"

if [[ "$SKIP_PROMPT" != 1 ]]; then
  read -r -p 'Type WIPE to confirm: ' answer
  [[ "$answer" == "WIPE" ]] || { echo "aborted."; exit 1; }
fi

echo "==> stopping $UNIT"
systemctl stop "$UNIT"

echo "==> removing world.save"
rm -fv "$SAVE" "$SAVE.tmp" "$SAVE.bak"

echo "==> starting $UNIT"
systemctl start "$UNIT"
sleep 2
systemctl --no-pager --lines=10 status "$UNIT" | head -15
