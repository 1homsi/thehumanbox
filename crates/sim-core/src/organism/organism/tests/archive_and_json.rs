//! Archiving and trimming an organism, and its JSON view.

use super::*;

#[test]
fn compress_for_archive_clears_heavy_state_but_keeps_skeleton() {
    let mut rng = StdRng::seed_from_u64(0);
    let traits = Traits::random(&mut rng);
    let mut org = Organism::new(
        "abc12345".into(),
        "Testname".into(),
        10.0,
        20.0,
        3,
        "parent99".into(),
        "lineage1".into(),
        5000,
        traits.clone(),
    );
    org.food_memory.insert((1, 1), 0.5);
    org.water_memory.insert((2, 2), 0.5);
    org.danger_memory.insert((3, 3), 0.5);
    org.q_table
        .insert("state".into(), vec![(0, 0.1), (1, 0.1), (2, 0.1)]);
    org.lineage_attitudes.insert("other".into(), 0.7);
    org.org_trust.insert("xyz".into(), 0.5);
    org.log_event("something happened".into());
    org.discoveries.insert("fire".into());
    org.father_id = Some("father77".into());
    org.alive = false;

    org.compress_for_archive();

    assert!(org.food_memory.is_empty());
    assert!(org.water_memory.is_empty());
    assert!(org.danger_memory.is_empty());
    assert!(org.q_table.is_empty());
    assert!(org.lineage_attitudes.is_empty());
    assert!(org.org_trust.is_empty());
    assert!(org.life_log.is_empty());
    assert!(org.discoveries.is_empty());
    assert_eq!(org.id, "abc12345");
    assert_eq!(org.name, "Testname");
    assert_eq!(org.lineage_id, "lineage1");
    assert_eq!(org.parent_id, "parent99");
    assert_eq!(org.father_id, Some("father77".into()));
    assert_eq!(org.generation, 3);
    assert_eq!(org.max_age, 5000);
    assert_eq!(org.traits.aggression, traits.aggression);
}

#[test]
fn compress_for_archive_skips_live_organisms() {
    let mut rng = StdRng::seed_from_u64(0);
    let traits = Traits::random(&mut rng);
    let mut org = Organism::new(
        "id".into(),
        "Live".into(),
        0.0,
        0.0,
        0,
        "".into(),
        "lin".into(),
        5000,
        traits,
    );
    org.q_table.insert("s".into(), vec![(0, 0.0), (1, 0.0)]);
    org.alive = true;
    org.compress_for_archive();
    assert!(!org.q_table.is_empty());
}

#[test]
fn cognitive_trim_keeps_strongest_learning_and_place_memories() {
    let mut org = learning_test_org(0.5, 0.5, 0.5, 0.5);
    for index in 0..100 {
        org.q_table
            .insert(format!("state-{index}"), vec![(0, index as f32 / 100.0)]);
        org.food_memory.insert((index, index), index as f32 / 100.0);
    }
    org.q_table.insert("strong-danger".into(), vec![(2, -9.0)]);
    org.food_memory.insert((999, 999), 9.0);

    org.trim_cognitive_state(true);

    assert_eq!(org.q_table.len(), 32);
    assert!(org.q_table.contains_key("strong-danger"));
    assert_eq!(org.food_memory.len(), 12);
    assert!(org.food_memory.contains_key(&(999, 999)));
}

/// The frame builder converts organisms with `to_json_value_with`; the serde
/// derive on `OrgJson` (still what the detail API serialises) is the
/// reference. They must give equal values and equal bytes for every field,
/// cold or hot, including the sparse and optional ones.
#[test]
fn direct_org_value_matches_the_serde_conversion() {
    use crate::sim::simulation::Simulation;
    let mut checked = 0;
    for seed in [42u64, 7] {
        let mut sim = Simulation::new(seed);
        for _ in 0..900 {
            sim.tick();
        }
        // Make sure the sparse and optional fields are all populated on some
        // organisms, plus values serde turns into null.
        for (n, org) in sim.organisms.iter_mut().enumerate() {
            match n % 4 {
                0 => {
                    org.joy_ticks = 7;
                    org.aspiration = "to build a bridge".into();
                    org.father_id = Some("f-1".into());
                    org.friends.insert("a-1".into(), "Ada".into());
                    org.friends.insert("b-2".into(), "Bo".into());
                    org.attributes.insert("kind".into());
                    org.attributes.insert("brave".into());
                    org.anchor_events.push((12, "first fire".into(), 0.63));
                    org.tools.insert("axe".into(), 2);
                    org.tools.insert("net".into(), 1);
                    org.home_furniture = vec!["bed".into(), "hearth".into()];
                    org.home_style_seed = 4;
                    org.zodiac = "owl".into();
                    org.birth_tick = 31;
                    // Two long ids that share their first eight characters.
                    org.org_trust.insert("abcdefgh-one".into(), 0.9);
                    org.org_trust.insert("abcdefgh-two".into(), -0.7);
                    org.org_trust.insert("zz".into(), 0.05);
                    org.lineage_attitudes.insert("rival".into(), -0.4);
                    org.lineage_attitudes.insert("kin".into(), 0.05);
                }
                1 => {
                    org.x = f32::NAN;
                    org.energy = f32::INFINITY;
                    org.father_id = None;
                }
                _ => {}
            }
        }
        for org in &sim.organisms {
            // `learning_summary` scans each row once; the previous version
            // scanned them twice. Same numbers, to the bit.
            let states = org.q_table.len();
            let old_promising = org.q_table.values().filter(|row| row.max_q() > 0.01).count();
            let old_confidence = if states == 0 {
                0.0
            } else {
                let total: f32 = org
                    .q_table
                    .values()
                    .map(|row| (row.max_q().max(0.0) / 0.25).clamp(0.0, 1.0))
                    .sum();
                (total / states as f32 * 100.0).round() / 100.0
            };
            let learning = org.learning_summary();
            assert_eq!(learning.states, states);
            assert_eq!(learning.promising_states, old_promising);
            assert_eq!(learning.confidence.to_bits(), old_confidence.to_bits());

            for cold in [true, false] {
                let reference = serde_json::to_value(org.to_json_with(cold)).unwrap();
                let direct = org.to_json_value_with(cold);
                assert_eq!(direct, reference, "org {} cold={cold}", org.id);
                assert_eq!(
                    serde_json::to_vec(&direct).unwrap(),
                    serde_json::to_vec(&reference).unwrap()
                );
                checked += 1;
            }
        }
    }
    assert!(
        checked > 100,
        "the worlds must hold organisms to compare ({checked})"
    );
}
