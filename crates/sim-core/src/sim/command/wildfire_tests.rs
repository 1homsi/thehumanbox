//! A wildfire: which ground catches, and which way the line runs.

use super::*;
use crate::world::tiles::Tile;

/// A square of grass around (150, 150); the wind blows east.
fn grassland(sim: &mut Simulation) {
    for x in 130..=170 {
        for y in 130..=170 {
            sim.grid.set(x, y, Tile::Grass);
        }
    }
    sim.weather.wind_x = 0.9;
    sim.weather.wind_y = 0.0;
    for o in sim.organisms.iter_mut() {
        o.x = 10.0;
        o.y = 10.0;
    }
    sim.animals.clear();
}

#[test]
fn a_wildfire_catches_the_grass_downwind_of_the_click() {
    let mut sim = Simulation::new(5);
    grassland(&mut sim);
    assert!(sim.apply_command_json(r#"{"cmd":"wildfire","x":150,"y":150,"radius":10}"#));
    let mut downwind = 0;
    let mut upwind_far = 0;
    for x in 130..=170 {
        for y in 130..=170 {
            if sim.grid.get(x, y) == Tile::Fire {
                if x >= 150 {
                    downwind += 1;
                } else if x <= 146 {
                    upwind_far += 1;
                }
            }
        }
    }
    assert!(downwind > 0, "the line catches downwind");
    assert_eq!(upwind_far, 0, "the fire does not run back against the wind");
}

#[test]
fn a_wildfire_over_bare_rock_is_a_failed_command() {
    let mut sim = Simulation::new(5);
    for x in 130..=170 {
        for y in 130..=170 {
            sim.grid.set(x, y, Tile::Rock);
        }
    }
    sim.animals.clear();
    assert!(!sim.apply_command_json(r#"{"cmd":"wildfire","x":150,"y":150,"radius":10}"#));
}
