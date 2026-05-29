use super::super::ctx::ActionCtx;
use crate::world::grid::TrailKind;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.leave_trail(ix, iy, TrailKind::Path, 1.4);
    ctx.think("blazing a trail");
    ctx.discover("trailblazing", "blazed a new trail");
    0.003
}
