

use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_stone == 0 || !ctx.org().discoveries.contains("astronomy") {
        return 0.0;
    }
    ctx.org_mut().inv_stone -= 1;
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.add_structure(ix, iy, 0.07);
    ctx.sim.active_structure_tiles.insert((ix, iy));
    ctx.think("building an observatory");
    ctx.discover("observatory", "raised an observatory");
    0.018
}
