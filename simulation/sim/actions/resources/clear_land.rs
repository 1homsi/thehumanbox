//! Action 31: clear scorched/ash ground back to grass.

use crate::world::tiles::Tile;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if matches!(ctx.tile, Tile::Ash | Tile::Scorched) {
        let (ix, iy) = (ctx.ix, ctx.iy);
        ctx.sim.grid.set(ix, iy, Tile::Grass);
        ctx.think("clearing the land");
        ctx.discover("land-clearing", "cleared scorched ground");
        0.01
    } else {
        ctx.think("tidying the ground");
        0.0
    }
}
