pub mod build_brush_pile;
pub mod count_birch;
pub mod count_fern;
pub mod count_maple;
pub mod count_oak;
pub mod count_pine;
pub mod cut_invasive;
pub mod fell_invasive_tree;
pub mod girdle_tree;
pub mod install_bat_box;
pub mod install_bee_hotel;
pub mod install_bluebird_box;
pub mod install_chimney_swift;
pub mod install_kestrel_box;
pub mod install_owl_box;
pub mod install_purple_martin_house;
pub mod install_swallow_cup;
pub mod install_swift_brick;
pub mod install_woodduck_box;
pub mod leave_snag;
pub mod manage_fuel_load;
pub mod monitor_air_quality;
pub mod monitor_amphibian;
pub mod monitor_bee;
pub mod monitor_butterfly;
pub mod monitor_canopy_cover;
pub mod monitor_pollinator;
pub mod monitor_reptile;
pub mod monitor_soil_health;
pub mod monitor_understory;
pub mod monitor_water_quality;
pub mod mow_invasive;
pub mod mulch_invasive;
pub mod plant_hedgerow;
pub mod plant_native;
pub mod plant_pollinator_strip;
pub mod plant_windbreak;
pub mod prescribed_burn;
pub mod pull_invasive;
pub mod remove_buckthorn;
pub mod remove_garlic_mustard;
pub mod remove_hogweed;
pub mod remove_invasive;
pub mod remove_kudzu;
pub mod restore_meadow;
pub mod restore_prairie;
pub mod restore_riparian;
pub mod restore_wetland;
pub mod saw_invasive_brush;
pub mod solarize_invasive;

use super::ctx::ActionCtx;
use crate::sim::simulation::Simulation;
use crate::world::{grid::TrailKind, tiles::Tile};

pub(crate) const REAL_ECOLOGICAL_ACTIONS: &[usize] = &[4380, 4381, 4382, 4384, 4392, 4393, 4425];

fn near_water(sim: &Simulation, x: i32, y: i32) -> bool {
    (-2i32..=2)
        .any(|dx| (-2i32..=2).any(|dy| matches!(sim.grid.get(x + dx, y + dy), Tile::Water | Tile::Flooded)))
}

fn near_farm(sim: &Simulation, x: i32, y: i32) -> bool {
    sim.farms
        .iter()
        .any(|farm| (farm.x - x).abs() + (farm.y - y).abs() <= 5)
}

fn near_campfire(sim: &Simulation, x: i32, y: i32) -> bool {
    (-2i32..=2).any(|dx| (-2i32..=2).any(|dy| sim.grid.get(x + dx, y + dy) == Tile::Campfire))
}

