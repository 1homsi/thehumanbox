use super::*;
use rand::rngs::StdRng;
use rand::Rng;
use rand::SeedableRng;

fn max_q_for_actions_reference(row: &QRow, actions: &[usize]) -> f32 {
    let m = actions
        .iter()
        .map(|&a| row.get_q(a as u16))
        .fold(f32::NEG_INFINITY, f32::max);
    if m.is_finite() {
        m
    } else {
        0.0
    }
}

#[test]
fn max_q_for_actions_matches_reference_semantics() {
    const ID_TEST_SPACE: usize = 7000;
    let mut rng = StdRng::seed_from_u64(99);
    for _ in 0..500 {
        let row_len = rng.random_range(0..60);
        let mut row: QRow = Vec::new();
        for _ in 0..row_len {
            let a = rng.random_range(0..ID_TEST_SPACE) as u16;
            let v = rng.random_range(-2.0f32..2.0);
            row.set_q(a, v);
        }
        let n_avail = rng.random_range(0..200);
        let mut actions: Vec<usize> = Vec::new();
        let mut seen = vec![false; ID_TEST_SPACE];
        for _ in 0..n_avail {
            let a = rng.random_range(0..ID_TEST_SPACE);
            if !seen[a] {
                seen[a] = true;
                actions.push(a);
            }
        }
        let expected = max_q_for_actions_reference(&row, &actions);
        let got = row.max_q_for_actions(&actions);
        assert!(
            (expected - got).abs() < 1e-6,
            "mismatch: expected {expected} got {got} (row {row:?}, actions {actions:?})"
        );
    }
}

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

fn learning_test_org(memory_strength: f32, curiosity: f32, fear: f32, resilience: f32) -> Organism {
    let mut org = Organism::new(
        "id".into(),
        "Learner".into(),
        0.0,
        0.0,
        0,
        "".into(),
        "lin".into(),
        5000,
        Traits {
            memory_strength,
            curiosity,
            fear,
            resilience,
            ..Traits::default()
        },
    );
    org.q_table.insert("next".into(), vec![(2, 1.0)]);
    org
}

#[test]
fn learning_rate_scales_with_memory_strength() {
    let mut slow = learning_test_org(0.1, 0.5, 0.5, 0.5);
    let mut fast = learning_test_org(0.9, 0.5, 0.5, 0.5);

    slow.learn("state", 1, 0.2, "next");
    fast.learn("state", 1, 0.2, "next");

    let slow_q = slow.q_table.get("state").unwrap().get_q(1);
    let fast_q = fast.q_table.get("state").unwrap().get_q(1);
    assert!(fast_q > slow_q, "fast_q={fast_q} slow_q={slow_q}");
}

#[test]
fn curious_organisms_value_future_reward_more() {
    let mut cautious = learning_test_org(0.5, 0.1, 0.5, 0.5);
    let mut curious = learning_test_org(0.5, 0.9, 0.5, 0.5);

    cautious.learn("state", 1, 0.0, "next");
    curious.learn("state", 1, 0.0, "next");

    let cautious_q = cautious.q_table.get("state").unwrap().get_q(1);
    let curious_q = curious.q_table.get("state").unwrap().get_q(1);
    assert!(
        curious_q > cautious_q,
        "curious_q={curious_q} cautious_q={cautious_q}"
    );
}

#[test]
fn fearful_low_resilience_organisms_learn_stronger_negative_signal() {
    let mut resilient = learning_test_org(0.5, 0.5, 0.1, 0.9);
    let mut fearful = learning_test_org(0.5, 0.5, 0.9, 0.1);

    resilient.learn("state", 1, -0.2, "missing");
    fearful.learn("state", 1, -0.2, "missing");

    let resilient_q = resilient.q_table.get("state").unwrap().get_q(1);
    let fearful_q = fearful.q_table.get("state").unwrap().get_q(1);
    assert!(
        fearful_q < resilient_q,
        "fearful_q={fearful_q} resilient_q={resilient_q}"
    );
}

