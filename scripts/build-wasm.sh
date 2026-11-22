#!/usr/bin/env bash
set -euo pipefail

# Builds the browser WebAssembly engine into apps/web/src/wasm/sim-core.
# Used by `make wasm` and by both CI workflows, so every build gets the same
# settings.
#
# The wasm build is optimised differently from the native one: fat LTO with a
# single codegen unit and opt-level 2. Measured against the default release
# profile (opt-level 3, 16 codegen units) the same 500-tick run is about 20%
# faster and the module 10% smaller; opt-level 3 is as fast but larger, and
# "s"/"z" are smaller but slower than the default. Simulation output is
# identical. The flags are passed per invocation so native builds, clippy and
# the test suite keep the quick release profile.
#
# Two modules are produced. sim-core is the SIMD build (`wasm-simd`, explicit
# simd128 kernels only — the rest of the crate is not auto-vectorised). sim-core-scalar
# has none of those opcodes, so a browser without WASM SIMD can still start.
# Both worlds match the native save fingerprint.
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
OUT_DIR=${1:-../../apps/web/src/wasm/sim-core}
# Beside the SIMD package, including when the caller picks another output directory.
SCALAR_DIR=${SCALAR_OUT_DIR:-"$OUT_DIR/scalar"}
TARGET=${WASM_TARGET:-web}

cd "$ROOT"

build() {
  local out="$1"
  local name="$2"
  shift 2
  RUSTFLAGS='--cfg getrandom_backend="wasm_js"' \
    wasm-pack build crates/sim-core --target "$TARGET" --release --out-dir "$out" --out-name "$name" \
    -- \
    "$@" \
    --config 'profile.release.lto="fat"' \
    --config 'profile.release.codegen-units=1' \
    --config 'profile.release.opt-level=2'
}

build "$OUT_DIR" sim_core --features wasm-simd
if [ "${WASM_SCALAR:-1}" = 1 ]; then
  build "$SCALAR_DIR" sim_core_scalar
fi
