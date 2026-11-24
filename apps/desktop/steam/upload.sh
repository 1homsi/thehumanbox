#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'TEXT'
usage: steam/upload.sh <win|mac|linux>

Uploads the unpacked Steam build of one platform as a depot. Nothing is set live:
the build lands in Steamworks, where it is assigned to a branch by hand.

Needs in the environment:
  STEAM_APP_ID       the app's id in Steamworks
  STEAM_DEPOT_ID     the depot for this platform
  STEAM_USERNAME     a Steamworks account allowed to upload builds
Optional:
  STEAM_BUILD_DESC   a note shown beside the build (default: the app version)
  STEAM_PREVIEW=1    check the build and print what would change, upload nothing
  STEAMCMD           the steamcmd binary (default: steamcmd on PATH)
TEXT
  exit 2
}

platform="${1:-}"
here="$(cd "$(dirname "$0")" && pwd)"
desktop="$(dirname "$here")"

case "$platform" in
  win) content="$desktop/out/steam/win-unpacked" ;;
  mac) content="$desktop/out/steam/mac-arm64" ;;
  linux) content="$desktop/out/steam/linux-unpacked" ;;
  *) usage ;;
esac

: "${STEAM_APP_ID:?set STEAM_APP_ID}"
: "${STEAM_DEPOT_ID:?set STEAM_DEPOT_ID}"
: "${STEAM_USERNAME:?set STEAM_USERNAME}"

for id in "$STEAM_APP_ID" "$STEAM_DEPOT_ID"; do
  [[ "$id" =~ ^[0-9]+$ ]] || { echo "not a Steam id: $id" >&2; exit 2; }
done

if [[ ! -d "$content" ]]; then
  echo "no build at $content; run: STEAM_APP_ID=$STEAM_APP_ID pnpm run pack:steam" >&2
  exit 1
fi

steamcmd="${STEAMCMD:-steamcmd}"
command -v "$steamcmd" >/dev/null || { echo "steamcmd not found; install it or set STEAMCMD" >&2; exit 1; }

preview=0
[[ "${STEAM_PREVIEW:-0}" == "1" ]] && preview=1

version="$(node -p "require('$desktop/package.json').version")"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
script="$work/app_build.vdf"

sed \
  -e "s|__APP_ID__|$STEAM_APP_ID|" \
  -e "s|__DEPOT_ID__|$STEAM_DEPOT_ID|" \
  -e "s|__DESCRIPTION__|${STEAM_BUILD_DESC:-$version $platform}|" \
  -e "s|__PREVIEW__|$preview|" \
  -e "s|__CONTENT_ROOT__|$content|" \
  -e "s|__BUILD_OUTPUT__|$work/output|" \
  "$here/app_build.vdf.template" > "$script"

"$steamcmd" +login "$STEAM_USERNAME" +run_app_build "$script" +quit
