//! A tsunami: the wave out of the sea and what it leaves on the coast.

use super::*;
use crate::organism::animal::{Animal, AnimalKind};
use crate::world::tiles::Tile;

/// A sea strip at x 150..=151 with grass to its east, and no people nearby.
fn coast(sim: &mut Simulation) {
    for x in 130..=170 {
        for y in 130..=170 {
            sim.grid
                .set(x, y, if x <= 151 { Tile::Water } else { Tile::Grass });
        }
    }
    for o in sim.organisms.iter_mut() {
        o.x = 10.0;
        o.y = 10.0;
    }
    sim.animals.clear();
}

#[test]
fn a_tsunami_floods_the_land_behind_the_coast() {
    let mut sim = Simulation::new(5);
    coast(&mut sim);
    assert!(sim.apply_command_json(r#"{"cmd":"tsunami","x":155,"y":150,"radius":8}"#));
    assert_eq!(sim.grid.get(153, 150), Tile::Flooded, "the shore floods");
    assert_eq!(sim.grid.get(151, 150), Tile::Water, "the sea itself stays sea");
    assert!(sim.flood_tiles.iter().any(|&(x, y, _)| (x, y) == (153, 150)));
}

#[test]
fn a_tsunami_drowns_land_animals_in_the_wave_but_not_fish() {
    let mut sim = Simulation::new(5);
    coast(&mut sim);
    let deer = Animal::new(sim.next_animal_id, 153.0, 150.0, AnimalKind::Deer);
    sim.next_animal_id += 1;
    let fish = Animal::new(sim.next_animal_id, 150.0, 140.0, AnimalKind::Fish);
    sim.next_animal_id += 1;
    sim.animals.push(deer);
    sim.animals.push(fish);
    assert!(sim.apply_command_json(r#"{"cmd":"tsunami","x":155,"y":150,"radius":8}"#));
    assert!(!sim.animals[0].alive, "the deer drowns");
    assert!(sim.animals[1].alive, "the fish swims on");
}

#[test]
fn a_tsunami_needs_the_sea_nearby() {
    let mut sim = Simulation::new(5);
    for x in 130..=170 {
        for y in 130..=170 {
            sim.grid.set(x, y, Tile::Grass);
        }
    }
    sim.animals.clear();
    for o in sim.organisms.iter_mut() {
        o.x = 10.0;
        o.y = 10.0;
    }
    let before = sim.grid.get(150, 150);
    assert!(!sim.apply_command_json(r#"{"cmd":"tsunami","x":150,"y":150,"radius":8}"#));
    assert_eq!(sim.grid.get(150, 150), before);
}
