//! Reward feedback for movement and reserves, and memory verification.

use super::*;

#[test]
fn movement_feedback_penalizes_blocked_detour() {
    let mut grid = WorldGrid::new(105);
    for x in 8..=12 {
        for y in 8..=12 {
            grid.set(x, y, Tile::Grass);
        }
    }
    grid.set(11, 10, Tile::Rock);

    let feedback = movement_step_feedback(&grid, 10, 10, 3, Some((11, 11)));

    assert!(feedback < 0.0);
}

#[test]
fn movement_feedback_penalizes_hazardous_destination_more_than_safe_step() {
    let mut grid = WorldGrid::new(106);
    for x in 8..=12 {
        for y in 8..=12 {
            grid.set(x, y, Tile::Grass);
        }
    }
    grid.hazard[WorldGrid::idx(11, 10)] = 0.9;

    let hazardous = movement_step_feedback(&grid, 10, 10, 3, Some((11, 10)));
    let safe = movement_step_feedback(&grid, 10, 10, 5, Some((11, 9)));

    assert!(hazardous < safe);
    assert!(hazardous < 0.0);
    assert!(safe > 0.0);
}

#[test]
fn movement_momentum_feedback_penalizes_backtracking_loop() {
    let mut sim = Simulation::new(113);
    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    sim.organisms[idx].energy = 0.80;
    sim.organisms[idx].hydration = 0.80;
    sim.organisms[idx].health = 0.90;
    sim.organisms[idx].fear_level = 0.0;
    sim.organisms[idx].vx_smooth = 1.0;
    sim.organisms[idx].vy_smooth = 0.0;

    let feedback = movement_momentum_feedback(&sim.organisms[idx], &sim.grid, (10, 10), Some((9, 10)));

    assert!(feedback < 0.0);
}

#[test]
fn movement_momentum_feedback_allows_danger_escape_backtrack() {
    let mut sim = Simulation::new(114);
    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    sim.organisms[idx].energy = 0.80;
    sim.organisms[idx].hydration = 0.80;
    sim.organisms[idx].health = 0.90;
    sim.organisms[idx].vx_smooth = 1.0;
    sim.organisms[idx].vy_smooth = 0.0;
    sim.grid.hazard[WorldGrid::idx(10, 10)] = 0.80;
    sim.grid.hazard[WorldGrid::idx(9, 10)] = 0.05;

    let feedback = movement_momentum_feedback(&sim.organisms[idx], &sim.grid, (10, 10), Some((9, 10)));

    assert_eq!(feedback, 0.0);
}

#[test]
fn resource_progress_feedback_rewards_moving_toward_remembered_food() {
    let mut sim = Simulation::new(107);
    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    sim.organisms[idx].energy = 0.25;
    sim.organisms[idx].hydration = 0.90;
    sim.organisms[idx].food_memory.insert((20, 10), 0.9);

    let feedback = urgent_resource_progress_feedback(&sim.organisms[idx], (10, 10), Some((11, 10)));

    assert!(feedback > 0.0);
}

#[test]
fn resource_progress_feedback_penalizes_moving_away_from_remembered_water() {
    let mut sim = Simulation::new(108);
    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    sim.organisms[idx].energy = 0.90;
    sim.organisms[idx].hydration = 0.20;
    sim.organisms[idx].water_memory.insert((20, 10), 0.9);

    let feedback = urgent_resource_progress_feedback(&sim.organisms[idx], (10, 10), Some((9, 10)));

    assert!(feedback < 0.0);
}

#[test]
fn reserve_inventory_feedback_rewards_useful_food_reserve_gain() {
    let mut sim = Simulation::new(115);
    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    sim.organisms[idx].inv_food = 1;
    sim.organisms[idx].inv_water = 0;

    let feedback = reserve_inventory_feedback(0.45, 0.90, 0, 0, &sim.organisms[idx]);

    assert!(feedback > 0.0);
}

#[test]
fn reserve_inventory_feedback_does_not_reward_food_hoarding_past_small_buffer() {
    let mut sim = Simulation::new(116);
    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    sim.organisms[idx].inv_food = 4;
    sim.organisms[idx].inv_water = 0;

    let feedback = reserve_inventory_feedback(0.45, 0.90, 3, 0, &sim.organisms[idx]);

    assert_eq!(feedback, 0.0);
}

#[test]
fn reserve_inventory_feedback_rewards_water_reserve_when_future_thirsty() {
    let mut sim = Simulation::new(117);
    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    sim.organisms[idx].inv_food = 0;
    sim.organisms[idx].inv_water = 2;

    let feedback = reserve_inventory_feedback(0.90, 0.35, 0, 0, &sim.organisms[idx]);

    assert!(feedback > 0.0);
}

#[test]
fn critical_reserve_use_ignores_periodic_cadence() {
    let mut sim = Simulation::new(118);
    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    sim.organisms[idx].energy = 0.20;
    sim.organisms[idx].hydration = 0.18;
    sim.organisms[idx].inv_food = 1;
    sim.organisms[idx].inv_water = 1;

    let (used_food, used_water) = use_needed_reserves(&mut sim.organisms[idx], 5);

    assert!(used_food);
    assert!(used_water);
    assert_eq!(sim.organisms[idx].inv_food, 0);
    assert_eq!(sim.organisms[idx].inv_water, 0);
    assert!(sim.organisms[idx].energy > 0.20);
    assert!(sim.organisms[idx].hydration > 0.18);
}

