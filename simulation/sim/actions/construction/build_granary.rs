//! Action 43: build a granary. Needs wood.

use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_wood == 0 { return 0.0; }
    ctx.consume_material();
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.add_structure(ix, iy, 0.05);
    ctx.sim.active_structure_tiles.insert((ix, iy));
    ctx.think("building a granary");
    ctx.discover("granary", "raised a granary");
    0.014
}
