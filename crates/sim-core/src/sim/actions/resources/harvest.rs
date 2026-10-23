use super::super::agriculture::farm_ops;
use super::super::ctx::ActionCtx;
use crate::organism::skills::Skill;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if farm_ops::has_farm_at(ctx.sim, ctx.ix, ctx.iy) {
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
        o.inv_food = o.inv_food.saturating_sub(harvest.yield_units);
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
