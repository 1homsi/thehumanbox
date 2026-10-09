//! The shipped simulation must reproduce a committed fingerprint on every target.
//!
//! This is an integration test on purpose: it links `sim-core` the way the game
//! and the wasm build do. The unit-test build of the library also registers
//! the test-only `registered/sample` action, which changes the action table and
//! so the world, so unit tests cannot stand in for the shipped world.
//!
//! The same value is checked by `scripts/check-wasm-determinism.mjs` against the
//! browser build. Change `scripts/determinism-fingerprint.json` only when the
//! world is meant to change.

use sim_core::sim::simulation::Simulation;

/// FNV-1a 64 over the serialized save, the same function the wasm check uses.
fn save_fnv1a64(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf2_9ce4_8422_2325u64, |h, &b| {
        (h ^ u64::from(b)).wrapping_mul(0x0000_0100_0000_01b3)
    })
}

#[test]
fn seed_42_save_matches_the_committed_fingerprint_on_this_target() {
    let golden: serde_json::Value =
        serde_json::from_str(include_str!("../../../scripts/determinism-fingerprint.json"))
            .expect("determinism fingerprint file is valid JSON");
    let seed = golden["seed"].as_u64().expect("seed");
    let tick = golden["tick"].as_u64().expect("tick");
    let expected = golden["save_fnv1a64"].as_str().expect("save_fnv1a64");

    let mut sim = Simulation::new(seed);
    while sim.tick_count < tick {
        sim.tick();
    }
    let bytes = serde_json::to_vec(&sim.to_save_state()).expect("save serializes");
    let got = format!("{:#018x}", save_fnv1a64(&bytes));
    assert_eq!(
        got, expected,
        "seed {seed} at tick {tick} no longer matches the committed fingerprint on this target"
    );
}
