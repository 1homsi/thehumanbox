//! The per-tick lineage tallies borrow a lineage's id until they need to keep
//! it. These check them against the versions that copied it for every person.

use super::*;
use crate::sim::agents::growth;

fn lived_in(seed: u64, ticks: u32) -> Simulation {
    let mut sim = Simulation::new(seed);
    sim.tick_n(ticks);
    sim
}

#[test]
fn member_index_matches_the_cloning_version() {
    for seed in [7u64, 42] {
        let sim = lived_in(seed, 1_500);
        let fast = lineage_member_index(&sim.organisms);
        let mut original: FxHashMap<String, Vec<usize>> = FxHashMap::default();
        for (idx, org) in sim.organisms.iter().enumerate() {
            if org.alive {
                original
                    .entry(org.lineage_id.clone())
                    .or_insert_with(Vec::new)
                    .push(idx);
            }
        }
        // The same keys in the same table order, each with the same members.
        let flatten = |map: &FxHashMap<String, Vec<usize>>| {
            map.iter()
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect::<Vec<_>>()
        };
        assert_eq!(flatten(&fast), flatten(&original), "seed {seed}");
        assert!(fast.len() > 3);
    }
}

#[test]
fn population_slots_match_the_cloning_version() {
    for seed in [7u64, 42] {
        let mut sim = lived_in(seed, 1_500);
        // Some unborn children, so the pending-birth arm is exercised.
        for (i, org) in sim.organisms.iter_mut().enumerate() {
            if !org.alive && i % 4 == 0 {
                org.age = 0;
                org.parent_id = format!("parent-{i}");
                org.father_id = Some("father".to_string());
            }
        }
        let fast = growth::lineage_population_slots(&sim.organisms);
        let mut original: FxHashMap<String, usize> = FxHashMap::default();
        for organism in sim
            .organisms
            .iter()
            .filter(|organism| organism.alive || growth::is_pending_birth(organism))
        {
            *original.entry(organism.lineage_id.clone()).or_insert(0) += 1;
        }
        let flatten =
            |map: &FxHashMap<String, usize>| map.iter().map(|(k, v)| (k.clone(), *v)).collect::<Vec<_>>();
        assert_eq!(flatten(&fast), flatten(&original), "seed {seed}");
        assert!(fast.values().sum::<usize>() > 50);
    }
}

#[test]
fn lineage_aggregates_match_the_cloning_version() {
    for seed in [7u64, 42] {
        let mut sim = lived_in(seed, 1_500);
        sim.rebuild_lineage_aggregates();
        let mut original: HashMap<String, LineageAggregate> = HashMap::default();
        for org in sim.organisms.iter().filter(|org| org.alive) {
            let entry = original.entry(org.lineage_id.clone()).or_default();
            entry.population += 1;
            entry.x_sum += org.x;
            entry.y_sum += org.y;
            entry.literacy_sum += org.literacy;
            entry.energy_sum += org.energy;
        }
        // The live map keeps its table from earlier ticks, so compare by key:
        // the tally is only ever looked up, never walked.
        let flatten = |map: &HashMap<String, LineageAggregate>| {
            let mut rows = map
                .iter()
                .map(|(k, a)| {
                    (
                        k.clone(),
                        a.population,
                        a.x_sum.to_bits(),
                        a.y_sum.to_bits(),
                        a.literacy_sum.to_bits(),
                        a.energy_sum.to_bits(),
                    )
                })
                .collect::<Vec<_>>();
            rows.sort();
            rows
        };
        assert_eq!(
            flatten(&sim.lineage_aggregates),
            flatten(&original),
            "seed {seed}"
        );
        assert!(original.len() > 3);
        // Rebuilding on top of last tick's tally starts from nothing.
        sim.rebuild_lineage_aggregates();
        assert_eq!(
            flatten(&sim.lineage_aggregates),
            flatten(&original),
            "seed {seed} twice"
        );
    }
}
