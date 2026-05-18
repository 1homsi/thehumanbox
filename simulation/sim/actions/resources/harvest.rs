//! Action 35: harvest a Food tile, converting it back to Grass.
//! Returns +2 food.

use crate::world::tiles::Tile;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !matches!(ctx.tile, Tile::Food) { return 0.0; }
    let o = ctx.org_mut();
    o.inv_food = o.inv_food.saturating_add(2);
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.set(ix, iy, Tile::Grass);
    ctx.think("harvesting");
    ctx.discover("harvest", "brought in a harvest");
    0.018
}
