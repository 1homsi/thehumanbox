//! Movement: learned choices against fire, prey and wolves; detours, flee
//! targets, land targets and obstacles.

use super::*;

fn autonomy_test_organism(id: &str, x: f32, y: f32) -> Organism {
    let mut org = Organism::new(
        id.to_string(),
        "Autonomous".to_string(),
        x,
        y,
        0,
        String::new(),
        "lineage-a".to_string(),
        20_000,
        crate::organism::traits::Traits::default(),
    );
    org.alive = true;
    org.age = 1500;
    org.energy = 0.60;
    org.hydration = 0.60;
    org.health = 0.90;
    org.sleep_debt = 0.0;
    org.fear_level = 0.0;
    org.traits.fear = 0.10;
    org.traits.curiosity = 0.10;
    org
}

/// `Tile::Fire` passes `walkable()`, so "can I stand there?" and "should I
/// stand there?" are different questions. These cover the enforcement point:
/// the movement executor that every organism move passes through.
mod fire_is_never_a_destination {
    use super::*;

    /// Ring the organism in fire and confirm it does not step into the flames
    /// on any of many ticks. When all eight neighbours score `-inf`, `toward`
    /// falls through to direction 0, so without the executor's check the
    /// organism walked into whichever tile happened to be first.
    #[test]
    fn a_surrounded_organism_never_steps_into_fire() {
        for seed in [0x5EED_u64, 1, 42, 1337, 2026] {
            let mut sim = Simulation::new(seed);
            sim.organisms.clear();
            sim.animals.clear();
            flatten_test_area(&mut sim, 50, 50);
            sim.organisms.push(autonomy_test_organism("subject", 50.0, 50.0));

            // Fire on all eight neighbours, safe sand two tiles out.
            for (dx, dy) in DIRECTIONS.iter() {
                sim.grid.set(50 + dx, 50 + dy, Tile::Fire);
            }

            for _ in 0..40 {
                tick_first_org(&mut sim);
                let (x, y) = (sim.organisms[0].x as i32, sim.organisms[0].y as i32);
                assert_ne!(
                    sim.grid.get(x, y),
                    Tile::Fire,
                    "seed {seed}: organism ended up standing in fire at {x},{y}"
                );
            }
        }
    }

    /// The same rule has to hold when fire is merely *one* option among
    /// walkable tiles, i.e. the ordinary "wander toward a target" case where
    /// the chosen direction happens to be the burning one.
    #[test]
    fn fire_is_skipped_even_when_other_tiles_are_walkable() {
        let mut sim = Simulation::new(0xF12E);
        sim.organisms.clear();
        sim.animals.clear();
        flatten_test_area(&mut sim, 50, 50);
        sim.organisms.push(autonomy_test_organism("subject", 50.0, 50.0));

        // Fire directly north, sand everywhere else.
        sim.grid.set(50, 49, Tile::Fire);
        for _ in 0..40 {
            tick_first_org(&mut sim);
            let (x, y) = (sim.organisms[0].x as i32, sim.organisms[0].y as i32);
            assert_ne!(sim.grid.get(x, y), Tile::Fire, "walked north into fire");
        }
    }

    /// The executor routes an illegal destination through
    /// `fallback_walkable_step`, so the fallback must not hand back fire
    /// either - that would defeat the whole check.
    #[test]
    fn the_fallback_step_never_returns_fire() {
        let mut sim = Simulation::new(7);
        flatten_test_area(&mut sim, 50, 50);
        // Every neighbour is fire: the fallback must find nothing rather than
        // picking the least-bad flame.
        for (dx, dy) in DIRECTIONS.iter() {
            sim.grid.set(50 + dx, 50 + dy, Tile::Fire);
        }
        assert_eq!(fallback_walkable_step(&sim.grid, 50, 50, 0, 0.5, 1.0), None);

        // With one safe tile available it must return that one, not a flame.
        sim.grid.set(51, 50, Tile::Sand);
        let step = fallback_walkable_step(&sim.grid, 50, 50, 0, 0.5, 1.0);
        assert_eq!(step, Some((51, 50)));
        if let Some((sx, sy)) = step {
            assert_ne!(sim.grid.get(sx, sy), Tile::Fire);
        }
    }
}

fn learned_perception_for_first_org(sim: &Simulation, animal_near: bool) -> String {
    let spatial = SpatialIndex::build(&sim.organisms, 10);
    sim.organisms[0].perceive(&sim.grid, &sim.organisms, false, animal_near, &spatial)
}

