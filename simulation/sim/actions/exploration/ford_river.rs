//! Action 212: ford a river.
use crate::world::grid::TrailKind;
use super::super::ctx::ActionCtx;

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
