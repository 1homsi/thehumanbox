#!/usr/bin/env bash
#
# update.sh - pull a prebuilt simulation-rs binary from a GitHub
# release and atomically swap it into place, then restart systemd.
#
# Replaces the old on-box `cargo build --release` flow which peaked
# rustc + linker at ~1.5 GB on the 2 GB c7g.medium and OOM-impaired
# the instance.
#
# Usage:   scripts/update.sh <VERSION>
# Example: scripts/update.sh 0.0.72
#
# Env knobs:
#   REPO       owner/name of the GitHub repo            (default: 1homsi/thehumanbox)
#   BIN_NAME   binary asset name in the release         (default: simulation-rs)
#   DEST       absolute path to the running binary      (default: /root/thehumanbox/simulation/target/release/simulation-rs)
#   UNIT       systemd unit name                        (default: thehumanbox)
#   GH_TOKEN   optional GitHub PAT - needed for private repos.
#              Can be set in /etc/thehumanbox.env (sourced if present).

set -euo pipefail

VERSION="${1:?usage: scripts/update.sh <VERSION>}"
REPO="${REPO:-1homsi/thehumanbox}"
BIN_NAME="${BIN_NAME:-simulation-rs}"
DEST="${DEST:-/root/thehumanbox/simulation/target/release/simulation-rs}"
UNIT="${UNIT:-thehumanbox}"

# Optional env file: GH_TOKEN, REPO, etc.
if [[ -f /etc/thehumanbox.env ]]; then
  # shellcheck disable=SC1091
  source /etc/thehumanbox.env
fi

URL="https://github.com/${REPO}/releases/download/v${VERSION}/${BIN_NAME}"
TMP="$(mktemp -t thb-bin.XXXXXX)"

echo "[update.sh] fetching ${URL}"

CURL_ARGS=(-fL --retry 5 --retry-delay 2 -o "$TMP")
if [[ -n "${GH_TOKEN:-}" ]]; then
  CURL_ARGS+=(-H "Authorization: Bearer ${GH_TOKEN}")
fi

if ! curl "${CURL_ARGS[@]}" "$URL"; then
  echo "[update.sh] curl failed - is the release tag v${VERSION} present and the binary uploaded?" >&2
  rm -f "$TMP"
  exit 1
fi

# Sanity check - the binary should be at least a few MB.
SIZE=$(stat -c%s "$TMP" 2>/dev/null || wc -c <"$TMP")
if [[ "$SIZE" -lt 1000000 ]]; then
  echo "[update.sh] downloaded binary is suspiciously small (${SIZE} bytes), aborting" >&2
  head -c 400 "$TMP"
  echo
  rm -f "$TMP"
  exit 1
fi

chmod +x "$TMP"

# Atomic swap: write to $DEST.new on the same fs, then rename.
mkdir -p "$(dirname "$DEST")"
mv "$TMP" "${DEST}.new"
mv "${DEST}.new" "$DEST"

echo "[update.sh] installed ${SIZE} bytes -> ${DEST}"

# Restart systemd. Use `systemctl cat` to detect unit existence -
# it returns 0 iff the unit file is found, works under non-interactive
# SSM shells, and doesn't rely on the unit already being loaded
# (which `list-units` does, and which made an earlier version of
# this script bail out on a real working unit).
if systemctl cat "${UNIT}.service" >/dev/null 2>&1; then
  systemctl restart "$UNIT"
  sleep 1
  ACTIVE=$(systemctl is-active "$UNIT" || true)
  echo "[update.sh] ${UNIT} restart: ${ACTIVE}"
else
  echo "[update.sh] systemd unit ${UNIT} not found - start the process yourself" >&2
fi

echo "[update.sh] done: v${VERSION}"
