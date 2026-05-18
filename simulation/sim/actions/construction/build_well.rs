//! Action 40: dig a well on sand/grass. 40% success → tile becomes water.

use crate::world::tiles::Tile;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if matches!(ctx.tile, Tile::Sand | Tile::Grass) && ctx.chance(0.4) {
        let (ix, iy) = (ctx.ix, ctx.iy);
        ctx.sim.grid.set(ix, iy, Tile::Water);
        ctx.think("digging a well");
        ctx.discover("well", "dug a well");
        0.05
    } else { 0.0 }
}