#[test]
fn learning_bootstrap_respects_available_next_actions() {
    let mut unrestricted = learning_test_org(0.5, 0.5, 0.5, 0.5);
    let mut restricted = learning_test_org(0.5, 0.5, 0.5, 0.5);
    unrestricted
        .q_table
        .insert("next".into(), vec![(10, 8.0), (2, 1.0)]);
    restricted
        .q_table
        .insert("next".into(), vec![(10, 8.0), (2, 1.0)]);

    unrestricted.learn("state", 1, 0.0, "next");
    restricted.learn_with_available_actions("state", 1, 0.0, "next", Some(&[2]));

    let unrestricted_q = unrestricted.q_table.get("state").unwrap().get_q(1);
    let restricted_q = restricted.q_table.get("state").unwrap().get_q(1);
    assert!(
        restricted_q < unrestricted_q,
        "restricted_q={restricted_q} unrestricted_q={unrestricted_q}"
    );
}

#[test]
fn q_row_available_action_max_treats_unseen_actions_as_zero() {
    let row = vec![(3, -0.5), (4, -0.2)];

    assert_eq!(row.max_q_for_actions(&[3, 99]), 0.0);
}

#[test]
fn remembered_resource_selection_avoids_known_danger() {
    let mut water = FxHashMap::default();
    water.insert((80, 5), 1.0);
    water.insert((40, 5), 0.55);
    let mut danger = FxHashMap::default();
    danger.insert((80, 5), 0.9);

    let target = Organism::best_remembered_with_danger(&water, 5.0, 5.0, &danger, 0.8);

    assert_eq!(target, Some((40, 5)));
}

#[test]
fn remembered_resource_selection_still_uses_strong_safe_memory() {
    let mut food = FxHashMap::default();
    food.insert((80, 5), 1.0);
    food.insert((40, 5), 0.55);
    let danger = FxHashMap::default();

    let target = Organism::best_remembered_with_danger(&food, 5.0, 5.0, &danger, 0.8);

    assert_eq!(target, Some((80, 5)));
}

#[test]
fn perception_encodes_remembered_resource_direction() {
    let mut rng = StdRng::seed_from_u64(0);
    let traits = Traits::random(&mut rng);
    let grid = WorldGrid::new(3);
    let spatial = crate::sim::spatial::SpatialIndex::build(&[], 10);
    let mut org = Organism::new(
        "id".into(),
        "Rememberer".into(),
        50.0,
        50.0,
        0,
        "".into(),
        "lin".into(),
        5000,
        traits,
    );
    org.energy = 0.30;
    org.food_memory.insert((80, 50), 0.8);

    let perception = org.perceive(&grid, &[], false, false, &spatial);

    assert_eq!(perception.chars().nth(2), Some('X'), "no visible food");
    assert_eq!(perception.chars().nth(4), Some('E'), "remembered food is east");
}

#[test]
fn perception_ignores_dangerous_remembered_resource() {
    let mut rng = StdRng::seed_from_u64(0);
    let traits = Traits::random(&mut rng);
    let grid = WorldGrid::new(4);
    let spatial = crate::sim::spatial::SpatialIndex::build(&[], 10);
    let mut org = Organism::new(
        "id".into(),
        "Cautious".into(),
        50.0,
        50.0,
        0,
        "".into(),
        "lin".into(),
        5000,
        traits,
    );
    org.energy = 0.30;
    org.food_memory.insert((80, 50), 0.9);
    org.danger_memory.insert((80, 50), 0.9);

    assert_eq!(
        Organism::best_remembered_with_danger(&org.food_memory, org.x, org.y, &org.danger_memory, 0.5),
        None
    );

    let perception = org.perceive(&grid, &[], false, false, &spatial);

    assert_eq!(perception.chars().nth(4), Some('X'), "{perception}");
}

#[test]
fn perception_encodes_carried_food_and_water_reserves() {
    let mut rng = StdRng::seed_from_u64(0);
    let traits = Traits::random(&mut rng);
    let grid = WorldGrid::new(5);
    let spatial = crate::sim::spatial::SpatialIndex::build(&[], 10);
    let mut org = Organism::new(
        "id".into(),
        "Prepared".into(),
        50.0,
        50.0,
        0,
        "".into(),
        "lin".into(),
        5000,
        traits,
    );
    org.inv_food = 3;
    org.inv_water = 1;

    let perception = org.perceive(&grid, &[], false, false, &spatial);

    assert_eq!(perception.chars().nth(16), Some('2'), "stocked food reserve");
    assert_eq!(perception.chars().nth(17), Some('1'), "light water reserve");
}

