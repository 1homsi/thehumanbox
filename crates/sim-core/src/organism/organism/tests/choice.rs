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
    let mut chosen = crate::hashing::FxHashSet::default();
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
    let mut chosen = crate::hashing::FxHashSet::default();
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

#[test]
fn at_night_a_person_walks_home_and_sleeps_there_not_in_any_shelter() {
    let mut rng = StdRng::seed_from_u64(3);
    let traits = Traits::random(&mut rng);
    let mut grid = WorldGrid::new(4);
    for x in 30..=70 {
        for y in 30..=70 {
            grid.set(x, y, Tile::Sand);
        }
    }
    let mut org = Organism::new(
        "id".into(),
        "Homeward".into(),
        50.0,
        50.0,
        0,
        "".into(),
        "lin".into(),
        9000,
        traits,
    );
    org.energy = 0.8;
    org.hydration = 0.8;
    org.health = 0.9;
    org.age = 1500;
    org.sleep_debt = 0.4;
    org.home_x = 40.0;
    org.home_y = 50.0;
    let (action, thought) = org.choose_action(
        &grid,
        &BuildingList::new(),
        100,
        0.0,
        &[],
        true,
        0,
        &mut rng,
        false,
        "state",
        &[0, 1, 2, 3, 4, 5, 6, 7, 17],
    );
    assert_ne!(action, 17, "not resting where it stands");
    assert_eq!(thought.as_deref(), Some("going home for the night"));

    // At the door it sleeps.
    org.x = 40.0;
    org.y = 50.0;
    let mut slept = false;
    for _ in 0..20 {
        let (a, t) = org.choose_action(
            &grid,
            &BuildingList::new(),
            100,
            0.0,
            &[],
            true,
            0,
            &mut rng,
            false,
            "state",
            &[0, 1, 2, 3, 4, 5, 6, 7, 17],
        );
        if a == 17 && t.as_deref() == Some("sleeping at home") {
            slept = true;
            break;
        }
    }
    assert!(slept, "the person sleeps at home once there");
}

