//! The candidate list built from ranges must be the very list the id-by-id
//! `retain` construction produced, in the same order.

use super::available::available_actions_into_reference;
use super::available_actions_into;
use crate::sim::simulation::Simulation;
use crate::sim::spatial::SpatialIndex;

#[test]
fn range_plan_matches_the_retain_construction() {
    let mut compared = 0usize;
    let mut total_ids = 0usize;
    for seed in [7u64, 42] {
        let mut sim = Simulation::new(seed);
        sim.tick_n(800);
        for stretch in 0..8 {
            sim.tick_n(450);
            let spatial = SpatialIndex::build(&sim.organisms, 10);
            let (mut fast, mut reference) = (Vec::new(), Vec::new());
            let (mut near_a, mut near_b) = (Vec::new(), Vec::new());
            for idx in 0..sim.organisms.len() {
                let (ix, iy) = (sim.organisms[idx].x as i32, sim.organisms[idx].y as i32);
                available_actions_into(&sim, idx, ix, iy, &spatial, &mut fast, &mut near_a);
                available_actions_into_reference(&sim, idx, ix, iy, &spatial, &mut reference, &mut near_b);
                assert_eq!(fast, reference, "seed {seed} stretch {stretch} organism {idx}");
                compared += 1;
                total_ids += fast.len();
            }
        }
    }
    assert!(
        compared > 2_000 && total_ids > 100_000,
        "{compared} lists, {total_ids} ids"
    );
}

/// Two organisms whose gate keys are equal must be let through the same bands:
/// that is all the per-organism mask cache relies on.
#[test]
fn equal_gate_keys_pass_the_same_bands() {
    use super::resolved;
    let tables = resolved::tables();
    let mut names: Vec<String> = Vec::new();
    for resolved_band in tables.base.iter().chain(&tables.banded) {
        for name in resolved_band.band.qualification.discoveries {
            names.push((*name).to_string());
        }
    }
    names.sort();
    names.dedup();
    let specialties = [
        "farmer", "scholar", "healer", "smith", "merchant", "priest", "teacher", "builder",
    ];
    let mut sim = Simulation::new(3);
    let mut org = sim.organisms.swap_remove(0);
    let mut state = 0x2545_F491_4F6C_DD1Du64;
    let mut next = move || {
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        state
    };
    let words = tables.band_count().div_ceil(64);
    let mut seen: Vec<(resolved::GateKey, Vec<u64>)> = Vec::new();
    let mut shared = 0;
    for round in 0..6_000 {
        // Small changes, so that many states repeat.
        match next() % 6 {
            0 => {
                org.discoveries
                    .insert(names[(next() % names.len() as u64) as usize].clone());
            }
            1 => {
                let name = names[(next() % names.len() as u64) as usize].clone();
                org.discoveries.remove(&name);
            }
            2 => org.literacy = [0.0, 0.04, 0.1, 0.16, 0.3, 0.5, 0.9, 1.0, f32::NAN][(next() % 9) as usize],
            3 => org.specialty = (next() % 3 != 0).then(|| specialties[(next() % 8) as usize].to_string()),
            4 => org.is_leader = !org.is_leader,
            _ => org.age = [10, 700, 1200, 2500, 9000][(next() % 5) as usize],
        }
        org.is_elder = next() % 5 == 0;
        let era = [
            crate::sim::era::Era::PreStone,
            crate::sim::era::Era::Stone,
            crate::sim::era::Era::Bronze,
            crate::sim::era::Era::Medieval,
            crate::sim::era::Era::Industrial,
        ][(next() % 5) as usize];
        let gate = tables.org_gate(&org);
        let key = tables.gate_key(&gate, era);
        let mut mask = vec![0u64; words];
        tables.org_pass_mask(&gate, era, &mut mask);
        match seen.iter().find(|(k, _)| *k == key) {
            Some((_, earlier)) => {
                assert_eq!(*earlier, mask, "round {round}: equal keys, different masks");
                shared += 1;
            }
            None => seen.push((key, mask)),
        }
    }
    assert!(shared > 300, "{shared} repeats");
}