#[test]
fn hungry_organism_filters_learned_choice_to_survival_actions() {
    let mut rng = StdRng::seed_from_u64(0);
    let traits = Traits::random(&mut rng);
    let mut grid = WorldGrid::new(4);
    for x in 40..=60 {
        for y in 40..=60 {
            grid.set(x, y, Tile::Sand);
        }
    }
    let mut org = Organism::new(
        "id".into(),
        "Hungry".into(),
        50.0,
        50.0,
        0,
        "".into(),
        "lin".into(),
        5000,
        traits,
    );
    org.energy = 0.32;
    org.hydration = 0.80;
    org.q_table
        .insert("state".into(), vec![(3000, 9.0), (1140, 0.4), (0, 0.2)]);

    let (action, _) = org.choose_action(
        &grid,
        &[],
        100,
        0.0,
        &[],
        false,
        0,
        &mut rng,
        false,
        "state",
        &[0, 1140, 3000],
    );

    assert_eq!(action, 1140);
}

#[test]
fn injured_organism_filters_learned_choice_to_recovery_actions() {
    let mut rng = StdRng::seed_from_u64(0);
    let traits = Traits::random(&mut rng);
    let mut grid = WorldGrid::new(4);
    for x in 40..=60 {
        for y in 40..=60 {
            grid.set(x, y, Tile::Grass);
        }
    }
    let mut org = Organism::new(
        "id".into(),
        "Injured".into(),
        50.0,
        50.0,
        0,
        "".into(),
        "lin".into(),
        5000,
        traits,
    );
    org.energy = 0.80;
    org.hydration = 0.80;
    org.health = 0.42;
    org.q_table
        .insert("state".into(), vec![(3000, 9.0), (17, 0.4), (0, 0.2)]);

    let (action, _) = org.choose_action(
        &grid,
        &[],
        100,
        0.0,
        &[],
        false,
        0,
        &mut rng,
        false,
        "state",
        &[0, 17, 3000],
    );

    assert_eq!(action, 17);
}

#[test]
fn active_directive_does_not_override_stronger_learned_choice() {
    let mut rng = StdRng::seed_from_u64(0);
    let traits = Traits::random(&mut rng);
    let mut grid = WorldGrid::new(4);
    for x in 40..=60 {
        for y in 40..=60 {
            grid.set(x, y, Tile::Sand);
        }
    }
    let mut org = Organism::new(
        "id".into(),
        "SelfDirected".into(),
        50.0,
        50.0,
        0,
        "".into(),
        "lin".into(),
        5000,
        traits,
    );
    org.energy = 0.80;
    org.hydration = 0.80;
    org.health = 0.90;
    org.age = 1500;
    org.directive = "hunt".to_string();
    org.directive_until = 1_000;
    org.q_table.insert("state".into(), vec![(24, 5.0), (12, 0.1)]);

    let (action, _) = org.choose_action(
        &grid,
        &[],
        100,
        0.0,
        &[],
        false,
        0,
        &mut rng,
        false,
        "state",
        &[12, 24],
    );

    assert_eq!(action, 24);
}

#[test]
fn active_directive_biases_tie_without_forcing_action() {
    let mut rng = StdRng::seed_from_u64(0);
    let traits = Traits::random(&mut rng);
    let mut grid = WorldGrid::new(4);
    for x in 40..=60 {
        for y in 40..=60 {
            grid.set(x, y, Tile::Sand);
        }
    }
    let mut org = Organism::new(
        "id".into(),
        "Influenced".into(),
        50.0,
        50.0,
        0,
        "".into(),
        "lin".into(),
        5000,
        traits,
    );
    org.energy = 0.80;
    org.hydration = 0.80;
    org.health = 0.90;
    org.age = 1500;
    org.directive = "trade".to_string();
    org.directive_until = 1_000;
    org.q_table.insert("state".into(), vec![(13, 0.0), (24, 0.0)]);

    let (action, _) = org.choose_action(
        &grid,
        &[],
        100,
        0.0,
        &[],
        false,
        0,
        &mut rng,
        false,
        "state",
        &[13, 24],
    );

    assert_eq!(action, 13);
}

