//! Snow, fog and gales from the sandbox.

use super::*;
use crate::world::grid::{HEIGHT, WIDTH};
use crate::world::tiles::Tile;

/// Every tile grass, so any snowfall has somewhere to land.
fn all_grass(sim: &mut Simulation) {
    for x in 0..WIDTH as i32 {
        for y in 0..HEIGHT as i32 {
            sim.grid.set(x, y, Tile::Grass);
        }
    }
}

fn snowy_tiles(sim: &Simulation) -> usize {
    let mut n = 0;
    for x in 0..WIDTH as i32 {
        for y in 0..HEIGHT as i32 {
            if sim.grid.get(x, y) == Tile::Snow {
                n += 1;
            }
        }
    }
    n
}

#[test]
fn snow_settles_on_open_ground_while_it_falls() {
    let mut sim = Simulation::new(3);
    all_grass(&mut sim);
    assert!(sim.apply_command_json(r#"{"cmd":"weather","kind":"snow"}"#));
    assert_eq!(sim.weather.kind, 3);
    assert_eq!(sim.weather.kind_str(), "snow");
    sim.tick_n(40);
    assert!(snowy_tiles(&sim) > 0, "snow lies on the grass");
}

#[test]
fn fog_is_damp_air_without_rain_or_snow() {
    let mut sim = Simulation::new(3);
    assert!(sim.apply_command_json(r#"{"cmd":"weather","kind":"fog"}"#));
    assert_eq!(sim.weather.kind, 4);
    assert_eq!(sim.weather.kind_str(), "fog");
    assert!(sim.weather.is_wet(sim.tick_count), "the ground is damp in fog");
}

#[test]
fn a_gale_blows_hard_from_a_new_quarter() {
    let mut sim = Simulation::new(3);
    let before = (sim.weather.wind_x, sim.weather.wind_y);
    assert!(sim.apply_command_json(r#"{"cmd":"gale"}"#));
    let strength = sim.weather.wind_x.hypot(sim.weather.wind_y);
    assert!((strength - 0.9).abs() < 1e-4, "gale strength {strength}");
    assert_ne!(
        (sim.weather.wind_x, sim.weather.wind_y),
        before,
        "the wind turned"
    );
}
