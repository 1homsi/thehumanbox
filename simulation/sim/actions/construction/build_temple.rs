

use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let has_faith = ctx.org().discoveries.contains("faith")
                 || ctx.org().discoveries.contains("ritual");
    if ctx.org().inv_stone == 0 || !has_faith { return 0.0; }
    ctx.org_mut().inv_stone -= 1;
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.add_structure(ix, iy, 0.08);
    ctx.sim.active_structure_tiles.insert((ix, iy));
    ctx.think("raising a temple");
    ctx.discover("temple", "raised a temple");
    0.020
}
