# Development

## Setup

You need Rust (stable; CI uses the newest, which lints more strictly than older
toolchains), Node 24 with `pnpm`, and for the browser build `wasm-pack`
(`rustup target add wasm32-unknown-unknown`).

```bash
make install        # pnpm install for web and desktop, cargo fetch
make sim            # native simulation server on ws://localhost:8000
make client         # Vite dev server for the web client
make desktop-dev    # Electron app from source
make help           # every target
```

`make wasm` rebuilds the WebAssembly engine into
`apps/web/src/wasm/sim-core`; the client runs a private world on it without a
server. Server options are in `apps/server/.env.example`.

## The checks CI runs

Run these before opening a PR. CI skips suites whose inputs did not change, but
runs everything on `main`.

| Area | Commands |
|---|---|
| Rust | `cargo fmt --all` then `cargo clippy --workspace --all-targets --locked --release -- -D warnings` then `cargo test --release --locked --workspace` |
| Web (`apps/web`) | `pnpm exec prettier --check "src/**/*.{ts,tsx,js,jsx,json,css}"`, `pnpm exec tsc -b --noEmit`, `pnpm exec eslint src`, `pnpm exec vitest run`, `pnpm run build` |
| Desktop (`apps/desktop`) | `pnpm exec tsc -p tsconfig.json --noEmit` and `pnpm run test:main` |
| Performance budget | `make perf-gate` (`scripts/perf-gate.sh`): three seeds, a time-per-tick and memory budget |

Run prettier and `cargo fmt` last, after every edit.

## Running the engine without a server

```bash
cargo run --release -p headless -- --seed 42 --ticks 6000 --every 1000
make profile OUT=profile.csv TICKS=12000      # time per tick and RSS over a run
cargo run --release -p headless -- --sweep-seeds 8   # world-health sweep
```

Runs are deterministic: the same seed and tick count give the same world.

## Measuring performance

Wall-clock time is a poor guide on a shared or busy machine. Use hardware
counters, and compare against a baseline binary built from the same base commit:

```bash
/usr/bin/time -l ./target/release/headless --seed 42 --ticks 2500 --every 2500
#   ... instructions retired / cycles elapsed ...
```

- Take the minimum of several runs and interleave A and B so load affects both.
- A lower instruction count is not enough: confirm cycles drop too. Code layout
  can move cycles by a few percent, so treat changes under ~3% with suspicion.
- To find hot spots, build with line tables and sample a running process:

```bash
CARGO_PROFILE_RELEASE_DEBUG=line-tables-only CARGO_TARGET_DIR=/tmp/prof \
  cargo build --release -p headless
/tmp/prof/release/headless --seed 42 --ticks 9000 --every 9000 &
sample $! 25 -file sample.txt          # macOS; use perf on Linux
```

  Look at *inclusive* time per function first; most of the cost of a tick is
  the per-organism pipeline (see [ARCHITECTURE.md](ARCHITECTURE.md)), not any
  single leaf.

## Proving a refactor or optimisation changed nothing

For anything in `crates/sim-core` that must not change behaviour, compare saved
worlds before and after: run `Simulation::new(seed)` for a few seeds, save at a
few tick counts (for example 1500, 4000, 9000), and hash the saved JSON, on
`main` and on your branch (use a `git worktree` with its own `CARGO_TARGET_DIR`
for the baseline). Every hash must match. Keep that test local: the hashes
change legitimately whenever gameplay does, so it does not belong in the suite.

When a function is rewritten for speed, keep the old version as a
`#[cfg(test)]` reference and add a test that compares the two over a lived-in
world; the band eligibility masks (`actions/resolved.rs`, `eligibility.rs`) and
the spatial index (`sim/spatial.rs`) are examples.

For the web renderer, render fixed scenes with `Date.now` and `Math.random`
stubbed and compare canvas hashes; for server changes, start the real binary and
compare responses per endpoint.

## Pull requests

- One feature or fix per PR, complete with tests; no half-done branches.
- Say what you compared to show behaviour is unchanged, and for performance work
  include before/after counter numbers.
- Squash-merge once every CI check is green.
