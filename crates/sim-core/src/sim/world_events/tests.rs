use super::*;
use std::collections::VecDeque;

#[test]
fn news_is_flagged_on_the_event_itself() {
    let mut events = std::collections::VecDeque::new();
    push_event(&mut events, 1, "prayer", "a tribe", "prays for rain");
    push_event(&mut events, 2, "died", "someone", "old age");
    assert!(events[0].news);
    assert!(!events[1].news);
    let json = serde_json::to_value(&events[1]).unwrap();
    assert!(json.get("news").is_none(), "chatter carries no flag on the wire");
}

#[test]
fn recent_events_keep_enough_context_for_debugging() {
    let mut events = VecDeque::new();
    for i in 0..40 {
        push_event(&mut events, i, "test", "world", "event");
    }

    assert_eq!(events.len(), 40);
    assert_eq!(events.front().unwrap().tick, 0);
}

#[test]
fn drought_never_dries_ocean_or_border() {
    use crate::world::grid::{WorldGrid, HEIGHT, WIDTH};
    use rand::SeedableRng;
    let mut grid = WorldGrid::new(42);
    let mut drought = DroughtState::default();
    let mut history = super::super::simulation::History::default();
    let mut events = VecDeque::new();
    let mut rng = rand::rngs::StdRng::seed_from_u64(7);

    for _ in 0..40 {
        start_drought(&mut drought, &mut grid, 0, &mut history, &mut events, &mut rng);
        end_drought(&mut drought, &mut grid, 0, &mut events);
    }

    for y in 0..HEIGHT as i32 {
        for x in 0..WIDTH as i32 {
            if WorldGrid::is_edge_border(x, y) {
                assert_eq!(grid.get(x, y), Tile::Water, "border tile ({x},{y}) was dried");
            }
        }
    }
}

#[test]
fn news_outlasts_a_flood_of_everyday_chatter() {
    let mut events = std::collections::VecDeque::new();
    push_event(&mut events, 1, "prayer", "Ashari", "pray for food");
    for t in 0..5_000 {
        push_event(&mut events, t, "social", "someone", "said hello");
    }
    assert_eq!(events.len(), MAX_RECENT_EVENTS);
    assert!(events.iter().any(|e| e.etype == "prayer"));
    // Order stays chronological.
    assert!(events
        .iter()
        .zip(events.iter().skip(1))
        .all(|(a, b)| a.tick <= b.tick || a.etype == "prayer"));
}

#[test]
fn a_log_full_of_news_drops_the_oldest() {
    let mut events = std::collections::VecDeque::new();
    for t in 0..(MAX_RECENT_EVENTS as u64 + 10) {
        push_event(&mut events, t, "weather", "the sky", "rain");
    }
    assert_eq!(events.len(), MAX_RECENT_EVENTS);
    assert_eq!(events.front().unwrap().tick, 10);
}

/// One lava pass, on the tick it runs on.
fn lava_pass(sim: &mut crate::sim::simulation::Simulation, pass: u64) {
    tick_lava(
        &mut sim.grid,
        &mut sim.physics,
        &mut sim.organisms,
        &mut sim.animals,
        pass * LAVA_EVERY,
        &mut sim.events,
        &mut sim.rng,
    );
}

#[test]
fn lava_only_runs_on_its_pass() {
    use crate::world::tiles::Tile;
    let mut sim = crate::sim::simulation::Simulation::new(42);
    sim.grid.set(120, 120, Tile::Lava);
    tick_lava(
        &mut sim.grid,
        &mut sim.physics,
        &mut sim.organisms,
        &mut sim.animals,
        LAVA_EVERY + 1,
        &mut sim.events,
        &mut sim.rng,
    );
    assert_eq!(sim.grid.get(120, 120), Tile::Lava, "off-cadence ticks do nothing");
}

#[test]
fn lava_never_runs_uphill_and_takes_a_lower_cell() {
    use crate::world::grid::WorldGrid;
    use crate::world::tiles::Tile;
    let mut sim = crate::sim::simulation::Simulation::new(42);
    for (x, y) in [(100, 100), (101, 100), (99, 100), (100, 101), (100, 99)] {
        sim.grid.set(x, y, Tile::Grass);
        sim.grid.elevation[WorldGrid::idx(x, y)] = 0.8;
    }
    sim.grid.set(100, 100, Tile::Lava);
    sim.grid.elevation[WorldGrid::idx(100, 100)] = 0.5;
    // Every neighbour is higher than the lava: it may cool, but it must never run uphill.
    for pass in 1..=200 {
        if sim.grid.get(100, 100) != Tile::Lava {
            break;
        }
        lava_pass(&mut sim, pass);
        for (x, y) in [(101, 100), (99, 100), (100, 101), (100, 99)] {
            assert_ne!(sim.grid.get(x, y), Tile::Lava, "lava ran uphill at {x},{y}");
        }
    }
    // A lower cell beside lava takes it. The source is kept molten (a spring) so cooling
    // does not decide the outcome.
    // Sand does not burn, so the lower cell is not set alight before the lava reaches it.
    sim.grid.set(101, 100, Tile::Sand);
    sim.grid.elevation[WorldGrid::idx(100, 100)] = 0.5;
    sim.grid.elevation[WorldGrid::idx(101, 100)] = 0.1;
    let mut moved = false;
    for pass in 300..700 {
        sim.grid.set(100, 100, Tile::Lava);
        lava_pass(&mut sim, pass);
        if sim.grid.get(101, 100) == Tile::Lava {
            moved = true;
            break;
        }
    }
    assert!(moved, "lava ran downhill onto the lower cell");
}

#[test]
fn lava_sets_flammable_neighbours_alight_and_cools_to_rock() {
    use crate::world::tiles::Tile;
    let mut sim = crate::sim::simulation::Simulation::new(42);
    sim.grid.set(200, 200, Tile::Lava);
    sim.grid.set(201, 200, Tile::Grass);
    let mut lit = false;
    for pass in 1..=100 {
        if sim.grid.get(200, 200) != Tile::Lava {
            break;
        }
        lava_pass(&mut sim, pass);
        if sim.grid.get(201, 200) == Tile::Fire {
            lit = true;
            break;
        }
    }
    assert!(lit, "grass beside lava catches fire");

    sim.grid.set(250, 250, Tile::Lava);
    for pass in 1000..6000 {
        if sim.grid.get(250, 250) != Tile::Lava {
            break;
        }
        lava_pass(&mut sim, pass);
    }
    assert_eq!(sim.grid.get(250, 250), Tile::Rock, "lava cools to rock over time");
}

#[test]
fn lava_kills_whoever_stands_on_it() {
    use crate::world::tiles::Tile;
    let mut sim = crate::sim::simulation::Simulation::new(42);
    let idx = sim.organisms.iter().position(|o| o.alive).expect("a person");
    sim.organisms[idx].x = 300.5;
    sim.organisms[idx].y = 150.5;
    sim.grid.set(300, 150, Tile::Lava);
    lava_pass(&mut sim, 1);
    assert!(sim.organisms[idx].health < 0.0, "the person on lava dies");
}
