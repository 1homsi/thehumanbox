# Scripts

Dev and CI helpers, plus the published desktop installer. Run them from anywhere; each resolves the repo root itself.

### install-desktop.sh
One-line macOS installer. The README publishes its raw GitHub URL
(`.../main/scripts/install-desktop.sh`), so keep this path stable.

### perf-gate.sh
Deterministic multi-seed performance budget used by CI (`make perf-gate`).

### rebuild-fresh.sh
Wipes the local `world.save` (and `.tmp`/`.bak` siblings) and rebuilds the release binaries from scratch.
**When to run:** local dev only. Use when iterating on world-gen or spawn logic and you need a known-clean seed. It does not touch any deployment.