#[test]
fn equal_q_actions_do_not_always_choose_the_highest_id() {
    let mut chosen = std::collections::HashSet::new();
    let mut grid = WorldGrid::new(4);
    for x in 40..=60 {
        for y in 40..=60 {
            grid.set(x, y, Tile::Sand);
        }
    }
    for seed in 0..32 {
        let mut rng = StdRng::seed_from_u64(seed);
        let traits = Traits::random(&mut rng);
        let mut org = Organism::new(
            format!("id-{seed}"),
            "Tied".into(),
            50.0,
            50.0,
            0,
            "".into(),
            "lin".into(),
            5000,
            traits,
        );
        org.energy = 0.80;
        org.hydration = 0.80;
        org.health = 0.90;
        org.age = 1500;
        org.q_table.insert("state".into(), vec![(3000, 1.0), (3001, 1.0)]);

        let (action, _) = org.choose_action(
            &grid,
            &[],
            100,
            0.0,
            &[],
            false,
            0,
            &mut rng,
            false,
            "state",
            &[3000, 3001],
        );
        if matches!(action, 3000 | 3001) {
            chosen.insert(action);
        }
    }

    assert_eq!(
        chosen.len(),
        2,
        "seeded tie-breaking should reach both equal actions"
    );
}

#[test]
fn wander_target_does_not_override_stronger_learned_choice() {
    let mut rng = StdRng::seed_from_u64(0);
    let traits = Traits::random(&mut rng);
    let mut grid = WorldGrid::new(4);
    for x in 40..=60 {
        for y in 40..=60 {
            grid.set(x, y, Tile::Sand);
        }
    }
    let mut org = Organism::new(
        "id".into(),
        "SelfDirectedWanderer".into(),
        50.0,
        50.0,
        0,
        "".into(),
        "lin".into(),
        5000,
        traits,
    );
    org.energy = 0.80;
    org.hydration = 0.80;
    org.health = 0.90;
    org.age = 1500;
    org.wander_target = Some((80, 50));
    org.q_table.insert("state".into(), vec![(3, 0.1), (24, 5.0)]);

    let (action, thought) = org.choose_action(
        &grid,
        &[],
        100,
        0.0,
        &[],
        false,
        0,
        &mut rng,
        false,
        "state",
        &[3, 24],
    );

    assert_eq!(action, 24);
    assert_ne!(thought.as_deref(), Some("wandering"));
}

#[test]
fn wander_target_biases_tie_without_forcing_action() {
    let mut rng = StdRng::seed_from_u64(0);
    let traits = Traits::random(&mut rng);
    let mut grid = WorldGrid::new(4);
    for x in 40..=60 {
        for y in 40..=60 {
            grid.set(x, y, Tile::Sand);
        }
    }
    let mut org = Organism::new(
        "id".into(),
        "SuggestibleWanderer".into(),
        50.0,
        50.0,
        0,
        "".into(),
        "lin".into(),
        5000,
        traits,
    );
    org.energy = 0.80;
    org.hydration = 0.80;
    org.health = 0.90;
    org.age = 1500;
    org.wander_target = Some((80, 50));
    org.q_table.insert("state".into(), vec![(3, 0.0), (24, 0.0)]);

    let (action, thought) = org.choose_action(
        &grid,
        &[],
        100,
        0.0,
        &[],
        false,
        0,
        &mut rng,
        false,
        "state",
        &[3, 24],
    );

    assert_eq!(action, 3);
    assert_eq!(thought.as_deref(), Some("wandering"));
}

#[test]
fn hydrated_organisms_leave_water_instead_of_lingering() {
    let mut rng = StdRng::seed_from_u64(0);
    let traits = Traits::random(&mut rng);
    let mut grid = WorldGrid::new(1);
    grid.set(10, 10, Tile::Water);
    grid.set(11, 10, Tile::Grass);

    let mut org = Organism::new(
        "id".into(),
        "Swimmer".into(),
        10.0,
        10.0,
        0,
        "".into(),
        "lin".into(),
        5000,
        traits,
    );
    org.hydration = 0.95;
    org.water_ticks = 8;

    let (action, thought) = org.choose_action(&grid, &[], 100, 0.0, &[], false, 0, &mut rng, false, "", &[]);

    assert_eq!(DIRECTIONS[action], (1, 0));
    assert_eq!(thought.as_deref(), Some("swimming ashore"));
}

