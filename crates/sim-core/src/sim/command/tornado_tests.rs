//! A tornado: what its funnel takes with it.

use super::*;
use crate::math::DetMath;
use crate::organism::animal::{Animal, AnimalKind};
use crate::world::tiles::Tile;

/// Open grass around (150, 150), and no people anywhere near it.
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
}

#[test]
fn a_tornado_strikes_down_the_animals_in_its_funnel() {
    let mut sim = Simulation::new(5);
    open_ground(&mut sim);
    sim.animals.clear();
    for k in 0..8 {
        let angle = k as f32 * std::f32::consts::FRAC_PI_4;
        let deer = Animal::new(
            sim.next_animal_id,
            150.0 + angle.det_cos(),
            150.0 + angle.det_sin(),
            AnimalKind::Deer,
        );
        sim.next_animal_id += 1;
        sim.animals.push(deer);
    }
    assert!(sim.apply_command_json(r#"{"cmd":"tornado","x":150,"y":150,"radius":12}"#));
    assert!(
        sim.animals.iter().any(|a| !a.alive),
        "the funnel takes at least one deer standing in it"
    );
}

#[test]
fn a_tornado_uproots_the_plantings_it_passes_over() {
    let mut sim = Simulation::new(5);
    open_ground(&mut sim);
    sim.animals.clear();
    assert!(sim.apply_command_json(r#"{"cmd":"plant","x":150,"y":150,"kind":"crop","radius":8}"#));
    let before = sim.plantings.len();
    assert!(before > 20, "a field to tear up: {before}");
    assert!(sim.apply_command_json(r#"{"cmd":"tornado","x":150,"y":150,"radius":12}"#));
    assert!(sim.plantings.len() < before, "some of the field is torn up");
}

#[test]
fn a_tornado_over_empty_ground_is_a_failed_command() {
    let mut sim = Simulation::new(5);
    open_ground(&mut sim);
    sim.animals.clear();
    sim.plantings.clear();
    let before = sim.grid.get(150, 150);
    assert!(!sim.apply_command_json(r#"{"cmd":"tornado","x":150,"y":150,"radius":6}"#));
    assert_eq!(sim.grid.get(150, 150), before);
}
