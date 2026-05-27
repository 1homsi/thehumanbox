#!/usr/bin/env bash
# Installs The Human Box desktop from the latest GitHub Release and strips
# the macOS quarantine attribute so it opens without the "unidentified
# developer" / "app is damaged" dialog. macOS only — Windows + Linux users
# should download the installer from the Releases page directly.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/1homsi/thehumanbox/main/scripts/install-desktop.sh | bash

set -euo pipefail

OWNER="1homsi"
REPO="thehumanbox"
APP_NAME="The Human Box"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "This installer is macOS only."
  echo "Windows + Linux: grab the installer at https://github.com/$OWNER/$REPO/releases/latest"
  exit 1
fi

ARCH="$(uname -m)"
case "$ARCH" in
  arm64) SUFFIX="arm64.dmg" ;;
  x86_64) SUFFIX="x64.dmg" ;;
  *) echo "unsupported arch: $ARCH" >&2; exit 1 ;;
esac

echo "==> Resolving latest release..."
API="https://api.github.com/repos/$OWNER/$REPO/releases/latest"
META="$(curl -fsSL "$API")"
TAG="$(printf '%s' "$META" | grep -oE '"tag_name":[[:space:]]*"[^"]+"' | head -n1 | sed -E 's/.*"([^"]+)"$/\1/' || true)"

# Match any dmg asset whose URL ends in -<arch>.dmg (electron-builder names
# them like "The Human Box-0.2.4-arm64.dmg").
URL="$(printf '%s' "$META" | grep -oE 'https://[^"]+\.dmg' | grep -E "${SUFFIX}\$" | head -n1 || true)"

if [[ -z "$URL" ]]; then
  echo
  echo "No macOS $SUFFIX installer is attached to the latest release${TAG:+ ($TAG)} yet." >&2
  echo "The desktop build may still be running, or this release was cut before" >&2
  echo "the desktop pipeline shipped. Check:" >&2
  echo "  https://github.com/$OWNER/$REPO/releases/latest" >&2
  echo "  https://github.com/$OWNER/$REPO/actions" >&2
  exit 1
fi

TMP="$(mktemp -d)"
DMG="$TMP/thehumanbox.dmg"
echo "==> Downloading $URL"
curl -fL --progress-bar -o "$DMG" "$URL"

echo "==> Mounting..."
MOUNT="$(hdiutil attach -nobrowse -readonly "$DMG" | tail -n1 | awk '{print substr($0, index($0,$3))}')"
trap 'hdiutil detach "$MOUNT" -quiet 2>/dev/null || true; rm -rf "$TMP"' EXIT

SRC="$MOUNT/$APP_NAME.app"
DEST="/Applications/$APP_NAME.app"

if [[ ! -d "$SRC" ]]; then
  echo "could not find '$APP_NAME.app' inside the mounted dmg" >&2
  exit 1
fi

if [[ -d "$DEST" ]]; then
  echo "==> Removing previous install at $DEST"
  rm -rf "$DEST"
fi

echo "==> Copying to /Applications..."
cp -R "$SRC" "$DEST"

echo "==> Removing quarantine (the unsigned-app bypass)..."
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true

echo
echo "✓ Installed. Open it with:"
echo "    open -a \"$APP_NAME\""
