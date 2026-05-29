use super::super::ctx::ActionCtx;
use crate::world::grid::TrailKind;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.water_near {
        ctx.think("no river here");
        return 0.0;
    }
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.leave_trail(ix, iy, TrailKind::Path, 0.8);
    ctx.think("fording the river");
    ctx.discover("fords", "found a ford");
    0.004
}
