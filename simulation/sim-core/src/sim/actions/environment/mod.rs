pub mod build_earthworks;
pub mod build_levee;
pub mod build_terrace_farm;
pub mod clean_water_source;
pub mod control_burn;
pub mod dig_pond;
pub mod drain_swamp;
pub mod manage_forest;
pub mod mark_dangerous_area;
pub mod plant_grove;
pub mod plant_windbreak;
pub mod reclaim_land;
pub mod remove_obstacles;
pub mod restore_burned_land;
pub mod stabilize_slope;

use super::ctx::ActionCtx;
use crate::organism::organism::Organism;
use crate::sim::{age_stage::AgeStage, era::Era, simulation::Simulation};
use crate::world::{grid::WorldGrid, tiles::Tile};

const REAL_ENVIRONMENT_ACTIONS: &[usize] = &[371, 375, 376, 379, 383, 384];

fn nearby_hazard(sim: &Simulation, ix: i32, iy: i32) -> Option<(i32, i32)> {
    let mut best = None;
    for dy in -4i32..=4 {
        for dx in -4i32..=4 {
            let distance = dx.abs() + dy.abs();
            if distance > 4 {
                continue;
            }
            let x = ix + dx;
            let y = iy + dy;
            if !matches!(sim.grid.get(x, y), Tile::Fire | Tile::Flooded) && sim.grid.hazard_at(x, y) < 0.45 {
                continue;
            }
            if best.is_none_or(|(_, _, best_distance)| distance < best_distance) {
                best = Some((x, y, distance));
            }
        }
    }
    best.map(|(x, y, _)| (x, y))
}

/// Only expose environmental actions with a paid, persistent effect. Generated
/// narrative-only actions remain unavailable until their world systems exist.
pub(crate) fn action_is_possible(sim: &Simulation, idx: usize, action: usize, ix: i32, iy: i32) -> bool {
    if !REAL_ENVIRONMENT_ACTIONS.contains(&action) {
        return !(371..=385).contains(&action);
    }
    let Some(org) = sim.organisms.get(idx).filter(|org| org.alive) else {
        return false;
    };
    if sim.era(&org.lineage_id) < Era::Stone
        || !matches!(org.age_stage(), AgeStage::Adult | AgeStage::Elder)
        || org.energy < 0.12
    {
        return false;
    }
    let tile = sim.grid.get(ix, iy);
    let grid_index = WorldGrid::idx(ix, iy);
    match action {
        371 => org.inv_wood > 0 && tile == Tile::Grass && sim.grid.structure_at(ix, iy) < 0.12,
        375 => {
            sim.grid.biome_at(ix, iy) == crate::world::tiles::Biome::Forest
                && matches!(tile, Tile::Grass | Tile::Food)
                && (sim.grid.pressure[grid_index] >= 0.20 || sim.grid.fertility[grid_index] < 0.70)
        }
        376 => {
            org.discoveries.contains("fire")
                && matches!(tile, Tile::Grass | Tile::Food)
                && (-2i32..=2)
                    .any(|dx| (-2i32..=2).any(|dy| sim.grid.get(ix + dx, iy + dy) == Tile::Campfire))
        }
        379 => {
            org.inv_wood > 0
                && tile == Tile::Grass
                && sim.grid.trail_at(ix, iy, crate::world::grid::TrailKind::Food) < 0.50
        }
        383 => {
            org.inv_wood > 0 && sim.grid.structure_at(ix, iy) < 0.12 && nearby_hazard(sim, ix, iy).is_some()
        }
        384 => org.inv_food > 0 && matches!(tile, Tile::Ash | Tile::Scorched),
        _ => false,
    }
}

