# Scripts

Local development helpers for rebuilding the simulation.

### rebuild-fresh.sh
Wipes the local `world.save` (and `.tmp`/`.bak` siblings) and rebuilds the release binaries from scratch.
**When to run:** Local dev only. Use when iterating on world-gen or spawn logic and you need a known-clean seed — does not touch any deployment.
