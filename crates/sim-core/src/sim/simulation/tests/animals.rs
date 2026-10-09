//! Animals: wolves and packs, dogs and their owners, breeding and seasons.

use super::*;

fn alive_resident_indices(sim: &Simulation) -> FxHashMap<String, usize> {
    sim.organisms
        .iter()
        .enumerate()
        .filter(|(_, resident)| resident.alive)
        .map(|(index, resident)| (resident.id.clone(), index))
        .collect()
}

#[test]
fn local_human_queries_preserve_animal_moves_and_rng() {
    let mut sim = Simulation::new(0xA11A);
    flatten_test_area(&mut sim, 50, 50);
    sim.organisms.clear();
    for i in 0..96 {
        let mut person = Organism::new(
            format!("person-{i}"),
            "resident".into(),
            40.0 + (i * 7 % 30) as f32,
            40.0 + (i * 11 % 25) as f32,
            1,
            String::new(),
            "lineage-a".into(),
            10_000,
            crate::organism::traits::Traits::default(),
        );
        person.alive = i % 13 != 0;
        sim.organisms.push(person);
    }
    let all_humans: Vec<_> = sim
        .organisms
        .iter()
        .filter(|person| person.alive)
        .map(|person| (person.x, person.y))
        .collect();
    let spatial = SpatialIndex::build(&sim.organisms, 10);
    let mut candidates = Vec::new();
    let mut local_humans = Vec::new();

    for kind in [
        AnimalKind::Rabbit,
        AnimalKind::Deer,
        AnimalKind::Boar,
        AnimalKind::Bird,
        AnimalKind::Fish,
        AnimalKind::Wolf,
        AnimalKind::Dog,
    ] {
        for (x, y) in [(49.0, 50.0), (60.0, 50.0), (200.0, 200.0)] {
            let radius = if kind.predator() {
                20
            } else {
                kind.flee_radius().ceil() as i32
            };
            nearby_human_positions(
                &sim.organisms,
                &spatial,
                x,
                y,
                radius,
                &mut candidates,
                &mut local_humans,
            );
            let mut reference = Animal::new(1, x, y, kind);
            let mut indexed = Animal::new(1, x, y, kind);
            let mut reference_rng = ChaCha8Rng::seed_from_u64(0x51A);
            let mut indexed_rng = ChaCha8Rng::seed_from_u64(0x51A);
            reference.tick(&sim.grid, &all_humans, &[], &[(53.0, 50.0)], &mut reference_rng);
            indexed.tick(&sim.grid, &local_humans, &[], &[(53.0, 50.0)], &mut indexed_rng);
            assert_eq!(
                (
                    indexed.x,
                    indexed.y,
                    indexed.energy,
                    indexed.alive,
                    indexed_rng.random::<u64>()
                ),
                (
                    reference.x,
                    reference.y,
                    reference.energy,
                    reference.alive,
                    reference_rng.random::<u64>()
                ),
                "{} moved differently at ({x}, {y})",
                kind.name()
            );
        }
    }
}

#[test]
fn wolf_encounters_keep_population_order_and_pack_defence_at_bucket_edges() {
    let mut people = Vec::new();
    for i in 0..600 {
        let mut person = Organism::new(
            format!("person-{i}"),
            "resident".into(),
            10.0 + (i * 17 % 130) as f32 + if i % 2 == 0 { 0.1 } else { 0.8 },
            10.0 + (i * 29 % 110) as f32 + if i % 3 == 0 { 0.9 } else { 0.2 },
            1,
            String::new(),
            format!("lineage-{}", i % 5),
            10_000,
            crate::organism::traits::Traits::default(),
        );
        person.alive = i % 19 != 0;
        person.energy = if i % 4 == 0 { 0.8 } else { 0.5 };
        person.traits.aggression = if i % 3 == 0 { 0.3 } else { 0.7 };
        people.push(person);
    }
    let spatial = SpatialIndex::build(&people, 10);
    let mut candidates = Vec::new();
    for (wx, wy) in [(49.9, 50.1), (50.1, 49.9), (99.8, 80.2), (300.0, 300.0)] {
        ordered_human_candidates(&spatial, wx, wy, 3, &mut candidates);
        let tame = |p: &Organism| {
            p.alive
                && p.energy >= 0.7
                && p.traits.aggression <= 0.5
                && (p.x - wx).abs() + (p.y - wy).abs() <= 2.5
        };
        let bite = |p: &Organism| p.alive && (p.x - wx).abs() + (p.y - wy).abs() <= 1.5;
        let reference_tames: Vec<_> = people
            .iter()
            .enumerate()
            .filter(|(_, p)| tame(p))
            .map(|(index, _)| index)
            .collect();
        let indexed_tames: Vec<_> = candidates
            .iter()
            .copied()
            .filter(|&index| tame(&people[index]))
            .collect();
        assert_eq!(indexed_tames, reference_tames, "taming at ({wx}, {wy})");

        let pack_defence = |person: &Organism, neighbours: &[usize]| {
            neighbours
                .iter()
                .filter(|&&index| {
                    let kin = &people[index];
                    kin.alive
                        && kin.id != person.id
                        && kin.lineage_id == person.lineage_id
                        && (kin.x - wx).abs() + (kin.y - wy).abs() <= 3.0
                })
                .count()
        };
        let all_indices: Vec<_> = (0..people.len()).collect();
        let reference_bites: Vec<_> = people
            .iter()
            .enumerate()
            .filter(|(_, p)| bite(p))
            .map(|(index, p)| (index, pack_defence(p, &all_indices)))
            .collect();
        let indexed_bites: Vec<_> = candidates
            .iter()
            .copied()
            .filter(|&index| bite(&people[index]))
            .map(|index| (index, pack_defence(&people[index], &candidates)))
            .collect();
        assert_eq!(indexed_bites, reference_bites, "bites at ({wx}, {wy})");
    }
}

