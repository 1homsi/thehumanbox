//! Releasing animals: they land on ground they can use, in their habitat when
//! the ground there suits them, and a missing count still releases one.

use super::*;
use crate::world::grid::WorldGrid;
use crate::world::tiles::{Biome, Tile};

/// A flat grassy patch around (150, 150) with a lake and a rock to test against.
fn grassy_patch(sim: &mut Simulation) {
    for x in 135..=165 {
        for y in 135..=165 {
            sim.grid.set(x, y, Tile::Grass);
        }
    }
    for x in 152..=153 {
        for y in 135..=165 {
            sim.grid.set(x, y, Tile::Water);
        }
    }
    sim.grid.set(146, 150, Tile::Rock);
}

#[test]
fn a_release_without_a_count_still_releases_one_animal() {
    let mut sim = Simulation::new(1);
    let before = sim.animals.len();
    assert!(sim.apply_command_json(r#"{"cmd":"spawn_animal","x":80.0,"y":80.0,"kind":"deer"}"#));
    assert_eq!(sim.animals.len(), before + 1);
}

#[test]
fn a_brush_release_spreads_its_count_on_land_the_animal_can_use() {
    let mut sim = Simulation::new(1);
    grassy_patch(&mut sim);
    let before = sim.animals.len();
    let cmd = r#"{"cmd":"spawn_animal","x":150.0,"y":150.0,"kind":"deer","count":8,"radius":5.0}"#;
    assert!(sim.apply_command_json(cmd));
    assert_eq!(sim.animals.len(), before + 8);
    for deer in &sim.animals[before..] {
        let tile = sim.grid.get(deer.x as i32, deer.y as i32);
        assert!(!matches!(tile, Tile::Water | Tile::Rock), "deer on {tile:?}");
    }
}

#[test]
fn fish_are_released_in_water_even_when_the_click_is_on_land() {
    let mut sim = Simulation::new(1);
    grassy_patch(&mut sim);
    let before = sim.animals.len();
    assert!(sim.apply_command_json(
        r#"{"cmd":"spawn_animal","x":140.0,"y":150.0,"kind":"fish","count":4,"radius":12.0}"#
    ));
    assert_eq!(sim.animals.len(), before + 4);
    for fish in &sim.animals[before..] {
        assert_eq!(sim.grid.get(fish.x as i32, fish.y as i32), Tile::Water);
    }
}

#[test]
fn nothing_is_released_where_no_ground_suits_the_kind() {
    let mut sim = Simulation::new(1);
    // Rock out to the full twelve-tile search reach around the click.
    for x in 136..=164 {
        for y in 136..=164 {
            sim.grid.set(x, y, Tile::Rock);
        }
    }
    let before = sim.animals.len();
    assert!(!sim.apply_command_json(r#"{"cmd":"spawn_animal","x":150.0,"y":150.0,"kind":"deer"}"#));
    assert_eq!(sim.animals.len(), before);
}

#[test]
fn wolves_are_released_in_the_forest_when_there_is_forest_nearby() {
    let mut sim = Simulation::new(1);
    for x in 130..=170 {
        for y in 130..=170 {
            sim.grid.set(x, y, Tile::Grass);
            let forest = x <= 150;
            sim.grid.biome[WorldGrid::idx(x, y)] = if forest { Biome::Forest } else { Biome::Desert } as u8;
        }
    }
    let before = sim.animals.len();
    assert!(sim.apply_command_json(
        r#"{"cmd":"spawn_animal","x":152.0,"y":150.0,"kind":"wolf","count":6,"radius":6.0}"#
    ));
    assert_eq!(sim.animals.len(), before + 6);
    for wolf in &sim.animals[before..] {
        assert_eq!(sim.grid.biome_at(wolf.x as i32, wolf.y as i32), Biome::Forest);
    }
}

#[test]
fn releases_respect_the_animal_cap() {
    let mut sim = Simulation::new(1);
    while sim.animals.iter().filter(|a| a.alive).count() < 1100 {
        assert!(sim.apply_command_json(r#"{"cmd":"spawn_animal","x":80.0,"y":80.0,"kind":"deer"}"#));
    }
    assert!(!sim.apply_command_json(r#"{"cmd":"spawn_animal","x":80.0,"y":80.0,"kind":"deer","count":5}"#));
}

#[test]
fn a_dog_released_beside_someone_bonds_to_them_and_is_named() {
    let mut sim = Simulation::new(1);
    grassy_patch(&mut sim);
    for o in sim.organisms.iter_mut() {
        o.x = 20.0;
        o.y = 20.0;
    }
    let owner_id = sim.organisms[0].id.clone();
    sim.organisms[0].x = 150.0;
    sim.organisms[0].y = 150.0;
    let before = sim.animals.len();
    assert!(sim.apply_command_json(r#"{"cmd":"spawn_animal","x":151.0,"y":150.0,"kind":"dog"}"#));
    let dog = &sim.animals[before];
    assert_eq!(dog.bonded_org.as_deref(), Some(owner_id.as_str()));
    assert!(dog.name.is_some(), "a bonded dog has a name");
    assert!(sim.organisms[0].discoveries.contains("dog"));
}

#[test]
fn a_dog_released_far_from_people_is_a_stray() {
    let mut sim = Simulation::new(1);
    grassy_patch(&mut sim);
    for o in sim.organisms.iter_mut() {
        o.x = 20.0;
        o.y = 20.0;
    }
    let before = sim.animals.len();
    assert!(sim.apply_command_json(r#"{"cmd":"spawn_animal","x":150.0,"y":150.0,"kind":"dog"}"#));
    let dog = &sim.animals[before];
    assert!(dog.bonded_org.is_none());
    assert!(dog.name.is_none());
}
