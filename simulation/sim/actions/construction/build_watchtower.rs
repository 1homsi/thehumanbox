//! Action 44: build a watchtower. Needs wood or stone.

use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_wood == 0 && ctx.org().inv_stone == 0 { return 0.0; }
    ctx.consume_material();
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.add_structure(ix, iy, 0.07);
    ctx.sim.active_structure_tiles.insert((ix, iy));
    ctx.think("building a watchtower");
    ctx.discover("watchtower", "raised a watchtower");
    0.014
}