#[test]
fn animal_population_does_not_respawn_without_living_adults() {
    let mut sim = Simulation::new(29);
    sim.animals.clear();

    let resident_indices = alive_resident_indices(&sim);
    sim.tick_animals(&resident_indices);

    assert_eq!(sim.animals.iter().filter(|a| a.alive).count(), 0);
}

#[test]
fn dense_animal_clusters_stop_reproducing() {
    let mut sim = Simulation::new(31);
    sim.animals.clear();
    for i in 0..20 {
        let mut a = Animal::new(i, 50.0, 50.0, AnimalKind::Rabbit);
        a.energy = 0.95;
        a.last_reproduced = 0;
        sim.animals.push(a);
    }
    sim.next_animal_id = 100;
    sim.tick_count = 5_000;

    let resident_indices = alive_resident_indices(&sim);
    for _ in 0..2_000 {
        sim.tick_animals(&resident_indices);
    }

    let alive = sim.animals.iter().filter(|a| a.alive).count();
    assert!(
        alive <= 35,
        "dense cluster ran away to {alive} animals - carrying-capacity factor isn't working"
    );
}

#[test]
fn bonded_dog_still_comforts_living_owner_but_ignores_stale_dead_owner_entry() {
    let mut sim = Simulation::new(0xD06);
    flatten_test_area(&mut sim, 50, 50);
    sim.organisms.clear();
    let mut owner = Organism::new(
        "owner".into(),
        "Owner".into(),
        51.0,
        50.0,
        1,
        String::new(),
        "lineage-a".into(),
        10_000,
        crate::organism::traits::Traits::default(),
    );
    owner.loneliness = 0.5;
    owner.boredom = 0.5;
    owner.comfort = 0.5;
    sim.organisms.push(owner);
    sim.animals.clear();
    let mut dog = Animal::new(1, 50.0, 50.0, AnimalKind::Dog);
    dog.bonded_org = Some("owner".into());
    sim.animals.push(dog);
    sim.tick_count = 100;
    let resident_indices = alive_resident_indices(&sim);

    sim.tick_animals(&resident_indices);
    assert!((sim.organisms[0].loneliness - 0.496).abs() < 0.0001);
    assert!((sim.organisms[0].boredom - 0.498).abs() < 0.0001);
    assert!((sim.organisms[0].comfort - 0.501).abs() < 0.0001);

    sim.organisms[0].alive = false;
    sim.tick_animals(&resident_indices);
    assert!((sim.organisms[0].loneliness - 0.496).abs() < 0.0001);
    assert!((sim.organisms[0].comfort - 0.501).abs() < 0.0001);
}

#[test]
fn archive_compaction_keeps_bonded_dog_owner_index_valid() {
    let mut sim = Simulation::new(0xA2C4);
    flatten_test_area(&mut sim, 50, 50);
    sim.organisms.clear();
    for i in 0..802 {
        let mut archived = Organism::new(
            format!("archived-{i}"),
            "Archived".into(),
            20.0,
            20.0,
            1,
            String::new(),
            "old-lineage".into(),
            10_000,
            crate::organism::traits::Traits::default(),
        );
        archived.alive = false;
        sim.organisms.push(archived);
    }
    let owner = Organism::new(
        "owner".into(),
        "Owner".into(),
        51.0,
        50.0,
        1,
        String::new(),
        "lineage-a".into(),
        10_000,
        crate::organism::traits::Traits::default(),
    );
    sim.organisms.push(owner);
    sim.animals.clear();
    let mut dog = Animal::new(1, 50.0, 50.0, AnimalKind::Dog);
    dog.bonded_org = Some("owner".into());
    sim.animals.push(dog);
    sim.tick_count = 1199;
    sim.last_immigration_tick = 1199;

    sim.tick();

    assert_eq!(sim.organisms.len(), 801);
    assert_eq!(sim.organisms[800].id, "owner");
    assert!(sim
        .animals
        .iter()
        .any(|animal| animal.bonded_org.as_deref() == Some("owner")));
}

