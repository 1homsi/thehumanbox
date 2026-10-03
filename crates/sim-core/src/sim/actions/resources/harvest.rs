use super::super::agriculture::farm_ops;
use super::super::ctx::ActionCtx;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if farm_ops::has_farm_at(ctx.sim, ctx.ix, ctx.iy) {
        let Some(harvest) = farm_ops::harvest_crop(ctx.sim, ctx.idx, ctx.ix, ctx.iy) else {
            return 0.0;
        };
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