pub(super) fn remember_hazard(ctx: &mut ActionCtx, x: i32, y: i32, strength: f32) {
    let actor_memory = ctx.org().traits.memory_strength;
    Organism::remember(&mut ctx.org_mut().danger_memory, x, y, strength, actor_memory);
    for index in ctx.kin.clone() {
        let memory = ctx.sim.organisms[index].traits.memory_strength;
        Organism::remember(
            &mut ctx.sim.organisms[index].danger_memory,
            x,
            y,
            strength * 0.75,
            memory,
        );
    }
}

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    if !action_is_possible(ctx.sim, ctx.idx, action, ctx.ix, ctx.iy) {
        return 0.0;
    }
    match action {
        371 => plant_windbreak::apply(ctx),
        372 => build_terrace_farm::apply(ctx),
        373 => drain_swamp::apply(ctx),
        374 => build_levee::apply(ctx),
        375 => manage_forest::apply(ctx),
        376 => control_burn::apply(ctx),
        377 => reclaim_land::apply(ctx),
        378 => stabilize_slope::apply(ctx),
        379 => plant_grove::apply(ctx),
        380 => dig_pond::apply(ctx),
        381 => remove_obstacles::apply(ctx),
        382 => clean_water_source::apply(ctx),
        383 => mark_dangerous_area::apply(ctx),
        384 => restore_burned_land::apply(ctx),
        385 => build_earthworks::apply(ctx),
        _ => 0.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::{actions::try_apply, spatial::SpatialIndex};
    use crate::world::{grid::TrailKind, tiles::Biome};

    fn steward(seed: u64, x: i32, y: i32) -> Simulation {
        let mut sim = Simulation::new(seed);
        sim.organisms.truncate(1);
        let lineage = sim.organisms[0].lineage_id.clone();
        sim.lineage_eras.insert(lineage, Era::Stone);
        let org = &mut sim.organisms[0];
        org.alive = true;
        org.age = org.max_age / 2;
        org.energy = 1.0;
        org.x = x as f32;
        org.y = y as f32;
        sim.grid.set(x, y, Tile::Grass);
        sim
    }

    fn apply_action(sim: &mut Simulation, action: usize, x: i32, y: i32) -> Option<f32> {
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        try_apply(sim, 0, action, x, y, &spatial)
    }

    #[test]
    fn generated_environment_stubs_and_prestone_stewardship_stay_hidden() {
        let (x, y) = (90, 90);
        let mut sim = steward(0xE001, x, y);
        let lineage = sim.organisms[0].lineage_id.clone();
        sim.organisms[0].inv_wood = 2;
        sim.lineage_eras.insert(lineage, Era::PreStone);
        let available =
            crate::sim::actions::available_actions(&sim, 0, x, y, &SpatialIndex::build(&sim.organisms, 10));
        assert!(!available.contains(&371));
        assert!(!(372..=374).any(|action| available.contains(&action)));
        assert!(!(377..=378).any(|action| available.contains(&action)));
        assert!(!(380..=382).any(|action| available.contains(&action)));
        assert!(!available.contains(&385));
    }

    #[test]
    fn windbreak_costs_wood_blocks_fire_and_survives_reload() {
        let (x, y) = (100, 100);
        let mut sim = steward(0xE002, x, y);
        sim.organisms[0].inv_wood = 1;

        assert!(apply_action(&mut sim, 371, x, y).is_some());
        assert_eq!(sim.organisms[0].inv_wood, 0);
        assert!(sim.grid.structure_at(x, y) >= 0.18);
        assert!(sim.active_structure_tiles.contains(&(x, y)));
        assert!(apply_action(&mut sim, 371, x, y).is_none());

        let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        assert!(loaded.grid.structure_at(x, y) >= 0.18);
        assert!(loaded.active_structure_tiles.contains(&(x, y)));
    }

    #[test]
    fn controlled_burn_and_seeded_restoration_change_the_same_land_once() {
        let (x, y) = (110, 110);
        let mut sim = steward(0xE003, x, y);
        sim.organisms[0].discoveries.insert("fire".into());
        sim.grid.set(x + 1, y, Tile::Campfire);
        sim.grid.pressure[WorldGrid::idx(x, y)] = 2.0;

        assert!(apply_action(&mut sim, 376, x, y).is_some());
        assert_eq!(sim.grid.get(x, y), Tile::Scorched);
        assert!(sim.grid.pressure[WorldGrid::idx(x, y)] < 2.0);
        assert!(apply_action(&mut sim, 376, x, y).is_none());

        sim.organisms[0].inv_food = 1;
        assert!(apply_action(&mut sim, 384, x, y).is_some());
        assert_eq!(sim.organisms[0].inv_food, 0);
        assert_eq!(sim.grid.get(x, y), Tile::Grass);
        assert!(sim.grid.trail_at(x, y, TrailKind::Food) >= 1.0);
        assert!(apply_action(&mut sim, 384, x, y).is_none());
    }

    #[test]
    fn forest_tending_relieves_pressure_and_hazard_marking_teaches_real_danger() {
        let (x, y) = (120, 120);
        let mut sim = steward(0xE004, x, y);
        let index = WorldGrid::idx(x, y);
        sim.grid.biome[index] = Biome::Forest as u8;
        sim.grid.pressure[index] = 1.0;
        let fertility_before = sim.grid.fertility[index];

        assert!(apply_action(&mut sim, 375, x, y).is_some());
        assert!(sim.grid.pressure[index] < 1.0);
        assert!(sim.grid.fertility[index] >= fertility_before);

        sim.organisms[0].inv_wood = 1;
        sim.grid.set(x + 2, y, Tile::Fire);
        assert!(apply_action(&mut sim, 383, x, y).is_some());
        assert_eq!(sim.organisms[0].inv_wood, 0);
        assert!(sim.organisms[0].danger_memory.contains_key(&(x + 2, y)));
        sim.organisms[0].inv_wood = 1;
        assert!(apply_action(&mut sim, 383, x, y).is_none());
        assert_eq!(sim.organisms[0].inv_wood, 1);
    }
}