#[test]
fn armed_kin_fight_back_and_kill_attacking_wolves() {
    use crate::organism::animal::{Animal, AnimalKind};
    let mut sim = Simulation::new(3);
    let lineage = sim.organisms[0].lineage_id.clone();
    let mut killed = 0;
    for round in 0..60 {
        let group: Vec<usize> = sim
            .organisms
            .iter()
            .enumerate()
            .filter(|(_, o)| o.alive && o.lineage_id == lineage)
            .map(|(i, _)| i)
            .take(4)
            .collect();
        if group.len() < 2 {
            break;
        }
        for &i in &group {
            let o = &mut sim.organisms[i];
            o.x = 120.0;
            o.y = 90.0;
            o.age = 2000;
            o.health = 1.0;
            o.traits.aggression = 0.9;
            o.discoveries.insert("spear".to_string());
        }
        let id = 90_000 + round;
        let mut wolf = Animal::new(id, 120.5, 90.0, AnimalKind::Wolf);
        wolf.energy = 0.3;
        sim.animals.push(wolf);
        sim.tick();
        if !sim.animals.iter().any(|a| a.id == id && a.alive) {
            killed += 1;
        }
        sim.animals.retain(|a| a.id != id);
    }
    assert!(killed > 0, "armed defenders killed at least one wolf");
}

/// Wild bears sleep the winter through: they stay put until spring.
#[test]
fn wild_bears_hibernate_through_winter() {
    use crate::organism::animal::{Animal, AnimalKind};
    let mut sim = Simulation::new(12);
    sim.animals.clear();
    // A quiet patch of grass far from everyone.
    for y in 20..30 {
        for x in 20..30 {
            sim.grid.set(x, y, Tile::Grass);
        }
    }
    sim.organisms.retain(|o| (o.x - 25.0).hypot(o.y - 25.0) > 60.0);
    sim.animals.push(Animal::new(9001, 25.0, 25.0, AnimalKind::Bear));
    sim.tick_count = crate::sim::config::SEASON_LENGTH * 2 + 5;
    for _ in 0..30 {
        sim.tick();
    }
    let bear = sim.animals.iter().find(|a| a.id == 9001).expect("bear");
    assert!(bear.sleeping, "a wild bear sleeps in winter");
    assert_eq!((bear.x, bear.y), (25.0, 25.0), "and stays where it lay down");
    sim.tick_count = crate::sim::config::SEASON_LENGTH * 3 + 5;
    sim.tick();
    assert!(
        !sim.animals.iter().find(|a| a.id == 9001).unwrap().sleeping,
        "it wakes in spring"
    );
}

/// Birds fly south for the winter, and young animals are only born in
/// spring and summer.
#[test]
fn birds_migrate_and_animals_breed_in_season() {
    use crate::organism::animal::AnimalKind;
    let winter = crate::sim::config::SEASON_LENGTH * 2 + 5;
    let mut sim = Simulation::new(14);
    sim.tick_count = winter;
    // Birds are placed explicitly: which kinds a seed spawns depends on the
    // habitat rules, so the seed alone no longer guarantees any.
    for _ in 0..3 {
        sim.spawn_animal_of_kind(AnimalKind::Bird);
    }
    let before = sim.animals.iter().filter(|a| a.alive).count();
    let max_id = sim.animals.iter().map(|a| a.id).max().unwrap_or(0);
    for _ in 0..200 {
        sim.tick();
    }
    let birds: Vec<_> = sim
        .animals
        .iter()
        .filter(|a| a.alive && a.kind == AnimalKind::Bird)
        .collect();
    assert!(!birds.is_empty());
    assert!(birds.iter().all(|b| b.away), "every wild bird is away in winter");
    // Respawn floors may top up, but no young are born in winter.
    let born = sim
        .animals
        .iter()
        .filter(|a| a.id > max_id && a.kind != AnimalKind::Zombie)
        .count();
    assert!(born <= before / 4, "{born} animals appeared in winter");
    sim.tick_count = crate::sim::config::SEASON_LENGTH * 3 + 5;
    sim.tick();
    assert!(
        sim.animals
            .iter()
            .filter(|a| a.kind == AnimalKind::Bird)
            .all(|b| !b.away),
        "birds return in spring"
    );
}

