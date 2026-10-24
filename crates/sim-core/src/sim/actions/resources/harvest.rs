use super::super::agriculture::farm_ops;
use super::super::ctx::ActionCtx;
use crate::organism::skills::Skill;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if farm_ops::has_farm_at(ctx.sim, ctx.ix, ctx.iy) {
        // `harvest_crop` puts the yield in hand, where a full load caps it;
        // the crop is routed below, so the worker keeps exactly what they had.
        let carried = ctx.org().inv_food;
        let Some(harvest) = farm_ops::harvest_crop(ctx.sim, ctx.idx, ctx.ix, ctx.iy) else {
            return 0.0;
        };
        // A practised farmer wastes less of the crop in the cutting.
        let extra = ctx.practised(Skill::Farming, true);
        // The crop goes to the tribe's stores (with the granary's bonus), as when
        // the village brings it in; what the stores cannot take stays in hand.
        let lineage = ctx.org().lineage_id.clone();
        let units = harvest.yield_units.saturating_add(extra);
        let grain = (units as f32 * crate::sim::civ::land::village_stores::yield_factor(ctx.sim, &lineage))
            .round() as u32;
        let o = ctx.org_mut();
        o.inv_food = carried;
        let at = (ctx.ix, ctx.iy);
        if !crate::sim::civ::land::village_carts::haul_harvest(ctx.sim, &lineage, at, grain) {
            let left = crate::sim::civ::land::village_stores::deposit(ctx.sim, &lineage, grain);
            let o = ctx.org_mut();
            o.inv_food = o.inv_food.saturating_add(left.min(255) as u8);
        }
        ctx.think(&format!("harvesting {} measures of crops", harvest.yield_units));
        ctx.discover("harvest", "brought in a harvest");
        return 0.018;
    }
    if !matches!(ctx.tile, Tile::Food) {
        return 0.0;
    }
    let o = ctx.org_mut();
    o.inv_food = o.inv_food.saturating_add(2);
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.set(ix, iy, Tile::Grass);
    ctx.think("harvesting");
    ctx.discover("harvest", "brought in a harvest");
    0.018
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::simulation::Simulation;
    use crate::sim::spatial::SpatialIndex;
    use crate::sim::tech::agriculture::{CropKind, Farm};
    use crate::sim::tech::buildings::{Building, BuildingKind};

    #[test]
    fn bringing_a_field_into_the_granary_leaves_the_worker_their_own_food() {
        let mut sim = Simulation::new(5_001);
        sim.buildings.clear();
        let lineage = sim.organisms[0].lineage_id.clone();
        let (x, y) = (sim.organisms[0].x as i32, sim.organisms[0].y as i32);
        let mut granary = Building::new(1, BuildingKind::Granary, x + 3, y, Some(lineage.clone()), 0);
        granary.condition = 1.0;
        sim.buildings.push(granary);
        sim.farms.push(Farm {
            id: 1,
            x,
            y,
            owner_lineage: lineage,
            crop: CropKind::Wheat,
            planted_tick: 0,
            ready_tick: 1,
            harvested: false,
            prepared: true,
            season_timed: false,
            withered: false,
        });
        sim.tick_count = 10;
        // Nearly a full load: the yield would have been capped in hand.
        sim.organisms[0].inv_food = 250;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let reward = {
            let mut ctx = ActionCtx::new(&mut sim, 0, x, y, &spatial);
            apply(&mut ctx)
        };
        assert!(reward > 0.0);
        assert!(sim.buildings[0].stock > 0, "the crop reached the granary");
        assert_eq!(sim.organisms[0].inv_food, 250);
    }
}
