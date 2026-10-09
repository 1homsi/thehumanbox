//! Laying and clearing roads: open ground only, a brush, and the save round trip.

use super::*;
use crate::sim::storage::persistence::SaveState;
use crate::world::grid::{ROAD_BRIDGE, ROAD_NONE, ROAD_TRACK};
use crate::world::tiles::Tile;

/// A square of `tile` around (100, 100).
fn square(sim: &mut Simulation, tile: Tile) {
    for x in 92..=108 {
        for y in 92..=108 {
            sim.grid.set(x, y, tile);
        }
    }
}

#[test]
fn a_road_is_laid_on_grass_inside_the_brush_only() {
    let mut sim = Simulation::new(1);
    square(&mut sim, Tile::Grass);
    assert!(sim.apply_command_json(r#"{"cmd":"road","x":100,"y":100,"radius":2,"kind":"road"}"#));
    assert_eq!(sim.grid.road_at(100, 100), ROAD_TRACK);
    assert_eq!(sim.grid.road_at(102, 100), ROAD_TRACK);
    assert_eq!(
        sim.grid.road_at(103, 100),
        ROAD_NONE,
        "outside the brush stays bare"
    );
    assert_eq!(
        sim.grid.get(100, 100),
        Tile::Grass,
        "the ground under a road is unchanged"
    );
}

#[test]
fn roads_skip_water_rock_and_fire() {
    let mut sim = Simulation::new(1);
    square(&mut sim, Tile::Water);
    sim.grid.set(100, 100, Tile::Rock);
    sim.grid.set(101, 100, Tile::Fire);
    assert!(!sim.apply_command_json(r#"{"cmd":"road","x":100,"y":100,"radius":3,"kind":"road"}"#));
    assert_eq!(sim.grid.road_at(99, 100), ROAD_NONE);
    assert_eq!(sim.grid.road_at(100, 100), ROAD_NONE);
    assert_eq!(sim.grid.road_at(101, 100), ROAD_NONE);
}

#[test]
fn the_eraser_clears_roads_even_over_water() {
    let mut sim = Simulation::new(1);
    square(&mut sim, Tile::Grass);
    assert!(sim.apply_command_json(r#"{"cmd":"road","x":100,"y":100,"radius":2,"kind":"road"}"#));
    sim.grid.set(100, 100, Tile::Water);
    assert!(sim.apply_command_json(r#"{"cmd":"road","x":100,"y":100,"radius":1,"kind":"erase"}"#));
    assert_eq!(sim.grid.road_at(100, 100), ROAD_NONE);
    assert_eq!(sim.grid.road_at(101, 100), ROAD_NONE);
    assert_eq!(
        sim.grid.road_at(102, 100),
        ROAD_TRACK,
        "outside the eraser stays a road"
    );
}

#[test]
fn an_unknown_road_kind_does_nothing() {
    let mut sim = Simulation::new(1);
    square(&mut sim, Tile::Grass);
    assert!(!sim.apply_command_json(r#"{"cmd":"road","x":100,"y":100,"radius":2,"kind":"motorway"}"#));
    assert_eq!(sim.grid.road_at(100, 100), ROAD_NONE);
}

#[test]
fn roads_survive_a_save_and_load() {
    let mut sim = Simulation::new(5);
    square(&mut sim, Tile::Grass);
    assert!(sim.apply_command_json(r#"{"cmd":"road","x":100,"y":100,"radius":1,"kind":"road"}"#));
    let json = serde_json::to_string(&sim.to_save_state()).expect("save state serialises");
    let loaded: SaveState = serde_json::from_str(&json).expect("save state parses");
    let back = Simulation::from_save(5, loaded);
    assert_eq!(back.grid.road_at(100, 100), ROAD_TRACK);
    assert_eq!(back.grid.road_at(103, 100), ROAD_NONE);
}

#[test]
fn a_bridge_goes_on_water_and_nowhere_else() {
    let mut sim = Simulation::new(1);
    square(&mut sim, Tile::Grass);
    for y in 92..=108 {
        sim.grid.set(100, y, Tile::Water);
    }
    assert!(sim.apply_command_json(r#"{"cmd":"road","x":100,"y":100,"radius":2,"kind":"bridge"}"#));
    assert_eq!(sim.grid.road_at(100, 100), ROAD_BRIDGE);
    assert_eq!(sim.grid.road_at(102, 100), ROAD_NONE, "bridges do not go on land");
    assert!(
        !sim.grid.wet_at(100, 100),
        "a bridged cell is not water to walk through"
    );
    assert!(sim.grid.wet_at(100, 92), "the water beyond the brush stays wet");
    assert!(!sim.apply_command_json(r#"{"cmd":"road","x":95,"y":95,"radius":0,"kind":"bridge"}"#));
}

#[test]
fn road_share_measures_how_much_of_a_line_is_road() {
    let mut sim = Simulation::new(1);
    square(&mut sim, Tile::Grass);
    // The first half of the row from (92, 100) to (108, 100) is road.
    for x in 92..=100 {
        sim.grid.road[WorldGrid::idx(x, 100)] = ROAD_TRACK;
    }
    let share = sim.grid.road_share([92, 100], [108, 100]);
    assert!(
        (0.5..0.7).contains(&share),
        "about half the line is road, got {share}"
    );
    assert_eq!(sim.grid.road_share([92, 104], [108, 104]), 0.0);
}

#[test]
fn a_save_without_the_road_layer_loads_with_none() {
    let sim = Simulation::new(5);
    let mut value = serde_json::to_value(sim.to_save_state()).expect("save state to value");
    value["grid"].as_object_mut().expect("grid object").remove("road");
    let state: SaveState = serde_json::from_value(value).expect("save state from value");
    let back = Simulation::from_save(5, state);
    assert!(back.grid.road.iter().all(|&k| k == ROAD_NONE));
}
