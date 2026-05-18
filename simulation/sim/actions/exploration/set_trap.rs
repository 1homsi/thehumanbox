
use crate::world::grid::TrailKind;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.leave_trail(ix, iy, TrailKind::Food, 0.5);
    ctx.think("setting a trap");
    ctx.discover("trap", "set a hunting trap");
    0.004
}
