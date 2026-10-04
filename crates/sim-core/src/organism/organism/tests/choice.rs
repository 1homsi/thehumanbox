//! Choosing an action: survival filters, directives, ties and wander targets.

use super::*;

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
        &BuildingList::new(),
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
        &BuildingList::new(),
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
        &BuildingList::new(),
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
        &BuildingList::new(),
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
    let mut chosen = rustc_hash::FxHashSet::default();
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
            &BuildingList::new(),
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
fn untried_actions_are_not_ranked_by_numeric_id() {
    let mut chosen = rustc_hash::FxHashSet::default();
    let mut grid = WorldGrid::new(4);
    for x in 40..=60 {
        for y in 40..=60 {
            grid.set(x, y, Tile::Sand);
        }
    }
    for seed in 0..64 {
        let mut rng = StdRng::seed_from_u64(seed);
        let mut traits = Traits::random(&mut rng);
        traits.curiosity = 0.5;
        let mut org = Organism::new(
            format!("id-{seed}"),
            "Unbiased".into(),
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

        let (action, _) = org.choose_action(
            &grid,
            &BuildingList::new(),
            100,
            0.0,
            &[],
            false,
            0,
            &mut rng,
            false,
            "state",
            &[24, 3001],
        );
        if matches!(action, 24 | 3001) {
            chosen.insert(action);
        }
    }

    assert_eq!(
        chosen.len(),
        2,
        "cold-start selection should not privilege the higher action id"
    );
}

#[test]
fn serialized_learning_summary_reports_experience() {
    let mut org = learning_test_org(0.5, 0.9, 0.5, 0.5);
    org.learn("foraging", 8, 0.2, "next");
    org.learn("foraging", 9, -0.1, "next");

    let learning = org.to_json().learning.expect("learning summary");
    assert!(learning.states >= 2);
    assert!(learning.tried_actions >= 3);
    assert!(learning.promising_states >= 1);
    assert!(learning.confidence > 0.0);
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
        &BuildingList::new(),
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
        &BuildingList::new(),
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
