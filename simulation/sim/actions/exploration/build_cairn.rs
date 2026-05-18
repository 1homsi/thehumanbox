//! Action 216: stack a stone cairn as a way-marker.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_stone == 0 {
        ctx.think("no stone for a cairn");
        return 0.0;
    }
    ctx.org_mut().inv_stone -= 1;
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.add_structure(ix, iy, 0.015);
    ctx.sim.active_structure_tiles.insert((ix, iy));
    ctx.think("stacking a cairn");
    ctx.discover("cairn", "built a navigation cairn");
    0.004
}
