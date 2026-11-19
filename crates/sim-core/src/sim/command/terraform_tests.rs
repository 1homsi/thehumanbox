use super::terraform::{PEAK_LEVEL, SEA_LEVEL};
use crate::sim::simulation::Simulation;
use crate::world::grid::{WorldGrid, HEIGHT, WIDTH};
use crate::world::tiles::{Biome, Tile};

fn flat_world(seed: u64) -> Simulation {
    let mut sim = Simulation::new(seed);
    for x in 0..WIDTH as i32 {
        for y in 0..HEIGHT as i32 {
            let i = WorldGrid::idx(x, y);
            sim.grid.set(x, y, Tile::Grass);
            sim.grid.biome[i] = Biome::Grassland as u8;
            sim.grid.elevation[i] = 0.4;
            sim.grid.depth[i] = 0.0;
        }
    }
    sim
}

fn elevation(sim: &Simulation, x: i32, y: i32) -> f32 {
    sim.grid.elevation[WorldGrid::idx(x, y)]
}

#[test]
fn raising_land_lifts_the_ground_most_at_the_middle_and_tops_out_in_rock() {
    let mut sim = flat_world(81);
    assert!(sim.apply_command_json(r#"{"cmd":"shape_land","x":100,"y":100,"radius":4,"by":0.1}"#));
    assert!(elevation(&sim, 100, 100) > elevation(&sim, 103, 100));
    assert!(elevation(&sim, 103, 100) > 0.4);
    assert_eq!(elevation(&sim, 110, 100), 0.4);
    for _ in 0..6 {
        sim.apply_command_json(r#"{"cmd":"shape_land","x":100,"y":100,"radius":4,"by":0.1}"#);
    }
    assert!(elevation(&sim, 100, 100) > PEAK_LEVEL);
    assert_eq!(sim.grid.get(100, 100), Tile::Rock);
}

#[test]
fn lowering_land_below_the_sea_fills_it_with_water_and_raising_it_again_dries_it() {
    let mut sim = flat_world(82);
    for _ in 0..3 {
        assert!(sim.apply_command_json(r#"{"cmd":"shape_land","x":100,"y":100,"radius":5,"by":-0.1}"#));
    }
    assert!(elevation(&sim, 100, 100) < SEA_LEVEL);
    assert_eq!(sim.grid.get(100, 100), Tile::Water);
    assert!(sim.grid.depth_at(100, 100) > 0.0);
    assert_eq!(sim.grid.get(110, 100), Tile::Grass);
    for _ in 0..4 {
        sim.apply_command_json(r#"{"cmd":"shape_land","x":100,"y":100,"radius":5,"by":0.1}"#);
    }
    assert!(elevation(&sim, 100, 100) >= SEA_LEVEL);
    assert!(matches!(sim.grid.get(100, 100), Tile::Grass | Tile::Sand));
    assert_eq!(sim.grid.depth_at(100, 100), 0.0);
}

#[test]
fn shaping_land_leaves_huts_and_refuses_a_zero_step() {
    let mut sim = flat_world(83);
    sim.grid.set(100, 100, Tile::Hut);
    assert!(sim.apply_command_json(r#"{"cmd":"shape_land","x":100,"y":100,"radius":3,"by":-0.5}"#));
    assert_eq!(sim.grid.get(100, 100), Tile::Hut);
    assert_eq!(elevation(&sim, 100, 100), 0.4);
    assert!(!sim.apply_command_json(r#"{"cmd":"shape_land","x":100,"y":100,"radius":3,"by":0.0}"#));
}

#[test]
fn ice_paints_only_over_water() {
    let mut sim = flat_world(84);
    assert!(!sim.apply_command_json(r#"{"cmd":"paint","x":100,"y":100,"tile":"ice","radius":2}"#));
    assert_eq!(sim.grid.get(100, 100), Tile::Grass);
    sim.grid.set(100, 100, Tile::Water);
    assert!(sim.apply_command_json(r#"{"cmd":"paint","x":100,"y":100,"tile":"ice","radius":2}"#));
    assert_eq!(sim.grid.get(100, 100), Tile::Ice);
    assert_eq!(sim.grid.get(101, 100), Tile::Grass);
}

#[test]
fn mineral_and_ash_paint_like_any_ground() {
    let mut sim = flat_world(85);
    assert!(sim.apply_command_json(r#"{"cmd":"paint","x":100,"y":100,"tile":"mineral","radius":1}"#));
    assert_eq!(sim.grid.get(100, 100), Tile::Mineral);
    assert!(sim.apply_command_json(r#"{"cmd":"paint","x":120,"y":100,"tile":"ash","radius":1}"#));
    assert_eq!(sim.grid.get(120, 100), Tile::Ash);
}

#[test]
fn the_volcanic_biome_paints_on_land() {
    let mut sim = flat_world(86);
    assert!(sim.apply_command_json(r#"{"cmd":"paint_biome","x":100,"y":100,"biome":"volcanic","radius":4}"#));
    assert_eq!(sim.grid.biome_at(100, 100), Biome::Volcanic);
}

#[test]
fn blessed_soil_grows_richer_than_the_biome_allows() {
    let mut sim = flat_world(87);
    let base = Biome::Grassland.base_fertility();
    sim.grid.set(101, 100, Tile::Ash);
    assert!(sim.apply_command_json(r#"{"cmd":"bless_soil","x":100.0,"y":100.0,"radius":4.0}"#));
    assert!(sim.grid.fertility_at(100, 100) > base);
    assert_eq!(sim.grid.get(101, 100), Tile::Grass);
    for x in 0..WIDTH as i32 {
        for y in 0..HEIGHT as i32 {
            sim.grid.set(x, y, Tile::Water);
        }
    }
    assert!(!sim.apply_command_json(r#"{"cmd":"bless_soil","x":100.0,"y":100.0,"radius":4.0}"#));
}

#[test]
fn a_spring_wells_up_on_dry_land_only() {
    let mut sim = flat_world(88);
    assert!(sim.apply_command_json(r#"{"cmd":"spring","x":100,"y":100}"#));
    assert_eq!(sim.grid.get(100, 100), Tile::Water);
    assert_eq!(sim.grid.get(101, 100), Tile::Water);
    assert!(sim.grid.pool_centers.contains(&(100, 100)));
    assert!(!sim.apply_command_json(r#"{"cmd":"spring","x":100,"y":100}"#));
}

#[test]
fn a_bountiful_hunt_releases_game() {
    let mut sim = flat_world(89);
    sim.animals.clear();
    assert!(sim.apply_command_json(r#"{"cmd":"bountiful_hunt","x":100.0,"y":100.0,"radius":6.0}"#));
    assert!(sim.animals.len() >= 6);
}
