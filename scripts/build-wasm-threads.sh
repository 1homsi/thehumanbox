#!/usr/bin/env bash
set -euo pipefail

# Builds the threaded browser WebAssembly engine into apps/web/src/wasm/sim-core-threads.
# The threaded build runs the world's parallel passes on a pool of Web Workers. It needs
# SharedArrayBuffer, so the worker only uses it on a cross-origin isolated page (see
# apps/web/src/simulation/wasmEngine.ts); every other browser runs the single-thread build from
# scripts/build-wasm.sh. Used by `make wasm` and the CI wasm job.
#
# Threads need the standard library rebuilt with atomics, so this uses a pinned nightly with rust-src
# (wasm-bindgen-rayon's README names the nightly it was tested with). The flags follow that README;
# the shared memory is capped at 1 GiB. The output is named sim_core_threads so both packages can sit
# side by side in the Vite build.
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
OUT_DIR=${1:-../../apps/web/src/wasm/sim-core-threads}
NIGHTLY=${WASM_THREADS_TOOLCHAIN:-nightly-2025-11-15}

cd "$ROOT"
# wasm-pack looks for rustc on PATH, and a Homebrew rustc on PATH has no wasm target: put the pinned
# toolchain's own bin directory first (the Makefile does the same for stable).
PATH="$(dirname "$(rustup which rustc --toolchain "$NIGHTLY")"):$PATH"
RUSTUP_TOOLCHAIN="$NIGHTLY" \
RUSTFLAGS='--cfg getrandom_backend="wasm_js" -C target-feature=+atomics,+bulk-memory,+mutable-globals -C link-arg=--shared-memory -C link-arg=--max-memory=1073741824 -C link-arg=--import-memory -C link-arg=--export=__wasm_init_tls -C link-arg=--export=__tls_size -C link-arg=--export=__tls_align -C link-arg=--export=__tls_base' \
  wasm-pack build crates/sim-core --target web --release --out-dir "$OUT_DIR" --out-name sim_core_threads \
  -- \
  --features wasm-threads \
  -Z build-std=panic_abort,std \
  --config 'profile.release.lto="fat"' \
  --config 'profile.release.codegen-units=1' \
  --config 'profile.release.opt-level=2'