fn tick_first_org(sim: &mut Simulation) {
    let mut lineage_counts = FxHashMap::default();
    lineage_counts.insert("lineage-a".to_string(), 1);
    let spatial = SpatialIndex::build(&sim.organisms, 10);
    let animal_spatial = SpatialIndex::build_animals(&sim.animals, 10);
    let mut buffers = TickBuffers::new();
    let org_idx_by_id: FxHashMap<String, usize> = sim
        .organisms
        .iter()
        .enumerate()
        .filter(|(_, o)| o.alive)
        .map(|(i, o)| (o.id.clone(), i))
        .collect();
    let mut lineage_members = lineage_member_index(&sim.organisms);
    sim.tick_organism(
        0,
        1,
        &lineage_counts,
        &spatial,
        &animal_spatial,
        &mut buffers,
        &org_idx_by_id,
        &mut lineage_members,
    );
}

#[test]
fn nearby_prey_does_not_override_learned_action_choice() {
    let mut sim = Simulation::new(0xa701);
    sim.organisms.clear();
    sim.animals.clear();
    flatten_test_area(&mut sim, 50, 50);
    let mut org = autonomy_test_organism("learner", 50.0, 50.0);
    org.energy = 0.50;
    sim.organisms.push(org);
    sim.animals.push(Animal::new(1, 54.0, 50.0, AnimalKind::Deer));
    sim.tick_count = 5_000;

    let perception = learned_perception_for_first_org(&sim, true);
    sim.organisms[0]
        .q_table
        .insert(perception, vec![(24, 5.0), (3, 0.1)]);

    tick_first_org(&mut sim);

    assert_eq!(sim.organisms[0].thought, "scouting the area");
    assert_ne!(sim.organisms[0].thought, "stalking prey");
}

#[test]
fn distant_wolf_pressure_updates_memory_without_forcing_action() {
    let mut sim = Simulation::new(0xa702);
    sim.organisms.clear();
    sim.animals.clear();
    flatten_test_area(&mut sim, 50, 50);
    sim.organisms.push(autonomy_test_organism("learner", 50.0, 50.0));
    sim.animals.push(Animal::new(1, 54.0, 50.0, AnimalKind::Wolf));
    sim.tick_count = 5_000;

    let perception = learned_perception_for_first_org(&sim, true);
    sim.organisms[0]
        .q_table
        .insert(perception, vec![(24, 5.0), (3, 0.1)]);

    tick_first_org(&mut sim);

    assert_eq!(sim.organisms[0].thought, "scouting the area");
    assert!(sim.organisms[0].danger_memory.contains_key(&(54, 50)));
    assert!(sim.organisms[0].fear_level > 0.0);
    assert_ne!(sim.organisms[0].thought, "wolf! run!");
}

#[test]
fn adjacent_wolf_still_triggers_emergency_reflex() {
    let mut sim = Simulation::new(0xa703);
    sim.organisms.clear();
    sim.animals.clear();
    flatten_test_area(&mut sim, 50, 50);
    sim.organisms.push(autonomy_test_organism("learner", 50.0, 50.0));
    sim.animals.push(Animal::new(1, 51.0, 51.0, AnimalKind::Wolf));
    sim.tick_count = 5_000;

    tick_first_org(&mut sim);

    assert_eq!(sim.organisms[0].thought, "wolf! run!");
    assert!(sim.organisms[0].wander_target.is_some());
    assert!(sim.organisms[0].danger_memory.contains_key(&(51, 51)));
}

#[test]
fn fallback_walkable_step_detours_around_blocked_direction() {
    let mut grid = WorldGrid::new(101);
    for x in 8..=12 {
        for y in 8..=12 {
            grid.set(x, y, Tile::Grass);
        }
    }
    grid.set(11, 10, Tile::Rock);

    let step = fallback_walkable_step(&grid, 10, 10, 3, 0.5, 1.0);

    assert!(matches!(step, Some((11, 9)) | Some((11, 11))));
}

#[test]
fn fallback_walkable_step_prefers_safer_aligned_detour() {
    let mut grid = WorldGrid::new(102);
    for x in 8..=12 {
        for y in 8..=12 {
            grid.set(x, y, Tile::Grass);
        }
    }
    grid.set(11, 10, Tile::Rock);
    grid.hazard[WorldGrid::idx(11, 9)] = 0.95;

    let step = fallback_walkable_step(&grid, 10, 10, 3, 0.9, 0.4);

    assert_eq!(step, Some((11, 11)));
}

#[test]
fn safe_flee_target_avoids_hazardous_raw_anchor() {
    let mut grid = WorldGrid::new(120);
    for x in 45..=85 {
        for y in 45..=65 {
            grid.set(x, y, Tile::Grass);
            grid.hazard[WorldGrid::idx(x, y)] = 0.0;
        }
    }
    grid.hazard[WorldGrid::idx(70, 50)] = 0.95;

    let target = safe_flee_target(&grid, 50.0, 50.0, 1.0, 0.0, 20.0);

    assert_ne!(target, (70, 50));
    assert_eq!(grid.get(target.0, target.1), Tile::Grass);
    assert!(grid.hazard_at(target.0, target.1) < 0.40);
}

