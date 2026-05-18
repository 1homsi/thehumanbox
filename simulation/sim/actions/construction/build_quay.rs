//! Action 178: build a stone quay next to water.

use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.water_near || ctx.org().inv_stone == 0 { return 0.0; }
    ctx.org_mut().inv_stone -= 1;
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.add_structure(ix, iy, 0.05);
    ctx.sim.active_structure_tiles.insert((ix, iy));
    ctx.think("laying a quay");
    ctx.discover("quay", "built a stone quay");
    0.012
}
