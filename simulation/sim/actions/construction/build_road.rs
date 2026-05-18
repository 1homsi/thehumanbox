//! Action 42: lay a basic road - just leaves a path trail.

use crate::world::grid::TrailKind;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.leave_trail(ix, iy, TrailKind::Path, 2.5);
    ctx.think("laying a road");
    ctx.discover("roads", "laid the first road");
    0.004
}
