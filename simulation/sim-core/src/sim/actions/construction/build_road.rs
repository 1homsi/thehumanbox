use super::super::ctx::ActionCtx;
use crate::world::grid::TrailKind;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.leave_trail(ix, iy, TrailKind::Path, 2.5);
    ctx.think("laying a road");
    ctx.discover("roads", "laid the first road");
    0.004
}
