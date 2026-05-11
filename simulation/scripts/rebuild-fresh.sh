#!/usr/bin/env bash
# Wipe the persisted world and rebuild the simulation binaries from scratch.
#
# Use this when:
#  - You're iterating on world-gen / spawn logic and need a fresh seed.
#  - A behaviour change is incompatible with whatever's in world.save and
#    you want to bypass the migrate-or-die debate.
#  - You're benchmarking startup behaviour and want a known clean state.
#
# Does NOT touch the live deployment - only the local working copy.
# After running, start the sim with `cargo run --release --bin simulation-rs`.
set -euo pipefail

# Resolve to the simulation/ directory regardless of where this is invoked from.
cd "$(dirname "$0")/.."

echo "==> Removing world.save (if present)"
rm -f world.save world.save.tmp world.save.bak

echo "==> Building release binaries"
cargo build --release --locked

echo
echo "==> Done. Saved files cleaned, fresh binaries in target/release/."
echo "    Next:  cargo run --release --bin simulation-rs"
echo "    Or:    ./target/release/headless --seed 42 --ticks 60000 --every 60000"
