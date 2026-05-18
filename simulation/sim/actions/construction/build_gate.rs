//! Action 169: hang a gate. Needs wood or stone.

use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_wood == 0 && ctx.org().inv_stone == 0 { return 0.0; }
    ctx.consume_material();
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.add_structure(ix, iy, 0.04);
    ctx.sim.active_structure_tiles.insert((ix, iy));
    ctx.think("hanging a gate");
    ctx.discover("gates", "built a gate");
    0.010
}
