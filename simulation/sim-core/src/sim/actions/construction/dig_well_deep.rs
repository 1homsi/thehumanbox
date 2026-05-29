use super::super::ctx::ActionCtx;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if matches!(ctx.tile, Tile::Sand | Tile::Grass) && ctx.chance(0.30) {
        let (ix, iy) = (ctx.ix, ctx.iy);
        ctx.sim.grid.set(ix, iy, Tile::Water);
        ctx.think("striking groundwater");
        ctx.discover("deep-well", "dug a deep well");
        0.04
    } else {
        ctx.think("digging deeper");
        0.0
    }
}