#[test]
fn movement_toward_land_avoids_deep_water_step() {
    let mut rng = StdRng::seed_from_u64(0);
    let traits = Traits::random(&mut rng);
    let mut grid = WorldGrid::new(2);
    grid.set(10, 10, Tile::Grass);
    grid.set(11, 10, Tile::Water);
    let wi = WorldGrid::idx(11, 10);
    grid.depth[wi] = 0.9;

    let org = Organism::new(
        "id".into(),
        "Walker".into(),
        10.0,
        10.0,
        0,
        "".into(),
        "lin".into(),
        5000,
        traits,
    );

    let action = org.toward((20, 10), &grid);
    assert_ne!(DIRECTIONS[action], (1, 0));
}

#[test]
fn movement_toward_target_prefers_safer_nearby_step() {
    let mut rng = StdRng::seed_from_u64(0);
    let traits = Traits::random(&mut rng);
    let mut grid = WorldGrid::new(2);
    for x in 8..=12 {
        for y in 8..=12 {
            grid.set(x, y, Tile::Grass);
        }
    }
    let east_idx = WorldGrid::idx(11, 10);
    grid.hazard[east_idx] = 0.95;

    let org = Organism::new(
        "id".into(),
        "CautiousWalker".into(),
        10.0,
        10.0,
        0,
        "".into(),
        "lin".into(),
        5000,
        traits,
    );

    let action = org.toward((20, 10), &grid);

    assert_ne!(DIRECTIONS[action], (1, 0));
    assert!(matches!(DIRECTIONS[action], (1, -1) | (1, 1)));
}

#[test]
fn movement_toward_target_uses_hazardous_step_when_safer_routes_blocked() {
    let mut rng = StdRng::seed_from_u64(0);
    let traits = Traits::random(&mut rng);
    let mut grid = WorldGrid::new(2);
    for x in 8..=12 {
        for y in 8..=12 {
            grid.set(x, y, Tile::Grass);
        }
    }
    grid.hazard[WorldGrid::idx(11, 10)] = 0.95;
    grid.set(11, 9, Tile::Rock);
    grid.set(11, 11, Tile::Rock);

    let org = Organism::new(
        "id".into(),
        "TrappedWalker".into(),
        10.0,
        10.0,
        0,
        "".into(),
        "lin".into(),
        5000,
        traits,
    );

    let action = org.toward((20, 10), &grid);

    assert_eq!(DIRECTIONS[action], (1, 0));
}

#[test]
fn movement_toward_shelter_does_not_step_into_hut_tile() {
    let mut rng = StdRng::seed_from_u64(0);
    let traits = Traits::random(&mut rng);
    let mut grid = WorldGrid::new(2);
    for x in 8..=12 {
        for y in 8..=12 {
            grid.set(x, y, Tile::Grass);
        }
    }
    grid.set(11, 10, Tile::Hut);

    let org = Organism::new(
        "id".into(),
        "ShelterSeeker".into(),
        10.0,
        10.0,
        0,
        "".into(),
        "lin".into(),
        5000,
        traits,
    );

    let action = org.toward((11, 10), &grid);

    assert_ne!(DIRECTIONS[action], (1, 0));
    assert!(grid
        .get(10 + DIRECTIONS[action].0, 10 + DIRECTIONS[action].1)
        .walkable());
}

#[test]
fn movement_toward_target_does_not_step_into_mineral_tile() {
    let mut rng = StdRng::seed_from_u64(0);
    let traits = Traits::random(&mut rng);
    let mut grid = WorldGrid::new(2);
    for x in 8..=12 {
        for y in 8..=12 {
            grid.set(x, y, Tile::Grass);
        }
    }
    grid.set(11, 10, Tile::Mineral);

    let org = Organism::new(
        "id".into(),
        "Miner".into(),
        10.0,
        10.0,
        0,
        "".into(),
        "lin".into(),
        5000,
        traits,
    );

    let action = org.toward((20, 10), &grid);

    assert_ne!(DIRECTIONS[action], (1, 0));
    assert!(grid
        .get(10 + DIRECTIONS[action].0, 10 + DIRECTIONS[action].1)
        .walkable());
}
