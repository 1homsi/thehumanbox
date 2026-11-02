//! Prints the FNV-1a 64 of a world's serialized save after ticking it, for checking
//! that the browser wasm build makes the same world as the native one:
//! `cargo run --release -p sim-core --example save_fingerprint -- [seed] [ticks]`
//! (seed 42, 3000 ticks by default, the same as `scripts/check-wasm-determinism.mjs`).
//!
//! An example rather than a test: the unit-test build registers the test-only
//! `registered/sample` action, which changes the world, and the value is compared
//! against the wasm of the same commit, not against a number kept in the repo.
use sim_core::sim::simulation::Simulation;

/// FNV-1a 64 over the serialized save, the same function the wasm check uses.
fn save_fnv1a64(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf2_9ce4_8422_2325u64, |h, &b| {
        (h ^ u64::from(b)).wrapping_mul(0x0000_0100_0000_01b3)
    })
}

fn main() {
    let mut args = std::env::args().skip(1);
    let seed: u64 = args.next().map_or(42, |s| s.parse().expect("seed is a number"));
    let ticks: u64 = args
        .next()
        .map_or(3000, |s| s.parse().expect("ticks is a number"));
    let mut sim = Simulation::new(seed);
    while sim.tick_count < ticks {
        sim.tick();
    }
    let bytes = serde_json::to_vec(&sim.to_save_state()).expect("save serializes");
    println!("{:#018x}", save_fnv1a64(&bytes));
}
