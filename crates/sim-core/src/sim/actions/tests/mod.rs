//! Tests for action selection, gating and application, by concern.
use super::*;
use crate::sim::spatial::SpatialIndex;
use crate::sim::tech::buildings::Building;

pub(super) fn actions_for(sim: &Simulation, idx: usize) -> Vec<usize> {
    let spatial = SpatialIndex::build(&sim.organisms, 10);
    let organism = &sim.organisms[idx];
    available_actions(sim, idx, organism.x as i32, organism.y as i32, &spatial)
}

pub(super) fn move_other_organisms_far_away(sim: &mut Simulation, idx: usize) {
    for (other_index, organism) in sim.organisms.iter_mut().enumerate() {
        if other_index == idx {
            continue;
        }
        organism.x = 300.0 + (other_index % 10) as f32 * 10.0;
        organism.y = 300.0 + (other_index / 10) as f32 * 10.0;
    }
}

mod apply;
mod gates;
mod selection;
