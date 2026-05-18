
use crate::world::grid::TrailKind;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_food == 0 { return 0.0; }
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.leave_trail(ix, iy, TrailKind::Food, 1.5);
    ctx.think("caching food");
    ctx.discover("granaries", "stocked food for winter");
    0.004
}