#[test]
fn safe_flee_target_avoids_unwalkable_raw_anchor() {
    let mut grid = WorldGrid::new(121);
    for x in 45..=85 {
        for y in 45..=65 {
            grid.set(x, y, Tile::Grass);
            grid.hazard[WorldGrid::idx(x, y)] = 0.0;
        }
    }
    grid.set(70, 50, Tile::Rock);

    let target = safe_flee_target(&grid, 50.0, 50.0, 1.0, 0.0, 20.0);

    assert_ne!(target, (70, 50));
    assert!(grid.get(target.0, target.1).walkable());
}

#[test]
fn land_target_rejects_hazardous_anchor() {
    let mut sim = Simulation::new(103);
    // Wide enough that the deep-water check around (54, 54) sees only land.
    for x in 40..=60 {
        for y in 40..=60 {
            sim.grid.set(x, y, Tile::Grass);
            sim.grid.hazard[WorldGrid::idx(x, y)] = 0.0;
        }
    }
    sim.grid.hazard[WorldGrid::idx(50, 50)] = 0.60;

    assert!(!sim.is_good_land_target(50, 50));
    assert!(sim.is_good_land_target(54, 54));
}

#[test]
fn wander_validation_clears_hazardous_existing_target() {
    let mut sim = Simulation::new(104);
    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    sim.organisms[idx].energy = 0.95;
    sim.organisms[idx].hydration = 0.95;
    sim.organisms[idx].age = 2_000;
    sim.organisms[idx].fear_level = 0.0;
    sim.organisms[idx].wander_target = Some((80, 80));
    sim.grid.set(80, 80, Tile::Grass);
    sim.grid.hazard[WorldGrid::idx(80, 80)] = 0.90;

    sim.validate_or_assign_wander_target(idx, None);

    assert_ne!(sim.organisms[idx].wander_target, Some((80, 80)));
}

#[test]
fn deep_water_fatigue_causes_panic_and_marks_danger() {
    let mut sim = Simulation::new(33);
    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    sim.organisms[idx].x = 50.0;
    sim.organisms[idx].y = 50.0;
    sim.organisms[idx].energy = 0.9;
    sim.organisms[idx].health = 0.9;
    sim.organisms[idx].fear_level = 0.1;
    sim.organisms[idx].water_ticks = 13;
    // A swimmer just off a small island.
    for x in 51..=56 {
        for y in 47..=53 {
            sim.grid.set(x, y, Tile::Grass);
        }
    }
    sim.grid.set(50, 50, Tile::Water);
    sim.grid.depth[WorldGrid::idx(50, 50)] = 0.8;

    sim.apply_water_fatigue(idx, 50, 50);

    assert!(sim.organisms[idx].energy < 0.9);
    assert!(sim.organisms[idx].health < 0.9);
    assert!(sim.organisms[idx].fear_level > 0.1);
    let escape = sim.organisms[idx]
        .wander_target
        .expect("swimmer should pick nearby land");
    assert_ne!(sim.grid.get(escape.0, escape.1), Tile::Water);
    assert!(sim.organisms[idx].danger_memory.contains_key(&(50, 50)));
}

/// People used to pace between two tiles in front of mountains, walls of
/// huts and lake shores because each greedy step undid the last. Routing
/// around obstacles keeps the share of people stuck pacing small.
#[test]
fn few_people_pace_in_place_in_front_of_obstacles() {
    let mut sim = Simulation::new(42);
    for _ in 0..1500 {
        sim.tick();
    }
    let window = 40;
    let mut tracks: std::collections::BTreeMap<String, Vec<(f32, f32)>> = Default::default();
    for _ in 0..window {
        for o in sim.organisms.iter().filter(|o| o.alive) {
            tracks.entry(o.id.clone()).or_default().push((o.x, o.y));
        }
        sim.tick();
    }
    let (mut tracked, mut pacing) = (0, 0);
    for t in tracks.values().filter(|t| t.len() == window) {
        tracked += 1;
        let mut path = 0.0f32;
        let mut reversals = 0;
        let mut last: Option<(f32, f32)> = None;
        for w in t.windows(2) {
            let (dx, dy) = (w[1].0 - w[0].0, w[1].1 - w[0].1);
            if dx.hypot(dy) > 0.01 {
                path += dx.hypot(dy);
                if last.is_some_and(|(lx, ly)| lx * dx + ly * dy < 0.0) {
                    reversals += 1;
                }
                last = Some((dx, dy));
            }
        }
        let net = (t[window - 1].0 - t[0].0).hypot(t[window - 1].1 - t[0].1);
        if path >= 0.3 && net < path * 0.25 && reversals > 6 {
            pacing += 1;
        }
    }
    assert!(tracked > 50, "enough people to judge: {tracked}");
    assert!(
        pacing * 100 < tracked * 12,
        "{pacing} of {tracked} people pace in place"
    );
}
