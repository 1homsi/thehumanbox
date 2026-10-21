//! Simulation-level tests, grouped by what they cover. Helpers shared by
//! more than one group live here.

use super::*;

/// A plain patch of open ground round (cx, cy) with a mild climate, whatever the generated world put
/// there (the corners of the map are often cold sea, which would send a test's people to warm up).
pub(super) fn flatten_test_area(sim: &mut Simulation, cx: i32, cy: i32) {
    for x in (cx - 12)..=(cx + 12) {
        for y in (cy - 12)..=(cy + 12) {
            sim.grid.set(x, y, Tile::Sand);
            let i = WorldGrid::idx(x, y);
            sim.grid.hazard[i] = 0.0;
            sim.grid.temperature[i] = 18.0;
            sim.grid.biome[i] = crate::world::tiles::Biome::Grassland as u8;
        }
    }
}

mod animals;
mod determinism;
mod dispersal;
mod eras;
mod feedback;
mod movement;
mod persistence;
mod strategy;
mod views;
mod wild_kinds;
mod world_events;
