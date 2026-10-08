//! Locusts: what a swarm eats and what it leaves alone.

use super::*;
use crate::organism::animal::{Animal, AnimalKind};
use crate::world::tiles::Tile;

/// Open grass around (150, 150), and no people or animals near it.
fn open_ground(sim: &mut Simulation) {
    for x in 130..=170 {
        for y in 130..=170 {
            sim.grid.set(x, y, Tile::Grass);
        }
    }
    for o in sim.organisms.iter_mut() {
        o.x = 10.0;
        o.y = 10.0;
    }
    sim.animals.clear();
}

#[test]
fn a_swarm_strips_the_crops_in_its_path() {
    let mut sim = Simulation::new(5);
    open_ground(&mut sim);
    assert!(sim.apply_command_json(r#"{"cmd":"plant","x":150,"y":150,"kind":"crop","radius":8}"#));
    let before = sim.plantings.len();
    assert!(before > 20, "a field to strip: {before}");
    assert!(sim.apply_command_json(r#"{"cmd":"locusts","x":150,"y":150,"radius":14}"#));
    assert!(sim.plantings.len() < before, "the swarm eats some of the field");
}

#[test]
fn a_swarm_halves_what_people_carry_and_leaves_them_alive() {
    let mut sim = Simulation::new(5);
    open_ground(&mut sim);
    sim.organisms[0].x = 150.0;
    sim.organisms[0].y = 150.0;
    sim.organisms[0].inv_food = 8;
    sim.organisms[0].alive = true;
    assert!(sim.apply_command_json(r#"{"cmd":"locusts","x":150,"y":150,"radius":6}"#));
    assert!(
        sim.organisms[0].inv_food <= 4,
        "stores halved: {}",
        sim.organisms[0].inv_food
    );
    assert!(sim.organisms[0].alive, "the swarm does not kill people");
}

#[test]
fn birds_feast_on_a_swarm_while_deer_are_left_alone() {
    let mut sim = Simulation::new(5);
    open_ground(&mut sim);
    let bird = Animal::new(sim.next_animal_id, 150.0, 150.0, AnimalKind::Bird);
    sim.next_animal_id += 1;
    let deer = Animal::new(sim.next_animal_id, 150.0, 151.0, AnimalKind::Deer);
    sim.next_animal_id += 1;
    sim.animals.push(bird);
    sim.animals.push(deer);
    sim.animals[0].energy = 0.4;
    sim.animals[1].energy = 0.4;
    assert!(sim.apply_command_json(r#"{"cmd":"locusts","x":150,"y":150,"radius":6}"#));
    assert!(sim.animals[0].energy > 0.4, "the bird feasts");
    assert_eq!(sim.animals[1].energy, 0.4, "the deer is not fed by locusts");
}

#[test]
fn a_swarm_over_bare_ground_is_a_failed_command() {
    let mut sim = Simulation::new(5);
    open_ground(&mut sim);
    sim.plantings.clear();
    assert!(!sim.apply_command_json(r#"{"cmd":"locusts","x":150,"y":150,"radius":6}"#));
}
