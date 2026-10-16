# Scripts

Dev and CI helpers, plus the published desktop installer. Run them from anywhere; each resolves the repo root itself.

### install-desktop.sh
One-line macOS installer. The README publishes its raw GitHub URL
(`.../main/scripts/install-desktop.sh`), so keep this path stable.

### build-wasm.sh
Builds the browser WebAssembly engine with the tuned wasm profile (fat LTO, one codegen unit, opt-level 2). `make wasm` and both CI workflows call it; the flags are per invocation, so native builds and tests keep the quick release profile.

### perf-gate.sh
Deterministic multi-seed performance budget used by CI (`make perf-gate`). It samples every tick and gates the max, p99 and mean tick time for three seeds at 8,000 ticks, plus one 25,000-tick run of seed 42 that reaches the mature world.

### rebuild-fresh.sh
Wipes the local `world.save` (and `.tmp`/`.bak` siblings) and rebuilds the release binaries from scratch.
**When to run:** local dev only. Use when iterating on world-gen or spawn logic and you need a known-clean seed. It does not touch any deployment.
