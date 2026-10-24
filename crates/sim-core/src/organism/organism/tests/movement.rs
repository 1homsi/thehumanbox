//! Moving and acting on the local map: steps, journeys, shelter, tools.

use super::*;

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
        "",
        &[],
    );

    assert_eq!(DIRECTIONS[action], (1, 0));
    assert_eq!(thought.as_deref(), Some("swimming ashore"));
}

#[test]
fn builder_packs_shelter_beside_a_hut_on_the_home_tile() {
    let mut rng = StdRng::seed_from_u64(0);
    let traits = Traits::random(&mut rng);
    let mut grid = WorldGrid::new(2);
    for x in 5..=15 {
        for y in 5..=15 {
            grid.set(x, y, Tile::Grass);
        }
    }
    grid.set(10, 10, Tile::Hut);

    let mut org = Organism::new(
        "id".into(),
        "Builder".into(),
        11.0,
        10.0,
        0,
        "".into(),
        "lin".into(),
        5000,
        traits,
    );
    org.home_x = 10.0;
    org.home_y = 10.0;
    org.hydration = 0.9;
    org.energy = 0.9;
    org.health = 1.0;
    org.carrying = 2;
    org.carrying_type = 1;

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
        "",
        &[],
    );
    assert_eq!(thought.as_deref(), Some("packing shelter"));
    assert_eq!(action, 17);
}

#[test]
fn hydrated_wader_in_shallows_keeps_going_instead_of_turning_back() {
    let mut rng = StdRng::seed_from_u64(0);
    let traits = Traits::random(&mut rng);
    let mut grid = WorldGrid::new(2);
    for x in 5..=20 {
        grid.set(x, 10, Tile::Grass);
    }
    grid.set(10, 10, Tile::Water);
    grid.depth[WorldGrid::idx(10, 10)] = 0.1;

    let mut org = Organism::new(
        "id".into(),
        "Wader".into(),
        10.0,
        10.0,
        0,
        "".into(),
        "lin".into(),
        5000,
        traits,
    );
    org.hydration = 0.95;
    org.energy = 0.9;
    org.health = 1.0;
    org.water_ticks = 1;
    org.wander_target = Some((20, 10));

    let (_, thought) = org.choose_action(
        &grid,
        &BuildingList::new(),
        100,
        0.0,
        &[],
        false,
        0,
        &mut rng,
        false,
        "",
        &[],
    );
    assert_ne!(thought.as_deref(), Some("swimming ashore"));
}

#[test]
fn someone_stuck_in_the_shallows_gets_out_even_mid_crossing_and_afraid_of_the_spot() {
    // The drowning trap: a half-done wading route, the water underfoot remembered
    // as dangerous, and too long in the water. They must head for land.
    let mut rng = StdRng::seed_from_u64(0);
    let traits = Traits::random(&mut rng);
    let mut grid = WorldGrid::new(2);
    for x in 0..=30 {
        grid.set(x, 10, Tile::Grass);
    }
    for x in 10..=14 {
        grid.set(x, 10, Tile::Water);
        grid.depth[WorldGrid::idx(x, 10)] = 0.05;
    }

    let mut org = Organism::new(
        "id".into(),
        "Wader".into(),
        12.0,
        10.0,
        0,
        "".into(),
        "lin".into(),
        5000,
        traits,
    );
    org.hydration = 0.96;
    org.energy = 0.6;
    org.health = 0.97;
    org.water_ticks = 20;
    org.danger_memory.insert((12, 10), 0.9);
    {
        let mut route = org.route.borrow_mut();
        route.goal = (25, 10);
        route.steps = (13..=25).map(|x| (x, 10)).collect();
        route.next = 0;
    }

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
        "",
        &[],
    );
    assert_eq!(thought.as_deref(), Some("swimming ashore"));
    assert!(action < 8, "a step, not standing still: {action}");
}