<<<<<<< HEAD
fn parched_at(tiles: &[((i32, i32), Tile)], hydration: f32) -> (Organism, WorldGrid) {
    let mut rng = StdRng::seed_from_u64(5);
    let traits = Traits::random(&mut rng);
    let mut grid = WorldGrid::new(4);
    for x in 30..=70 {
        for y in 30..=70 {
            grid.set(x, y, Tile::Grass);
        }
    }
    for &((x, y), t) in tiles {
        grid.set(x, y, t);
    }
    let mut org = Organism::new(
        "dry".into(),
        "Dry".into(),
=======
fn worker_on_sand(name: &str) -> (Organism, WorldGrid, StdRng) {
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
        name.into(),
>>>>>>> e57af3ac6 (world: people lean toward work they like and keep from work that hurt them, and elders tell the children how their work is done)
        50.0,
        50.0,
        0,
        "".into(),
        "lin".into(),
        5000,
        traits,
    );
<<<<<<< HEAD
    org.energy = 0.8;
    org.hydration = hydration;
    (org, grid)
}

#[test]
fn someone_thirsty_beside_a_frozen_lake_breaks_the_ice_to_drink() {
    let (org, grid) = parched_at(&[((51, 50), Tile::Ice)], 0.25);
    let mut rng = StdRng::seed_from_u64(0);
    let (action, thought) = org.choose_action(
        &grid,
=======
    org.energy = 0.80;
    org.hydration = 0.80;
    org.health = 0.90;
    org.age = 1500;
    (org, grid, rng)
}

fn learned_pick(org: &Organism, grid: &WorldGrid, rng: &mut StdRng, available: &[usize]) -> usize {
    org.choose_action(
        grid,
>>>>>>> e57af3ac6 (world: people lean toward work they like and keep from work that hurt them, and elders tell the children how their work is done)
        &BuildingList::new(),
        100,
        0.0,
        &[],
        false,
        0,
<<<<<<< HEAD
        &mut rng,
        false,
        "state",
        &[0, 1, 2, 3, 4, 5, 6, 7, 9],
    );
    assert_eq!(action, 9);
    assert_eq!(thought.as_deref(), Some("breaking the ice to drink"));
}

#[test]
fn only_someone_parched_cuts_through_the_houses_between_them_and_water() {
    // Houses built all the way round, with water just beyond.
    let mut tiles: Vec<((i32, i32), Tile)> = (-1i32..=1)
        .flat_map(|dx| (-1i32..=1).map(move |dy| (dx, dy)))
        .filter(|&d| d != (0, 0))
        .map(|(dx, dy)| ((50 + dx, 50 + dy), Tile::Hut))
        .collect();
    tiles.extend((40..=60).map(|x| ((x, 53), Tile::Water)));
    let (parched, grid) = parched_at(&tiles, 0.2);
    let step = parched.toward((50, 53), &grid);
    assert_eq!(
        crate::organism::organism::DIRECTIONS[step].1,
        1,
        "steps toward the water"
    );
    // Someone only thirsty is still held by the houses: no step leads through.
    let (thirsty, grid) = parched_at(&tiles, 0.5);
    let step = thirsty.toward((50, 53), &grid);
    assert_ne!(crate::organism::organism::DIRECTIONS[step], (0, 1));
=======
        rng,
        false,
        "state",
        available,
    )
    .0
}

#[test]
fn dreaded_work_loses_a_close_learned_choice() {
    use crate::organism::skills::{Skill, DREAD};
    let (mut org, grid, mut rng) = worker_on_sand("Wary");
    // Fishing (28) has served a little better than resting (17) here.
    org.q_table.insert("state".into(), vec![(28, 0.30), (17, 0.27)]);
    assert_eq!(learned_pick(&org, &grid, &mut rng, &[17, 28]), 28);

    org.skills.set_feeling(Skill::Fishing, DREAD);
    assert_eq!(learned_pick(&org, &grid, &mut rng, &[17, 28]), 17);
}

#[test]
fn liked_work_wins_a_near_tie_but_not_a_clear_loss() {
    use crate::organism::skills::{Skill, LIKING_CAP};
    let (mut org, grid, mut rng) = worker_on_sand("Keen");
    org.skills.set_feeling(Skill::Fishing, LIKING_CAP);
    org.q_table.insert("state".into(), vec![(28, 0.28), (17, 0.30)]);
    assert_eq!(learned_pick(&org, &grid, &mut rng, &[17, 28]), 28);

    org.q_table.insert("state".into(), vec![(28, 0.28), (17, 0.50)]);
    assert_eq!(learned_pick(&org, &grid, &mut rng, &[17, 28]), 17);
}

#[test]
fn someone_hurt_felling_trees_stops_going_off_to_chop_wood() {
    use crate::organism::skills::{Skill, DREAD};
    let chops = |dread: bool| {
        let mut picks = 0;
        for seed in 0..40 {
            let (mut org, mut grid, _) = worker_on_sand("Axe");
            grid.set(50, 50, Tile::Grass);
            org.discoveries.insert("stone_tools".into());
            if dread {
                org.skills.set_feeling(Skill::Woodcutting, DREAD);
            }
            let mut rng = StdRng::seed_from_u64(seed);
            if learned_pick(&org, &grid, &mut rng, &[17]) == 27 {
                picks += 1;
            }
        }
        picks
    };
    assert!(chops(false) > 0, "a toolmaker on a tree tile sometimes chops");
    assert_eq!(chops(true), 0);
}

#[test]
fn every_daily_work_action_practises_its_own_skill() {
    use crate::organism::skills::Skill;
    for (action, skill) in [
        (27, Skill::Woodcutting),
        (28, Skill::Fishing),
        (29, Skill::Quarrying),
        (34, Skill::Foraging),
        (35, Skill::Farming),
        (338, Skill::Farming),
        (121, Skill::Hunting),
    ] {
        assert_eq!(Skill::of_action(action), Some(skill), "action {action}");
    }
    assert_eq!(Skill::of_action(17), None);
>>>>>>> e57af3ac6 (world: people lean toward work they like and keep from work that hurt them, and elders tell the children how their work is done)
}
