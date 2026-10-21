#!/usr/bin/env bash
set -euo pipefail

# Prints a key for the committed source at HEAD, optionally limited to some
# paths (`scripts/source-key.sh crates apps/server`). The release bot's version
# stamps are left out: after a merge it commits `chore: release X [skip-bump]`,
# which only rewrites the version in these four files, so a PR's tested merge
# and the main commit it becomes get the same key even when a release landed
# in between.
#
#   apps/server/Cargo.toml     the first `version = "..."` line
#   Cargo.lock                 the version line under `name = "simulation-rs"`
#   apps/web/package.json      .version
#   apps/desktop/package.json  .version
#
# CI uses it to ship a merge the PR run already verified, and to cache the
# desktop simulation binary. Needs git, awk, sed and jq (jq only for the
# package.json files).
cd "$(git rev-parse --show-toplevel)"

digest() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum; else shasum -a 256; fi | cut -c1-40
}

unstamped() {
  case "$1" in
    apps/server/Cargo.toml) git show "HEAD:$1" | awk '!done && /^version = "/ { done = 1; next } { print }' ;;
    Cargo.lock) git show "HEAD:$1" | sed '/^name = "simulation-rs"$/{n;d;}' ;;
    apps/web/package.json | apps/desktop/package.json) git show "HEAD:$1" | jq -S 'del(.version)' ;;
  esac
}

git ls-tree -r HEAD -- "$@" | while IFS=$'\t' read -r entry path; do
  case "$path" in
    apps/server/Cargo.toml | Cargo.lock | apps/web/package.json | apps/desktop/package.json)
      printf '%s\t%s\n' "$(unstamped "$path" | digest)" "$path"
      ;;
    *) printf '%s\t%s\n' "$entry" "$path" ;;
  esac
done | digest
