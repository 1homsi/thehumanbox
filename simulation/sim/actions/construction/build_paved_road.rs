use super::super::ctx::ActionCtx;
use crate::world::grid::TrailKind;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_stone == 0 {
        return 0.0;
    }
    ctx.org_mut().inv_stone -= 1;
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.leave_trail(ix, iy, TrailKind::Path, 3.0);
    ctx.think("laying paving stones");
    ctx.discover("paved-roads", "paved a road");
    0.006
}