#[test]
fn family_dogs_walk_home_and_sleep_by_the_hearth_at_night() {
    let mut sim = Simulation::new(0xD06);
    flatten_test_area(&mut sim, 50, 50);
    sim.organisms.clear();
    let mut owner = Organism::new(
        "owner".into(),
        "Owner".into(),
        58.0,
        56.0,
        1,
        String::new(),
        "lineage-a".into(),
        10_000,
        crate::organism::traits::Traits::default(),
    );
    // The owner is out at the edge of the village; the family hearth is at (50, 50).
    owner.home_x = 50.0;
    owner.home_y = 50.0;
    sim.organisms.push(owner);
    sim.animals.clear();
    let mut dog = Animal::new(1, 44.0, 44.0, AnimalKind::Dog);
    dog.bonded_org = Some("owner".into());
    sim.animals.push(dog);
    // Night: the last 30 percent of the day.
    sim.tick_count = 500;

    let resident_indices = alive_resident_indices(&sim);
    let mut slept = false;
    for _ in 0..80 {
        sim.tick_animals(&resident_indices);
        let dog = &sim.animals[0];
        if dog.sleeping {
            slept = true;
            assert!(
                (dog.x - 50.0).abs() + (dog.y - 50.0).abs() <= 1.0,
                "a sleeping dog lies by the hearth, not at ({}, {})",
                dog.x,
                dog.y
            );
        }
    }
    assert!(slept, "the dog should reach the hearth and sleep there at night");

    // Morning: the dog wakes and goes back to following its owner.
    sim.tick_count = 100;
    sim.tick_animals(&resident_indices);
    assert!(!sim.animals[0].sleeping);
}

#[test]
fn fish_with_schoolmates_drift_together_through_the_water() {
    let mut sim = Simulation::new(0x5C00);
    for x in 40..=60 {
        for y in 40..=60 {
            sim.grid.set(x, y, Tile::Water);
        }
    }
    sim.animals.clear();
    for (id, x) in [(1usize, 46.0f32), (2, 50.0), (3, 54.0)] {
        sim.animals.push(Animal::new(id, x, 50.0, AnimalKind::Fish));
    }
    let spread = |sim: &Simulation| {
        let xs: Vec<f32> = sim.animals.iter().map(|a| a.x).collect();
        xs.iter().cloned().fold(f32::MIN, f32::max) - xs.iter().cloned().fold(f32::MAX, f32::min)
    };
    let before = spread(&sim);
    for _ in 0..40 {
        sim.tick_fish_schools();
    }
    assert!(
        spread(&sim) < before,
        "the shoal should close up ({} -> {})",
        before,
        spread(&sim)
    );
    assert!(sim
        .animals
        .iter()
        .all(|a| sim.grid.get(a.x as i32, a.y as i32) == Tile::Water));
}

#[test]
fn fishing_a_shoal_lands_a_fish_from_it() {
    let mut sim = Simulation::new(0xF15);
    sim.animals.clear();
    for i in 0..6usize {
        sim.animals
            .push(Animal::new(i + 1, 30.0 + i as f32, 30.0, AnimalKind::Fish));
    }
    assert_eq!(sim.fish_school_near(30.0, 30.0), 6);
    sim.take_nearest_fish(30.0, 30.0);
    assert_eq!(sim.animals.iter().filter(|a| a.alive).count(), 5);
}

#[test]
fn birds_that_fly_close_together_settle_on_one_heading() {
    let mut sim = Simulation::new(0xB12D);
    flatten_test_area(&mut sim, 50, 50);
    sim.animals.clear();
    for i in 0..8usize {
        let mut bird = Animal::new(
            i + 1,
            46.0 + (i % 4) as f32,
            46.0 + (i / 4) as f32,
            AnimalKind::Bird,
        );
        bird.heading = i as u8;
        sim.animals.push(bird);
    }
    let majority = |sim: &Simulation| {
        let mut votes = [0usize; 8];
        for a in &sim.animals {
            votes[usize::from(a.heading % 8)] += 1;
        }
        votes.into_iter().max().unwrap_or(0)
    };
    assert!(majority(&sim) <= 2);
    for _ in 0..30 {
        sim.tick_bird_flocks();
    }
    assert!(
        majority(&sim) >= 6,
        "a flock should fly one way (majority {})",
        majority(&sim)
    );
}
