use super::super::ctx::ActionCtx;
use crate::world::grid::TrailKind;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.water_near {
        ctx.think("seeking the river");
        return 0.0;
    }
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.leave_trail(ix, iy, TrailKind::Path, 0.6);
    ctx.think("following the river");
    0.003
}
