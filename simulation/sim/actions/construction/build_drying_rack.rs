//! Action 180: hammer together a drying rack.

use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_wood == 0 { return 0.0; }
    ctx.org_mut().inv_wood -= 1;
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.add_structure(ix, iy, 0.02);
    ctx.sim.active_structure_tiles.insert((ix, iy));
    ctx.think("hammering a drying rack");
    ctx.discover("drying-rack", "built a drying rack");
    0.006
}
