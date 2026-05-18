

use crate::world::grid::TrailKind;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.water_near { return 0.0; }
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.leave_trail(ix, iy, TrailKind::Path, 2.0);
    ctx.sim.grid.add_structure(ix, iy, 0.03);
    ctx.think("building a bridge");
    ctx.discover("bridge", "spanned a bridge");
    0.01
}
