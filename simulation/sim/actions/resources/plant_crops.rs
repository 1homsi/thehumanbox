//! Action 38: plant crops. Converts a fertile grass tile into Food
//! and reduces the local fertility.

use crate::world::tiles::Tile;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let fidx = ctx.fidx;
    if !matches!(ctx.tile, Tile::Grass) || ctx.sim.grid.fertility[fidx] <= 0.4 {
        return 0.0;
    }
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.set(ix, iy, Tile::Food);
    ctx.sim.grid.reduce_fertility(ix, iy, 0.04);
    ctx.think("planting crops");
    ctx.discover("farm", "planted a crop field");
    0.014
}
