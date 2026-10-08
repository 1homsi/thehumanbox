//! Simulation-level tests, grouped by what they cover. Helpers shared by
//! more than one group live here.

use super::*;

pub(super) fn flatten_test_area(sim: &mut Simulation, cx: i32, cy: i32) {
    for x in (cx - 12)..=(cx + 12) {
        for y in (cy - 12)..=(cy + 12) {
            sim.grid.set(x, y, Tile::Sand);
            sim.grid.hazard[WorldGrid::idx(x, y)] = 0.0;
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