/// Modern ecological work must consume real supplies and alter habitat. The
/// remaining generated verbs stay hidden until their species or pollution
/// systems exist instead of granting free comfort.
pub(crate) fn action_is_possible(sim: &Simulation, idx: usize, action: usize, x: i32, y: i32) -> bool {
    if !REAL_ECOLOGICAL_ACTIONS.contains(&action) {
        return !(4380..=4429).contains(&action);
    }
    let Some(org) = sim
        .organisms
        .get(idx)
        .filter(|org| org.alive && org.energy >= 0.15)
    else {
        return false;
    };
    let tile = sim.grid.get(x, y);
    let biome = sim.grid.biome_at(x, y);
    match action {
        4380 => {
            org.inv_food > 0
                && matches!(tile, Tile::Grass | Tile::Ash | Tile::Scorched)
                && sim.grid.trail_at(x, y, TrailKind::Food) < 0.55
        }
        4381 => {
            org.inv_food > 0
                && org.inv_wood > 0
                && near_water(sim, x, y)
                && matches!(tile, Tile::Grass | Tile::Ash | Tile::Scorched)
                && biome != crate::world::tiles::Biome::Forest
        }
        4382 => org.inv_food > 0 && matches!(tile, Tile::Ash | Tile::Scorched),
        4384 => {
            org.inv_food > 0
                && org.inv_wood > 0
                && near_water(sim, x, y)
                && matches!(tile, Tile::Grass | Tile::Ash | Tile::Scorched)
                && biome != crate::world::tiles::Biome::Wetland
        }
        4392 => {
            org.inv_food > 0
                && tile == Tile::Grass
                && near_farm(sim, x, y)
                && sim.grid.trail_at(x, y, TrailKind::Food) < 0.60
        }
        4393 => {
            org.inv_wood > 0
                && tile == Tile::Grass
                && near_farm(sim, x, y)
                && sim.grid.structure_at(x, y) < 0.12
        }
        4425 => {
            org.inv_water > 0
                && matches!(tile, Tile::Grass | Tile::Food)
                && biome == crate::world::tiles::Biome::Forest
                && sim.grid.pressure[crate::world::grid::WorldGrid::idx(x, y)] >= 0.50
                && near_campfire(sim, x, y)
        }
        _ => false,
    }
}

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    if !action_is_possible(ctx.sim, ctx.idx, action, ctx.ix, ctx.iy) {
        return 0.0;
    }
    match action {
        4380 => plant_native::apply(ctx),
        4381 => restore_riparian::apply(ctx),
        4382 => restore_meadow::apply(ctx),
        4383 => restore_prairie::apply(ctx),
        4384 => restore_wetland::apply(ctx),
        4385 => remove_invasive::apply(ctx),
        4386 => remove_kudzu::apply(ctx),
        4387 => remove_hogweed::apply(ctx),
        4388 => remove_garlic_mustard::apply(ctx),
        4389 => remove_buckthorn::apply(ctx),
        4390 => build_brush_pile::apply(ctx),
        4391 => leave_snag::apply(ctx),
        4392 => plant_pollinator_strip::apply(ctx),
        4393 => plant_hedgerow::apply(ctx),
        4394 => plant_windbreak::apply(ctx),
        4395 => install_bat_box::apply(ctx),
        4396 => install_owl_box::apply(ctx),
        4397 => install_bee_hotel::apply(ctx),
        4398 => install_purple_martin_house::apply(ctx),
        4399 => install_bluebird_box::apply(ctx),
        4400 => install_chimney_swift::apply(ctx),
        4401 => install_woodduck_box::apply(ctx),
        4402 => install_kestrel_box::apply(ctx),
        4403 => install_swallow_cup::apply(ctx),
        4404 => install_swift_brick::apply(ctx),
        4405 => monitor_pollinator::apply(ctx),
        4406 => monitor_butterfly::apply(ctx),
        4407 => monitor_bee::apply(ctx),
        4408 => monitor_amphibian::apply(ctx),
        4409 => monitor_reptile::apply(ctx),
        4410 => monitor_water_quality::apply(ctx),
        4411 => monitor_air_quality::apply(ctx),
        4412 => monitor_soil_health::apply(ctx),
        4413 => monitor_canopy_cover::apply(ctx),
        4414 => monitor_understory::apply(ctx),
        4415 => count_oak::apply(ctx),
        4416 => count_maple::apply(ctx),
        4417 => count_birch::apply(ctx),
        4418 => count_pine::apply(ctx),
        4419 => count_fern::apply(ctx),
        4420 => pull_invasive::apply(ctx),
        4421 => cut_invasive::apply(ctx),
        4422 => solarize_invasive::apply(ctx),
        4423 => mow_invasive::apply(ctx),
        4424 => mulch_invasive::apply(ctx),
        4425 => prescribed_burn::apply(ctx),
        4426 => manage_fuel_load::apply(ctx),
        4427 => girdle_tree::apply(ctx),
        4428 => fell_invasive_tree::apply(ctx),
        4429 => saw_invasive_brush::apply(ctx),
        _ => 0.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::{
        actions::{available_actions, try_apply},
        agriculture::{CropKind, Farm},
        era::Era,
        spatial::SpatialIndex,
    };
    use crate::world::{grid::WorldGrid, tiles::Biome};

    fn ecologist(seed: u64, x: i32, y: i32) -> Simulation {
        let mut sim = Simulation::new(seed);
        sim.organisms.truncate(1);
        let lineage = sim.organisms[0].lineage_id.clone();
        sim.lineage_eras.insert(lineage, Era::Modern);
        let org = &mut sim.organisms[0];
        org.alive = true;
        org.age = org.max_age / 2;
        org.energy = 1.0;
        org.x = x as f32;
        org.y = y as f32;
        org.specialty = Some("farmer".into());
        org.literacy = 0.6;
        org.discoveries.insert("scientific_method".into());
        sim.grid.set(x, y, Tile::Grass);
        sim
    }

    fn apply_action(sim: &mut Simulation, action: usize, x: i32, y: i32) -> Option<f32> {
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        try_apply(sim, 0, action, x, y, &spatial)
    }

    #[test]
    fn fake_ecology_actions_are_hidden_while_paid_native_planting_is_available() {
        let (x, y) = (130, 130);
        let mut sim = ecologist(0xEC01, x, y);
        sim.organisms[0].inv_food = 1;
        let actions = available_actions(&sim, 0, x, y, &SpatialIndex::build(&sim.organisms, 10));
        assert!(actions.contains(&4380));
        assert!(!actions.contains(&4385));
        assert!(!actions.contains(&4405));
        assert!(!actions.contains(&4426));

        assert!(apply_action(&mut sim, 4380, x, y).is_some());
        assert_eq!(sim.organisms[0].inv_food, 0);
        assert!(sim.grid.trail_at(x, y, TrailKind::Food) >= 1.0);
        assert!(apply_action(&mut sim, 4380, x, y).is_none());
    }

    #[test]
    fn wetland_restoration_costs_supplies_changes_habitat_and_survives_reload() {
        let (x, y) = (140, 140);
        let mut sim = ecologist(0xEC02, x, y);
        sim.organisms[0].inv_food = 1;
        sim.organisms[0].inv_wood = 1;
        sim.grid.set(x + 1, y, Tile::Water);
        sim.grid.set_biome(x, y, Biome::Grassland);

        assert!(apply_action(&mut sim, 4384, x, y).is_some());
        assert_eq!(sim.organisms[0].inv_food, 0);
        assert_eq!(sim.organisms[0].inv_wood, 0);
        assert_eq!(sim.grid.biome_at(x, y), Biome::Wetland);

        let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        assert_eq!(loaded.grid.biome_at(x, y), Biome::Wetland);
    }

    #[test]
    fn pollinator_strip_and_hedgerow_require_a_real_farm_and_distinct_supplies() {
        let (x, y) = (150, 150);
        let mut sim = ecologist(0xEC03, x, y);
        let lineage = sim.organisms[0].lineage_id.clone();
        sim.organisms[0].inv_food = 1;
        sim.organisms[0].inv_wood = 1;
        assert!(apply_action(&mut sim, 4392, x, y).is_none());
        assert!(apply_action(&mut sim, 4393, x, y).is_none());
        sim.farms.push(Farm {
            id: 1,
            x: x + 2,
            y,
            owner_lineage: lineage,
            crop: CropKind::Wheat,
            planted_tick: 0,
            ready_tick: 100,
            harvested: false,
            prepared: false,
        });
        let fertility_before = sim.grid.fertility[WorldGrid::idx(x + 1, y)];

        assert!(apply_action(&mut sim, 4392, x, y).is_some());
        assert_eq!(sim.organisms[0].inv_food, 0);
        assert!(sim.grid.fertility[WorldGrid::idx(x + 1, y)] >= fertility_before);
        assert!(apply_action(&mut sim, 4393, x, y).is_some());
        assert_eq!(sim.organisms[0].inv_wood, 0);
        assert!(sim.grid.structure_at(x, y) >= 0.16);
    }

    #[test]
    fn prescribed_burn_spends_water_and_reduces_real_forest_fuel_pressure() {
        let (x, y) = (160, 160);
        let mut sim = ecologist(0xEC04, x, y);
        sim.organisms[0].inv_water = 1;
        sim.grid.set_biome(x, y, Biome::Forest);
        sim.grid.pressure[WorldGrid::idx(x, y)] = 2.0;
        sim.grid.set(x + 1, y, Tile::Campfire);

        assert!(apply_action(&mut sim, 4425, x, y).is_some());
        assert_eq!(sim.organisms[0].inv_water, 0);
        assert_eq!(sim.grid.get(x, y), Tile::Scorched);
        assert!(sim.grid.pressure[WorldGrid::idx(x, y)] < 2.0);
        assert!(apply_action(&mut sim, 4425, x, y).is_none());
    }
}
