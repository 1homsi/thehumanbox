

use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_wood == 0 || !ctx.org().discoveries.contains("chronicle") {
        return 0.0;
    }
    ctx.org_mut().inv_wood -= 1;
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.add_structure(ix, iy, 0.06);
    ctx.sim.active_structure_tiles.insert((ix, iy));
    ctx.think("raising a library");
    ctx.discover("library", "built a library of lore");
    0.016
}
