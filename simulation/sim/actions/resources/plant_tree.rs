//! Action 30: plant a sapling on grass. Bumps fertility and adds a
//! small structure tier (saplings will grow into forest cover via
//! the world physics tick).

use crate::world::tiles::Tile;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !matches!(ctx.tile, Tile::Grass) {
        return 0.0;
    }
    let fidx = ctx.fidx;
    ctx.sim.grid.fertility[fidx] = (ctx.sim.grid.fertility[fidx] + 0.04).min(0.95);
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.add_structure(ix, iy, 0.005);
    ctx.think("planting a sapling");
    ctx.discover("forestry", "planted the first tree");
    0.006
}
