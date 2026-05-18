//! Action 73: paint a symbol. Requires rock or existing structure.
use crate::world::tiles::Tile;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let canvas = matches!(ctx.tile, Tile::Rock)
              || ctx.sim.grid.structure_at(ctx.ix, ctx.iy) > 0.1;
    if !canvas {
        ctx.think("looking for a canvas");
        return 0.0;
    }
    ctx.think("painting a symbol");
    ctx.discover("art", "painted the first symbol");
    ctx.event("social", "left a painting on the rock");
    0.005
}
