# Tools

Local development and CI helpers. The macOS installer stays in `scripts/` because its raw URL is published.

### rebuild-fresh.sh
Wipes the local `world.save` (and `.tmp`/`.bak` siblings) and rebuilds the release binaries from scratch.
**When to run:** Local dev only. Use when iterating on world-gen or spawn logic and you need a known-clean seed — does not touch any deployment.

### perf-gate.sh
Deterministic multi-seed performance budget used by CI (`make perf-gate`).

### install-desktop.sh
Lives at `scripts/install-desktop.sh` (not here) because the README publishes its raw GitHub URL for the one-line macOS install.
