# The Human Box — top-level dev tasks.
#
# Install just from https://just.systems and run `just <recipe>`.
# Without just, the recipes here are short enough to copy out by hand.

# Default recipe — show the menu.
default:
    @just --list

# Run the Rust simulation server (release, with autoreload-on-restart).
sim:
    cd simulation && cargo run --release --bin simulation-rs

# Run the Vite client dev server.
client:
    cd client && pnpm dev

# Headless deterministic gate run (fast smoke).
headless seed='42' ticks='6000':
    cd simulation && cargo run --release --bin headless -- --seed {{seed}} --ticks {{ticks}} --every {{ticks}}

# All tests.
test:
    cd simulation && cargo test --release --locked
    cd client     && pnpm test

# Lint + format-check.
lint:
    cd simulation && cargo fmt --all -- --check
    cd simulation && cargo clippy --all-targets -- -D warnings
    cd client     && pnpm lint
    cd client     && pnpm format:check

# Auto-format the entire tree.
fmt:
    cd simulation && cargo fmt --all
    cd client     && pnpm format

# Wipe local world.save to start a fresh world on next sim launch.
wipe:
    rm -f simulation/world.save

# Build the client for production into client/dist.
build:
    cd client && pnpm run build

# Tail the local sim logs (when running under `just sim`).
logs:
    tail -f simulation/sim.log 2>/dev/null || echo "no simulation/sim.log — run with > sim.log first"
