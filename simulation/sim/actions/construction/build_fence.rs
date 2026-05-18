//! Action 48: set a fence.

use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.add_structure(ix, iy, 0.02);
    ctx.sim.active_structure_tiles.insert((ix, iy));
    ctx.think("setting a fence");
    ctx.discover("fencing", "fenced the homestead");
    0.004
}