#[test]
fn moderate_reserve_use_keeps_periodic_cadence() {
    let mut sim = Simulation::new(119);
    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    sim.organisms[idx].energy = 0.40;
    sim.organisms[idx].hydration = 0.50;
    sim.organisms[idx].inv_food = 1;
    sim.organisms[idx].inv_water = 1;

    let (used_food, used_water) = use_needed_reserves(&mut sim.organisms[idx], 5);

    assert!(!used_food);
    assert!(!used_water);
    assert_eq!(sim.organisms[idx].inv_food, 1);
    assert_eq!(sim.organisms[idx].inv_water, 1);
}

#[test]
fn stored_winter_provisions_feed_an_organism_after_carried_food_runs_out() {
    let mut sim = Simulation::new(120);
    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    sim.organisms[idx].energy = 0.20;
    sim.organisms[idx].inv_food = 0;
    sim.organisms[idx].tools.insert("winter_provisions".into(), 2);

    let (used_food, _) = use_needed_reserves(&mut sim.organisms[idx], 5);

    assert!(used_food);
    assert_eq!(sim.organisms[idx].tools.get("winter_provisions"), Some(&1));
    assert!(sim.organisms[idx].energy > 0.20);
}

#[test]
fn local_resource_verification_decays_stale_food_memory_nearby() {
    let mut sim = Simulation::new(109);
    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    for x in 9..=11 {
        for y in 9..=11 {
            sim.grid.set(x, y, Tile::Grass);
        }
    }
    sim.organisms[idx].food_memory.insert((10, 10), 0.9);
    sim.organisms[idx].food_memory.insert((11, 10), 0.8);

    verify_local_resource_memory(&mut sim.organisms[idx], &sim.grid, 10, 10);

    assert!(
        sim.organisms[idx]
            .food_memory
            .get(&(10, 10))
            .copied()
            .unwrap_or(0.0)
            < 0.5
    );
    assert!(
        sim.organisms[idx]
            .food_memory
            .get(&(11, 10))
            .copied()
            .unwrap_or(0.0)
            < 0.8
    );
}

#[test]
fn local_resource_verification_keeps_memory_when_resource_is_nearby() {
    let mut sim = Simulation::new(110);
    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    for x in 9..=11 {
        for y in 9..=11 {
            sim.grid.set(x, y, Tile::Grass);
        }
    }
    sim.grid.set(11, 10, Tile::Food);
    sim.organisms[idx].food_memory.insert((10, 10), 0.9);

    verify_local_resource_memory(&mut sim.organisms[idx], &sim.grid, 10, 10);

    assert_eq!(sim.organisms[idx].food_memory.get(&(10, 10)).copied(), Some(0.9));
}

#[test]
fn local_danger_verification_decays_stale_safe_area_memory() {
    let mut sim = Simulation::new(111);
    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    for x in 9..=11 {
        for y in 9..=11 {
            sim.grid.set(x, y, Tile::Grass);
            sim.grid.hazard[WorldGrid::idx(x, y)] = 0.0;
        }
    }
    sim.organisms[idx].danger_memory.insert((10, 10), 0.9);
    sim.organisms[idx].danger_memory.insert((11, 10), 0.8);

    let animal_spatial = SpatialIndex::build_animals(&sim.animals, 10);
    verify_local_danger_memory(
        &mut sim.organisms[idx],
        &sim.grid,
        &sim.animals,
        &animal_spatial,
        &mut Vec::new(),
        10,
        10,
    );

    assert!(
        sim.organisms[idx]
            .danger_memory
            .get(&(10, 10))
            .copied()
            .unwrap_or(0.0)
            < 0.55
    );
    assert!(
        sim.organisms[idx]
            .danger_memory
            .get(&(11, 10))
            .copied()
            .unwrap_or(0.0)
            < 0.8
    );
}

#[test]
fn local_danger_verification_keeps_memory_when_hazard_remains_nearby() {
    let mut sim = Simulation::new(112);
    let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    for x in 9..=11 {
        for y in 9..=11 {
            sim.grid.set(x, y, Tile::Grass);
            sim.grid.hazard[WorldGrid::idx(x, y)] = 0.0;
        }
    }
    sim.grid.hazard[WorldGrid::idx(11, 10)] = 0.70;
    sim.organisms[idx].danger_memory.insert((11, 10), 0.8);

    let animal_spatial = SpatialIndex::build_animals(&sim.animals, 10);
    verify_local_danger_memory(
        &mut sim.organisms[idx],
        &sim.grid,
        &sim.animals,
        &animal_spatial,
        &mut Vec::new(),
        10,
        10,
    );

    assert_eq!(
        sim.organisms[idx].danger_memory.get(&(11, 10)).copied(),
        Some(0.8)
    );
}

#[test]
fn indexed_predator_danger_matches_full_scan_across_bucket_edges_and_deaths() {
    let mut sim = Simulation::new(0xD09);
    flatten_test_area(&mut sim, 50, 50);
    sim.animals = vec![
        Animal::new(0, 52.0, 50.0, AnimalKind::Wolf),
        Animal::new(1, 50.0, 50.0, AnimalKind::Rabbit),
        Animal::new(2, 120.0, 120.0, AnimalKind::Wolf),
    ];
    let animal_spatial = SpatialIndex::build_animals(&sim.animals, 10);
    let mut candidates = Vec::new();
    for killed_nearby_wolf in [false, true] {
        if killed_nearby_wolf {
            sim.animals[0].alive = false;
        }
        for (x, y) in [(49, 50), (50, 50), (56, 50), (60, 50)] {
            let expected = sim.animals.iter().any(|animal| {
                animal.alive
                    && animal.kind.predator()
                    && (animal.x - x as f32).abs() + (animal.y - y as f32).abs() <= 5.0
            });
            assert_eq!(
                local_danger_present(&sim.grid, &sim.animals, &animal_spatial, &mut candidates, x, y),
                expected,
                "danger mismatch at ({x}, {y}) after death={killed_nearby_wolf}"
            );
        }
    }
}
