pub mod brew_beer;
pub mod build_barn;
pub mod build_greenhouse;
pub mod compost_heap;
pub mod dry_fruit;
pub(crate) mod farm_ops;
pub mod ferment_grain;
pub mod graft_tree;
pub mod harvest_grain;
pub mod mill_grain;
pub mod plant_herb_garden;
pub mod plow_field;
pub mod press_oil;
pub mod rotate_crops;
pub mod seed_saving;
pub mod sow_seeds;
pub mod store_grain;
pub mod tend_orchard;
pub mod thresh_grain;
pub mod water_crops;
pub mod weed_crops;

use super::ctx::ActionCtx;
use crate::sim::simulation::Simulation;

pub(crate) fn action_is_possible(
    sim: &Simulation,
    idx: usize,
    action: usize,
    x: i32,
    y: i32,
    water_near: bool,
) -> bool {
    match action {
        38 => {
            let crop = farm_ops::crop_for_plot(sim, idx, x, y, water_near);
            farm_ops::can_plant_crop(sim, idx, x, y, crop, false)
        }
        336 => farm_ops::can_prepare_plot(sim, idx, x, y),
        337 => {
            let crop = farm_ops::crop_for_plot(sim, idx, x, y, water_near);
            farm_ops::can_plant_crop(sim, idx, x, y, crop, true)
        }
        338 | 346 => farm_ops::can_tend_crop(sim, idx, x, y, farm_ops::FarmCare::Weed),
        339 => {
            water_near
                && farm_ops::can_tend_crop(sim, idx, x, y, farm_ops::FarmCare::Water { irrigated: false })
        }
        340 => farm_ops::can_harvest_crop(sim, idx, x, y),
        344 => farm_ops::can_tend_crop(sim, idx, x, y, farm_ops::FarmCare::Rotate { practiced: false }),
        355 => sim
            .organisms
            .get(idx)
            .is_some_and(|org| org.inv_food > 0 && org.tools.get("seeds").copied().unwrap_or(0) < 8),
        473 => {
            let crop = farm_ops::crop_for_plot(sim, idx, x, y, water_near);
            sim.tick_count % 12_000 < 3_000 && farm_ops::can_plant_crop(sim, idx, x, y, crop, false)
        }
        474 => {
            let season_tick = sim.tick_count % 12_000;
            (6_000..9_000).contains(&season_tick) && farm_ops::can_harvest_crop(sim, idx, x, y)
        }
        _ => true,
    }
}

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    match action {
        336 => plow_field::apply(ctx),
        337 => sow_seeds::apply(ctx),
        338 => weed_crops::apply(ctx),
        339 => water_crops::apply(ctx),
        340 => harvest_grain::apply(ctx),
        341 => thresh_grain::apply(ctx),
        342 => mill_grain::apply(ctx),
        343 => store_grain::apply(ctx),
        344 => rotate_crops::apply(ctx),
        345 => build_barn::apply(ctx),
        346 => tend_orchard::apply(ctx),
        347 => graft_tree::apply(ctx),
        348 => dry_fruit::apply(ctx),
        349 => press_oil::apply(ctx),
        350 => ferment_grain::apply(ctx),
        351 => brew_beer::apply(ctx),
        352 => plant_herb_garden::apply(ctx),
        353 => build_greenhouse::apply(ctx),
        354 => compost_heap::apply(ctx),
        355 => seed_saving::apply(ctx),
        _ => 0.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::actions::agriculture::farm_ops::{harvest_crop, plant_crop, prepare_plot};
    use crate::sim::agriculture::CropKind;
    use crate::sim::era::Era;
    use crate::world::grid::WorldGrid;
    use crate::world::tiles::Tile;

    #[test]
    fn lifecycle_actions_are_only_possible_in_the_matching_plot_state() {
        let mut sim = Simulation::new(8_008);
        let idx = sim.organisms.iter().position(|org| org.alive).unwrap();
        let (x, y) = (120, 120);
        let lineage = sim.organisms[idx].lineage_id.clone();
        sim.lineage_eras.insert(lineage, Era::Bronze);
        sim.organisms[idx].inv_food = 2;
        sim.grid.set(x, y, Tile::Grass);
        sim.grid.fertility[WorldGrid::idx(x, y)] = 0.8;

        assert!(action_is_possible(&sim, idx, 336, x, y, false));
        assert!(!action_is_possible(&sim, idx, 337, x, y, false));
        assert!(!action_is_possible(&sim, idx, 340, x, y, false));

        prepare_plot(&mut sim, idx, x, y).unwrap();
        assert!(!action_is_possible(&sim, idx, 336, x, y, false));
        assert!(action_is_possible(&sim, idx, 337, x, y, false));
        plant_crop(&mut sim, idx, x, y, CropKind::Wheat, true).unwrap();
        assert!(!action_is_possible(&sim, idx, 337, x, y, false));
        assert!(action_is_possible(&sim, idx, 338, x, y, false));
        assert!(!action_is_possible(&sim, idx, 340, x, y, false));

        sim.tick_count = sim.farms[0].ready_tick;
        assert!(!action_is_possible(&sim, idx, 338, x, y, false));
        assert!(action_is_possible(&sim, idx, 340, x, y, false));
        harvest_crop(&mut sim, idx, x, y).unwrap();
        assert!(action_is_possible(&sim, idx, 344, x, y, false));
        assert!(!action_is_possible(&sim, idx, 474, x, y, false));
        assert!(super::farm_ops::tend_crop(
            &mut sim,
            idx,
            x,
            y,
            super::farm_ops::FarmCare::Rotate { practiced: true }
        ));
        assert!(!action_is_possible(&sim, idx, 344, x, y, false));

        sim.organisms[idx].tools.insert("seeds".to_string(), 1);
        sim.tick_count = 12_100;
        assert!(action_is_possible(&sim, idx, 473, x, y, false));
        let crop = super::farm_ops::crop_for_plot(&sim, idx, x, y, false);
        plant_crop(&mut sim, idx, x, y, crop, false).unwrap();
        sim.tick_count = 18_000;
        assert!(action_is_possible(&sim, idx, 474, x, y, false));
    }
}
