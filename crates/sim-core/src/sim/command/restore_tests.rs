//! The eraser: ground changes inside the radius go back to their biome.

use super::*;
use crate::world::grid::WorldGrid;
use crate::world::tiles::{Biome, Tile};

/// A square of `tile` in `biome` around (100, 100).
fn square(sim: &mut Simulation, tile: Tile, biome: Biome) {
    for x in 92..=108 {
        for y in 92..=108 {
            sim.grid.set(x, y, tile);
            sim.grid.biome[WorldGrid::idx(x, y)] = biome as u8;
        }
    }
}

#[test]
fn restore_drains_water_back_to_the_biomes_ground() {
    let mut sim = Simulation::new(1);
    square(&mut sim, Tile::Water, Biome::Grassland);
    assert!(sim.apply_command_json(r#"{"cmd":"restore","x":100,"y":100,"radius":3}"#));
    assert_eq!(sim.grid.get(100, 100), Tile::Grass);
    assert_eq!(sim.grid.get(108, 108), Tile::Water, "outside the brush stays wet");
}

#[test]
fn restore_cools_fire_and_puts_desert_sand_back_as_sand() {
    let mut sim = Simulation::new(1);
    square(&mut sim, Tile::Fire, Biome::Desert);
    *sim.grid.fire_intensity_mut(100, 100) = 0.8;
    assert!(sim.apply_command_json(r#"{"cmd":"restore","x":100,"y":100,"radius":2}"#));
    assert_eq!(sim.grid.get(100, 100), Tile::Sand);
    assert_eq!(*sim.grid.fire_intensity_mut(100, 100), 0.0);
}

#[test]
fn restore_leaves_rock_and_huts_alone() {
    let mut sim = Simulation::new(1);
    square(&mut sim, Tile::Water, Biome::Grassland);
    sim.grid.set(100, 100, Tile::Rock);
    sim.grid.set(101, 100, Tile::Hut);
    assert!(sim.apply_command_json(r#"{"cmd":"restore","x":100,"y":100,"radius":2}"#));
    assert_eq!(sim.grid.get(100, 100), Tile::Rock);
    assert_eq!(sim.grid.get(101, 100), Tile::Hut);
    assert_eq!(sim.grid.get(102, 100), Tile::Grass);
}

#[test]
fn restore_on_ground_that_is_already_right_changes_nothing() {
    let mut sim = Simulation::new(1);
    square(&mut sim, Tile::Grass, Biome::Grassland);
    assert!(!sim.apply_command_json(r#"{"cmd":"restore","x":100,"y":100,"radius":3}"#));
}