#[test]
fn a_danger_underfoot_is_not_fled_toward() {
    let mut rng = StdRng::seed_from_u64(3);
    let traits = Traits::random(&mut rng);
    let mut grid = WorldGrid::new(4);
    for x in 0..=30 {
        for y in 0..=20 {
            grid.set(x, y, Tile::Sand);
        }
    }
    let mut org = Organism::new(
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
    org.hydration = 0.9;
    org.energy = 0.9;
    org.health = 1.0;
    org.danger_memory.insert((10, 10), 0.9);
    let (_, thought) = org.choose_action(
        &grid,
        &BuildingList::new(),
        100,
        0.0,
        &[],
        false,
        0,
        &mut rng,
        false,
        "",
        &[],
    );
    assert_ne!(
        thought.as_deref(),
        Some("avoiding danger"),
        "fled from the tile it stands on"
    );
}

#[test]
fn movement_toward_land_avoids_deep_water_step() {
    let mut rng = StdRng::seed_from_u64(0);
    let traits = Traits::random(&mut rng);
    let mut grid = WorldGrid::new(2);
    // Open land around the walker, with one deep pool straight ahead.
    for x in 5..=25 {
        for y in 5..=15 {
            grid.set(x, y, Tile::Grass);
        }
    }
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

#[test]
fn committed_journey_moves_around_wall_instead_of_shuffling() {
    let mut rng = StdRng::seed_from_u64(71);
    let mut grid = WorldGrid::new(2);
    for x in 20..80 {
        for y in 20..80 {
            grid.set(x, y, Tile::Sand);
            grid.hazard[WorldGrid::idx(x, y)] = 0.0;
        }
    }
    // The greedy direction used to bounce north/south against this wall.
    for y in 43..=57 {
        grid.set(52, y, Tile::Rock);
    }
    let mut org = Organism::new(
        "journey".into(),
        "Traveller".into(),
        50.0,
        50.0,
        0,
        "".into(),
        "lin".into(),
        5000,
        Traits::random(&mut rng),
    );
    org.energy = 0.9;
    org.hydration = 0.9;
    org.health = 1.0;
    org.age = 1600;
    org.home_x = 50.0;
    org.home_y = 50.0;
    org.begin_journey((66, 50), "scouting the hills", 100);
    for tick in 100..180 {
        if (org.x - 66.0).abs().max((org.y - 50.0).abs()) <= 2.0 {
            break;
        }
        let (action, _) = org.choose_action(
            &grid,
            &BuildingList::new(),
            tick,
            0.0,
            &[],
            false,
            0,
            &mut rng,
            false,
            "test",
            &[0, 1, 2, 3, 4, 5, 6, 7, 17, 24],
        );
        assert!(
            action < 8,
            "journey unexpectedly chose stationary action {action}"
        );
        let (dx, dy) = DIRECTIONS[action];
        assert!(grid.get(org.x as i32 + dx, org.y as i32 + dy).walkable());
        org.x += dx as f32;
        org.y += dy as f32;
    }
    assert!(
        (org.x - 66.0).abs().max((org.y - 50.0).abs()) <= 2.0,
        "traveller never reached destination: {}, {}",
        org.x,
        org.y
    );
    // An urgent need takes priority even while a journey is active.
    org.x = 50.0;
    org.y = 50.0;
    grid.set(50, 50, Tile::Food);
    org.energy = 0.1;
    let (action, _) = org.choose_action(
        &grid,
        &BuildingList::new(),
        110,
        0.0,
        &[],
        false,
        0,
        &mut rng,
        false,
        "test",
        &[0, 1, 2, 3, 4, 5, 6, 7, 8, 17],
    );
    assert_eq!(action, 8);
}

#[test]
fn indexed_local_decisions_match_population_scan() {
    use crate::sim::spatial::SpatialIndex;
    let mut grid = WorldGrid::new(42);
    for y in 10..100 {
        for x in 10..100 {
            grid.set(x, y, Tile::Grass);
        }
    }
    grid.set(49, 49, Tile::Campfire);
    grid.set(58, 50, Tile::Food);
    grid.set(50, 59, Tile::Water);
    let mut people: Vec<_> = (0..180)
        .map(|i| {
            let mut o = Organism::new(
                format!("org-{i}"),
                "Resident".into(),
                12.0 + (i * 17 % 80) as f32,
                12.0 + (i * 7 % 80) as f32,
                1,
                String::new(),
                format!("kin-{}", i % 3),
                5000,
                Traits::default(),
            );
            o.age = 200 + i * 12;
            o.energy = 0.15 + (i % 8) as f32 * 0.1;
            o.hydration = 0.15 + (i % 7) as f32 * 0.1;
            o.fear_level = if i % 5 == 0 { 0.7 } else { 0.0 };
            o.infection = if i % 9 == 0 { 0.4 } else { 0.0 };
            o
        })
        .collect();
    people[0].x = 50.0;
    people[0].y = 50.0;
    let spatial = SpatialIndex::build(&people, 10);
    for (i, org) in people.iter().enumerate().take(60) {
        let mut near = spatial.query(org.x as i32, org.y as i32, 16);
        near.sort_unstable();
        for seed in 0..20 {
            let mut full_rng = StdRng::seed_from_u64(seed);
            let mut indexed_rng = StdRng::seed_from_u64(seed);
            let full = org.choose_action(
                &grid,
                &BuildingList::new(),
                100,
                0.1,
                &people,
                false,
                0,
                &mut full_rng,
                false,
                "",
                &[0, 1, 2, 3, 4, 5, 6, 7, 17, 20, 21],
            );
            let indexed = org.choose_action_with_neighbors(
                &grid,
                &BuildingList::new(),
                100,
                0.1,
                &people,
                false,
                0,
                &mut indexed_rng,
                false,
                "",
                &[0, 1, 2, 3, 4, 5, 6, 7, 17, 20, 21],
                Some(&near),
            );
            assert_eq!(full, indexed, "person {i}, seed {seed}");
            assert_eq!(full_rng.random::<u64>(), indexed_rng.random::<u64>());
        }
    }
}

#[test]
fn toolmakers_fetch_stone_from_nearby_rock() {
    let traits = Traits::random(&mut StdRng::seed_from_u64(0));
    let mut grid = WorldGrid::new(2);
    for x in 0..=30 {
        for y in 0..=20 {
            grid.set(x, y, Tile::Sand);
        }
    }
    grid.set(16, 10, Tile::Rock);
    let mut org = Organism::new(
        "id".into(),
        "Mason".into(),
        10.0,
        10.0,
        0,
        "".into(),
        "lin".into(),
        5000,
        traits,
    );
    org.home_x = 10.0;
    org.home_y = 10.0;
    org.hydration = 0.9;
    org.energy = 0.9;
    org.health = 1.0;
    org.discoveries.insert("stone_tools".into());

    let thoughts: Vec<Option<String>> = (0..200)
        .map(|seed| {
            let mut rng = StdRng::seed_from_u64(seed);
            org.choose_action(
                &grid,
                &BuildingList::new(),
                100,
                0.0,
                &[],
                false,
                0,
                &mut rng,
                false,
                "",
                &[],
            )
            .1
        })
        .collect();
    assert!(thoughts
        .iter()
        .any(|t| t.as_deref() == Some("heading to the quarry")));

    org.x = 15.0;
    let quarried = (0..200).any(|seed| {
        let mut rng = StdRng::seed_from_u64(seed);
        org.choose_action(
            &grid,
            &BuildingList::new(),
            100,
            0.0,
            &[],
            false,
            0,
            &mut rng,
            false,
            "",
            &[],
        ) == (29, Some("quarrying stone".to_string()))
    });
    assert!(quarried, "next to rock they quarry");
}

/// The cell-by-cell search the row scan replaced, kept here as the reference.
fn nearest_cell_by_cell(grid: &WorldGrid, at: (i32, i32), tile: Tile, radius: i32) -> Option<(i32, i32)> {
    let mut best_dist = radius + 1;
    let mut best = None;
    for dx in -radius..=radius {
        for dy in -radius..=radius {
            if grid.get(at.0 + dx, at.1 + dy) == tile {
                let dist = dx.abs() + dy.abs();
                if dist < best_dist {
                    best_dist = dist;
                    best = Some((at.0 + dx, at.1 + dy));
                }
            }
        }
    }
    best
}

#[test]
fn the_row_scan_finds_the_same_tile_as_the_cell_by_cell_search() {
    use rand::RngExt;
    let mut rng = StdRng::seed_from_u64(21);
    let mut grid = WorldGrid::new(4);
    let (w, h) = (
        crate::world::grid::WIDTH as i32,
        crate::world::grid::HEIGHT as i32,
    );
    for x in 0..w {
        for y in 0..h {
            let t = match rng.random_range(0..10) {
                0 => Tile::Food,
                1 => Tile::Water,
                2 => Tile::Fire,
                _ => Tile::Grass,
            };
            grid.set(x, y, t);
        }
    }
    let traits = Traits::random(&mut rng);
    let mut org = Organism::new(
        "scan".into(),
        "Scan".into(),
        0.0,
        0.0,
        0,
        "".into(),
        "lin".into(),
        5000,
        traits,
    );
    // Corners and edges as well as the open map.
    let mut spots = vec![
        (0, 0),
        (w - 1, h - 1),
        (0, h - 1),
        (w - 1, 0),
        (3, 200),
        (w - 2, 5),
    ];
    for _ in 0..400 {
        spots.push((rng.random_range(0..w), rng.random_range(0..h)));
    }
    for (x, y) in spots {
        org.x = x as f32;
        org.y = y as f32;
        for tile in [Tile::Food, Tile::Water, Tile::Fire, Tile::Rock] {
            for radius in [1, 4, 8, 24] {
                assert_eq!(
                    org.nearest_visible(&grid, tile, radius),
                    nearest_cell_by_cell(&grid, (x, y), tile, radius),
                    "{tile:?} r{radius} at ({x},{y})"
                );
            }
        }
    }
}
